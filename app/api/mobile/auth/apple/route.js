import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import jwksRsa from 'jwks-rsa'
import { connectToMongo } from '@/lib/server/db'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production')
}
const jwtSecret = JWT_SECRET || 'dev-only-secret-key'

const APPLE_BUNDLE_ID = 'com.trypzy.mobile'

// JWKS client for fetching Apple's public signing keys
const jwksClient = jwksRsa({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
})

/**
 * Verify an Apple identity token JWT.
 *
 * Fetches Apple's public keys from their JWKS endpoint and verifies
 * the token signature, issuer, and audience.
 */
function verifyAppleToken(identityToken) {
  return new Promise((resolve, reject) => {
    // Decode header to get the key ID
    const decoded = jwt.decode(identityToken, { complete: true })
    if (!decoded || !decoded.header?.kid) {
      return reject(new Error('Invalid token format'))
    }

    jwksClient.getSigningKey(decoded.header.kid, (err, key) => {
      if (err) return reject(err)
      const signingKey = key.getPublicKey()

      jwt.verify(
        identityToken,
        signingKey,
        {
          issuer: 'https://appleid.apple.com',
          audience: APPLE_BUNDLE_ID,
          algorithms: ['RS256'],
        },
        (verifyErr, payload) => {
          if (verifyErr) return reject(verifyErr)
          resolve(payload)
        }
      )
    })
  })
}

/**
 * POST /api/mobile/auth/apple
 *
 * Accepts an Apple identity token from the native app, verifies it,
 * finds or creates the user, and returns a Trypzy JWT.
 *
 * Apple quirk: email and name are only provided on the FIRST sign-in.
 * On subsequent sign-ins the JWT payload still contains the email,
 * so we always read email from the verified token payload.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { identityToken, fullName } = body

    if (!identityToken || typeof identityToken !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid identityToken' },
        { status: 400 }
      )
    }

    // Verify Apple identity token
    let payload
    try {
      payload = await verifyAppleToken(identityToken)
    } catch {
      return NextResponse.json(
        { error: 'Invalid Apple identity token' },
        { status: 401 }
      )
    }

    if (!payload || !payload.sub) {
      return NextResponse.json(
        { error: 'Invalid token payload' },
        { status: 401 }
      )
    }

    const appleId = payload.sub
    // Email comes from verified JWT (reliable), not request body
    const email = payload.email?.toLowerCase()
    // Name only arrives on first sign-in via the request body
    const name =
      fullName?.givenName && fullName?.familyName
        ? `${fullName.givenName} ${fullName.familyName}`.trim()
        : fullName?.givenName || email?.split('@')[0] || 'Trypzy User'

    const db = await connectToMongo()

    // Find user by appleId OR email (mirrors Google route pattern)
    const query = [{ appleId }]
    if (email) query.push({ email })

    let user = await db.collection('users').findOne({ $or: query })

    if (!user) {
      // Create new user
      user = {
        id: uuidv4(),
        email: email || undefined,
        name,
        appleId,
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
    } else {
      // Ensure appleId is linked and custom id exists
      const updates = {}
      if (!user.appleId) updates.appleId = appleId
      if (!user.id) updates.id = uuidv4()
      // Update name if we got a fresh one and current name looks like a placeholder
      if (
        fullName?.givenName &&
        user.name === user.email?.split('@')[0]
      ) {
        updates.name = name
      }

      if (Object.keys(updates).length > 0) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: updates }
        )
        Object.assign(user, updates)
      }
    }

    // Sign JWT with SAME format as getUserFromToken() expects
    const token = jwt.sign(
      { userId: user.id },
      jwtSecret,
      { expiresIn: '7d' }
    )

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
