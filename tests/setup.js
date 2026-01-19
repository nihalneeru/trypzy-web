import '@testing-library/jest-dom'
import { resetMongoConnection } from '../lib/server/db.js'

// Set test environment variables FIRST
process.env.MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
process.env.DB_NAME = 'trypzy_test'  // Force test database
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key'

// Reset any cached connection so it picks up the test DB_NAME
// Use top-level await since setup files support it in Vitest
await resetMongoConnection()

