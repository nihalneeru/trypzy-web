/**
 * Context-aware privacy helper for trip filtering and detail level
 * 
 * IMPORTANT: Privacy settings (Upcoming Trips Visibility, Trip Details Level) 
 * ONLY apply to other-user profile views, never to self/dashboard/circle/trip access.
 * 
 * @param {Object} params
 * @param {string} params.viewerId - ID of the user viewing trips
 * @param {string} params.ownerId - ID of the trip owner (or target user for profile view)
 * @param {Object} params.ownerPrivacy - Privacy settings of the owner/target user
 * @param {Array} params.trips - Array of trip documents
 * @param {'PROFILE_VIEW'|'DASHBOARD'|'CIRCLE_TRIPS'|'TRIP_PAGE'|'SELF_PROFILE'} params.context - Context where trips are being viewed
 * @returns {Promise<{filteredTrips: Array, applyDetailsLevel: boolean}>}
 */
export async function applyProfileTripPrivacy({ viewerId, ownerId, ownerPrivacy, trips, context }) {
  // Self contexts: NO privacy filtering, full details always
  const selfContexts = ['DASHBOARD', 'CIRCLE_TRIPS', 'TRIP_PAGE', 'SELF_PROFILE']
  const isSelfContext = selfContexts.includes(context) || viewerId === ownerId
  
  if (isSelfContext) {
    // Owner always sees all trips with full details in self contexts
    return {
      filteredTrips: trips,
      applyDetailsLevel: false // Full details
    }
  }
  
  // Other-user profile view: Apply privacy filters
  if (context === 'PROFILE_VIEW' && viewerId !== ownerId) {
    const privacy = ownerPrivacy || {}
    const tripsVisibility = privacy.tripsVisibility || 'circle'
    
    // Filter trips based on Upcoming Trips Visibility
    let filteredTrips = trips
    
    if (tripsVisibility === 'private') {
      // Private: exclude all trips from non-owners
      filteredTrips = []
    } else if (tripsVisibility === 'circle') {
      // Circle: trips are visible (filtering by circle membership happens elsewhere)
      filteredTrips = trips
    } else if (tripsVisibility === 'public') {
      // Public: all trips visible
      filteredTrips = trips
    }
    
    // Apply Trip Details Level
    const showTripDetailsLevel = privacy.showTripDetailsLevel || 'limited'
    const applyDetailsLevel = showTripDetailsLevel === 'limited'
    
    return {
      filteredTrips,
      applyDetailsLevel
    }
  }
  
  // Default: no filtering, full details
  return {
    filteredTrips: trips,
    applyDetailsLevel: false
  }
}
