/**
 * Nudge Correlation
 *
 * Tracks when user actions correlate with recently displayed nudges.
 * This is critical for measuring nudge effectiveness.
 *
 * Architecture (per EVENTS_SPEC.md):
 * - nudge_events: Short-lived correlation cache (TTL 7 days)
 * - trip_events: Long-term ledger (nudge.system.correlated_action events)
 */

import { ObjectId } from 'mongodb'
import { connectToMongo } from '@/lib/server/db'
import { emitNonCriticalEvent } from './emit'
import { EVENT_TYPES, type ActorRole } from './types'

// Correlation window: 30 minutes
const CORRELATION_WINDOW_MS = 30 * 60 * 1000

/**
 * Check if a recent nudge was displayed to this user and emit correlation event.
 *
 * @param tripId - Trip ID
 * @param circleId - Circle ID
 * @param userId - User ID
 * @param actionType - What action the user took (e.g., 'window_suggested')
 * @param tripCreatedAt - Trip creation date
 */
export async function checkNudgeCorrelation(
  tripId: string | ObjectId,
  circleId: string | ObjectId,
  userId: string | ObjectId,
  actionType: string,
  tripCreatedAt: Date
): Promise<void> {
  const db = await connectToMongo()

  const cutoffTime = new Date(Date.now() - CORRELATION_WINDOW_MS)

  // Find nudge displayed to this user in last 30 minutes
  // Uses nudge_events (short-lived cache) for fast lookup
  // The nudge_events collection stores createdAt as ISO string
  const recentNudge = await db.collection('nudge_events').findOne(
    {
      tripId: tripId.toString(),
      userId: userId.toString(),
      status: 'shown',
      createdAt: { $gte: cutoffTime.toISOString() },
    },
    { sort: { createdAt: -1 } } // Most recent first
  )

  if (!recentNudge) {
    // No recent nudge, nothing to correlate
    return
  }

  // Calculate latency from nudge display to action
  const nudgeDisplayedAt = new Date(recentNudge.createdAt)
  const latencyMs = Date.now() - nudgeDisplayedAt.getTime()
  const latencySeconds = Math.round(latencyMs / 1000)

  // Emit correlation to trip_events (long-term ledger)
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.NUDGE_CORRELATED_ACTION,
    userId,
    'traveler' as ActorRole,
    tripCreatedAt,
    {
      nudgeType: recentNudge.nudgeType,
      actionType,
      latencySeconds,
    },
    {
      precedingEventId: recentNudge._id?.toString() || recentNudge.id,
      latencyFromPrecedingMs: latencyMs,
    }
  )
}

/**
 * Ensure the TTL index exists on nudge_events.
 * Call this during app initialization.
 */
export async function ensureNudgeEventsTTLIndex(): Promise<void> {
  const db = await connectToMongo()

  try {
    // Create TTL index on displayedAt field (7 days expiry)
    // Note: nudge_events uses createdAt, not displayedAt
    // We need to add a displayedAt field or use createdAt
    await db.collection('nudge_events').createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: 604800, // 7 days
        background: true,
        // Note: TTL index on string dates may not work correctly
        // Consider migrating createdAt to Date type
      }
    )
  } catch (err: unknown) {
    // Index might already exist with different options
    // Log but don't fail
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      err.code !== 85 // IndexOptionsConflict
    ) {
      console.error('[events] Failed to create nudge_events TTL index:', err)
    }
  }
}
