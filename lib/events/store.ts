/**
 * TripEvent Store
 *
 * Helpers for recording and querying trip events.
 * Events are persisted for analytics, ML training, and audit trails.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  TripEvent,
  TripEventType,
  TripEventMetadata,
  RecordTripEventInput,
  GetRecentTripEventsOptions,
} from './types'

/**
 * Record a trip event to the database.
 *
 * @param db - MongoDB database instance
 * @param input - Event data to record
 * @returns The created event
 */
export async function recordTripEvent(
  db: any,
  input: RecordTripEventInput
): Promise<TripEvent> {
  const event: TripEvent = {
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
 * @param db - MongoDB database instance
 * @param tripId - Trip ID to query events for
 * @param options - Query options (since, types, limit)
 * @returns Array of matching events
 */
export async function getRecentTripEvents(
  db: any,
  tripId: string,
  options: GetRecentTripEventsOptions = {}
): Promise<TripEvent[]> {
  const { since, types, limit = 100 } = options

  const query: Record<string, unknown> = { tripId }

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

  return events as TripEvent[]
}

/**
 * Check if a specific event type has occurred for a trip.
 *
 * @param db - MongoDB database instance
 * @param tripId - Trip ID
 * @param type - Event type to check
 * @param since - Optional: only check events since this date
 * @returns True if event exists
 */
export async function hasEventOccurred(
  db: any,
  tripId: string,
  type: TripEventType,
  since?: Date
): Promise<boolean> {
  const query: Record<string, unknown> = { tripId, type }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  const count = await db.collection('trip_events').countDocuments(query)
  return count > 0
}

/**
 * Get the most recent event of a specific type for a trip.
 *
 * @param db - MongoDB database instance
 * @param tripId - Trip ID
 * @param type - Event type to find
 * @returns The most recent event or null
 */
export async function getLatestEvent(
  db: any,
  tripId: string,
  type: TripEventType
): Promise<TripEvent | null> {
  const event = await db
    .collection('trip_events')
    .findOne({ tripId, type }, { sort: { createdAt: -1 } })

  return event as TripEvent | null
}

/**
 * Count events of a specific type for a trip.
 *
 * @param db - MongoDB database instance
 * @param tripId - Trip ID
 * @param type - Event type to count
 * @param since - Optional: only count events since this date
 * @returns Event count
 */
export async function countEvents(
  db: any,
  tripId: string,
  type: TripEventType,
  since?: Date
): Promise<number> {
  const query: Record<string, unknown> = { tripId, type }

  if (since) {
    query.createdAt = { $gte: since.toISOString() }
  }

  return db.collection('trip_events').countDocuments(query)
}

/**
 * Get events by actor (user who triggered the event).
 *
 * @param db - MongoDB database instance
 * @param tripId - Trip ID
 * @param actorUserId - User ID
 * @param options - Query options
 * @returns Array of events
 */
export async function getEventsByActor(
  db: any,
  tripId: string,
  actorUserId: string,
  options: GetRecentTripEventsOptions = {}
): Promise<TripEvent[]> {
  const { since, types, limit = 50 } = options

  const query: Record<string, unknown> = { tripId, actorUserId }

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

  return events as TripEvent[]
}
