/**
 * @typedef {Object} PendingAction
 * @property {'scheduling_required'|'date_vote'|'itinerary_review'|'budget_confirmation'|'booking_confirmation'|'other_input'} type
 * @property {number} priority - 1 = highest (scheduling), 5 = lowest
 * @property {string} label
 * @property {string} href
 * @property {string} timestamp
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
  votes,
  isCurrentUserTraveler = true,
  { dateWindows = [], windowSupports = [] } = {}
) {
  const actions = []
  const isTripLeader = trip.createdBy === userId

  // For collaborative trips
  if (trip.type === 'collaborative') {
    // 1. Scheduling required (highest priority) — only for active travelers
    if (isCurrentUserTraveler && (trip.status === 'proposed' || trip.status === 'scheduling')) {
      if (trip.schedulingMode === 'date_windows') {
        // date_windows mode: user has participated if they suggested a window or supported one
        const userSuggested = dateWindows.some(w => w.suggestedBy === userId)
        const userSupported = windowSupports.some(s => s.userId === userId)
        if (!userSuggested && !userSupported) {
          actions.push({
            type: 'scheduling_required',
            priority: 1,
            label: 'Add your dates',
            href: `/trips/${trip.id}`,
            timestamp: trip.updatedAt || trip.createdAt
          })
        }
      } else if (trip.schedulingMode === 'top3_heatmap') {
        // Check if user has submitted date picks
        if (!userDatePicks || userDatePicks.length === 0) {
          actions.push({
            type: 'scheduling_required',
            priority: 1,
            label: 'Share your dates',
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

    // 2. Date voting — only for active travelers
    if (isCurrentUserTraveler && trip.status === 'voting') {
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

    // 3. Finalize dates (trip leader only — leader is always a traveler)
    if (isTripLeader && trip.status === 'voting' && votes.length > 0) {
      actions.push({
        type: 'date_vote', // Can reuse type for "finalize" action
        priority: 2,
        label: 'Finalize dates',
        href: `/trips/${trip.id}`,
        timestamp: trip.updatedAt || trip.createdAt
      })
    }
    
    // Itinerary review removed - passive action, not actionable
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
    
    // Itinerary review for participants removed - passive action, not actionable
  }
  
  // Sort by priority (lower number = higher priority)
  return actions.sort((a, b) => a.priority - b.priority)
}
