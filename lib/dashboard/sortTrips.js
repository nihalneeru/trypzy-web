/**
 * Sort trips within a circle according to dashboard spec
 * Extracted from getDashboardData.js for reuse
 *
 * @param {Array} trips - Array of trip objects
 * @returns {{ active: Array, cancelled: Array }} - Object with active and cancelled trips
 */
export function sortTrips(trips) {
  // Guard: if trips is not an array, return empty result
  if (!Array.isArray(trips)) {
    return { active: [], cancelled: [] }
  }

  const today = new Date().toISOString().split('T')[0]

  // Separate cancelled trips first
  const cancelledTrips = []
  const activeTrips = []

  trips.forEach(trip => {
    if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
      cancelledTrips.push(trip)
    } else {
      activeTrips.push(trip)
    }
  })

  // Sort cancelled trips by canceledAt descending (most recent first)
  cancelledTrips.sort((a, b) => {
    const aDate = a.canceledAt || a.createdAt || ''
    const bDate = b.canceledAt || b.createdAt || ''
    return bDate.localeCompare(aDate)
  })

  // Separate active trips into buckets
  const bucket1 = [] // Trips with pending actions
  const bucket2 = [] // Upcoming trips
  const bucket3 = [] // Planning/in-progress trips
  const bucket4 = [] // Past trips

  activeTrips.forEach(trip => {
    const pendingActions = trip.pendingActions || []
    if (pendingActions.length > 0) {
      bucket1.push(trip)
    } else if (trip.startDate && trip.startDate >= today) {
      bucket2.push(trip)
    } else if (!trip.lockedStartDate && !trip.lockedEndDate) {
      bucket3.push(trip)
    } else if (trip.endDate && trip.endDate < today) {
      bucket4.push(trip)
    } else {
      bucket3.push(trip) // Default to bucket 3
    }
  })
  
  // Sort bucket 1: by pending action priority desc, then recency
  bucket1.sort((a, b) => {
    const aPendingActions = a.pendingActions || []
    const bPendingActions = b.pendingActions || []
    const aPriority = Math.min(...aPendingActions.map(pa => pa.priority))
    const bPriority = Math.min(...bPendingActions.map(pa => pa.priority))
    if (aPriority !== bPriority) return aPriority - bPriority
    
    const aLatest = a.latestActivity?.createdAt || aPendingActions[0]?.timestamp || ''
    const bLatest = b.latestActivity?.createdAt || bPendingActions[0]?.timestamp || ''
    return bLatest.localeCompare(aLatest)
  })
  
  // Sort bucket 2: by startDate asc
  bucket2.sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0
    if (!a.startDate) return 1
    if (!b.startDate) return -1
    return a.startDate.localeCompare(b.startDate)
  })
  
  // Sort bucket 3: by status progression, then latestActivity desc
  const statusOrder = { 'proposed': 1, 'scheduling': 2, 'voting': 3, 'locked': 4 }
  bucket3.sort((a, b) => {
    const aStatus = statusOrder[a.status] || 0
    const bStatus = statusOrder[b.status] || 0
    if (aStatus !== bStatus) return aStatus - bStatus
    
    const aLatest = a.latestActivity?.createdAt || ''
    const bLatest = b.latestActivity?.createdAt || ''
    return bLatest.localeCompare(aLatest)
  })
  
  // Sort bucket 4: by endDate desc
  bucket4.sort((a, b) => {
    if (!a.endDate && !b.endDate) return 0
    if (!a.endDate) return 1
    if (!b.endDate) return -1
    return b.endDate.localeCompare(a.endDate)
  })
  
  // Combine buckets for active trips
  const sortedActive = [...bucket1, ...bucket2, ...bucket3, ...bucket4]

  // Final tie-breaker: tripName A-Z
  sortedActive.sort((a, b) => {
    const aPendingActions = a.pendingActions || []
    const bPendingActions = b.pendingActions || []
    const aInBucket1 = bucket1.includes(a)
    const bInBucket1 = bucket1.includes(b)
    if (aInBucket1 && bInBucket1 && aPendingActions.length > 0 && bPendingActions.length > 0) {
      const aPriority = Math.min(...aPendingActions.map(pa => pa.priority))
      const bPriority = Math.min(...bPendingActions.map(pa => pa.priority))
      if (aPriority === bPriority) {
        return a.name.localeCompare(b.name)
      }
    }
    return a.name.localeCompare(b.name)
  })

  return {
    active: sortedActive,
    cancelled: cancelledTrips
  }
}
