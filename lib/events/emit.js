/**
 * Event Emitter for Trypzy Data Moat
 *
 * Emits structured events to trip_events collection per EVENTS_SPEC.md.
 * This is the canonical event emitter for the coordination intelligence moat.
 */

import { ObjectId } from 'mongodb'
import { connectToMongo } from '@/lib/server/db'
import * as Sentry from '@sentry/nextjs'

// ============ Core Emitter ============

/**
 * Emit a trip event to the trip_events collection.
 *
 * @param {string|ObjectId} tripId - Trip ID
 * @param {string|ObjectId} circleId - Circle ID (denormalized for aggregation)
 * @param {string} eventType - Namespaced event type (e.g., 'scheduling.window.suggested')
 * @param {string|ObjectId|null} actorId - User ID or null for system events
 * @param {'leader'|'traveler'|'system'} actorRole - Actor role
 * @param {Date} tripCreatedAt - Trip creation date (for computing tripAgeMs)
 * @param {Object} payload - Event-specific data (IDs only, no full documents)
 * @param {Object} [options] - Optional: idempotencyKey, precedingEventId, latencyFromPrecedingMs, sessionId
 * @returns {Promise<string|null>} Event ID string or null if duplicate
 */
export async function emitTripEvent(
  tripId,
  circleId,
  eventType,
  actorId,
  actorRole,
  tripCreatedAt,
  payload,
  options
) {
  const db = await connectToMongo()

  const now = new Date()
  const tripAgeMs = now.getTime() - tripCreatedAt.getTime()

  const event = {
    schemaVersion: 1,
    tripId: new ObjectId(tripId),
    circleId: new ObjectId(circleId),
    eventType,
    actorId: actorId ? new ObjectId(actorId) : null,
    actorRole,
    timestamp: now,
    tripAgeMs,
    payload,
  }

  // Add idempotencyKey if provided
  if (options?.idempotencyKey) {
    event.idempotencyKey = options.idempotencyKey
  }

  // Add context if precedingEventId or sessionId provided
  if (options?.precedingEventId || options?.sessionId) {
    event.context = {}
    if (options.precedingEventId) {
      event.context.precedingEventId = new ObjectId(options.precedingEventId)
    }
    if (options.latencyFromPrecedingMs != null) {
      event.context.latencyFromPrecedingMs = options.latencyFromPrecedingMs
    }
    if (options.sessionId) {
      event.context.sessionId = options.sessionId
    }
  }

  try {
    const result = await db.collection('trip_events').insertOne(event)
    return result.insertedId.toString()
  } catch (err) {
    // Handle duplicate idempotencyKey gracefully (MongoDB error code 11000)
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code === 11000 &&
      options?.idempotencyKey
    ) {
      console.log(`[events] Duplicate event skipped: ${options.idempotencyKey}`)
      return null
    }
    console.error(`[events] Failed to emit ${eventType}:`, err)
    throw err
  }
}

// ============ Helpers for Common Patterns ============

/**
 * Emit a critical event with best-effort durability.
 * Awaits the write but catches errors to not break user flow.
 *
 * @returns {Promise<string|null>} Event ID or null on failure
 */
export async function emitCriticalEvent(
  tripId,
  circleId,
  eventType,
  actorId,
  actorRole,
  tripCreatedAt,
  payload,
  options
) {
  try {
    return await emitTripEvent(
      tripId,
      circleId,
      eventType,
      actorId,
      actorRole,
      tripCreatedAt,
      payload,
      options
    )
  } catch (err) {
    // Log prominently but don't break user flow
    console.error('[events] CRITICAL event failed:', err, {
      tripId: tripId.toString(),
      eventType,
    })
    // Report to Sentry for production monitoring
    Sentry.captureException(err, {
      tags: { component: 'events', eventType },
      extra: { tripId: tripId.toString(), circleId: circleId?.toString() }
    })
    return null
  }
}

/**
 * Emit a non-critical event (fire-and-forget with logging).
 * Returns immediately, logs errors.
 */
export function emitNonCriticalEvent(
  tripId,
  circleId,
  eventType,
  actorId,
  actorRole,
  tripCreatedAt,
  payload,
  options
) {
  emitTripEvent(
    tripId,
    circleId,
    eventType,
    actorId,
    actorRole,
    tripCreatedAt,
    payload,
    options
  ).catch((err) => {
    console.error('[events] Non-critical event failed:', err, {
      tripId: tripId.toString(),
      eventType,
    })
  })
}
