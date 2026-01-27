/**
 * Check if a circle member is a "late joiner" for a given trip.
 *
 * A late joiner is someone whose circle membership began AFTER the trip
 * was created. They are not auto-travelers — they must request to join.
 *
 * The trip creator is never a late joiner (they created the trip).
 *
 * Uses `membership.joinedAt` (set once on first circle join, never
 * updated on rejoin — only `rejoinedAt` is set on rejoin).
 *
 * Returns false for any legacy/missing data so existing records are
 * grandfathered in.
 *
 * @param {Object|null} membership - Circle membership record (must have userId)
 * @param {Object|null} trip - Trip document (must have createdAt, createdBy)
 * @returns {boolean}
 */
export function isLateJoinerForTrip(membership, trip) {
  if (!membership || !trip) return false
  // Trip creator is never a late joiner
  if (membership.userId && trip.createdBy && membership.userId === trip.createdBy) return false
  if (!membership.joinedAt || !trip.createdAt) return false
  return membership.joinedAt > trip.createdAt
}
