/**
 * Event Instrumentation Helpers
 *
 * High-level functions for instrumenting API handlers with events.
 * These wrap the core emitter with common patterns.
 */

import {
  emitCriticalEvent,
  emitNonCriticalEvent,
} from './emit'
import { EVENT_TYPES, type ActorRole } from './types'
import { maybeEmitFirstAction, getTravelerJoinDate } from './firstAction'
import { checkNudgeCorrelation } from './nudgeCorrelation'

// ============ Trip Lifecycle Events ============

/**
 * Emit trip.lifecycle.created event.
 * CRITICAL - awaits the write.
 */
export async function emitTripCreated(
  tripId: string,
  circleId: string,
  creatorId: string,
  tripType: 'collaborative' | 'hosted',
  schedulingMode: string | null,
  tripCreatedAt: Date
): Promise<void> {
  await emitCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRIP_CREATED,
    creatorId,
    'leader',
    tripCreatedAt,
    {
      tripType,
      schedulingMode,
    }
  )
}

/**
 * Emit trip.lifecycle.status_changed event.
 * Non-critical (fire-and-forget).
 */
export function emitTripStatusChanged(
  tripId: string,
  circleId: string,
  actorId: string | null,
  actorRole: ActorRole,
  fromStatus: string,
  toStatus: string,
  tripCreatedAt: Date
): void {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRIP_STATUS_CHANGED,
    actorId,
    actorRole,
    tripCreatedAt,
    {
      fromStatus,
      toStatus,
      triggeredBy: actorId ? 'user' : 'system',
    }
  )
}

/**
 * Emit trip.lifecycle.canceled event.
 * CRITICAL - awaits the write.
 */
export async function emitTripCanceled(
  tripId: string,
  circleId: string,
  canceledBy: string,
  tripCreatedAt: Date,
  reason?: string
): Promise<void> {
  const daysSinceCreated = Math.floor(
    (Date.now() - tripCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
  )

  await emitCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRIP_CANCELED,
    canceledBy,
    'leader',
    tripCreatedAt,
    {
      daysSinceCreated,
      reason: reason || null,
    }
  )
}

// ============ Scheduling Events ============

/**
 * Emit scheduling.window.suggested event.
 * Also triggers first-action tracking and nudge correlation.
 */
export async function emitWindowSuggested(
  tripId: string,
  circleId: string,
  userId: string,
  actorRole: ActorRole,
  windowId: string,
  precision: string,
  startDate: string | null,
  endDate: string | null,
  tripCreatedAt: Date
): Promise<void> {
  // Calculate duration if dates available
  let durationDays: number | null = null
  if (startDate && endDate) {
    const start = new Date(startDate + 'T12:00:00')
    const end = new Date(endDate + 'T12:00:00')
    durationDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.WINDOW_SUGGESTED,
    userId,
    actorRole,
    tripCreatedAt,
    {
      windowId,
      precision,
      durationDays,
    },
    { idempotencyKey: `${tripId}:${userId}:window:${windowId}` }
  )

  // Track first action
  const joinedAt = await getTravelerJoinDate(tripId, userId)
  await maybeEmitFirstAction(
    tripId,
    circleId,
    userId,
    actorRole,
    'window_suggested',
    tripCreatedAt,
    joinedAt
  )

  // Check nudge correlation
  await checkNudgeCorrelation(tripId, circleId, userId, 'window_suggested', tripCreatedAt)
}

/**
 * Emit scheduling.window.supported event.
 * Also triggers first-action tracking and nudge correlation.
 */
export async function emitWindowSupported(
  tripId: string,
  circleId: string,
  userId: string,
  actorRole: ActorRole,
  windowId: string,
  tripCreatedAt: Date
): Promise<void> {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.WINDOW_SUPPORTED,
    userId,
    actorRole,
    tripCreatedAt,
    { windowId },
    { idempotencyKey: `${tripId}:${userId}:${windowId}:support` }
  )

  // Track first action
  const joinedAt = await getTravelerJoinDate(tripId, userId)
  await maybeEmitFirstAction(
    tripId,
    circleId,
    userId,
    actorRole,
    'window_supported',
    tripCreatedAt,
    joinedAt
  )

  // Check nudge correlation
  await checkNudgeCorrelation(tripId, circleId, userId, 'window_supported', tripCreatedAt)
}

/**
 * Emit scheduling.reaction.submitted event.
 * Also triggers first-action tracking and nudge correlation.
 */
export async function emitReactionSubmitted(
  tripId: string,
  circleId: string,
  userId: string,
  actorRole: ActorRole,
  windowId: string,
  reaction: 'works' | 'maybe' | 'cant',
  tripCreatedAt: Date
): Promise<void> {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.REACTION_SUBMITTED,
    userId,
    actorRole,
    tripCreatedAt,
    {
      windowId,
      reaction,
    },
    { idempotencyKey: `${tripId}:${userId}:${windowId}:reaction` }
  )

  // Track first action
  const joinedAt = await getTravelerJoinDate(tripId, userId)
  await maybeEmitFirstAction(
    tripId,
    circleId,
    userId,
    actorRole,
    'reaction_submitted',
    tripCreatedAt,
    joinedAt
  )

  // Check nudge correlation
  await checkNudgeCorrelation(tripId, circleId, userId, 'reaction_submitted', tripCreatedAt)
}

/**
 * Emit scheduling.dates.locked event.
 * CRITICAL - awaits the write.
 */
export async function emitDatesLocked(
  tripId: string,
  circleId: string,
  lockedBy: string,
  windowId: string,
  overrideUsed: boolean,
  approvalCount: number,
  totalReactions: number,
  tripCreatedAt: Date
): Promise<void> {
  await emitCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.DATES_LOCKED,
    lockedBy,
    'leader',
    tripCreatedAt,
    {
      windowId,
      overrideUsed,
      approvalCount,
      totalReactions,
    }
  )
}

// ============ Participation Events ============

/**
 * Emit traveler.participation.joined event.
 */
export function emitTravelerJoined(
  tripId: string,
  circleId: string,
  userId: string,
  method: 'circle_member' | 'invite' | 'request',
  tripCreatedAt: Date
): void {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRAVELER_JOINED,
    userId,
    'traveler',
    tripCreatedAt,
    { method },
    { idempotencyKey: `${tripId}:${userId}:joined` }
  )
}

/**
 * Emit traveler.participation.left event.
 */
export function emitTravelerLeft(
  tripId: string,
  circleId: string,
  userId: string,
  reason: 'voluntary' | 'removed',
  tripCreatedAt: Date
): void {
  const timestamp = Date.now()
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRAVELER_LEFT,
    userId,
    'traveler',
    tripCreatedAt,
    { reason },
    { idempotencyKey: `${tripId}:${userId}:left:${timestamp}` }
  )
}

/**
 * Emit traveler.role.leader_changed event.
 */
export function emitLeaderChanged(
  tripId: string,
  circleId: string,
  fromUserId: string,
  toUserId: string,
  tripCreatedAt: Date
): void {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.LEADER_CHANGED,
    fromUserId,
    'leader',
    tripCreatedAt,
    {
      fromUserId,
      toUserId,
    }
  )
}
