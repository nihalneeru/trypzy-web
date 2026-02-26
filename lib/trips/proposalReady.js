/**
 * Computes whether a trip is ready for the leader to propose dates.
 *
 * This implements the deterministic gating logic for the date-locking funnel:
 * - COLLECTING phase: windows are being submitted, leader cannot propose until threshold met
 * - PROPOSED phase: leader has proposed a window, awaiting lock
 * - LOCKED phase: dates are final
 *
 * Thresholds:
 * - Small groups (≤10 travelers): majority of total travelers must support leading window
 * - Large groups (>10 travelers): majority of responders AND minimum 5 must support leading window
 *
 * @module lib/trips/proposalReady
 */

/**
 * Count supports per window
 * @param {Array} windows - Array of window objects with id
 * @param {Array} supports - Array of support objects with windowId, userId
 * @returns {Array} Array of { window, count, userIds } sorted by count descending
 */
function countSupportByWindow(windows, supports) {
  const counts = windows.map(window => {
    const windowSupports = supports.filter(s => s.windowId === window.id)
    return {
      window,
      count: windowSupports.length,
      userIds: windowSupports.map(s => s.userId)
    }
  })

  // Sort by count descending, then by creation date (earlier windows win ties)
  return counts.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    // Earlier window wins ties
    return new Date(a.window.createdAt) - new Date(b.window.createdAt)
  })
}

/**
 * Get unique responders (users who have supported at least one window)
 * @param {Array} supports - Array of support objects
 * @returns {Set} Set of user IDs who have responded
 */
function getResponders(supports) {
  return new Set(supports.map(s => s.userId))
}

/**
 * Compute whether the trip is ready for the leader to propose dates.
 *
 * @param {Object} trip - Trip object
 * @param {Array} travelers - Array of traveler objects with id field
 * @param {Array} windows - Array of date window objects
 * @param {Array} supports - Array of window support objects
 * @returns {Object} Proposal readiness result
 */
export function computeProposalReady(trip, travelers, windows, supports) {
  const totalTravelers = travelers.length
  const responders = getResponders(supports)
  const responderCount = responders.size

  // No windows = not ready
  if (windows.length === 0) {
    return {
      proposalReady: false,
      reason: 'no_windows',
      leadingWindow: null,
      stats: {
        totalTravelers,
        responderCount,
        leaderCount: 0,
        thresholdNeeded: totalTravelers <= 10
          ? Math.floor(totalTravelers / 2) + 1
          : Math.max(5, Math.ceil(responderCount / 2))
      }
    }
  }

  // Count supports per window
  const windowCounts = countSupportByWindow(windows, supports)
  const leader = windowCounts[0]
  const runnerUp = windowCounts[1] || null

  // Compute thresholds based on group size
  let proposalReady = false
  let thresholdNeeded = 0

  if (totalTravelers <= 10) {
    // Small group: majority of total travelers
    thresholdNeeded = Math.floor(totalTravelers / 2) + 1
    proposalReady = leader.count >= thresholdNeeded
  } else {
    // Large group: majority of responders AND minimum 5
    const majorityOfResponders = Math.ceil(responderCount / 2)
    thresholdNeeded = Math.max(5, majorityOfResponders)
    proposalReady = leader.count >= thresholdNeeded
  }

  return {
    proposalReady,
    reason: proposalReady ? 'threshold_met' : 'threshold_not_met',
    leadingWindow: leader.window,
    leaderCount: leader.count,
    leaderUserIds: leader.userIds,
    runnerUp: runnerUp ? {
      window: runnerUp.window,
      count: runnerUp.count
    } : null,
    stats: {
      totalTravelers,
      responderCount,
      leaderCount: leader.count,
      thresholdNeeded,
      windowCount: windows.length
    }
  }
}

/**
 * Check if leader can propose (either threshold met or override)
 *
 * @param {Object} trip - Trip object
 * @param {Array} travelers - Array of traveler objects
 * @param {Array} windows - Array of date window objects
 * @param {Array} supports - Array of window support objects
 * @param {boolean} leaderOverride - Whether leader is explicitly overriding
 * @returns {Object} { canPropose: boolean, proposalReady: boolean, ...stats }
 */
export function canLeaderPropose(trip, travelers, windows, supports, leaderOverride = false) {
  const result = computeProposalReady(trip, travelers, windows, supports)

  return {
    ...result,
    canPropose: result.proposalReady || leaderOverride,
    leaderOverride
  }
}

/**
 * Determine the scheduling phase for a trip
 *
 * @param {Object} trip - Trip object
 * @returns {'COLLECTING' | 'PROPOSED' | 'LOCKED'} Current phase
 */
export function getSchedulingPhase(trip) {
  // Check if dates are locked
  if (trip.status === 'locked' || trip.lockedStartDate) {
    return 'LOCKED'
  }

  // Check if windows are proposed (supports both single and multi-window proposals)
  if (trip.proposedWindowIds?.length > 0 || trip.proposedWindowId) {
    return 'PROPOSED'
  }

  // Default: collecting windows
  return 'COLLECTING'
}

/**
 * Get proposed window IDs from trip (backward-compatible)
 * Handles both old (proposedWindowId) and new (proposedWindowIds) format
 *
 * @param {Object} trip - Trip object
 * @returns {string[]} Array of proposed window IDs
 */
export function getProposedWindowIds(trip) {
  if (trip.proposedWindowIds?.length > 0) {
    return trip.proposedWindowIds
  }
  if (trip.proposedWindowId) {
    return [trip.proposedWindowId]
  }
  return []
}

/**
 * Check if new windows can be submitted
 * Windows are blocked once a proposal is active
 *
 * @param {Object} trip - Trip object
 * @returns {boolean} Whether new windows can be submitted
 */
export function canSubmitWindow(trip) {
  const phase = getSchedulingPhase(trip)
  return phase === 'COLLECTING'
}
