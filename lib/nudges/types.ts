/**
 * Nudge Engine Types
 *
 * Defines the structure and taxonomy for the nudge system.
 */

// ============ Enums ============

/**
 * The 8 MVP nudge types.
 */
export enum NudgeType {
  // Celebratory nudges (chat_card, all users)
  FIRST_AVAILABILITY_SUBMITTED = 'first_availability_submitted',
  AVAILABILITY_HALF_SUBMITTED = 'availability_half_submitted',
  STRONG_OVERLAP_DETECTED = 'strong_overlap_detected',
  DATES_LOCKED = 'dates_locked',

  // Leader action nudges
  LEADER_READY_TO_PROPOSE = 'leader_ready_to_propose',
  LEADER_CAN_LOCK_DATES = 'leader_can_lock_dates',

  // Traveler guidance nudges
  TRAVELER_TOO_MANY_WINDOWS = 'traveler_too_many_windows',

  // Confirmation nudges
  LEADER_PROPOSING_LOW_COVERAGE = 'leader_proposing_low_coverage',
}

/**
 * Delivery channel for the nudge.
 */
export enum NudgeChannel {
  CHAT_CARD = 'chat_card', // System card in chat feed
  BANNER = 'banner', // Top banner with dismiss
  CTA_HIGHLIGHT = 'cta_highlight', // Subtle highlight on existing CTA
  INLINE_HINT = 'inline_hint', // Inline hint near an action
  CONFIRM_DIALOG = 'confirm_dialog', // Shown in confirmation dialog
}

/**
 * Who should see the nudge.
 */
export enum NudgeAudience {
  LEADER = 'leader',
  TRAVELER = 'traveler',
  ALL = 'all',
}

/**
 * Nudge priority for sorting.
 * Lower number = higher priority.
 */
export enum NudgePriority {
  CRITICAL = 1, // Must show (e.g., confirmation dialogs)
  HIGH = 2, // Important actions
  MEDIUM = 3, // Helpful info
  LOW = 4, // Nice to have / celebratory
}

// ============ Interfaces ============

/**
 * Payload for different nudge types.
 */
export interface NudgePayload {
  // Common fields
  title?: string
  message: string
  ctaLabel?: string
  ctaAction?: string // e.g., 'open_voting', 'lock_dates'

  // For date-related nudges
  dateRange?: {
    start: string // ISO date
    end: string // ISO date
    label: string // Formatted: "Feb 7 – Feb 9"
  }

  // For coverage nudges
  coverage?: {
    count: number
    total: number
    percentage: number
  }

  // For window-related nudges
  windowCount?: number
  maxWindows?: number

  // For milestone nudges
  travelerName?: string
  travelerCount?: number

  // Extra metadata
  [key: string]: unknown
}

/**
 * A nudge to be shown to a user.
 */
export interface Nudge {
  id: string
  type: NudgeType
  channel: NudgeChannel
  audience: NudgeAudience
  priority: NudgePriority
  payload: NudgePayload

  // Dedupe configuration
  dedupeKey: string // Unique key for this nudge instance
  cooldownHours: number // Hours before same dedupeKey can be shown again

  // Expiration
  expiresAt?: string // ISO timestamp after which nudge is invalid
}

/**
 * Nudge status for persistence.
 */
export enum NudgeStatus {
  SHOWN = 'shown',
  CLICKED = 'clicked',
  DISMISSED = 'dismissed',
}

/**
 * Persisted nudge event record.
 */
export interface NudgeEventRecord {
  id: string
  tripId: string
  userId: string
  nudgeId: string
  nudgeType: NudgeType
  dedupeKey: string
  status: NudgeStatus
  channel: NudgeChannel
  createdAt: string
}

// ============ Input Types ============

/**
 * Input for computing nudges.
 */
export interface ComputeNudgesInput {
  trip: TripData
  metrics: TripMetrics
  viewer: ViewerContext
}

/**
 * Minimal trip data needed for nudge computation.
 */
export interface TripData {
  id: string
  name: string
  type: 'collaborative' | 'hosted'
  status: string
  createdBy: string
  startDate?: string | null
  endDate?: string | null
  lockedStartDate?: string | null
  lockedEndDate?: string | null
  datesLocked?: boolean
  schedulingMode?: string | null
  createdAt: string
}

/**
 * Computed metrics for a trip.
 */
export interface TripMetrics {
  travelerCount: number
  availabilitySubmittedCount: number
  availabilityCompletionPct: number

  // Overlap analysis
  overlapBestRange: {
    start: string
    end: string
    label: string
  } | null
  overlapBestCoverageCount: number
  overlapBestCoveragePct: number

  // Proposal/voting state
  hasProposedWindow: boolean
  proposedWindowId: string | null
  votingOpen: boolean
  voteCount: number
  voteThresholdMet: boolean
  topOptionId: string | null
  topOptionVotes: number

  // Stage info
  tripStage: string
  lockedDates: {
    start: string
    end: string
    label: string
  } | null

  // Per-user metrics (for current viewer)
  viewerWindowCount: number
}

/**
 * Context about the current viewer.
 */
export interface ViewerContext {
  userId: string
  isLeader: boolean
  isParticipant: boolean
  hasSubmittedAvailability: boolean
  windowCount: number
}

/**
 * Context for inline hint evaluation.
 */
export interface InlineHintContext {
  action: 'add_window' | 'propose_window'
  currentWindowCount?: number
  proposedWindowCoverage?: number
  proposedWindowTotal?: number
}

/**
 * Result of nudge computation.
 */
export interface ComputeNudgesResult {
  nudges: Nudge[]
  actionNudge: Nudge | null // Max 1 actionable nudge
  celebratorNudge: Nudge | null // Max 1 celebratory nudge
}
