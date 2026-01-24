import { connectToMongo } from '../server/db.js'
import { derivePendingActions } from './derivePendingActions.js'
import { getUserActionRequired } from './getUserActionRequired.js'

/**
 * @typedef {Object} TripCardData
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {number} travelerCount
 * @property {Object|null} latestActivity
 * @property {Array} pendingActions
 * @property {string} createdBy
 * @property {'collaborative'|'hosted'} type
 * @property {string|null} [itineraryStatus]
 * @property {string|null} [lockedStartDate]
 * @property {string|null} [lockedEndDate]
 */

/**
 * Get latest activity from trip messages
 * @param {Object} db
 * @param {string} tripId
 * @returns {Promise<{text: string, createdAt: string}|null>}
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
 * Get active traveler count for a trip
 * Active travelers = circle members minus users with status 'left' or 'removed'
 * @param {Object} db
 * @param {Object} trip
 * @param {Array} [participants] - Optional pre-fetched participants array (for batch processing)
 * @returns {Promise<number>}
 */
async function getTravelerCount(db, trip, participants = null) {
  if (trip.type === 'hosted') {
    // For hosted trips: count trip_participants with status missing or 'active'
    const tripParticipants = participants !== null ? participants : await db.collection('trip_participants')
      .find({ tripId: trip.id })
      .toArray()
    
    return tripParticipants.filter(p => {
      const status = p.status || 'active'
      return status === 'active'
    }).length
  } else {
    // For collaborative trips: circle members minus users with status 'left' or 'removed'
    const memberships = await db.collection('memberships')
      .find({ circleId: trip.circleId })
      .toArray()
    
    const circleMemberUserIds = new Set(memberships.map(m => m.userId))
    
    // Get trip_participants records for this trip
    const tripParticipants = participants !== null ? participants : await db.collection('trip_participants')
      .find({ tripId: trip.id })
      .toArray()
    
    // Build set of user IDs who have left or been removed
    const leftOrRemovedUserIds = new Set()
    tripParticipants.forEach(p => {
      const status = p.status || 'active'
      if ((status === 'left' || status === 'removed') && circleMemberUserIds.has(p.userId)) {
        leftOrRemovedUserIds.add(p.userId)
      }
    })
    
    // Active travelers = circle members minus those who left/removed
    return circleMemberUserIds.size - leftOrRemovedUserIds.size
  }
}

/**
 * Build trip card data from a trip document
 * This is the canonical function used by both dashboard and circles page
 * @param {Object} trip - Trip document from database
 * @param {string} userId - Current user ID
 * @param {'owner'|'member'} userRoleInCircle - User's role in the circle
 * @param {Object} db - MongoDB database connection
 * @param {Object} [options] - Additional data (availabilities, votes, participants, datePicks, messages)
 * @returns {Promise<TripCardData>}
 */
export async function buildTripCardData(trip, userId, userRoleInCircle, db, options = {}) {
  const {
    availabilities = [],
    votes = [],
    participants = [],
    datePicks = [],
    messages = []
  } = options

  // Get user-specific data
  const userDatePicksDoc = datePicks.find(dp => dp.tripId === trip.id && dp.userId === userId)
  const userDatePicks = userDatePicksDoc?.picks || null
  const userVote = votes.find(v => v.tripId === trip.id && v.userId === userId)
  const isParticipant = participants.some(p => p.tripId === trip.id && p.userId === userId)
  const tripAvailabilities = availabilities.filter(a => a.tripId === trip.id)
  const tripVotes = votes.filter(v => v.tripId === trip.id)
  
  const pendingActions = derivePendingActions(
    trip,
    userId,
    userRoleInCircle,
    userDatePicks,
    userVote,
    isParticipant,
    tripAvailabilities,
    tripVotes
  )
  
  // Determine if user has a required action (for "Waiting on you" badge)
  // MVP: Only for Dates Picking stages (availability/vote submission)
  const actionRequired = getUserActionRequired(
    trip,
    userId,
    userDatePicks,
    userVote,
    tripAvailabilities
  )
  
  // Get latest activity from messages
  const tripMessages = messages.filter(m => m.tripId === trip.id)
  const latestActivity = tripMessages.length > 0
    ? {
        text: tripMessages.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0].content || 'Activity',
        createdAt: tripMessages.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0].createdAt
      }
    : null
  
  // Get active traveler count (use pre-fetched participants if available)
  // Note: participants array contains all trips' participants, so filter for this trip
  const tripParticipants = participants.filter(p => p.tripId === trip.id)
  const travelerCount = await getTravelerCount(db, trip, tripParticipants)
  
  return {
    id: trip.id,
    name: trip.name,
    status: trip.status || (trip.type === 'hosted' ? 'locked' : 'proposed'),
    startDate: trip.lockedStartDate || trip.startDate || null,
    endDate: trip.lockedEndDate || trip.endDate || null,
    travelerCount,
    latestActivity,
    pendingActions,
    actionRequired,
    createdBy: trip.createdBy,
    type: trip.type,
    itineraryStatus: trip.itineraryStatus || null,
    lockedStartDate: trip.lockedStartDate || null,
    lockedEndDate: trip.lockedEndDate || null,
    proposedStart: trip.proposedStart || null,
    proposedEnd: trip.proposedEnd || null,
    lockedStart: trip.lockedStart || trip.lockedStartDate || null,
    lockedEnd: trip.lockedEnd || trip.lockedEndDate || null,
    datesLocked: trip.datesLocked || Boolean(trip.lockedStartDate && trip.lockedEndDate) || trip.status === 'locked',
    // Include original dates for countdown logic (countdown uses lockedStartDate if available)
    // trip.lockedStartDate is already checked above for startDate/endDate
  }
}

/**
 * Build trip card data for multiple trips (batch processing)
 * @param {Object[]} trips - Array of trip documents
 * @param {string} userId - Current user ID
 * @param {'owner'|'member'} userRoleInCircle - User's role in the circle
 * @param {Object} db - MongoDB database connection
 * @returns {Promise<TripCardData[]>}
 */
export async function buildTripCardDataBatch(trips, userId, userRoleInCircle, db) {
  if (trips.length === 0) return []
  
  const tripIds = trips.map(t => t.id)
  
  // Fetch all related data in bulk (avoid N+1)
  const [availabilities, votes, participants, datePicks, messages] = await Promise.all([
    db.collection('availabilities').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('votes').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_participants').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_date_picks').find({ tripId: { $in: tripIds } }).toArray(),
    db.collection('trip_messages').find({ tripId: { $in: tripIds } }).toArray()
  ])
  
  // Build trip card data for each trip
  const tripCardDataPromises = trips.map(trip =>
    buildTripCardData(trip, userId, userRoleInCircle, db, {
      availabilities,
      votes,
      participants,
      datePicks,
      messages
    })
  )
  
  return Promise.all(tripCardDataPromises)
}
