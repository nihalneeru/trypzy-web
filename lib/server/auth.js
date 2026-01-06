import jwt from 'jsonwebtoken'
import { connectToMongo } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET || 'trypzy-secret-key-change-in-production'

// Get user from JWT token
export async function getUserFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const db = await connectToMongo()
    const user = await db.collection('users').findOne({ id: decoded.userId })
    return user
  } catch (error) {
    return null
  }
}

// Protected route helper
export async function requireAuth(request) {
  const user = await getUserFromToken(request)
  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }
  return { user }
}

