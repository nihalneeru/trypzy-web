/**
 * Event Aggregation Jobs
 *
 * Computes materialized aggregates from trip_events for the data moat.
 * Run daily via cron or manually.
 */

import { connectToMongo } from '@/lib/server/db'

// ============ Trip Coordination Snapshots ============

/**
 * Compute coordination snapshot for a single trip.
 *
 * @param {string} tripId - Trip ID
 * @returns {Promise<Object|null>} Trip coordination snapshot or null
 */
export async function computeTripSnapshot(tripId) {
  const db = await connectToMongo()

  const trip = await db.collection('trips').findOne({ id: tripId })
  if (!trip) return null

  // Determine outcome
  let outcome = 'active'
  if (trip.status === 'locked' || trip.lockedStartDate) {
    outcome = 'locked'
  } else if (trip.status === 'canceled' || trip.tripStatus === 'CANCELLED') {
    outcome = 'canceled'
  } else if (trip.status === 'completed' || trip.tripStatus === 'COMPLETED') {
    outcome = 'locked' // completed trips were locked first
  } else {
    // Check for abandonment: no activity in last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    const recentEvent = await db.collection('trip_events').findOne({
      tripId: String(tripId),
      timestamp: { $gte: twoWeeksAgo },
    })
    if (!recentEvent && new Date(trip.createdAt) < twoWeeksAgo) {
      outcome = 'abandoned'
    }
  }

  // Time to outcome
  let timeToOutcomeHours = null
  const createdAt = new Date(trip.createdAt)
  if (outcome === 'locked' && trip.lockedAt) {
    const lockedAt = new Date(trip.lockedAt)
    timeToOutcomeHours = Math.round((lockedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60))
  } else if (outcome === 'canceled' && trip.canceledAt) {
    const canceledAt = new Date(trip.canceledAt)
    timeToOutcomeHours = Math.round((canceledAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60))
  }

  // Count windows suggested
  const windowsSuggested = await db.collection('trip_events').countDocuments({
    tripId: String(tripId),
    eventType: 'scheduling.window.suggested',
  })

  // Count "cant" reactions
  const cantReactionCount = await db.collection('trip_events').countDocuments({
    tripId: String(tripId),
    eventType: 'scheduling.reaction.submitted',
    'payload.reaction': 'cant',
  })

  // Participation rate: unique actors / total travelers
  const uniqueActors = await db.collection('trip_events').distinct('actorId', {
    tripId: String(tripId),
    actorId: { $ne: null },
  })

  // Get total travelers
  let totalTravelers = 0
  if (trip.type === 'collaborative') {
    const memberships = await db.collection('memberships').countDocuments({
      circleId: trip.circleId,
      status: { $ne: 'left' },
    })
    totalTravelers = memberships
  } else {
    const participants = await db.collection('trip_participants').countDocuments({
      tripId,
      status: 'active',
    })
    totalTravelers = participants
  }

  const participationRate = totalTravelers > 0 ? uniqueActors.length / totalTravelers : 0

  // Nudge stats (from last 30 days for performance)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const nudgesDisplayed = await db.collection('nudge_events').countDocuments({
    tripId,
    status: 'shown',
    createdAt: { $gte: thirtyDaysAgo.toISOString() },
  })

  const nudgesWithCorrelatedAction = await db.collection('trip_events').countDocuments({
    tripId: String(tripId),
    eventType: 'nudge.system.correlated_action',
  })

  const snapshot = {
    tripId: String(tripId),
    circleId: String(trip.circleId),
    outcome,
    timeToOutcomeHours,
    windowsSuggested,
    cantReactionCount,
    participationRate: Math.round(participationRate * 100) / 100,
    nudgesDisplayed,
    nudgesWithCorrelatedAction,
    computedAt: new Date(),
  }

  // Upsert the snapshot
  await db.collection('trip_coordination_snapshots').updateOne(
    { tripId: String(tripId) },
    { $set: snapshot },
    { upsert: true }
  )

  return snapshot
}

/**
 * Compute snapshots for all active trips (or recent trips).
 *
 * @returns {Promise<number>} Number of snapshots computed
 */
export async function computeAllTripSnapshots() {
  const db = await connectToMongo()

  // Get trips created in last 90 days or still active
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const trips = await db
    .collection('trips')
    .find({
      $or: [
        { createdAt: { $gte: ninetyDaysAgo.toISOString() } },
        { status: { $in: ['proposed', 'scheduling', 'voting'] } },
      ],
    })
    .project({ id: 1 })
    .toArray()

  let count = 0
  for (const trip of trips) {
    await computeTripSnapshot(trip.id)
    count++
  }

  console.log(`[aggregates] Computed ${count} trip snapshots`)
  return count
}

// ============ Circle Coordination Profiles ============

/**
 * Compute coordination profile for a single circle.
 *
 * @param {string} circleId - Circle ID
 * @returns {Promise<Object|null>} Circle coordination profile or null
 */
export async function computeCircleProfile(circleId) {
  const db = await connectToMongo()

  const circle = await db.collection('circles').findOne({ id: circleId })
  if (!circle) return null

  // Get all trips for this circle
  const trips = await db
    .collection('trips')
    .find({ circleId })
    .toArray()

  const tripCount = trips.length
  if (tripCount === 0) {
    // No trips yet, create minimal profile
    const profile = {
      circleId: String(circleId),
      tripCount: 0,
      completedTripCount: 0,
      canceledTripCount: 0,
      completionRate: 0,
      medianTimeToLockDays: null,
      avgFirstActionDelayHours: null,
      leaderConcentration: 0,
      avgNudgesBeforeLock: 0,
      updatedAt: new Date(),
    }
    await db.collection('circle_coordination_profiles').updateOne(
      { circleId: String(circleId) },
      { $set: profile },
      { upsert: true }
    )
    return profile
  }

  // Count completed (locked) and canceled trips
  const completedTripCount = trips.filter(
    (t) => t.status === 'locked' || t.status === 'completed' || t.lockedStartDate
  ).length
  const canceledTripCount = trips.filter(
    (t) => t.status === 'canceled' || t.tripStatus === 'CANCELLED'
  ).length

  // Completion rate
  const decidedTrips = completedTripCount + canceledTripCount
  const completionRate = decidedTrips > 0 ? completedTripCount / decidedTrips : 0

  // Median time to lock
  const timeToLockDays = []
  for (const trip of trips) {
    if ((trip.status === 'locked' || trip.lockedStartDate) && trip.lockedAt && trip.createdAt) {
      const createdAt = new Date(trip.createdAt)
      const lockedAt = new Date(trip.lockedAt)
      const days = (lockedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      timeToLockDays.push(days)
    }
  }
  timeToLockDays.sort((a, b) => a - b)
  const medianTimeToLockDays =
    timeToLockDays.length > 0
      ? timeToLockDays[Math.floor(timeToLockDays.length / 2)]
      : null

  // Average first action delay
  const firstActionEvents = await db
    .collection('trip_events')
    .find({
      circleId: String(circleId),
      eventType: 'traveler.participation.first_action',
    })
    .toArray()

  let avgFirstActionDelayHours = null
  if (firstActionEvents.length > 0) {
    const delays = firstActionEvents
      .map((e) => e.payload?.hoursSinceJoin)
      .filter((h) => h != null && !isNaN(h))
    if (delays.length > 0) {
      avgFirstActionDelayHours =
        Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10
    }
  }

  // Leader concentration: how often the same person leads
  const leaderCounts = new Map()
  for (const trip of trips) {
    const leaderId = trip.createdBy
    if (leaderId) {
      leaderCounts.set(leaderId, (leaderCounts.get(leaderId) || 0) + 1)
    }
  }
  const maxLeadCount = Math.max(...leaderCounts.values(), 0)
  const leaderConcentration = tripCount > 0 ? maxLeadCount / tripCount : 0

  // Average nudges before lock
  let totalNudgesBeforeLock = 0
  let lockedTripCount = 0
  for (const trip of trips) {
    if (trip.status === 'locked' || trip.lockedStartDate) {
      const nudgeCount = await db.collection('nudge_events').countDocuments({
        tripId: trip.id,
        status: 'shown',
      })
      totalNudgesBeforeLock += nudgeCount
      lockedTripCount++
    }
  }
  const avgNudgesBeforeLock =
    lockedTripCount > 0 ? Math.round((totalNudgesBeforeLock / lockedTripCount) * 10) / 10 : 0

  const profile = {
    circleId: String(circleId),
    tripCount,
    completedTripCount,
    canceledTripCount,
    completionRate: Math.round(completionRate * 100) / 100,
    medianTimeToLockDays: medianTimeToLockDays ? Math.round(medianTimeToLockDays * 10) / 10 : null,
    avgFirstActionDelayHours,
    leaderConcentration: Math.round(leaderConcentration * 100) / 100,
    avgNudgesBeforeLock,
    updatedAt: new Date(),
  }

  // Upsert the profile
  await db.collection('circle_coordination_profiles').updateOne(
    { circleId: String(circleId) },
    { $set: profile },
    { upsert: true }
  )

  return profile
}

/**
 * Compute profiles for all circles with trips.
 *
 * @returns {Promise<number>} Number of profiles computed
 */
export async function computeAllCircleProfiles() {
  const db = await connectToMongo()

  // Get all circles that have trips
  const circleIds = await db.collection('trips').distinct('circleId')

  let count = 0
  for (const circleId of circleIds) {
    await computeCircleProfile(circleId)
    count++
  }

  console.log(`[aggregates] Computed ${count} circle profiles`)
  return count
}

// ============ Index Setup ============

/**
 * Ensure indexes exist on aggregate collections.
 */
export async function ensureAggregateIndexes() {
  const db = await connectToMongo()

  // trip_coordination_snapshots
  await db.collection('trip_coordination_snapshots').createIndex(
    { tripId: 1 },
    { unique: true, background: true }
  )
  await db.collection('trip_coordination_snapshots').createIndex(
    { circleId: 1, computedAt: -1 },
    { background: true }
  )

  // circle_coordination_profiles
  await db.collection('circle_coordination_profiles').createIndex(
    { circleId: 1 },
    { unique: true, background: true }
  )
  await db.collection('circle_coordination_profiles').createIndex(
    { updatedAt: -1 },
    { background: true }
  )

  console.log('[aggregates] Indexes created')
}

// ============ Main Job ============

/**
 * Run the full daily aggregation job.
 *
 * @returns {Promise<{tripSnapshots: number, circleProfiles: number}>} Counts
 */
export async function runDailyAggregation() {
  console.log('[aggregates] Starting daily aggregation...')

  await ensureAggregateIndexes()

  const tripSnapshots = await computeAllTripSnapshots()
  const circleProfiles = await computeAllCircleProfiles()

  console.log('[aggregates] Daily aggregation complete')

  return { tripSnapshots, circleProfiles }
}
