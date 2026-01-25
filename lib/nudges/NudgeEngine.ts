/**
 * Nudge Engine
 *
 * Pure function that computes nudges based on trip state.
 * No database calls - only uses passed-in data.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  Nudge,
  NudgeType,
  NudgeChannel,
  NudgeAudience,
  NudgePriority,
  NudgePayload,
  ComputeNudgesInput,
  ComputeNudgesResult,
  TripMetrics,
  ViewerContext,
  TripData,
  InlineHintContext,
} from './types'
import { getNudgeCopy, formatDateRange, shouldIncludeYear } from './copy'

// ============ Constants ============

// Thresholds
const AVAILABILITY_HALF_THRESHOLD = 50 // 50% completion
const STRONG_OVERLAP_THRESHOLD = 60 // 60% coverage
const LOW_COVERAGE_THRESHOLD = 40 // Below 40% is "low"
const MAX_WINDOWS_PER_USER = 2

// Cooldown periods (hours)
const COOLDOWN = {
  CELEBRATORY: 8760, // ~1 year (basically forever for MVP)
  LEADER_ACTION: 72, // 3 days
  TRAVELER_HINT: 168, // 1 week
  CONFIRMATION: 24, // 1 day
}

// ============ Nudge Builders ============

function buildNudge(
  type: NudgeType,
  channel: NudgeChannel,
  audience: NudgeAudience,
  priority: NudgePriority,
  payload: NudgePayload,
  dedupeKey: string,
  cooldownHours: number,
  expiresAt?: string
): Nudge {
  return {
    id: uuidv4(),
    type,
    channel,
    audience,
    priority,
    payload,
    dedupeKey,
    cooldownHours,
    expiresAt,
  }
}

// ============ Individual Nudge Evaluators ============

/**
 * 1. FIRST_AVAILABILITY_SUBMITTED
 * Triggered when someone submits their first availability.
 */
function evaluateFirstAvailability(
  metrics: TripMetrics,
  trip: TripData,
  firstSubmitterName?: string
): Nudge | null {
  // Only trigger when exactly 1 person has submitted
  if (metrics.availabilitySubmittedCount !== 1) return null
  if (metrics.tripStage !== 'scheduling') return null

  const payload: NudgePayload = {
    message: '', // Will be filled by copy
    travelerName: firstSubmitterName,
  }

  const copy = getNudgeCopy(NudgeType.FIRST_AVAILABILITY_SUBMITTED, payload)
  payload.message = copy.message
  payload.title = copy.title

  return buildNudge(
    NudgeType.FIRST_AVAILABILITY_SUBMITTED,
    NudgeChannel.CHAT_CARD,
    NudgeAudience.ALL,
    NudgePriority.LOW,
    payload,
    `first_availability:${trip.id}`,
    COOLDOWN.CELEBRATORY
  )
}

/**
 * 2. AVAILABILITY_HALF_SUBMITTED
 * Triggered when 50%+ travelers have submitted availability.
 */
function evaluateAvailabilityHalf(
  metrics: TripMetrics,
  trip: TripData
): Nudge | null {
  if (metrics.availabilityCompletionPct < AVAILABILITY_HALF_THRESHOLD) return null
  if (metrics.tripStage === 'locked') return null

  const payload: NudgePayload = {
    message: '',
    travelerCount: metrics.availabilitySubmittedCount,
    coverage: {
      count: metrics.availabilitySubmittedCount,
      total: metrics.travelerCount,
      percentage: metrics.availabilityCompletionPct,
    },
  }

  const copy = getNudgeCopy(NudgeType.AVAILABILITY_HALF_SUBMITTED, payload)
  payload.message = copy.message
  payload.title = copy.title

  return buildNudge(
    NudgeType.AVAILABILITY_HALF_SUBMITTED,
    NudgeChannel.CHAT_CARD,
    NudgeAudience.ALL,
    NudgePriority.LOW,
    payload,
    `availability_half:${trip.id}`,
    COOLDOWN.CELEBRATORY
  )
}

/**
 * 3. STRONG_OVERLAP_DETECTED
 * Triggered when a date range has 60%+ coverage.
 */
function evaluateStrongOverlap(
  metrics: TripMetrics,
  trip: TripData
): Nudge | null {
  if (!metrics.overlapBestRange) return null
  if (metrics.overlapBestCoveragePct < STRONG_OVERLAP_THRESHOLD) return null
  if (metrics.tripStage === 'locked') return null

  const payload: NudgePayload = {
    message: '',
    dateRange: metrics.overlapBestRange,
    coverage: {
      count: metrics.overlapBestCoverageCount,
      total: metrics.travelerCount,
      percentage: metrics.overlapBestCoveragePct,
    },
  }

  const copy = getNudgeCopy(NudgeType.STRONG_OVERLAP_DETECTED, payload)
  payload.message = copy.message
  payload.title = copy.title

  return buildNudge(
    NudgeType.STRONG_OVERLAP_DETECTED,
    NudgeChannel.CHAT_CARD,
    NudgeAudience.ALL,
    NudgePriority.LOW,
    payload,
    `strong_overlap:${trip.id}:${metrics.overlapBestRange.start}`,
    COOLDOWN.CELEBRATORY
  )
}

/**
 * 4. DATES_LOCKED
 * Triggered when trip dates are locked.
 */
function evaluateDatesLocked(
  metrics: TripMetrics,
  trip: TripData
): Nudge | null {
  if (!metrics.lockedDates) return null
  if (metrics.tripStage !== 'locked') return null

  const payload: NudgePayload = {
    message: '',
    dateRange: metrics.lockedDates,
  }

  const copy = getNudgeCopy(NudgeType.DATES_LOCKED, payload)
  payload.message = copy.message
  payload.title = copy.title

  return buildNudge(
    NudgeType.DATES_LOCKED,
    NudgeChannel.CHAT_CARD,
    NudgeAudience.ALL,
    NudgePriority.LOW,
    payload,
    `dates_locked:${trip.id}`,
    COOLDOWN.CELEBRATORY
  )
}

/**
 * 5. LEADER_READY_TO_PROPOSE
 * Nudge leader when there's a good date option to propose.
 */
function evaluateLeaderReadyToPropose(
  metrics: TripMetrics,
  trip: TripData,
  viewer: ViewerContext
): Nudge | null {
  if (!viewer.isLeader) return null
  if (!metrics.overlapBestRange) return null
  if (metrics.hasProposedWindow) return null
  if (metrics.tripStage === 'locked') return null
  if (metrics.overlapBestCoveragePct < 40) return null // Need at least some coverage

  const payload: NudgePayload = {
    message: '',
    dateRange: metrics.overlapBestRange,
    coverage: {
      count: metrics.overlapBestCoverageCount,
      total: metrics.travelerCount,
      percentage: metrics.overlapBestCoveragePct,
    },
    ctaAction: 'propose_dates',
  }

  const copy = getNudgeCopy(NudgeType.LEADER_READY_TO_PROPOSE, payload)
  payload.message = copy.message
  payload.title = copy.title
  payload.ctaLabel = copy.ctaLabel

  return buildNudge(
    NudgeType.LEADER_READY_TO_PROPOSE,
    NudgeChannel.CTA_HIGHLIGHT,
    NudgeAudience.LEADER,
    NudgePriority.MEDIUM,
    payload,
    `leader_propose:${trip.id}`,
    COOLDOWN.LEADER_ACTION
  )
}

/**
 * 6. LEADER_CAN_LOCK_DATES
 * Nudge leader when proposed dates have support and can be locked.
 */
function evaluateLeaderCanLock(
  metrics: TripMetrics,
  trip: TripData,
  viewer: ViewerContext
): Nudge | null {
  if (!viewer.isLeader) return null
  if (!metrics.hasProposedWindow) return null
  if (metrics.tripStage === 'locked') return null

  // Need some support (at least 2 people or 40% of travelers)
  const hasSupport =
    metrics.topOptionVotes >= 2 ||
    (metrics.travelerCount > 0 &&
      metrics.topOptionVotes / metrics.travelerCount >= 0.4)

  if (!hasSupport) return null

  const payload: NudgePayload = {
    message: '',
    dateRange: metrics.overlapBestRange || undefined,
    coverage: {
      count: metrics.topOptionVotes,
      total: metrics.travelerCount,
      percentage: Math.round((metrics.topOptionVotes / Math.max(1, metrics.travelerCount)) * 100),
    },
    ctaAction: 'lock_dates',
  }

  const copy = getNudgeCopy(NudgeType.LEADER_CAN_LOCK_DATES, payload)
  payload.message = copy.message
  payload.title = copy.title
  payload.ctaLabel = copy.ctaLabel

  return buildNudge(
    NudgeType.LEADER_CAN_LOCK_DATES,
    NudgeChannel.CTA_HIGHLIGHT,
    NudgeAudience.LEADER,
    NudgePriority.HIGH,
    payload,
    `leader_lock:${trip.id}`,
    COOLDOWN.LEADER_ACTION
  )
}

/**
 * 7. TRAVELER_TOO_MANY_WINDOWS
 * Inline hint when traveler has already submitted max windows.
 * This is evaluated on-demand when user attempts to add a window.
 */
export function evaluateTooManyWindows(
  context: InlineHintContext,
  tripId: string
): Nudge | null {
  if (context.action !== 'add_window') return null
  if ((context.currentWindowCount || 0) < MAX_WINDOWS_PER_USER) return null

  const payload: NudgePayload = {
    message: '',
    windowCount: context.currentWindowCount,
    maxWindows: MAX_WINDOWS_PER_USER,
  }

  const copy = getNudgeCopy(NudgeType.TRAVELER_TOO_MANY_WINDOWS, payload)
  payload.message = copy.message

  return buildNudge(
    NudgeType.TRAVELER_TOO_MANY_WINDOWS,
    NudgeChannel.INLINE_HINT,
    NudgeAudience.TRAVELER,
    NudgePriority.MEDIUM,
    payload,
    `too_many_windows:${tripId}`,
    COOLDOWN.TRAVELER_HINT
  )
}

/**
 * 8. LEADER_PROPOSING_LOW_COVERAGE
 * Confirm dialog when leader proposes a window with low coverage.
 * This is evaluated on-demand when leader attempts to propose.
 */
export function evaluateLowCoverageProposal(
  context: InlineHintContext,
  tripId: string,
  travelerCount: number
): Nudge | null {
  if (context.action !== 'propose_window') return null

  const coverage = context.proposedWindowCoverage || 0
  const total = context.proposedWindowTotal || travelerCount

  const coveragePct = total > 0 ? Math.round((coverage / total) * 100) : 0

  if (coveragePct >= LOW_COVERAGE_THRESHOLD) return null

  const payload: NudgePayload = {
    message: '',
    coverage: {
      count: coverage,
      total,
      percentage: coveragePct,
    },
  }

  const copy = getNudgeCopy(NudgeType.LEADER_PROPOSING_LOW_COVERAGE, payload)
  payload.message = copy.message
  payload.title = copy.title
  payload.ctaLabel = copy.ctaLabel

  return buildNudge(
    NudgeType.LEADER_PROPOSING_LOW_COVERAGE,
    NudgeChannel.CONFIRM_DIALOG,
    NudgeAudience.LEADER,
    NudgePriority.CRITICAL,
    payload,
    `low_coverage_proposal:${tripId}`,
    COOLDOWN.CONFIRMATION
  )
}

// ============ Main Engine ============

/**
 * Compute all applicable nudges for the current state.
 * Returns max 2 nudges: 1 actionable + 1 celebratory.
 */
export function computeNudges(input: ComputeNudgesInput): ComputeNudgesResult {
  const { trip, metrics, viewer } = input

  // Skip for hosted trips (they don't go through scheduling funnel)
  if (trip.type === 'hosted') {
    return { nudges: [], actionNudge: null, celebratorNudge: null }
  }

  const allNudges: Nudge[] = []

  // Evaluate all nudge conditions
  // Note: We pass undefined for firstSubmitterName since we don't have that data
  // In production, this would come from the recent events
  const nudge1 = evaluateFirstAvailability(metrics, trip)
  const nudge2 = evaluateAvailabilityHalf(metrics, trip)
  const nudge3 = evaluateStrongOverlap(metrics, trip)
  const nudge4 = evaluateDatesLocked(metrics, trip)
  const nudge5 = evaluateLeaderReadyToPropose(metrics, trip, viewer)
  const nudge6 = evaluateLeaderCanLock(metrics, trip, viewer)
  // nudge7 and nudge8 are evaluated on-demand via separate functions

  if (nudge1) allNudges.push(nudge1)
  if (nudge2) allNudges.push(nudge2)
  if (nudge3) allNudges.push(nudge3)
  if (nudge4) allNudges.push(nudge4)
  if (nudge5) allNudges.push(nudge5)
  if (nudge6) allNudges.push(nudge6)

  // Sort by priority (lower = higher priority)
  allNudges.sort((a, b) => a.priority - b.priority)

  // Separate into categories
  const celebratoryTypes = [
    NudgeType.FIRST_AVAILABILITY_SUBMITTED,
    NudgeType.AVAILABILITY_HALF_SUBMITTED,
    NudgeType.STRONG_OVERLAP_DETECTED,
    NudgeType.DATES_LOCKED,
  ]

  const actionNudges = allNudges.filter(
    n => !celebratoryTypes.includes(n.type)
  )
  const celebratoryNudges = allNudges.filter(n =>
    celebratoryTypes.includes(n.type)
  )

  // Take max 1 of each
  const actionNudge = actionNudges[0] || null
  const celebratorNudge = celebratoryNudges[0] || null

  // Return combined (max 2)
  const nudges: Nudge[] = []
  if (actionNudge) nudges.push(actionNudge)
  if (celebratorNudge) nudges.push(celebratorNudge)

  return {
    nudges,
    actionNudge,
    celebratorNudge,
  }
}

// ============ Exports ============

export {
  COOLDOWN,
  MAX_WINDOWS_PER_USER,
  AVAILABILITY_HALF_THRESHOLD,
  STRONG_OVERLAP_THRESHOLD,
  LOW_COVERAGE_THRESHOLD,
}
