/**
 * Atomic dedupe and daily cap for push notifications.
 * Uses push_events collection with $setOnInsert upsert.
 */

/**
 * Try to record a push event (atomic dedupe).
 * Returns true if this is a new event (safe to send).
 * Returns false if duplicate (already sent).
 *
 * @param {object} db - MongoDB database instance
 * @param {object} opts
 * @param {string} opts.userId - Recipient user ID
 * @param {string} opts.dedupeKey - Unique key for this push
 * @param {string} opts.pushType - Push notification type
 * @param {string} opts.tripId - Associated trip ID
 * @returns {Promise<boolean>} true if new (safe to send), false if duplicate
 */
export async function tryRecordPush(db, { userId, dedupeKey, pushType, tripId }) {
  const result = await db.collection('push_events').updateOne(
    { userId, dedupeKey },
    { $setOnInsert: { userId, dedupeKey, pushType, tripId, sentAt: new Date() } },
    { upsert: true }
  )
  return result.upsertedCount > 0
}

/**
 * Check if user has hit daily push cap (3 per day, UTC).
 *
 * Known limitation: Uses UTC midnight, not user-local time.
 * A user in PST could receive up to 6 pushes in a 24hr window
 * across the UTC boundary. Acceptable for beta.
 *
 * @param {object} db
 * @param {string} userId
 * @returns {Promise<boolean>} true if capped (should NOT send)
 */
export async function isDailyCapped(db, userId) {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const count = await db.collection('push_events').countDocuments({
    userId,
    sentAt: { $gte: todayStart },
  })
  return count >= 3
}

/**
 * P0 types are exempt from the daily cap.
 */
const P0_TYPES = new Set([
  'trip_created_notify',
  'trip_canceled',
  'first_dates_suggested',
  'dates_proposed_by_leader',
  'dates_locked',
  'itinerary_generated',
  'join_request_received',
  'join_request_approved',
])

/**
 * Check if a push type is P0 (exempt from daily cap).
 */
export function isP0Type(pushType) {
  return P0_TYPES.has(pushType)
}
