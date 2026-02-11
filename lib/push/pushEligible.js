/**
 * Push notification eligibility filter.
 *
 * Only a subset of nudge types warrant a push notification.
 * Philosophy: actionable + role-aware + celebratory over demanding.
 */

const PUSH_ELIGIBLE_TYPES = new Set([
  'leader_can_lock_dates',      // Unblocks entire trip. Leader-only.
  'leader_ready_to_propose',    // Actionable for leader.
  'dates_locked',               // Important milestone — all travelers.
])

/**
 * Check if a nudge type is eligible for push notification.
 * @param {string} nudgeType
 * @returns {boolean}
 */
export function isPushEligible(nudgeType) {
  return PUSH_ELIGIBLE_TYPES.has(nudgeType)
}
