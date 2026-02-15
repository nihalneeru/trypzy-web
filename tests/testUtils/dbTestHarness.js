/**
 * Canonical test harness for API integration tests
 * 
 * Ensures consistent MongoDB connection setup across all tests:
 * - Sets env vars (MONGO_URL, MONGO_URI, DB_NAME, JWT_SECRET)
 * - Resets cached connection once before route handler imports
 * - Returns db handle that matches what route handlers see
 */

import { MongoClient } from 'mongodb'
import { resetMongoConnection } from '../../lib/server/db.js'

const TEST_DB_NAME = 'tripti_test'
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://localhost:27017'
const JWT_SECRET = process.env.JWT_SECRET || 'tripti-secret-key-change-in-production'

/**
 * Sets up test database environment and returns a db handle
 * Call this in beforeAll before importing route handlers
 * 
 * @returns {Promise<{db: Db, client: MongoClient}>} Database handle and client
 */
export async function setupTestDatabase() {
  // Set env vars consistently (both MONGO_URL for connectToMongo and MONGO_URI for test clients)
  process.env.MONGO_URL = MONGO_URI
  process.env.MONGO_URI = MONGO_URI
  process.env.DB_NAME = TEST_DB_NAME
  process.env.JWT_SECRET = JWT_SECRET
  
  // Reset cached connection so route handlers use test database
  await resetMongoConnection()
  
  // Create test's own db handle
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  const db = client.db(TEST_DB_NAME)
  
  return { db, client }
}

/**
 * Cleans up test database connection
 * Call this in afterAll
 * 
 * @param {MongoClient} client - MongoDB client to close
 */
export async function teardownTestDatabase(client) {
  if (client) {
    await client.close()
  }
}

export { TEST_DB_NAME, MONGO_URI, JWT_SECRET }
