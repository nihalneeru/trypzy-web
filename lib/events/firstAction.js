/**
 * First Action Tracking
 *
 * Tracks the first meaningful action a traveler takes on a trip.
 * This is a high-value signal for engagement prediction.
 */

import { ObjectId } from 'mongodb'
import { connectToMongo } from '@/lib/server/db'
import { emitNonCriticalEvent } from './emit'
import { EVENT_TYPES } from './types'

/**
 * Emit traveler.participation.first_action ONCE per (tripId, userId).
 * Uses idempotencyKey to ensure deduplication.
 *
 * @param {string|ObjectId} tripId - Trip ID
 * @param {string|ObjectId} circleId - Circle ID
 * @param {string|ObjectId} userId - User ID
 * @param {'leader'|'traveler'} actorRole - Actor role
 * @param {string} actionType - What action triggered this (e.g., 'window_suggested', 'reaction_submitted')
 * @param {Date} tripCreatedAt - Trip creation date
 * @param {Date|null} [joinedAt] - When the user joined the trip (for computing delay)
 */
export async function maybeEmitFirstAction(
  tripId,
  circleId,
  userId,
  actorRole,
  actionType,
  tripCreatedAt,
  joinedAt
) {
  const db = await connectToMongo()
  const tripIdStr = tripId.toString()
  const userIdStr = userId.toString()

  // Check if first_action already emitted for this user on this trip
  // Use the idempotencyKey pattern for fast lookup
  const idempotencyKey = `${tripIdStr}:${userIdStr}:first_action`

  const existing = await db.collection('trip_events').findOne({
    idempotencyKey,
  })

  if (existing) {
    // Already emitted, skip
    return
  }

  // Calculate hours since join (if joinedAt provided)
  let hoursSinceJoin = null
  if (joinedAt) {
    const msSinceJoin = Date.now() - joinedAt.getTime()
    hoursSinceJoin = Math.round((msSinceJoin / (1000 * 60 * 60)) * 10) / 10 // 1 decimal place
  }

  // Emit the first action event (non-critical, fire-and-forget)
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRAVELER_FIRST_ACTION,
    userId,
    actorRole,
    tripCreatedAt,
    {
      actionType,
      hoursSinceJoin,
    },
    { idempotencyKey }
  )
}

/**
 * Get a user's join date for a trip.
 * Helper for computing hoursSinceJoin.
 *
 * @param {string|ObjectId} tripId - Trip ID
 * @param {string|ObjectId} userId - User ID
 * @returns {Promise<Date|null>} Join date or null
 */
export async function getTravelerJoinDate(tripId, userId) {
  const db = await connectToMongo()

  // Check trip_participants first
  const participant = await db.collection('trip_participants').findOne({
    tripId: new ObjectId(tripId),
    userId: new ObjectId(userId),
  })

  if (participant?.joinedAt) {
    return new Date(participant.joinedAt)
  }

  if (participant?.createdAt) {
    return new Date(participant.createdAt)
  }

  // For collaborative trips, check membership join date
  // (travelers are circle members)
  const trip = await db.collection('trips').findOne({
    _id: new ObjectId(tripId),
  })

  if (trip?.circleId) {
    const membership = await db.collection('memberships').findOne({
      circleId: trip.circleId.toString(),
      userId: userId.toString(),
    })

    if (membership?.joinedAt) {
      return new Date(membership.joinedAt)
    }
  }

  return null
}
