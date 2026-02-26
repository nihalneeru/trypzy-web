/**
 * Core MongoDB indexes for hot query paths.
 * Called once on first API request (lazy singleton).
 */

let indexesCreated = false

export async function ensureCoreIndexes(db) {
  if (indexesCreated) return
  if (!db) return // Guard against undefined db (race condition during cold start)
  indexesCreated = true

  try {
    await Promise.all([
      // trips — queried by id, circleId, createdBy, status
      db.collection('trips').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('trips').createIndex({ circleId: 1 }, { background: true }),
      db.collection('trips').createIndex({ createdBy: 1 }, { background: true }),
      db.collection('trips').createIndex({ status: 1 }, { background: true }),

      // circles — queried by id, inviteCode
      db.collection('circles').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('circles').createIndex({ inviteCode: 1 }, { unique: true, sparse: true, background: true }),

      // memberships — queried by (userId, circleId) pair, also by circleId alone
      db.collection('memberships').createIndex({ userId: 1, circleId: 1 }, { unique: true, background: true }),
      db.collection('memberships').createIndex({ circleId: 1 }, { background: true }),

      // trip_participants — queried by tripId, also by (tripId, userId)
      db.collection('trip_participants').createIndex({ tripId: 1 }, { background: true }),
      db.collection('trip_participants').createIndex({ tripId: 1, userId: 1 }, { unique: true, background: true }),

      // date_windows — queried by tripId
      db.collection('date_windows').createIndex({ tripId: 1 }, { background: true }),

      // window_supports — queried by (tripId, windowId), also by (tripId, userId)
      db.collection('window_supports').createIndex({ tripId: 1, windowId: 1 }, { background: true }),
      db.collection('window_supports').createIndex({ tripId: 1, userId: 1 }, { background: true }),

      // trip_messages — queried by tripId, sorted by createdAt
      db.collection('trip_messages').createIndex({ tripId: 1, createdAt: -1 }, { background: true }),

      // users — queried by id, email
      db.collection('users').createIndex({ id: 1 }, { unique: true, background: true }),
      db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true, background: true }),
    ])
  } catch (error) {
    // Log but don't throw — indexes are optimization, not required for correctness
    console.warn('[ensureCoreIndexes] Some indexes may already exist:', error.message)
  }
}
