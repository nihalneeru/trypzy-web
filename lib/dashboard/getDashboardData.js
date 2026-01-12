import { connectToMongo } from '../server/db.js'

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
 * Derive pending actions for a trip based on user role and trip state
 * @param {Object} trip
 * @param {string} userId
 * @param {'owner'|'member'} userRoleInCircle
 * @param {Array|null} userDatePicks
 * @param {Object|null} userVote
 * @param {boolean} isParticipant
 * @param {Array} availabilities
 * @param {Array} votes
 * @returns {PendingAction[]}
 */
export function derivePendingActions(
  trip,
  userId,
  userRoleInCircle,
  userDatePicks,
  userVote,
  isParticipant,
  availabilities,
  votes
) {
  const actions = []
  const isTripLeader = trip.createdBy === userId
  
  // For collaborative trips
  if (trip.type === 'collaborative') {
    // 1. Scheduling required (highest priority)
    if (trip.status === 'proposed' || trip.status === 'scheduling') {
      if (trip.schedulingMode === 'top3_heatmap') {
        // Check if user has submitted date picks
        if (!userDatePicks || userDatePicks.length === 0) {
          actions.push({
            type: 'scheduling_required',
            priority: 1,
            label: 'Pick your dates',
            href: `/trips/${trip.id}`,
            timestamp: trip.updatedAt || trip.createdAt
          })
        }
      } else {
        // Legacy availability system
        const userAvail = availabilities.filter(a => a.userId === userId)
        if (userAvail.length === 0) {
          actions.push({
            type: 'scheduling_required',
            priority: 1,
            label: 'Mark availability',
            href: `/trips/${trip.id}`,
            timestamp: trip.updatedAt || trip.createdAt
          })
        }
      }
    }
    
    // 2. Date voting
    if (trip.status === 'voting') {
      if (!userVote) {
        actions.push({
          type: 'date_vote',
          priority: 2,
          label: 'Vote on dates',
          href: `/trips/${trip.id}`,
          timestamp: trip.updatedAt || trip.createdAt
        })
      }
    }
    
    // 3. Finalize dates (trip leader only)
    if (isTripLeader && trip.status === 'voting' && votes.length > 0) {
      actions.push({
        type: 'date_vote', // Can reuse type for "finalize" action
        priority: 2,
        label: 'Finalize dates',
        href: `/trips/${trip.id}`,
        timestamp: trip.updatedAt || trip.createdAt
      })
    }
    
    // 4. Itinerary review (for locked trips)
    if (trip.status === 'locked') {
      // If itinerary exists, check for review needs
      if (trip.itineraryStatus) {
        actions.push({
          type: 'itinerary_review',
          priority: 3,
          label: 'Review itinerary',
          href: `/trips/${trip.id}`,
          timestamp: trip.updatedAt || trip.createdAt
        })
      }
    }
  }
  
  // For hosted trips
  if (trip.type === 'hosted') {
    // Join action for non-participants
    if (!isParticipant && trip.status !== 'locked') {
      actions.push({
        type: 'other_input',
        priority: 2,
        label: 'Join trip',
        href: `/trips/${trip.id}`,
        timestamp: trip.createdAt
      })
    }
    
    // Itinerary actions for trip leader
    if (isTripLeader) {
      if (trip.status === 'locked' && trip.itineraryStatus === 'collecting_ideas') {
        actions.push({
          type: 'itinerary_review',
          priority: 3,
          label: 'Generate itinerary',
          href: `/trips/${trip.id}`,
          timestamp: trip.updatedAt || trip.createdAt
        })
      } else if (trip.itineraryStatus === 'drafting') {
        actions.push({
          type: 'itinerary_review',
          priority: 3,
          label: 'Review itinerary draft',
          href: `/trips/${trip.id}`,
          timestamp: trip.updatedAt || trip.createdAt
        })
      }
    }
    
    // Itinerary review for participants
    if (isParticipant && trip.status === 'locked' && trip.itineraryStatus === 'published') {
      actions.push({
        type: 'itinerary_review',
        priority: 3,
        label: 'Review itinerary',
        href: `/trips/${trip.id}`,
        timestamp: trip.updatedAt || trip.createdAt
      })
    }
  }
  
  // Sort by priority (lower number = higher priority)
  return actions.sort((a, b) => a.priority - b.priority)
}

/**
 * Get latest activity from trip messages
 * @param {Object} db
 * @param {string} tripId
 * @returns {Promise<LatestActivity|null>}
 */
async function getLatestActivity(db, tripId) {
  const latestMessage = await db.collection('trip_messages')
    .find({ tripId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray()
  
  if (latestMessage.length === 0) return null
  
  const msg = latestMessage[0]
  return {
    text: msg.content || 'Activity',
    createdAt: msg.createdAt
  }
}

/**
 * Get traveler count for a trip
 * @param {Object} db
 * @param {Object} trip
 * @returns {Promise<number>}
 */
async function getTravelerCount(db, trip) {
  if (trip.type === 'hosted') {
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id })
      .toArray()
    return participants.length
  } else {
    // For collaborative trips, count circle members
    const memberships = await db.collection('memberships')
      .find({ circleId: trip.circleId })
      .toArray()
    return memberships.length
  }
}

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
 * Sort trips within a circle according to spec
 * @param {TripData[]} trips
 * @returns {TripData[]}
 */
function sortTrips(trips) {
  const today = new Date().toISOString().split('T')[0]
  
  // Separate into buckets
  const bucket1 = [] // Trips with pending actions
  const bucket2 = [] // Upcoming trips
  const bucket3 = [] // Planning/in-progress trips
  const bucket4 = [] // Past trips
  
  trips.forEach(trip => {
    if (trip.pendingActions.length > 0) {
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
    const aPriority = Math.min(...a.pendingActions.map(pa => pa.priority))
    const bPriority = Math.min(...b.pendingActions.map(pa => pa.priority))
    if (aPriority !== bPriority) return aPriority - bPriority
    
    const aLatest = a.latestActivity?.createdAt || a.pendingActions[0]?.timestamp || ''
    const bLatest = b.latestActivity?.createdAt || b.pendingActions[0]?.timestamp || ''
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
  
  // Combine buckets
  const sorted = [...bucket1, ...bucket2, ...bucket3, ...bucket4]
  
  // Final tie-breaker: tripName A-Z
  sorted.sort((a, b) => {
    const aInBucket1 = bucket1.includes(a)
    const bInBucket1 = bucket1.includes(b)
    if (aInBucket1 && bInBucket1 && a.pendingActions.length > 0 && b.pendingActions.length > 0) {
      const aPriority = Math.min(...a.pendingActions.map(pa => pa.priority))
      const bPriority = Math.min(...b.pendingActions.map(pa => pa.priority))
      if (aPriority === bPriority) {
        return a.name.localeCompare(b.name)
      }
    }
    return a.name.localeCompare(b.name)
  })
  
  return sorted
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
  
  // Get all related data in bulk (avoid N+1)
  const tripIds = allTrips.map(t => t.id)
  
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
  
  // Process trips
  for (const trip of allTrips) {
    const circleData = circleDataMap.get(trip.circleId)
    if (!circleData) continue
    
    const membership = memberships.find(m => m.circleId === trip.circleId)
    const userDatePicksDoc = datePicks.find(dp => dp.tripId === trip.id && dp.userId === userId)
    const userDatePicks = userDatePicksDoc?.picks || null
    const userVote = votes.find(v => v.tripId === trip.id && v.userId === userId)
    const isParticipant = participants.some(p => p.tripId === trip.id && p.userId === userId)
    const tripAvailabilities = availabilities.filter(a => a.tripId === trip.id)
    const tripVotes = votes.filter(v => v.tripId === trip.id)
    
    const pendingActions = derivePendingActions(
      trip,
      userId,
      membership.role,
      userDatePicks,
      userVote,
      isParticipant,
      tripAvailabilities,
      tripVotes
    )
    
    // Get latest activity from messages
    const tripMessages = messages.filter(m => m.tripId === trip.id)
    const latestActivity = tripMessages.length > 0
      ? {
          text: tripMessages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].content || 'Activity',
          createdAt: tripMessages.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt
        }
      : null
    
    const travelerCount = await getTravelerCount(db, trip)
    
    circleData.trips.push({
      id: trip.id,
      name: trip.name,
      status: trip.status || (trip.type === 'hosted' ? 'locked' : 'proposed'),
      startDate: trip.lockedStartDate || trip.startDate || null,
      endDate: trip.lockedEndDate || trip.endDate || null,
      travelerCount,
      latestActivity,
      pendingActions,
      createdBy: trip.createdBy,
      type: trip.type,
      itineraryStatus: trip.itineraryStatus || null,
      lockedStartDate: trip.lockedStartDate || null,
      lockedEndDate: trip.lockedEndDate || null
    })
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
        globalNotifications.push({
          id: `trip-${trip.id}-${highestPriorityAction.type}`,
          title: trip.name,
          context: highestPriorityAction.label,
          ctaLabel: highestPriorityAction.label,
          href: highestPriorityAction.href,
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
