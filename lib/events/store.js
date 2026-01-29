/**
 * TripEvent Store
 *
 * Helpers for recording and querying trip events.
 * Events are persisted for analytics, ML training, and audit trails.
 */

import { v4 as uuidv4 } from 'uuid'

/**
 * Record a trip event to the database.
 *
 * @param {Object} db - MongoDB database instance
 * @param {Object} input - Event data to record
 * @returns {Promise<Object>} The created event
 */
export async function recordTripEvent(db, input) {
  const event = {
    id: uuidv4(),
    tripId: input.tripId,
    actorUserId: input.actorUserId,
    type: input.type,
    metadata: input.metadata || {},
    createdAt: new Date().toISOString(),
  }

  await db.collection('trip_events').insertOne(event)

  return event
}

/**
 * Get recent trip events with optional filtering.
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID to query events for
 * @param {Object} [options] - Query options (since, types, limit)
 * @returns {Promise<Array>} Array of matching events
 */
export async function getRecentTripEvents(db, tripId, options = {}) {
  const { since, types, limit = 100 } = options

  const query = { tripId }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  if (types && types.length > 0) {
    query.type = { $in: types }
  }

  const events = await db
    .collection('trip_events')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()

  return events
}

/**
 * Check if a specific event type has occurred for a trip.
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID
 * @param {string} type - Event type to check
 * @param {Date} [since] - Optional: only check events since this date
 * @returns {Promise<boolean>} True if event exists
 */
export async function hasEventOccurred(db, tripId, type, since) {
  const query = { tripId, type }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  const count = await db.collection('trip_events').countDocuments(query)
  return count > 0
}

/**
 * Get the most recent event of a specific type for a trip.
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID
 * @param {string} type - Event type to find
 * @returns {Promise<Object|null>} The most recent event or null
 */
export async function getLatestEvent(db, tripId, type) {
  const event = await db
    .collection('trip_events')
    .findOne({ tripId, type }, { sort: { createdAt: -1 } })

  return event
}

/**
 * Count events of a specific type for a trip.
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID
 * @param {string} type - Event type to count
 * @param {Date} [since] - Optional: only count events since this date
 * @returns {Promise<number>} Event count
 */
export async function countEvents(db, tripId, type, since) {
  const query = { tripId, type }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  return db.collection('trip_events').countDocuments(query)
}

/**
 * Get events by actor (user who triggered the event).
 *
 * @param {Object} db - MongoDB database instance
 * @param {string} tripId - Trip ID
 * @param {string} actorUserId - User ID
 * @param {Object} [options] - Query options
 * @returns {Promise<Array>} Array of events
 */
export async function getEventsByActor(db, tripId, actorUserId, options = {}) {
  const { since, types, limit = 50 } = options

  const query = { tripId, actorUserId }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  if (types && types.length > 0) {
    query.type = { $in: types }
  }

  const events = await db
    .collection('trip_events')
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()

  return events
}
