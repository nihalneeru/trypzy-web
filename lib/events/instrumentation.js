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
import { EVENT_TYPES } from './types'
import { maybeEmitFirstAction, getTravelerJoinDate } from './firstAction'
import { checkNudgeCorrelation } from './nudgeCorrelation'

// ============ Trip Lifecycle Events ============

/**
 * Emit trip.lifecycle.created event.
 * CRITICAL - awaits the write.
 */
export async function emitTripCreated(
  tripId,
  circleId,
  creatorId,
  tripType,
  schedulingMode,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  actorId,
  actorRole,
  fromStatus,
  toStatus,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  canceledBy,
  tripCreatedAt,
  reason
) {
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
  tripId,
  circleId,
  userId,
  actorRole,
  windowId,
  precision,
  startDate,
  endDate,
  tripCreatedAt
) {
  // Calculate duration if dates available
  let durationDays = null
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
  tripId,
  circleId,
  userId,
  actorRole,
  windowId,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  userId,
  actorRole,
  windowId,
  reaction,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  lockedBy,
  windowId,
  overrideUsed,
  approvalCount,
  totalReactions,
  tripCreatedAt
) {
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

/**
 * Emit scheduling.window.proposed event.
 * Leader proposes a window for group reaction.
 */
export function emitWindowProposed(
  tripId,
  circleId,
  leaderId,
  windowId,
  tripCreatedAt
) {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.WINDOW_PROPOSED,
    leaderId,
    'leader',
    tripCreatedAt,
    { windowId }
  )
}

/**
 * Emit scheduling.window.proposal_rejected event.
 * Leader withdraws/pivots from a proposed window.
 */
export function emitWindowProposalRejected(
  tripId,
  circleId,
  leaderId,
  windowId,
  tripCreatedAt,
  reason
) {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.WINDOW_PROPOSAL_REJECTED,
    leaderId,
    'leader',
    tripCreatedAt,
    {
      windowId,
      reason: reason || null,
    }
  )
}

// ============ Participation Events ============

/**
 * Emit traveler.participation.joined event.
 */
export function emitTravelerJoined(
  tripId,
  circleId,
  userId,
  method,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  userId,
  reason,
  tripCreatedAt
) {
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
  tripId,
  circleId,
  fromUserId,
  toUserId,
  tripCreatedAt
) {
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

// ============ Onboarding Events ============

/**
 * Emit onboarding.trip_first.completed event.
 * Fired when a trip is created via the trip-first flow (auto-created circle).
 */
export function emitTripFirstFlowCompleted(
  tripId,
  circleId,
  userId,
  tripType,
  tripCreatedAt
) {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.TRIP_FIRST_FLOW_COMPLETED,
    userId,
    'leader',
    tripCreatedAt,
    { tripType, circleAutoCreated: true }
  )
}

// ============ Boost / Revenue Events ============

/**
 * Emit boost.purchase.initiated event.
 * Non-critical (fire-and-forget).
 */
export function emitBoostPurchaseInitiated(
  tripId,
  circleId,
  userId,
  actorRole,
  tripCreatedAt
) {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.BOOST_PURCHASE_INITIATED,
    userId,
    actorRole,
    tripCreatedAt,
    { priceAmount: 499, currency: 'usd' }
  )
}

/**
 * Emit boost.purchase.completed event.
 * Non-critical (webhook context — don't block Stripe response).
 */
export function emitBoostPurchaseCompleted(
  tripId,
  circleId,
  userId,
  actorRole,
  tripCreatedAt
) {
  emitNonCriticalEvent(
    tripId,
    circleId,
    EVENT_TYPES.BOOST_PURCHASE_COMPLETED,
    userId,
    actorRole,
    tripCreatedAt,
    { priceAmount: 499, currency: 'usd' }
  )
}
