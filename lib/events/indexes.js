/**
 * Event System Database Indexes
 *
 * Ensures required indexes exist for the trip_events collection.
 * Run during app initialization or as a migration.
 */

import { connectToMongo } from '@/lib/server/db'

/**
 * Ensure all required indexes exist for the event system.
 * Safe to call multiple times (createIndex is idempotent).
 */
export async function ensureEventIndexes() {
  const db = await connectToMongo()

  console.log('[events] Ensuring trip_events indexes...')

  try {
    // Primary: query by trip timeline
    await db.collection('trip_events').createIndex(
      { tripId: 1, timestamp: 1 },
      { background: true }
    )

    // Circle-level aggregation
    await db.collection('trip_events').createIndex(
      { circleId: 1, timestamp: -1 },
      { background: true }
    )

    // Event type filtering
    await db.collection('trip_events').createIndex(
      { eventType: 1, timestamp: -1 },
      { background: true }
    )

    // Idempotency (sparse unique) - only indexes documents with idempotencyKey
    await db.collection('trip_events').createIndex(
      { idempotencyKey: 1 },
      { unique: true, sparse: true, background: true }
    )

    console.log('[events] trip_events indexes created successfully')
  } catch (err) {
    // Handle index conflicts gracefully
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err.code === 85 || err.code === 86) // IndexOptionsConflict or IndexKeySpecsConflict
    ) {
      console.log('[events] Some indexes already exist with different options, skipping')
    } else {
      console.error('[events] Failed to create trip_events indexes:', err)
      throw err
    }
  }

  // Ensure nudge_events TTL index
  console.log('[events] Ensuring nudge_events TTL index...')

  try {
    // TTL index for auto-expiry after 7 days
    // Note: nudge_events stores createdAt as ISO string, but TTL needs Date type
    // This index will work for new Date-typed fields
    await db.collection('nudge_events').createIndex(
      { displayedAt: 1 },
      { expireAfterSeconds: 604800, background: true, sparse: true }
    )

    console.log('[events] nudge_events TTL index created successfully')
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err.code === 85 || err.code === 86)
    ) {
      console.log('[events] nudge_events TTL index already exists, skipping')
    } else {
      console.error('[events] Failed to create nudge_events TTL index:', err)
      // Don't throw - TTL index is not critical for MVP
    }
  }
}

/**
 * List current indexes on trip_events (for debugging).
 */
export async function listEventIndexes() {
  const db = await connectToMongo()

  const tripEventIndexes = await db.collection('trip_events').indexes()
  console.log('[events] trip_events indexes:', JSON.stringify(tripEventIndexes, null, 2))

  const nudgeEventIndexes = await db.collection('nudge_events').indexes()
  console.log('[events] nudge_events indexes:', JSON.stringify(nudgeEventIndexes, null, 2))
}
