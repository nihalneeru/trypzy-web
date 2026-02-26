import { connectToMongo } from '../server/db.js'
import { filterTripsByActiveTravelerPrivacy } from '../trips/canViewerSeeTrip.js'
import { buildTripCardData } from '../trips/buildTripCardData.js'

/**
 * Lightweight notification fetch — returns globalNotifications without full dashboard data.
 * Powers the AppHeader bell on all pages.
 *
 * @param {string} userId
 * @returns {Promise<Array<{id:string, title:string, context:string, ctaLabel:string, href:string, priority:number, timestamp:string}>>}
 */
export async function getGlobalNotifications(userId) {
  const db = await connectToMongo()

  // Get user's circle memberships
  const memberships = await db.collection('memberships')
    .find({ userId, status: { $ne: 'left' } })
    .toArray()

  if (memberships.length === 0) return []

  const circleIds = memberships.map(m => m.circleId)

  // Get only active trips (skip completed/canceled for speed)
  const allTrips = await db.collection('trips')
    .find({
      circleId: { $in: circleIds },
      status: { $nin: ['completed', 'canceled'] }
    })
    .toArray()

  // Privacy filter
  const visibleTrips = allTrips.length > 0
    ? await filterTripsByActiveTravelerPrivacy({ viewerId: userId, trips: allTrips, db })
    : []

  const tripIds = visibleTrips.map(t => t.id)

  // Bulk fetch related data for buildTripCardData
  const [availabilities, votes, participants, datePicks, messages, dateWindows, windowSupports] = await Promise.all([
    tripIds.length > 0 ? db.collection('availabilities').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('votes').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('trip_participants').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('trip_date_picks').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('trip_messages').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('date_windows').find({ tripId: { $in: tripIds } }).toArray() : [],
    tripIds.length > 0 ? db.collection('window_supports').find({ tripId: { $in: tripIds } }).toArray() : [],
  ])

  const notifications = []

  // Build trip card data and extract pending actions
  for (const trip of visibleTrips) {
    const membership = memberships.find(m => m.circleId === trip.circleId)
    if (!membership) continue

    const tripCardData = await buildTripCardData(trip, userId, membership.role, db, {
      availabilities, votes, participants, datePicks, messages, dateWindows, windowSupports
    })

    if (tripCardData.pendingActions.length > 0) {
      const action = tripCardData.pendingActions[0]
      const baseHref = action.href
      const returnParams = new URLSearchParams()
      returnParams.set('returnTo', '/dashboard')
      returnParams.set('circleId', trip.circleId)
      const separator = baseHref.includes('?') ? '&' : '?'

      notifications.push({
        id: `trip-${trip.id}-${action.type}`,
        title: trip.name,
        context: action.label,
        ctaLabel: action.label,
        href: `${baseHref}${separator}${returnParams.toString()}`,
        priority: action.priority,
        timestamp: action.timestamp
      })
    }
  }

  // Join request notifications (for trips user leads)
  const leaderTripIds = allTrips
    .filter(t => t.createdBy === userId)
    .map(t => t.id)

  if (leaderTripIds.length > 0) {
    const joinRequests = await db.collection('trip_join_requests')
      .find({ tripId: { $in: leaderTripIds }, status: 'pending' })
      .sort({ createdAt: 1 })
      .toArray()

    if (joinRequests.length > 0) {
      const requesterIds = [...new Set(joinRequests.map(r => r.requesterId))]
      const requesters = await db.collection('users')
        .find({ id: { $in: requesterIds } })
        .toArray()
      const requesterMap = new Map(requesters.map(u => [u.id, u]))

      for (const request of joinRequests) {
        const trip = allTrips.find(t => t.id === request.tripId)
        if (!trip) continue

        const requester = requesterMap.get(request.requesterId)
        const requesterName = requester?.name || 'Unknown'

        const returnParams = new URLSearchParams()
        returnParams.set('returnTo', '/dashboard')
        returnParams.set('circleId', trip.circleId)

        notifications.push({
          id: `join-request-${request.id}`,
          title: trip.name,
          context: `${requesterName} wants to join`,
          ctaLabel: 'Review request',
          href: `/trips/${trip.id}?${returnParams.toString()}`,
          priority: 1,
          timestamp: request.createdAt || new Date().toISOString()
        })
      }
    }
  }

  // Sort: priority → recency
  notifications.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.timestamp.localeCompare(a.timestamp)
  })

  return notifications
}
