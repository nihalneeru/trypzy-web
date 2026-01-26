/**
 * Returns a MongoDB query filter for active circle memberships.
 * Backwards-compatible: existing records without a `status` field
 * are treated as active since MongoDB's $ne:'left' matches
 * null/undefined/missing fields.
 *
 * @param {string} userId
 * @param {string} circleId
 * @returns {{ userId: string, circleId: string, status: { $ne: 'left' } }}
 */
export function activeMembershipQuery(userId, circleId) {
  return {
    userId,
    circleId,
    status: { $ne: 'left' }
  }
}
