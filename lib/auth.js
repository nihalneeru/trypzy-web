import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-key'
// MongoDB connection singleton
let mongoClientPromise

function getMongoClient() {
  if (!mongoClientPromise) {
    mongoClientPromise = MongoClient.connect(process.env.MONGO_URL)
  }
  return mongoClientPromise
}

// Get database - single source of truth
async function getDb() {
  const client = await getMongoClient()
  return client.db(process.env.DB_NAME || 'tripti')
}

export const authOptions = {
  // NO ADAPTER - we manage users ourselves in the jwt callback
  // This eliminates the dual-system conflict that was causing auth failures
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Always show account picker (important for multi-account users)
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
        try {
          // Read auth mode cookie — wrapped in its own try-catch because
          // cookies() from next/headers can throw in NextAuth callback context
          let authMode = null
          try {
            const { cookies } = await import('next/headers')
            const cookieStore = cookies()
            authMode = cookieStore.get('tripti_auth_mode')?.value
          } catch (cookieErr) {
            // cookies() not available in this context — skip auth mode check
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] cookies() unavailable in signIn callback, skipping authMode check')
            }
          }

          if (process.env.NODE_ENV === 'development') {
            console.log('[Auth] signIn callback:', {
              email: user.email,
              googleId: account.providerAccountId,
              authMode,
            })
          }

          const db = await getDb()

          // Find user by email OR googleId (handles account linking)
          const existingUser = await db.collection('users').findOne({
            $or: [
              { email: user.email.toLowerCase() },
              { googleId: account.providerAccountId }
            ]
          })

          if (process.env.NODE_ENV === 'development') {
            console.log('[Auth] User lookup:', {
              found: !!existingUser,
              hasGoogleId: !!existingUser?.googleId,
              userId: existingUser?.id
            })
          }

          // Validate auth mode (only if cookie was readable)
          if (authMode === 'login' && !existingUser) {
            // Allow through — jwt() callback will create the account.
            // Beta phrase was already validated before OAuth was initiated.
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] No existing account on login, will auto-create in jwt callback')
            }
          }

          if (authMode === 'signup' && existingUser) {
            return '/login?error=AccountExists'
          }

          return true
        } catch (error) {
          console.error('[Auth] signIn callback error:', error)
          return '/signup?error=CallbackError'
        }
      }
      return true
    },

    async jwt({ token, user, account, profile }) {
      // Only run on initial sign-in (when account is present)
      if (account?.provider === 'google' && user) {
        try {
          const db = await getDb()

          // Find user by email OR googleId
          let dbUser = await db.collection('users').findOne({
            $or: [
              { email: user.email.toLowerCase() },
              { googleId: account.providerAccountId }
            ]
          })

          if (!dbUser) {
            // Create new user
            dbUser = {
              id: uuidv4(),
              email: user.email.toLowerCase(),
              name: user.name,
              googleId: account.providerAccountId,
              createdAt: new Date().toISOString(),
            }
            await db.collection('users').insertOne(dbUser)

            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Created new user:', dbUser.id)
            }
          } else {
            // Update existing user if needed
            const updates = {}

            // Ensure googleId is set (links OAuth account to user)
            if (!dbUser.googleId) {
              updates.googleId = account.providerAccountId
            }

            // Ensure custom id field exists (migration from old records)
            if (!dbUser.id) {
              updates.id = uuidv4()
            }

            // Apply updates if any
            if (Object.keys(updates).length > 0) {
              await db.collection('users').updateOne(
                { _id: dbUser._id },
                { $set: updates }
              )
              // Merge updates into dbUser for token
              Object.assign(dbUser, updates)

              if (process.env.NODE_ENV === 'development') {
                console.log('[Auth] Updated user:', updates)
              }
            }
          }

          // Set token fields
          token.userId = dbUser.id
          token.email = dbUser.email
          token.name = dbUser.name

          // Generate our custom JWT for API authentication
          token.customToken = jwt.sign(
            { userId: token.userId },
            JWT_SECRET,
            { expiresIn: '7d' }
          )

        } catch (error) {
          console.error('[Auth] jwt callback error:', error)
          token.authError = 'Authentication failed. Please try again.'
        }
      }
      return token
    },

    async session({ session, token }) {
      // Propagate auth errors to client
      if (token.authError) {
        session.error = token.authError
        return session
      }

      // Set session fields from token
      if (token.userId) {
        session.user.id = token.userId
        session.accessToken = token.customToken
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[Auth] session:', {
          hasUserId: !!session.user?.id,
          hasAccessToken: !!session.accessToken,
          hasError: !!session.error
        })
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
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  secret: process.env.NEXTAUTH_SECRET || JWT_SECRET,
}

