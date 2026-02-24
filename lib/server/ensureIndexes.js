/**
 * Lazy Index Creation for Boost-related Collections
 *
 * Called once on first boost endpoint hit. Uses a module-level flag
 * to avoid redundant createIndex calls (which are idempotent but
 * still cost a round-trip to MongoDB).
 */

import { connectToMongo } from './db.js'

let indexesEnsured = false

export async function ensureBoostIndexes() {
  if (indexesEnsured) return
  indexesEnsured = true

  const db = await connectToMongo()

  await Promise.all([
    db.collection('boost_purchases').createIndex({ tripId: 1 }),
    db.collection('boost_purchases').createIndex({ userId: 1 }),
    db.collection('boost_purchases').createIndex(
      { stripePaymentIntentId: 1 },
      { unique: true, sparse: true }
    ),
  ])
}
