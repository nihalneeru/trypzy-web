/**
 * Diagnostic script to check user database state
 *
 * Run with: node scripts/diagnose-users.js
 *
 * This helps identify any users who may have been affected by auth issues.
 */

import { MongoClient } from 'mongodb'
import 'dotenv/config'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'trypzy'

async function diagnose() {
  if (!MONGO_URL) {
    console.error('MONGO_URL environment variable not set')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  const client = await MongoClient.connect(MONGO_URL)
  const db = client.db(DB_NAME)

  try {
    console.log('\n=== USER DATABASE DIAGNOSIS ===\n')

    // Total users
    const totalUsers = await db.collection('users').countDocuments()
    console.log(`Total users in database: ${totalUsers}`)

    // Users with our custom id field
    const usersWithId = await db.collection('users').countDocuments({
      id: { $exists: true }
    })
    console.log(`Users with custom id field: ${usersWithId}`)

    // Users without custom id field
    const usersWithoutId = await db.collection('users').countDocuments({
      id: { $exists: false }
    })
    console.log(`Users WITHOUT custom id field: ${usersWithoutId}`)

    // Users with googleId (OAuth linked)
    const usersWithGoogleId = await db.collection('users').countDocuments({
      googleId: { $exists: true }
    })
    console.log(`Users with googleId (OAuth linked): ${usersWithGoogleId}`)

    // Users without googleId (need to re-auth to link)
    const usersWithoutGoogleId = await db.collection('users').countDocuments({
      googleId: { $exists: false }
    })
    console.log(`Users WITHOUT googleId: ${usersWithoutGoogleId}`)

    if (usersWithoutId > 0) {
      console.log('\n⚠️  These users need migration (will happen automatically on next login):')
      const users = await db.collection('users').find({
        id: { $exists: false }
      }).project({ email: 1, name: 1, _id: 1 }).toArray()

      users.forEach(u => {
        console.log(`  - ${u.email} (${u.name || 'no name'})`)
      })
    }

    // Check for duplicate emails (case-insensitive)
    console.log('\n--- Checking for duplicate emails ---')
    const duplicates = await db.collection('users').aggregate([
      {
        $group: {
          _id: { $toLower: '$email' },
          count: { $sum: 1 },
          docs: { $push: { id: '$id', _id: '$_id', email: '$email' } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray()

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} emails with duplicates:`)
      duplicates.forEach(d => {
        console.log(`  - ${d._id}: ${d.count} records`)
        d.docs.forEach(doc => console.log(`    - id: ${doc.id || 'MISSING'}, _id: ${doc._id}`))
      })
    } else {
      console.log('✓ No duplicate emails found')
    }

    // Check NextAuth adapter collections
    console.log('\n--- NextAuth Adapter Collections ---')
    const collections = await db.listCollections().toArray()
    const nextAuthCollections = ['users', 'accounts', 'sessions', 'verification_tokens']

    for (const name of nextAuthCollections) {
      const exists = collections.some(c => c.name === name)
      if (exists) {
        const count = await db.collection(name).countDocuments()
        console.log(`  ${name}: ${count} documents`)
      } else {
        console.log(`  ${name}: (not found)`)
      }
    }

    // Sample user structure
    console.log('\n--- Sample User Document Structure ---')
    const sampleUser = await db.collection('users').findOne()
    if (sampleUser) {
      const keys = Object.keys(sampleUser)
      console.log(`Fields present: ${keys.join(', ')}`)
    }

    console.log('\n=== DIAGNOSIS COMPLETE ===\n')

  } finally {
    await client.close()
  }
}

diagnose().catch(console.error)
