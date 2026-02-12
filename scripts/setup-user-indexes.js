/**
 * Setup indexes for user collection
 *
 * Run with: node scripts/setup-user-indexes.js
 *
 * Creates indexes for efficient user lookups:
 * - email (unique)
 * - googleId (sparse, for OAuth lookups)
 */

import { MongoClient } from 'mongodb'
import 'dotenv/config'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'tripti'

async function setup() {
  if (!MONGO_URL) {
    console.error('MONGO_URL environment variable not set')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  const client = await MongoClient.connect(MONGO_URL)
  const db = client.db(DB_NAME)

  try {
    console.log(`Setting up indexes in ${DB_NAME} database...\n`)

    // Create email index (unique)
    console.log('Creating email index (unique)...')
    await db.collection('users').createIndex(
      { email: 1 },
      { unique: true, background: true }
    )
    console.log('  ✓ Email index created')

    // Create googleId index (sparse - only indexes documents with googleId)
    console.log('Creating googleId index (sparse)...')
    await db.collection('users').createIndex(
      { googleId: 1 },
      { sparse: true, background: true }
    )
    console.log('  ✓ GoogleId index created')

    // Create id index for our custom UUID field
    console.log('Creating id index...')
    await db.collection('users').createIndex(
      { id: 1 },
      { sparse: true, background: true }
    )
    console.log('  ✓ Id index created')

    // List all indexes
    console.log('\nCurrent indexes on users collection:')
    const indexes = await db.collection('users').indexes()
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`)
    })

    console.log('\n✓ Index setup complete!')

  } finally {
    await client.close()
  }
}

setup().catch(console.error)
