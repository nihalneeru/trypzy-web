/**
 * Event System - Public API
 *
 * Per EVENTS_SPEC.md, this module provides:
 * - Event emission (emitTripEvent, emitCriticalEvent, emitNonCriticalEvent)
 * - Event types (EVENT_TYPES)
 * - First action tracking (maybeEmitFirstAction)
 * - Nudge correlation (checkNudgeCorrelation)
 * - Index management (ensureEventIndexes)
 */

// Core emitter
export {
  emitTripEvent,
  emitCriticalEvent,
  emitNonCriticalEvent,
  type EmitOptions,
} from './emit'

// Types
export {
  EVENT_TYPES,
  type EventType,
  type ActorRole,
  type TripEventDocument,
} from './types'

// First action helper
export {
  maybeEmitFirstAction,
  getTravelerJoinDate,
} from './firstAction'

// Nudge correlation
export {
  checkNudgeCorrelation,
  ensureNudgeEventsTTLIndex,
} from './nudgeCorrelation'

// Index management
export {
  ensureEventIndexes,
  listEventIndexes,
} from './indexes'

// High-level instrumentation helpers
export {
  emitTripCreated,
  emitTripStatusChanged,
  emitTripCanceled,
  emitWindowSuggested,
  emitWindowSupported,
  emitReactionSubmitted,
  emitDatesLocked,
  emitTravelerJoined,
  emitTravelerLeft,
  emitLeaderChanged,
} from './instrumentation'
