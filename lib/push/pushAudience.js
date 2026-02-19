/**
 * Audience resolution for push notifications.
 * Maps notification type to target user IDs.
 *
 * Replicates isActiveTraveler() logic from the API route but returns
 * all active traveler IDs at once (bulk resolution).
 */

/**
 * Get all active traveler IDs for a trip.
 * Replicates the isActiveTraveler() logic from app/api/[[...path]]/route.js.
 *
 * - Collaborative trips: circle members minus left/removed participants
 * - Hosted trips: only explicit active participants
 *
 * @param {object} db - MongoDB database instance
 * @param {object} trip - Trip object with id, type, circleId
 * @returns {Promise<string[]>} Array of user IDs
 */
export async function getActiveTravelerIds(db, trip) {
  if (trip.type === 'hosted') {
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id, status: 'active' })
      .toArray()
    return participants.map(p => p.userId)
  }

  // Collaborative: circle members minus left/removed
  const memberships = await db.collection('memberships')
    .find({ circleId: trip.circleId, status: { $ne: 'left' } })
    .toArray()

  const participants = await db.collection('trip_participants')
    .find({ tripId: trip.id })
    .toArray()

  const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))

  return memberships
    .filter(m => {
      const status = statusMap.get(m.userId)
      return status !== 'left' && status !== 'removed'
    })
    .map(m => m.userId)
}

/**
 * Resolve target user IDs for a push notification.
 *
 * @param {object} db - MongoDB database instance
 * @param {string} type - Push notification type
 * @param {object} trip - Trip object
 * @param {object} context - Type-specific context (actorUserId, requesterId, etc.)
 * @returns {Promise<string[]>} Array of user IDs to receive the push
 */
export async function resolveTargetUsers(db, type, trip, context) {
  switch (type) {
    case 'trip_created_notify': {
      // All circle members except creator
      const travelers = await getActiveTravelerIds(db, trip)
      return travelers.filter(id => id !== context.actorUserId)
    }

    case 'trip_canceled':
    case 'first_dates_suggested':
    case 'dates_proposed_by_leader': {
      // All active travelers except the actor
      const travelers = await getActiveTravelerIds(db, trip)
      return travelers.filter(id => id !== context.actorUserId)
    }

    case 'dates_locked': {
      // All active travelers (including the leader who locked — they get different copy)
      return getActiveTravelerIds(db, trip)
    }

    case 'itinerary_generated': {
      // All active travelers except leader (who triggered the generation)
      const travelers = await getActiveTravelerIds(db, trip)
      return travelers.filter(id => id !== trip.createdBy)
    }

    case 'join_request_received': {
      // Leader only
      return [trip.createdBy]
    }

    case 'join_request_approved': {
      // The requester only
      return context.requesterId ? [context.requesterId] : []
    }

    case 'leader_transferred': {
      // New leader only
      return context.newLeaderId ? [context.newLeaderId] : []
    }

    // P1 types
    case 'window_supported_author': {
      // Original window author only (skip if supporter === author)
      return context.authorUserId && context.authorUserId !== context.actorUserId
        ? [context.authorUserId]
        : []
    }

    case 'expense_added': {
      // All travelers in the split except submitter
      const travelers = await getActiveTravelerIds(db, trip)
      return travelers.filter(id => id !== context.actorUserId)
    }

    case 'accommodation_selected': {
      // All active travelers
      return getActiveTravelerIds(db, trip)
    }

    case 'first_idea_contributed': {
      // All active travelers except the contributor
      const travelers = await getActiveTravelerIds(db, trip)
      return travelers.filter(id => id !== context.actorUserId)
    }

    case 'prep_reminder_7d':
    case 'trip_started': {
      // All active travelers
      return getActiveTravelerIds(db, trip)
    }

    default:
      return []
  }
}
