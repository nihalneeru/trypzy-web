'use client'

import { cn } from '@/lib/utils'

export type BlockerType = 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'READY' | null

interface FocusBannerV2Props {
  /** Trip name/title */
  tripName: string
  /** Proposed start date (ISO string, e.g., "2025-07-20") */
  startDate: string | null
  /** Proposed end date (ISO string, e.g., "2025-08-05") */
  endDate: string | null
  /** Locked/confirmed start date (ISO string) */
  lockedStartDate: string | null
  /** Locked/confirmed end date (ISO string) */
  lockedEndDate: string | null
  /** Blocker text from LLM or heuristic (e.g., "Pick your dates to continue") */
  blockerText: string | null
  /** Type of blocker for color coding */
  blockerType: BlockerType
}

/**
 * Format a date range in a compact, readable format
 * Examples:
 * - Same year: "Jul 20 - Aug 5, 2025"
 * - Same month: "Jul 20 - 25, 2025"
 * - Different years: "Dec 28, 2025 - Jan 5, 2026"
 */
function formatDateRange(startDateStr: string | null, endDateStr: string | null): string {
  if (!startDateStr || !endDateStr) {
    return 'Dates TBD'
  }

  try {
    // Parse dates with noon time to avoid timezone issues
    const start = new Date(startDateStr + 'T12:00:00')
    const end = new Date(endDateStr + 'T12:00:00')

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const startDay = start.getDate()
    const startYear = start.getFullYear()

    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const endDay = end.getDate()
    const endYear = end.getFullYear()

    // Same year
    if (startYear === endYear) {
      // Same month
      if (startMonth === endMonth) {
        return `${startMonth} ${startDay} - ${endDay}, ${endYear}`
      }
      // Different months, same year
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`
    }

    // Different years
    return `${startMonth} ${startDay}, ${startYear} - ${endMonth} ${endDay}, ${endYear}`
  } catch {
    return 'Dates TBD'
  }
}

/**
 * Get the color classes for blocker text based on blocker type
 * Using brand colors:
 * - brand-red: CTAs, blockers, errors, current action
 * - brand-blue: completed states, secondary actions
 */
function getBlockerColorClasses(blockerType: BlockerType): string {
  switch (blockerType) {
    case 'DATES':
      return 'text-brand-red bg-brand-red/10'
    case 'ITINERARY':
      return 'text-brand-red bg-brand-red/10'
    case 'ACCOMMODATION':
      return 'text-brand-red bg-brand-red/10'
    case 'READY':
      return 'text-brand-blue bg-brand-blue/10'
    default:
      return 'text-brand-carbon/60'
  }
}

/**
 * FocusBannerV2 - Simplified focus banner for Command Center V2
 *
 * Displays:
 * 1. Trip name + date range (e.g., "Morocco Trip - Jul 20 - Aug 5, 2025")
 * 2. Blocker indicator text below with color coding by type
 */
export function FocusBannerV2({
  tripName,
  startDate,
  endDate,
  lockedStartDate,
  lockedEndDate,
  blockerText,
  blockerType
}: FocusBannerV2Props) {
  // Use locked dates if available, otherwise use proposed dates
  const displayStartDate = lockedStartDate || startDate
  const displayEndDate = lockedEndDate || endDate

  const dateRange = formatDateRange(displayStartDate, displayEndDate)
  const hasLockedDates = lockedStartDate && lockedEndDate

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3">
      {/* Trip name and date range */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h1 className="text-lg font-semibold text-gray-900 truncate">
          {tripName}
        </h1>
        <span className="text-gray-500" aria-hidden="true">-</span>
        <span
          className={cn(
            'text-sm',
            hasLockedDates ? 'text-gray-700 font-medium' : 'text-gray-500'
          )}
        >
          {dateRange}
          {hasLockedDates && (
            <span className="ml-1 text-xs text-brand-blue">(confirmed)</span>
          )}
        </span>
      </div>

      {/* Blocker text */}
      {blockerText && (
        <p
          className={cn(
            'mt-1.5 text-sm inline-block px-2 py-0.5 rounded-full',
            getBlockerColorClasses(blockerType)
          )}
        >
          {blockerText}
        </p>
      )}
    </div>
  )
}
