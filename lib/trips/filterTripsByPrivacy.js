/**
 * Privacy helper: Get user privacy with defaults applied
 * (Inlined here to avoid circular dependencies)
 */
function getUserPrivacyWithDefaults(userDoc) {
  if (!userDoc) return null
  
  const privacy = userDoc.privacy || {}
  return {
    profileVisibility: privacy.profileVisibility || 'circle',
    tripsVisibility: privacy.tripsVisibility || 'circle',
    allowTripJoinRequests: privacy.allowTripJoinRequests !== undefined ? privacy.allowTripJoinRequests : true,
    showTripDetailsLevel: privacy.showTripDetailsLevel || 'limited'
  }
}

/**
 * Filter trips based on trip owner's privacy settings
 * Rule: If trip owner's tripsVisibility is 'private', exclude the trip UNLESS viewer is the owner
 * 
 * @param {Object} db - MongoDB database connection
 * @param {Array} trips - Array of trip documents
 * @param {string} viewerId - ID of the user viewing the trips
 * @returns {Promise<Array>} Filtered array of trips
 */
export async function filterTripsByPrivacy(db, trips, viewerId) {
  if (!trips || trips.length === 0) {
    return []
  }

  // Get unique trip owner IDs
  const ownerIds = [...new Set(trips.map(trip => trip.createdBy).filter(Boolean))]
  
  if (ownerIds.length === 0) {
    // No owners found, return all trips (edge case)
    return trips
  }

  // Fetch all trip owners' privacy settings in one query
  const owners = await db.collection('users')
    .find({ id: { $in: ownerIds } })
    .toArray()
  
  // Create a map of ownerId -> privacy settings for fast lookup
  const ownerPrivacyMap = new Map()
  for (const owner of owners) {
    const privacy = getUserPrivacyWithDefaults(owner)
    ownerPrivacyMap.set(owner.id, privacy)
  }

  // Filter trips: exclude if owner's tripsVisibility is 'private' and viewer is not the owner
  return trips.filter(trip => {
    // Always allow if viewer is the trip owner
    if (trip.createdBy === viewerId) {
      return true
    }

    // Get owner's privacy settings
    const ownerPrivacy = ownerPrivacyMap.get(trip.createdBy)
    if (!ownerPrivacy) {
      // Owner not found - default to allowing (safe fallback)
      return true
    }

    // If owner's tripsVisibility is 'private', exclude from non-owners
    if (ownerPrivacy.tripsVisibility === 'private') {
      return false
    }

    // Otherwise allow (existing visibility rules like 'circle' or 'public' apply)
    return true
  })
}
