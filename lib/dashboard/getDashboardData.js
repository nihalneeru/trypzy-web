import { connectToMongo } from '../server/db.js'
import { buildTripCardData } from '../trips/buildTripCardData.js'
import { sortTrips } from './sortTrips.js'
import { derivePendingActions } from '../trips/derivePendingActions.js'

/**
 * @typedef {Object} PendingAction
 * @property {'scheduling_required'|'date_vote'|'itinerary_review'|'budget_confirmation'|'booking_confirmation'|'other_input'} type
 * @property {number} priority - 1 = highest (scheduling), 5 = lowest
 * @property {string} label
 * @property {string} href
 * @property {string} timestamp
 */

/**
 * @typedef {Object} LatestActivity
 * @property {string} text
 * @property {string} createdAt
 */

/**
 * @typedef {Object} TripData
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {number} travelerCount
 * @property {LatestActivity|null} latestActivity
 * @property {PendingAction[]} pendingActions
 * @property {string} createdBy
 * @property {'collaborative'|'hosted'} type
 * @property {string|null} [itineraryStatus]
 * @property {string|null} [lockedStartDate]
 * @property {string|null} [lockedEndDate]
 */

/**
 * @typedef {Object} CircleData
 * @property {string} id
 * @property {string} name
 * @property {'owner'|'member'} role
 * @property {TripData[]} trips
 */

/**
 * @typedef {Object} GlobalNotification
 * @property {string} id
 * @property {string} title
 * @property {string} context
 * @property {string} ctaLabel
 * @property {string} href
 * @property {number} priority
 * @property {string} timestamp
 */

/**
 * @typedef {Object} DashboardData
 * @property {CircleData[]} circles
 * @property {GlobalNotification[]} globalNotifications
 */

/**
 * Sort circles according to spec
 * @param {CircleData[]} circles
 * @returns {CircleData[]}
 */
function sortCircles(circles) {
  return circles.sort((a, b) => {
    // 1. Circles with blocking/high pending actions
    const aHighPriority = a.trips.some(t => t.pendingActions.some(pa => pa.priority <= 2))
    const bHighPriority = b.trips.some(t => t.pendingActions.some(pa => pa.priority <= 2))
    if (aHighPriority && !bHighPriority) return -1
    if (!aHighPriority && bHighPriority) return 1
    
    // 2. Circles with any pending actions
    const aHasActions = a.trips.some(t => t.pendingActions.length > 0)
    const bHasActions = b.trips.some(t => t.pendingActions.length > 0)
    if (aHasActions && !bHasActions) return -1
    if (!aHasActions && bHasActions) return 1
    
    // 3. Circles with recent activity
    const aLatestActivity = a.trips
      .map(t => t.latestActivity?.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0]
    const bLatestActivity = b.trips
      .map(t => t.latestActivity?.createdAt)
      .filter(Boolean)
      .sort()
      .reverse()[0]
    if (aLatestActivity && bLatestActivity) {
      if (aLatestActivity > bLatestActivity) return -1
      if (aLatestActivity < bLatestActivity) return 1
    }
    if (aLatestActivity && !bLatestActivity) return -1
    if (!aLatestActivity && bLatestActivity) return 1
    
    // 4. Circles with upcoming trips
    const today = new Date().toISOString().split('T')[0]
    const aUpcoming = a.trips.some(t => t.startDate && t.startDate >= today)
    const bUpcoming = b.trips.some(t => t.startDate && t.startDate >= today)
    if (aUpcoming && !bUpcoming) return -1
    if (!aUpcoming && bUpcoming) return 1
    
    // 5. Alphabetical
    return a.name.localeCompare(b.name)
  })
}

/**
 * Main function to get dashboard data
 * @param {string} userId
 * @returns {Promise<DashboardData>}
 */
export async function getDashboardData(userId) {
  const db = await connectToMongo()
  
  // Get user's circle memberships
  const memberships = await db.collection('memberships')
    .find({ userId })
    .toArray()
  
  if (memberships.length === 0) {
    return {
      circles: [],
      globalNotifications: []
    }
  }
  
  const circleIds = memberships.map(m => m.circleId)
  const circles = await db.collection('circles')
    .find({ id: { $in: circleIds } })
    .toArray()
  
  // Get all trips for user's circles
  const allTrips = await db.collection('trips')
    .find({ circleId: { $in: circleIds } })
    .toArray()
  
  // Filter trips based on trip owner's privacy settings
  // Private trips are excluded unless viewer is the owner
  const { filterTripsByPrivacy } = await import('../trips/filterTripsByPrivacy.js')
  const visibleTrips = await filterTripsByPrivacy(db, allTrips, userId)
  
  // Get all related data in bulk (avoid N+1)
  const tripIds = visibleTrips.map(t => t.id)
  
  const [availabilities, votes, participants, datePicks, messages] = await Promise.all([
    db.collection('availabilities').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('votes').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_participants').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_date_picks').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_messages').find({ tripId: { $in: tripIds } }).toArray()
  ])
  
  // Build trip data with pending actions
  const circleDataMap = new Map()
  
  for (const circle of circles) {
    const membership = memberships.find(m => m.circleId === circle.id)
    if (!membership) continue
    
    circleDataMap.set(circle.id, {
      id: circle.id,
      name: circle.name,
      role: membership.role,
      trips: []
    })
  }
  
  // Process trips - use shared trip card data builder
  for (const trip of visibleTrips) {
    const circleData = circleDataMap.get(trip.circleId)
    if (!circleData) continue
    
    const membership = memberships.find(m => m.circleId === trip.circleId)
    
    // Build trip card data using shared function
    const tripCardData = await buildTripCardData(
      trip,
      userId,
      membership.role,
      db,
      {
        availabilities,
        votes,
        participants,
        datePicks,
        messages
      }
    )
    
    circleData.trips.push(tripCardData)
  }
  
  // Sort trips within each circle
  for (const circleData of circleDataMap.values()) {
    circleData.trips = sortTrips(circleData.trips)
  }
  
  // Generate global notifications from pending actions
  const globalNotifications = []
  
  for (const circleData of circleDataMap.values()) {
    for (const trip of circleData.trips) {
      if (trip.pendingActions.length > 0) {
        const highestPriorityAction = trip.pendingActions[0]
        // Add returnTo parameter to href for breadcrumb navigation
        const baseHref = highestPriorityAction.href
        const returnParams = new URLSearchParams()
        returnParams.set('returnTo', '/dashboard')
        returnParams.set('circleId', circleData.id)
        const separator = baseHref.includes('?') ? '&' : '?'
        const hrefWithReturn = `${baseHref}${separator}${returnParams.toString()}`
        
        globalNotifications.push({
          id: `trip-${trip.id}-${highestPriorityAction.type}`,
          title: trip.name,
          context: highestPriorityAction.label,
          ctaLabel: highestPriorityAction.label,
          href: hrefWithReturn,
          priority: highestPriorityAction.priority,
          timestamp: highestPriorityAction.timestamp
        })
      }
    }
  }
  
  // Sort notifications: priority → recency
  globalNotifications.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.timestamp.localeCompare(a.timestamp)
  })
  
  // Convert map to array and sort circles
  const circlesArray = Array.from(circleDataMap.values())
  const sortedCircles = sortCircles(circlesArray)
  
  return {
    circles: sortedCircles,
    globalNotifications
  }
}
