/**
 * Privacy helper: Check if a viewer can see a trip based on active travelers' privacy settings
 * 
 * Rule: "Most restrictive traveler wins"
 * - If ANY active traveler has privacy='private', non-travelers cannot see the trip
 * - Trip creators can always see their trips
 * - Active travelers can always see trips they are on, even if another traveler is private
 * 
 * @param {Object} params
 * @param {string} params.viewerId - ID of the user viewing the trip
 * @param {Object} params.trip - Trip document from database
 * @param {Set|Array} [params.activeTravelerIds] - Optional pre-computed active traveler IDs (for batch processing)
 * @param {Map|Object} [params.travelerPrivacyMap] - Optional pre-fetched privacy settings map (userId -> privacy object)
 * @param {Object} params.db - MongoDB database connection
 * @returns {Promise<boolean>}
 */
export async function canViewerSeeTrip({ viewerId, trip, activeTravelerIds = null, travelerPrivacyMap = null, db }) {
  if (!viewerId || !trip || !db) {
    return false
  }

  // Rule 1: Trip creator can always see
  if (trip.createdBy === viewerId) {
    return true
  }

  // Rule 2: Get active traveler IDs for this trip
  let effectiveActiveTravelerIds = activeTravelerIds

  if (!effectiveActiveTravelerIds) {
    effectiveActiveTravelerIds = await getActiveTravelerIds(trip, db)
  }

  // Convert Set to Array if needed for consistent processing
  const travelerIdsArray = effectiveActiveTravelerIds instanceof Set 
    ? Array.from(effectiveActiveTravelerIds)
    : Array.isArray(effectiveActiveTravelerIds)
    ? effectiveActiveTravelerIds
    : []

  // Rule 3: Active travelers can always see trips they are on
  if (travelerIdsArray.includes(viewerId)) {
    return true
  }

  // Rule 4: If there are no active travelers, allow (edge case - trip might be empty)
  if (travelerIdsArray.length === 0) {
    return true
  }

  // Rule 5: Check if ANY active traveler has privacy='private'
  // If so, non-travelers cannot see the trip

  // Fetch privacy settings for all active travelers if not provided
  let privacyMap = travelerPrivacyMap

  if (!privacyMap || !(privacyMap instanceof Map)) {
    // Fetch all active travelers' privacy settings in one query
    const travelers = await db.collection('users')
      .find({ id: { $in: travelerIdsArray } })
      .toArray()

    privacyMap = new Map()
    for (const traveler of travelers) {
      const privacy = traveler.privacy || {}
      const tripsVisibility = privacy.tripsVisibility || 'circle' // Default to 'circle' if not set
      privacyMap.set(traveler.id, { tripsVisibility })
    }
  }

  // Check if any active traveler has privacy='private'
  let anyTravelerPrivate = false

  // Handle both Map and plain object privacy maps
  if (privacyMap instanceof Map) {
    for (const travelerId of travelerIdsArray) {
      const travelerPrivacy = privacyMap.get(travelerId)
      if (travelerPrivacy && travelerPrivacy.tripsVisibility === 'private') {
        anyTravelerPrivate = true
        break
      }
    }
  } else {
    // Plain object: keys are userIds
    for (const travelerId of travelerIdsArray) {
      const travelerPrivacy = privacyMap[travelerId]
      if (travelerPrivacy && travelerPrivacy.tripsVisibility === 'private') {
        anyTravelerPrivate = true
        break
      }
    }
  }

  // If any traveler is private, non-travelers cannot see the trip
  if (anyTravelerPrivate) {
    return false
  }

  // Otherwise, allow (subject to existing circle membership checks elsewhere)
  return true
}

/**
 * Get active traveler IDs for a trip
 * @param {Object} trip - Trip document
 * @param {Object} db - MongoDB database connection
 * @returns {Promise<Set<string>>} Set of active traveler user IDs
 */
async function getActiveTravelerIds(trip, db) {
  const activeIds = new Set()

  if (trip.type === 'hosted') {
    // For hosted trips: active = trip_participants with status 'active' (or missing, defaults to active)
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id })
      .toArray()

    for (const p of participants) {
      const status = p.status || 'active'
      if (status === 'active') {
        activeIds.add(p.userId)
      }
    }
  } else {
    // For collaborative trips: active = circle members minus users with status 'left' or 'removed'
    const memberships = await db.collection('memberships')
      .find({ circleId: trip.circleId })
      .toArray()

    const circleMemberUserIds = new Set(memberships.map(m => m.userId))

    // Get trip_participants records for this trip
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id })
      .toArray()

    // Build status map
    const statusByUserId = new Map()
    for (const p of participants) {
      statusByUserId.set(p.userId, p.status || 'active')
    }

    // Active = circle members whose status is 'active' (or missing, defaults to active)
    for (const userId of circleMemberUserIds) {
      const status = statusByUserId.get(userId) || 'active'
      if (status === 'active') {
        activeIds.add(userId)
      }
    }
  }

  return activeIds
}

/**
 * Batch filter trips based on active travelers' privacy settings (efficient for multiple trips)
 * 
 * @param {Object} params
 * @param {string} params.viewerId - ID of the user viewing trips
 * @param {Array} params.trips - Array of trip documents
 * @param {Object} params.db - MongoDB database connection
 * @returns {Promise<Array>} Filtered array of trips
 */
export async function filterTripsByActiveTravelerPrivacy({ viewerId, trips, db }) {
  if (!viewerId || !trips || trips.length === 0 || !db) {
    return []
  }

  // Step 1: For each trip, get active traveler IDs
  // Batch this efficiently
  const activeTravelerIdsByTrip = new Map()

  for (const trip of trips) {
    const activeIds = await getActiveTravelerIds(trip, db)
    activeTravelerIdsByTrip.set(trip.id, activeIds)
  }

  // Step 2: Collect all unique active traveler IDs across all trips
  const allTravelerIds = new Set()
  for (const activeIds of activeTravelerIdsByTrip.values()) {
    for (const userId of activeIds) {
      allTravelerIds.add(userId)
    }
  }

  // Step 3: Fetch privacy settings for all active travelers in one query
  const travelerIdsArray = Array.from(allTravelerIds)
  const travelers = travelerIdsArray.length > 0
    ? await db.collection('users')
        .find({ id: { $in: travelerIdsArray } })
        .toArray()
    : []

  const travelerPrivacyMap = new Map()
  for (const traveler of travelers) {
    const privacy = traveler.privacy || {}
    const tripsVisibility = privacy.tripsVisibility || 'circle'
    travelerPrivacyMap.set(traveler.id, { tripsVisibility })
  }

  // Step 4: Filter trips using privacy check
  const visibleTrips = []

  for (const trip of trips) {
    const activeIds = activeTravelerIdsByTrip.get(trip.id) || new Set()

    // Check if viewer can see this trip
    const canSee = await canViewerSeeTrip({
      viewerId,
      trip,
      activeTravelerIds: activeIds,
      travelerPrivacyMap,
      db
    })

    if (canSee) {
      visibleTrips.push(trip)
    }
  }

  return visibleTrips
}
