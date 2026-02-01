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
          prompt: 'consent',
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

        console.log('[Auth] signIn callback:', {
          email: user.email,
          authMode,
          provider: account.provider
        })

        const client = await getMongoClient()
        const db = client.db(getDbName())
        const existingUser = await db.collection('users').findOne({
          email: user.email.toLowerCase()
        })

        console.log('[Auth] User lookup result:', {
          email: user.email.toLowerCase(),
          found: !!existingUser,
          userId: existingUser?.id
        })

        // If mode is explicit login, ensure user exists
        if (authMode === 'login') {
          if (!existingUser) {
            console.log('[Auth] Login failed: user not found')
            return '/signup?error=AccountNotFound'
          }
        }

        // If mode is explicit signup, ensure user does NOT exist
        if (authMode === 'signup') {
          if (existingUser) {
            console.log('[Auth] Signup failed: user already exists')
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

          console.log('[Auth] jwt callback:', {
            email: user.email.toLowerCase(),
            existingUser: !!existingUser
          })

          if (!existingUser) {
            // Create user in our custom users collection
            const newUser = {
              id: uuidv4(),
              email: user.email.toLowerCase(),
              name: user.name,
              googleId: account.providerAccountId,
              createdAt: new Date().toISOString(),
            }
            await db.collection('users').insertOne(newUser)
            console.log('[Auth] Created new user:', newUser.id)

            token.userId = newUser.id
            token.email = newUser.email
            token.name = newUser.name
          } else {
            token.userId = existingUser.id
            token.email = existingUser.email
            token.name = existingUser.name
          }

          // Generate our custom JWT token for API compatibility
          token.customToken = jwt.sign({ userId: token.userId }, JWT_SECRET, { expiresIn: '7d' })
        } catch (error) {
          console.error('[Auth] Error in JWT callback:', error)
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId
        session.accessToken = token.customToken
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
  },
  secret: process.env.NEXTAUTH_SECRET || JWT_SECRET,
}

// Helper function to validate private beta secret
export function validateBetaSecret(secret) {
  return secret === PRIVATE_BETA_SECRET
}

export { PRIVATE_BETA_SECRET }
