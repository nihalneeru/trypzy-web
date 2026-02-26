/**
 * Nudge Copy Templates
 *
 * All user-facing text for nudges.
 * Follows Tripti brand guidelines:
 * - Calm, friendly, non-preachy
 * - No guilt/shaming language
 * - Celebrate progress, don't pressure
 */

import { NudgeType, NudgePayload } from './types'

// ============ Date Formatting Helpers ============

/**
 * Format a date as "Feb 7" or "Feb 7, 2025" if year differs.
 */
export function formatDateLabel(dateStr: string, includeYear = false): string {
  const date = new Date(dateStr + 'T12:00:00')
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  }

  if (includeYear) {
    options.year = 'numeric'
  }

  return date.toLocaleDateString('en-US', options)
}

/**
 * Format a date range as "Feb 7 – Feb 9" or "Feb 7 – Feb 9, 2025".
 */
export function formatDateRange(
  startStr: string,
  endStr: string,
  includeYear = false
): string {
  const start = formatDateLabel(startStr, false)
  const end = formatDateLabel(endStr, includeYear)
  return `${start} – ${end}`
}

/**
 * Check if year should be included (different from current year).
 */
export function shouldIncludeYear(dateStr: string): boolean {
  const date = new Date(dateStr)
  const now = new Date()
  return date.getFullYear() !== now.getFullYear()
}

// ============ Copy Templates ============

interface CopyTemplate {
  title?: string
  message: string
  ctaLabel?: string
}

/**
 * Get copy for a nudge type with payload interpolation.
 */
export function getNudgeCopy(
  type: NudgeType,
  payload: Partial<NudgePayload>
): CopyTemplate {
  switch (type) {
    // ============ Celebratory Nudges ============

    case NudgeType.FIRST_AVAILABILITY_SUBMITTED:
      return {
        title: 'Things are moving!',
        message: payload.travelerName
          ? `${payload.travelerName} added their dates. The trip is getting started!`
          : 'Someone added their dates. The trip is getting started!',
      }

    case NudgeType.AVAILABILITY_HALF_SUBMITTED:
      return {
        title: 'Halfway there!',
        message: `${payload.travelerCount || 'Several'} people have shared their dates. Looking good!`,
      }

    case NudgeType.STRONG_OVERLAP_DETECTED:
      return {
        title: 'A date is pulling ahead',
        message: payload.dateRange
          ? `${payload.dateRange.label} works for ${payload.coverage?.count || 'most'} people!`
          : 'There\'s a date range that works for most people!',
      }

    case NudgeType.DATES_LOCKED:
      return {
        title: 'Dates confirmed!',
        message: payload.dateRange
          ? `The trip is happening ${payload.dateRange.label}. Time to plan the fun stuff!`
          : 'The dates are confirmed. Time to plan the fun stuff!',
      }

    // ============ Leader Action Nudges ============

    case NudgeType.LEADER_READY_TO_PROPOSE:
      return {
        title: 'Ready when you are',
        message: payload.dateRange
          ? `${payload.dateRange.label} is looking good. You can suggest it whenever you're ready.`
          : 'There\'s a popular date option. You can suggest it whenever you\'re ready.',
        ctaLabel: 'Suggest to group',
      }

    case NudgeType.LEADER_CAN_LOCK_DATES:
      return {
        title: 'Ready to lock?',
        message: payload.dateRange
          ? `${payload.dateRange.label} has support. Lock it in when you're ready.`
          : 'The proposed dates have support. Lock them in when you\'re ready.',
        ctaLabel: 'Confirm dates',
      }

    // ============ Traveler Guidance Nudges ============

    case NudgeType.TRAVELER_TOO_MANY_WINDOWS:
      return {
        message: `You've already shared ${payload.windowCount || 2} date options. Adding more might make it harder to find a match.`,
      }

    // ============ Confirmation Nudges ============

    case NudgeType.LEADER_PROPOSING_LOW_COVERAGE:
      return {
        title: 'Heads up',
        message: payload.coverage
          ? `Only ${payload.coverage.count} of ${payload.coverage.total} people can make this date range. Still want to propose it?`
          : 'Not everyone can make this date range. Still want to propose it?',
        ctaLabel: 'Suggest anyway',
      }

    case NudgeType.CHECKING_REMINDER:
      return {
        message: payload.travelerName && payload.dateRange
          ? `${payload.travelerName} — still checking on ${payload.dateRange.label}? No rush, just keeping it on your radar.`
          : 'Still checking on those dates? No rush, just keeping it on your radar.',
      }

    default:
      return {
        message: 'Something is happening with your trip.',
      }
  }
}

// ============ Emoji Helpers ============

/**
 * Get emoji for a nudge type.
 */
export function getNudgeEmoji(type: NudgeType): string {
  switch (type) {
    case NudgeType.FIRST_AVAILABILITY_SUBMITTED:
      return '🎉'
    case NudgeType.AVAILABILITY_HALF_SUBMITTED:
      return '📊'
    case NudgeType.STRONG_OVERLAP_DETECTED:
      return '✨'
    case NudgeType.DATES_LOCKED:
      return '🔒'
    case NudgeType.LEADER_READY_TO_PROPOSE:
      return '📅'
    case NudgeType.LEADER_CAN_LOCK_DATES:
      return '✅'
    case NudgeType.TRAVELER_TOO_MANY_WINDOWS:
      return '💡'
    case NudgeType.LEADER_PROPOSING_LOW_COVERAGE:
      return '⚠️'
    case NudgeType.CHECKING_REMINDER:
      return '🔔'
    default:
      return '📌'
  }
}

// ============ Full Message Builder ============

/**
 * Build a complete nudge message with emoji.
 */
export function buildNudgeMessage(
  type: NudgeType,
  payload: Partial<NudgePayload>
): string {
  const emoji = getNudgeEmoji(type)
  const copy = getNudgeCopy(type, payload)

  if (copy.title) {
    return `${emoji} **${copy.title}** ${copy.message}`
  }

  return `${emoji} ${copy.message}`
}

/**
 * Build a chat-friendly message (for chat_card channel).
 */
export function buildChatMessage(
  type: NudgeType,
  payload: Partial<NudgePayload>
): string {
  const emoji = getNudgeEmoji(type)
  const copy = getNudgeCopy(type, payload)

  // Chat messages are simpler, just emoji + message
  return `${emoji} ${copy.message}`
}
