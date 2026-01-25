/**
 * Trip Metrics Computation
 *
 * Computes metrics needed for nudge decisions.
 * Pure functions that take data and return computed values.
 */

import type { TripMetrics, TripData, ViewerContext } from './types'
import { formatDateRange, shouldIncludeYear } from './copy'

// ============ Types ============

interface DateWindow {
  id: string
  proposedBy: string
  startDate: string
  endDate: string
  sourceText?: string
  precision?: string
  supportCount?: number
  supporterIds?: string[]
  isProposed?: boolean
}

interface TripParticipant {
  odId: string
  status?: string
}

interface ComputeMetricsInput {
  trip: TripData
  windows: DateWindow[]
  participants: TripParticipant[]
  viewerId: string
}

// ============ Overlap Algorithm ============

/**
 * Represents a single day with coverage info.
 */
interface DayCoverage {
  date: string // ISO date (YYYY-MM-DD)
  count: number // Number of people available
  userIds: string[]
}

/**
 * Compute day-by-day coverage from date windows.
 * Returns a map of date -> users available on that date.
 */
export function computeDayCoverage(windows: DateWindow[]): Map<string, Set<string>> {
  const coverage = new Map<string, Set<string>>()

  for (const window of windows) {
    if (!window.startDate || !window.endDate) continue
    if (window.precision === 'unstructured') continue // Skip unstructured windows

    const start = new Date(window.startDate + 'T12:00:00')
    const end = new Date(window.endDate + 'T12:00:00')
    const userId = window.proposedBy

    // Iterate through each day in the range
    const current = new Date(start)
    while (current <= end) {
      const dateKey = current.toISOString().split('T')[0]

      if (!coverage.has(dateKey)) {
        coverage.set(dateKey, new Set())
      }
      coverage.get(dateKey)!.add(userId)

      current.setDate(current.getDate() + 1)
    }
  }

  return coverage
}

/**
 * Find the best contiguous date range with maximum coverage.
 * Uses a sliding window approach.
 */
export function findBestOverlapRange(
  windows: DateWindow[],
  minDays = 2,
  maxDays = 7
): { start: string; end: string; coverageCount: number; userIds: string[] } | null {
  const coverage = computeDayCoverage(windows)

  if (coverage.size === 0) return null

  // Sort dates
  const sortedDates = Array.from(coverage.keys()).sort()

  let best: { start: string; end: string; coverageCount: number; userIds: string[] } | null = null

  // Try different window sizes
  for (let windowSize = minDays; windowSize <= maxDays; windowSize++) {
    for (let i = 0; i <= sortedDates.length - windowSize; i++) {
      const rangeStart = sortedDates[i]
      const rangeEnd = sortedDates[i + windowSize - 1]

      // Check if dates are contiguous
      const startDate = new Date(rangeStart + 'T12:00:00')
      const endDate = new Date(rangeEnd + 'T12:00:00')
      const expectedDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

      if (expectedDays !== windowSize) continue // Not contiguous

      // Find users available for ALL days in range
      let commonUsers: Set<string> | null = null

      for (let j = 0; j < windowSize; j++) {
        const dateKey = sortedDates[i + j]
        const dayUsers = coverage.get(dateKey)

        if (!dayUsers) {
          commonUsers = new Set()
          break
        }

        if (commonUsers === null) {
          commonUsers = new Set(dayUsers)
        } else {
          // Intersection
          commonUsers = new Set([...commonUsers].filter(u => dayUsers.has(u)))
        }
      }

      const coverageCount = commonUsers?.size || 0

      // Update best if this is better
      // Prefer: higher coverage, then longer duration
      if (
        !best ||
        coverageCount > best.coverageCount ||
        (coverageCount === best.coverageCount && windowSize > (new Date(best.end).getTime() - new Date(best.start).getTime()) / (1000 * 60 * 60 * 24) + 1)
      ) {
        best = {
          start: rangeStart,
          end: rangeEnd,
          coverageCount,
          userIds: Array.from(commonUsers || []),
        }
      }
    }
  }

  return best
}

/**
 * Compute coverage for a specific date range.
 */
export function computeRangeCoverage(
  windows: DateWindow[],
  startDate: string,
  endDate: string
): { count: number; userIds: string[] } {
  const coverage = computeDayCoverage(windows)

  const start = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')

  let commonUsers: Set<string> | null = null
  const current = new Date(start)

  while (current <= end) {
    const dateKey = current.toISOString().split('T')[0]
    const dayUsers = coverage.get(dateKey)

    if (!dayUsers) {
      return { count: 0, userIds: [] }
    }

    if (commonUsers === null) {
      commonUsers = new Set(dayUsers)
    } else {
      commonUsers = new Set([...commonUsers].filter(u => dayUsers.has(u)))
    }

    current.setDate(current.getDate() + 1)
  }

  return {
    count: commonUsers?.size || 0,
    userIds: Array.from(commonUsers || []),
  }
}

// ============ Main Metrics Computation ============

/**
 * Compute all metrics needed for nudge decisions.
 */
export function computeTripMetrics(input: ComputeMetricsInput): TripMetrics {
  const { trip, windows, participants, viewerId } = input

  // Filter active participants
  const activeParticipants = participants.filter(
    p => !p.status || p.status === 'active'
  )
  const travelerCount = activeParticipants.length

  // Count unique users who submitted windows
  const usersWithWindows = new Set(windows.map(w => w.proposedBy))
  const availabilitySubmittedCount = usersWithWindows.size

  // Completion percentage
  const availabilityCompletionPct =
    travelerCount > 0
      ? Math.round((availabilitySubmittedCount / travelerCount) * 100)
      : 0

  // Find best overlap
  const bestOverlap = findBestOverlapRange(windows)

  const overlapBestRange = bestOverlap
    ? {
        start: bestOverlap.start,
        end: bestOverlap.end,
        label: formatDateRange(
          bestOverlap.start,
          bestOverlap.end,
          shouldIncludeYear(bestOverlap.end)
        ),
      }
    : null

  const overlapBestCoverageCount = bestOverlap?.coverageCount || 0
  const overlapBestCoveragePct =
    travelerCount > 0
      ? Math.round((overlapBestCoverageCount / travelerCount) * 100)
      : 0

  // Check for proposed window
  const proposedWindow = windows.find(w => w.isProposed)
  const hasProposedWindow = !!proposedWindow
  const proposedWindowId = proposedWindow?.id || null

  // Voting state (simplified - based on trip status)
  const votingOpen = trip.status === 'voting'
  const voteThresholdMet = false // TODO: integrate with actual voting data
  const voteCount = 0
  const topOptionId = proposedWindowId
  const topOptionVotes = proposedWindow?.supportCount || 0

  // Determine trip stage
  let tripStage = 'proposed'
  if (trip.datesLocked || trip.status === 'locked') {
    tripStage = 'locked'
  } else if (votingOpen) {
    tripStage = 'voting'
  } else if (hasProposedWindow) {
    tripStage = 'proposed'
  } else if (availabilitySubmittedCount > 0) {
    tripStage = 'scheduling'
  }

  // Locked dates info
  const lockedDates =
    trip.lockedStartDate && trip.lockedEndDate
      ? {
          start: trip.lockedStartDate,
          end: trip.lockedEndDate,
          label: formatDateRange(
            trip.lockedStartDate,
            trip.lockedEndDate,
            shouldIncludeYear(trip.lockedEndDate)
          ),
        }
      : null

  // Viewer-specific metrics
  const viewerWindows = windows.filter(w => w.proposedBy === viewerId)
  const viewerWindowCount = viewerWindows.length

  return {
    travelerCount,
    availabilitySubmittedCount,
    availabilityCompletionPct,
    overlapBestRange,
    overlapBestCoverageCount,
    overlapBestCoveragePct,
    hasProposedWindow,
    proposedWindowId,
    votingOpen,
    voteCount,
    voteThresholdMet,
    topOptionId,
    topOptionVotes,
    tripStage,
    lockedDates,
    viewerWindowCount,
  }
}

/**
 * Build viewer context from trip data.
 */
export function buildViewerContext(
  viewerId: string,
  tripCreatedBy: string,
  participants: TripParticipant[],
  windows: DateWindow[]
): ViewerContext {
  const isLeader = viewerId === tripCreatedBy

  const isParticipant = participants.some(
    p => p.odId === viewerId && (!p.status || p.status === 'active')
  )

  const viewerWindows = windows.filter(w => w.proposedBy === viewerId)
  const hasSubmittedAvailability = viewerWindows.length > 0
  const windowCount = viewerWindows.length

  return {
    userId: viewerId,
    isLeader,
    isParticipant,
    hasSubmittedAvailability,
    windowCount,
  }
}
