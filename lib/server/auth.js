import jwt from 'jsonwebtoken'
import { connectToMongo } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production')
}
// For development, use a default
const jwtSecret = JWT_SECRET || 'dev-only-secret-key'

// Get user from JWT token
// Returns: { user } on success, { authError: true } for bad tokens, { serverError: true } for DB issues
export async function getUserFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authError: true }
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, jwtSecret)
    const db = await connectToMongo()
    const user = await db.collection('users').findOne({ id: decoded.userId })
    if (!user) return { authError: true }
    if (user.deletedAt) return { authError: true }
    return { user }
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return { authError: true }
    }
    console.error('getUserFromToken server error:', error.message)
    return { serverError: true }
  }
}

// Protected route helper
export async function requireAuth(request) {
  const result = await getUserFromToken(request)
  if (result.serverError) {
    return { error: 'Internal server error', status: 500 }
  }
  if (result.authError || !result.user) {
    return { error: 'Unauthorized', status: 401 }
  }
  return { user: result.user }
}

