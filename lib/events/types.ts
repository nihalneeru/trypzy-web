/**
 * TripEvent Taxonomy
 *
 * Structured events for analytics, ML training, and audit trails.
 * These events capture "what happened" in a trip's lifecycle.
 *
 * This file contains:
 * 1. NEW canonical event types per EVENTS_SPEC.md (EVENT_TYPES, TripEventDocument)
 * 2. LEGACY event types for backward compatibility with nudge store (TripEventTypes, TripEvent)
 */

import { ObjectId } from 'mongodb'

// ============ NEW Canonical Event Types (per EVENTS_SPEC.md) ============

/**
 * Canonical event types per EVENTS_SPEC.md
 * Namespaced: <domain>.<entity>.<action>
 */
export const EVENT_TYPES = {
  // Trip lifecycle
  TRIP_CREATED: 'trip.lifecycle.created',
  TRIP_STATUS_CHANGED: 'trip.lifecycle.status_changed',
  TRIP_CANCELED: 'trip.lifecycle.canceled',
  TRIP_COMPLETED: 'trip.lifecycle.completed',

  // Scheduling (date_windows mode)
  WINDOW_SUGGESTED: 'scheduling.window.suggested',
  WINDOW_SUPPORTED: 'scheduling.window.supported',
  WINDOW_PROPOSED: 'scheduling.window.proposed',
  WINDOW_PROPOSAL_REJECTED: 'scheduling.window.proposal_rejected',
  REACTION_SUBMITTED: 'scheduling.reaction.submitted',
  DATES_LOCKED: 'scheduling.dates.locked',

  // Participation
  TRAVELER_JOINED: 'traveler.participation.joined',
  TRAVELER_LEFT: 'traveler.participation.left',
  TRAVELER_FIRST_ACTION: 'traveler.participation.first_action',
  LEADER_CHANGED: 'traveler.role.leader_changed',

  // Nudges
  NUDGE_DISPLAYED: 'nudge.system.displayed',
  NUDGE_CORRELATED_ACTION: 'nudge.system.correlated_action',

  // Itinerary (optional MVP)
  ITINERARY_GENERATED: 'itinerary.version.generated',
  ITINERARY_SELECTED: 'itinerary.version.selected',
  IDEA_ADDED: 'itinerary.idea.added',
  IDEA_LIKED: 'itinerary.idea.liked',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

/**
 * Actor role for events
 */
export type ActorRole = 'leader' | 'traveler' | 'system'

/**
 * Canonical TripEvent document per EVENTS_SPEC.md
 */
export interface TripEventDocument {
  _id?: ObjectId
  schemaVersion: 1
  tripId: ObjectId
  circleId: ObjectId
  eventType: string
  actorId: ObjectId | null
  actorRole: ActorRole
  timestamp: Date
  tripAgeMs: number
  idempotencyKey?: string
  payload: Record<string, unknown>
  context?: {
    precedingEventId?: ObjectId
    latencyFromPrecedingMs?: number
    sessionId?: string
  }
}

// ============ LEGACY Event Types (for backward compatibility with nudge store) ============

export const TripEventTypes = {
  // Availability events
  AVAILABILITY_SUBMITTED: 'availability.submitted',
  AVAILABILITY_THRESHOLD_CROSSED: 'availability.threshold_crossed',

  // Overlap/consensus events
  OVERLAP_DETECTED: 'overlap.detected',
  OVERLAP_IMPROVED: 'overlap.improved',

  // Date proposal events
  DATES_PROPOSED: 'dates.proposed',
  DATES_PROPOSAL_CHANGED: 'dates.proposal_changed',

  // Voting events
  VOTING_OPENED: 'voting.opened',
  VOTING_THRESHOLD_MET: 'voting.threshold_met',
  VOTE_CAST: 'vote.cast',

  // Lock events
  DATES_LOCKED: 'dates.locked',

  // Itinerary events
  ITINERARY_IDEA_ADDED: 'itinerary.idea_added',
  ITINERARY_GENERATED: 'itinerary.generated',
  ITINERARY_SELECTED: 'itinerary.selected',

  // Accommodation events
  ACCOMMODATION_OPTION_ADDED: 'accommodation.option_added',
  ACCOMMODATION_SELECTED: 'accommodation.selected',

  // Traveler events
  TRAVELER_JOINED: 'traveler.joined',
  TRAVELER_LEFT: 'traveler.left',
  TRAVELER_INVITED: 'traveler.invited',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_DECLINED: 'invitation.declined',

  // Leadership events
  LEADERSHIP_TRANSFER_INITIATED: 'leadership.transfer_initiated',
  LEADERSHIP_TRANSFER_ACCEPTED: 'leadership.transfer_accepted',
  LEADERSHIP_TRANSFER_DECLINED: 'leadership.transfer_declined',

  // Trip lifecycle events
  TRIP_CREATED: 'trip.created',
  TRIP_CANCELLED: 'trip.cancelled',
  TRIP_COMPLETED: 'trip.completed',

  // Nudge events (for tracking nudge effectiveness)
  NUDGE_SHOWN: 'nudge.shown',
  NUDGE_CLICKED: 'nudge.clicked',
  NUDGE_DISMISSED: 'nudge.dismissed',
} as const

export type TripEventType = typeof TripEventTypes[keyof typeof TripEventTypes]

// ============ Event Metadata Interfaces ============

export interface AvailabilitySubmittedMetadata {
  windowCount: number
  windowIds: string[]
  isFirstSubmission: boolean
}

export interface AvailabilityThresholdCrossedMetadata {
  threshold: number // e.g., 50 for 50%
  currentCount: number
  totalTravelers: number
}

export interface OverlapDetectedMetadata {
  bestRangeStart: string // ISO date
  bestRangeEnd: string // ISO date
  coverageCount: number
  coveragePct: number
}

export interface DatesProposedMetadata {
  windowId: string
  startDate: string
  endDate: string
  supportCount: number
}

export interface VotingOpenedMetadata {
  windowCount: number
  topWindowId?: string
}

export interface VotingThresholdMetMetadata {
  threshold: number
  voteCount: number
  topWindowId: string
  topWindowVotes: number
}

export interface DatesLockedMetadata {
  startDate: string
  endDate: string
  finalSupportCount: number
}

export interface ItineraryIdeaAddedMetadata {
  ideaId: string
  ideaTitle: string
  totalIdeas: number
}

export interface ItineraryGeneratedMetadata {
  itemCount: number
  generationMethod: 'manual' | 'ai_assisted'
}

export interface NudgeShownMetadata {
  nudgeType: string
  channel: string
  dedupeKey: string
  audience: string
}

export interface NudgeClickedMetadata extends NudgeShownMetadata {
  actionTaken?: string
}

export interface NudgeDismissedMetadata extends NudgeShownMetadata {
  reason?: string
}

// Union type for all metadata
export type TripEventMetadata =
  | AvailabilitySubmittedMetadata
  | AvailabilityThresholdCrossedMetadata
  | OverlapDetectedMetadata
  | DatesProposedMetadata
  | VotingOpenedMetadata
  | VotingThresholdMetMetadata
  | DatesLockedMetadata
  | ItineraryIdeaAddedMetadata
  | ItineraryGeneratedMetadata
  | NudgeShownMetadata
  | NudgeClickedMetadata
  | NudgeDismissedMetadata
  | Record<string, unknown> // Allow arbitrary metadata for flexibility

// ============ TripEvent Interface ============

export interface TripEvent {
  id: string
  tripId: string | null // null for system-wide events
  actorUserId: string | null // null for system-generated events
  type: TripEventType
  metadata: TripEventMetadata
  createdAt: string // ISO timestamp
}

export interface RecordTripEventInput {
  tripId: string | null
  actorUserId: string | null
  type: TripEventType
  metadata?: TripEventMetadata
}

export interface GetRecentTripEventsOptions {
  since?: Date
  types?: TripEventType[]
  limit?: number
}
