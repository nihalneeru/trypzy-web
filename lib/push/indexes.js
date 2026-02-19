/**
 * Push notification database indexes.
 *
 * Run once during setup or migration.
 * Safe to call multiple times (createIndex is idempotent).
 */

/**
 * Ensure all push-related indexes exist.
 *
 * @param {object} db - MongoDB database instance
 */
export async function ensurePushIndexes(db) {
  // push_tokens: unique per user+device
  await db.collection('push_tokens').createIndex(
    { userId: 1, token: 1 },
    { unique: true, background: true }
  )

  // push_events: atomic dedupe upsert
  await db.collection('push_events').createIndex(
    { userId: 1, dedupeKey: 1 },
    { unique: true, background: true }
  )

  // push_events: daily cap count query
  await db.collection('push_events').createIndex(
    { userId: 1, sentAt: -1 },
    { background: true }
  )

  // push_events: TTL — expire after 30 days
  await db.collection('push_events').createIndex(
    { sentAt: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60, background: true }
  )
}
