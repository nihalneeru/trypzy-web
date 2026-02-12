/**
 * One-time migration script to add custom `id` field to users created by MongoDBAdapter
 *
 * Run with: node scripts/migrate-users-add-id.js
 *
 * This is optional - the auth flow now handles this automatically on login.
 * Use this if you want to proactively fix all users at once.
 */

import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import 'dotenv/config'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'tripti'

async function migrate() {
  if (!MONGO_URL) {
    console.error('MONGO_URL environment variable not set')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  const client = await MongoClient.connect(MONGO_URL)
  const db = client.db(DB_NAME)

  try {
    // Find users without custom id field
    const usersWithoutId = await db.collection('users').find({
      id: { $exists: false }
    }).toArray()

    console.log(`Found ${usersWithoutId.length} users without custom id field`)

    if (usersWithoutId.length === 0) {
      console.log('No migration needed!')
      return
    }

    // Migrate each user
    let migrated = 0
    for (const user of usersWithoutId) {
      const newId = uuidv4()
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { id: newId } }
      )
      console.log(`  Migrated: ${user.email} -> ${newId}`)
      migrated++
    }

    console.log(`\nMigration complete! ${migrated} users updated.`)

    // Verify
    const remaining = await db.collection('users').countDocuments({
      id: { $exists: false }
    })
    console.log(`Users still without id: ${remaining}`)

  } finally {
    await client.close()
  }
}

migrate().catch(console.error)
