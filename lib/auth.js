import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-key'
const PRIVATE_BETA_SECRET = process.env.PRIVATE_BETA_SECRET || 'trypzy-beta-2024'

// MongoDB connection for NextAuth adapter
let mongoClientPromise

function getMongoClient() {
  if (!mongoClientPromise) {
    mongoClientPromise = MongoClient.connect(process.env.MONGO_URL)
  }
  return mongoClientPromise
}

// Get database name consistently
const getDbName = () => process.env.DB_NAME || 'trypzy'

export const authOptions = {
  adapter: MongoDBAdapter(getMongoClient(), { databaseName: getDbName() }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // select_account: always show account picker (important for multi-account users)
          // consent: show permissions screen (needed for offline access)
          prompt: 'select_account consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        const { cookies } = await import('next/headers')
        const cookieStore = cookies()
        const authMode = cookieStore.get('trypzy_auth_mode')?.value

        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth] signIn callback:', {
            email: user.email,
            authMode,
            provider: account.provider
          })
        }

        const client = await getMongoClient()
        const db = client.db(getDbName())
        const existingUser = await db.collection('users').findOne({
          email: user.email.toLowerCase()
        })

        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth] User lookup result:', {
            email: user.email.toLowerCase(),
            found: !!existingUser,
            userId: existingUser?.id
          })
        }

        // If mode is explicit login, ensure user exists
        if (authMode === 'login') {
          if (!existingUser) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Login failed: user not found')
            }
            return '/signup?error=AccountNotFound'
          }
        }

        // If mode is explicit signup, ensure user does NOT exist
        if (authMode === 'signup') {
          if (existingUser) {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Signup failed: user already exists')
            }
            return '/login?error=AccountExists'
          }
        }

        // Verify beta secret from sessionStorage (will be checked on client side)
        // The actual validation happens before redirect, so we trust it here
        return true
      }
      return true
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === 'google' && user) {
        try {
          const client = await getMongoClient()
          const db = client.db(getDbName())

          // Check if user exists in our custom users collection
          const existingUser = await db.collection('users').findOne({
            email: user.email.toLowerCase()
          })

          if (process.env.NODE_ENV === 'development') {
            console.log('[Auth] jwt callback:', {
              email: user.email.toLowerCase(),
              existingUser: !!existingUser
            })
          }

          if (!existingUser) {
            // NOTE: This branch rarely executes because MongoDBAdapter creates the user
            // BEFORE this callback runs. We keep it as a fallback for edge cases.
            const newUser = {
              id: uuidv4(),
              email: user.email.toLowerCase(),
              name: user.name,
              googleId: account.providerAccountId,
              createdAt: new Date().toISOString(),
            }
            await db.collection('users').insertOne(newUser)
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Created new user:', newUser.id)
            }

            token.userId = newUser.id
            token.email = newUser.email
            token.name = newUser.name
          } else {
            // Handle users created by MongoDBAdapter (with _id but not our custom id field)
            // This is the common path - adapter creates user, we add our id field
            let userId = existingUser.id
            if (!userId) {
              userId = uuidv4()
              await db.collection('users').updateOne(
                { _id: existingUser._id },
                { $set: { id: userId } }
              )
              if (process.env.NODE_ENV === 'development') {
                console.log('[Auth] Migrated adapter user, added id:', userId)
              }
            }
            token.userId = userId
            token.email = existingUser.email
            token.name = existingUser.name
          }

          // Generate our custom JWT token for API compatibility
          token.customToken = jwt.sign({ userId: token.userId }, JWT_SECRET, { expiresIn: '7d' })
        } catch (error) {
          console.error('[Auth] Error in JWT callback:', error)
          // Propagate error to session so client can detect and handle it
          token.authError = 'Authentication failed. Please try again.'
        }
      }
      return token
    },
    async session({ session, token }) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth] session callback:', {
          hasUserId: !!token.userId,
          hasCustomToken: !!token.customToken,
          hasError: !!token.authError
        })
      }

      // Propagate any auth errors to the session for client-side handling
      if (token.authError) {
        session.error = token.authError
      }

      if (token.userId) {
        session.user.id = token.userId
        session.accessToken = token.customToken
      } else if (process.env.NODE_ENV === 'development') {
        console.warn('[Auth] No userId in token, session.accessToken will not be set')
      }
      return session
    },
  },
  pages: {
    signIn: '/signup',
    error: '/signup',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days - aligned with our custom token expiration
  },
  secret: process.env.NEXTAUTH_SECRET || JWT_SECRET,
}

// Helper function to validate private beta secret
export function validateBetaSecret(secret) {
  return secret === PRIVATE_BETA_SECRET
}

export { PRIVATE_BETA_SECRET }
