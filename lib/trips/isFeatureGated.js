/**
 * Feature Gating Helper
 *
 * Checks whether a feature requires Trip Boost and the trip is not boosted.
 * Returns true if the feature is BLOCKED (needs boost).
 *
 * @module lib/trips/isFeatureGated
 */

const GATED_FEATURES = new Set([
  'decision_deadline',
  'decision_auto_close',
  'decision_nudge_voters',
  'brief_export',
  'brief_show_address',
  'settle_up',
  'settle_reminder',
  'settle_mark',
])

/**
 * Check if a feature is gated (blocked) for this trip.
 *
 * @param {Object} trip - Trip document (must have boostStatus field)
 * @param {string} feature - Feature key to check
 * @returns {boolean} true if the feature is BLOCKED (needs boost)
 */
export function isFeatureGated(trip, feature) {
  if (!trip || trip.boostStatus === 'boosted') return false
  return GATED_FEATURES.has(feature)
}

/**
 * Get the list of all gated feature keys.
 * Useful for displaying "Boosting also unlocks:" lists.
 *
 * @returns {string[]}
 */
export function getGatedFeatureList() {
  return [...GATED_FEATURES]
}

/**
 * Human-readable descriptions for gated features.
 * Used by the BoostGateCard component.
 */
export const GATED_FEATURE_DESCRIPTIONS = {
  decision_deadline: 'Set deadlines on group decisions',
  decision_auto_close: 'Auto-close decisions when deadline passes',
  decision_nudge_voters: 'Nudge people who haven\'t voted yet',
  brief_export: 'Export and print your trip brief',
  brief_show_address: 'Toggle address visibility in shared briefs',
  settle_up: 'See who owes whom after the trip',
  settle_reminder: 'Send payment reminders to the group',
  settle_mark: 'Mark debts as settled',
}
