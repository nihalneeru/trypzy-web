import { NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/server/db'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production')
}
const jwtSecret = JWT_SECRET || 'dev-only-secret-key'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID)

/**
 * POST /api/mobile/auth/google
 *
 * Accepts a Google ID token from native app, verifies it,
 * finds or creates the user, and returns a Trypzy JWT.
 *
 * The JWT uses the SAME payload format and secret as the web flow:
 *   jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' })
 *
 * This ensures getUserFromToken() in the main API handler works identically.
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const { idToken } = body

    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid idToken' },
        { status: 400 }
      )
    }

    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Accept tokens issued for the web, iOS, or Android client ID
    const validAudiences = [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID].filter(Boolean)

    // Verify Google ID token
    let ticket
    try {
      ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: validAudiences,
      })
    } catch {
      return NextResponse.json(
        { error: 'Invalid Google ID token' },
        { status: 401 }
      )
    }

    const payload = ticket.getPayload()
    if (!payload || !payload.email) {
      return NextResponse.json(
        { error: 'Invalid token payload' },
        { status: 401 }
      )
    }

    const email = payload.email.toLowerCase()
    const name = payload.name || email.split('@')[0]
    const googleId = payload.sub

    const db = await connectToMongo()

    // Find user by email OR googleId (mirrors lib/auth.js logic)
    let user = await db.collection('users').findOne({
      $or: [
        { email },
        { googleId }
      ]
    })

    if (!user) {
      // Create new user (mirrors lib/auth.js jwt callback)
      user = {
        id: uuidv4(),
        email,
        name,
        googleId,
        createdAt: new Date().toISOString(),
      }
      await db.collection('users').insertOne(user)
    } else {
      // Ensure googleId is linked and custom id exists
      const updates = {}
      if (!user.googleId) updates.googleId = googleId
      if (!user.id) updates.id = uuidv4()

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
