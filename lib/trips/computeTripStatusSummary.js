/**
 * computeTripStatusSummary — deterministic status summary for the TripStatusCard.
 *
 * All logic is pure: no DB, no LLM.
 *
 * @param {Object} trip           - Trip document (with schedulingSummary, itineraryStatus, etc.)
 * @param {Array}  participants   - Active participants [{userId, ...}]
 * @param {Object|null} sinceData - Delta data since last visit (null if < 24h)
 *   { newMessages, newWindows, newReactions, lastVisitedAt }
 * @param {string} userId         - Current user's ID
 * @returns {{ phase: string, stats: string|null, sinceLastVisit: object|null, nextAction: string|null, nextActionRole: 'traveler'|'leader'|null }}
 */
export function computeTripStatusSummary(trip, participants, sinceData, userId) {
  if (!trip) {
    return { phase: 'Trip loading...', stats: null, sinceLastVisit: null, nextAction: null, nextActionRole: null }
  }

  const totalTravelers = participants?.length || 0
  const isLeader = trip.createdBy === userId
  const status = trip.status || 'proposed'
  const datesLocked = status === 'locked' || !!(trip.lockedStartDate && trip.lockedEndDate)

  // Format since-last-visit data (only show if 24h+ since last visit and there's something new)
  const sinceLastVisit = formatSinceLastVisit(sinceData)

  // COMPLETED
  if (status === 'completed') {
    return {
      phase: 'Trip completed!',
      stats: null,
      sinceLastVisit,
      nextAction: null,
      nextActionRole: null
    }
  }

  // CANCELED
  if (status === 'canceled' || trip.tripStatus === 'CANCELLED') {
    return {
      phase: 'Trip canceled',
      stats: null,
      sinceLastVisit: null,
      nextAction: null,
      nextActionRole: null
    }
  }

  // PROPOSED — no scheduling activity yet
  if (status === 'proposed') {
    return {
      phase: 'Trip proposed',
      stats: totalTravelers > 0
        ? `${totalTravelers} traveler${totalTravelers === 1 ? '' : 's'} in the group`
        : null,
      sinceLastVisit,
      nextAction: 'Suggest dates for the trip',
      nextActionRole: 'traveler'
    }
  }

  // SCHEDULING (date_windows mode)
  if (status === 'scheduling') {
    const ss = trip.schedulingSummary

    // PROPOSED sub-phase: leader has proposed a window, awaiting reactions
    if (ss?.phase === 'PROPOSED') {
      const reactedCount = ss.totalReactions || 0
      const userReacted = !!ss.userReaction

      return {
        phase: `Leader proposed ${ss.proposedWindowText || 'dates'}`,
        stats: `${reactedCount} of ${totalTravelers} travelers have reacted`,
        sinceLastVisit,
        nextAction: !userReacted ? 'React to the proposed dates' : (isLeader ? 'Confirm dates when ready' : null),
        nextActionRole: !userReacted ? 'traveler' : (isLeader ? 'leader' : null)
      }
    }

    // COLLECTING sub-phase: travelers are suggesting date windows
    const windowCount = ss?.windowCount || 0
    const responderCount = ss?.responderCount || 0
    const userHasResponded = ss?.userHasResponded || false

    return {
      phase: 'Collecting dates',
      stats: responderCount > 0
        ? `${responderCount} of ${totalTravelers} travelers have suggested dates`
        : 'Waiting for date suggestions',
      sinceLastVisit,
      nextAction: !userHasResponded
        ? 'Add your date preferences'
        : (isLeader && ss?.proposalReady ? 'Propose dates to the group' : null),
      nextActionRole: !userHasResponded
        ? 'traveler'
        : (isLeader && ss?.proposalReady ? 'leader' : null)
    }
  }

  // VOTING (legacy top3_heatmap mode)
  if (status === 'voting') {
    return {
      phase: 'Voting on dates',
      stats: null,
      sinceLastVisit,
      nextAction: 'Cast your vote',
      nextActionRole: 'traveler'
    }
  }

  // LOCKED — dates are set
  if (datesLocked) {
    const startDate = trip.lockedStartDate || trip.startDate
    const endDate = trip.lockedEndDate || trip.endDate
    const dateStr = formatDateRange(startDate, endDate)

    const itineraryStatus = trip.itineraryStatus

    // Has finalized itinerary
    if (itineraryStatus === 'selected' || itineraryStatus === 'published') {
      const accommodationChosen = trip.progress?.steps?.accommodationChosen
      if (accommodationChosen) {
        return {
          phase: `Dates locked${dateStr ? ` (${dateStr})` : ''}`,
          stats: 'Accommodation chosen — getting ready!',
          sinceLastVisit,
          nextAction: isLeader ? 'Check trip prep items' : null,
          nextActionRole: isLeader ? 'leader' : null
        }
      }
      return {
        phase: `Dates locked${dateStr ? ` (${dateStr})` : ''}`,
        stats: 'Itinerary ready — time to find a place to stay',
        sinceLastVisit,
        nextAction: 'Explore accommodation options',
        nextActionRole: 'traveler'
      }
    }

    // Itinerary in progress
    if (itineraryStatus === 'drafting' || itineraryStatus === 'revising') {
      return {
        phase: `Dates locked${dateStr ? ` (${dateStr})` : ''}`,
        stats: 'Itinerary is being worked on...',
        sinceLastVisit,
        nextAction: null,
        nextActionRole: null
      }
    }

    // Collecting ideas or no itinerary yet
    const ideaCount = trip.ideaSummary?.totalCount || 0
    return {
      phase: `Dates locked${dateStr ? ` (${dateStr})` : ''}`,
      stats: ideaCount > 0
        ? `${ideaCount} idea${ideaCount === 1 ? '' : 's'} shared — time to plan the itinerary`
        : 'Time to plan the itinerary',
      sinceLastVisit,
      nextAction: isLeader ? 'Build the itinerary' : 'Suggest destinations and activities',
      nextActionRole: isLeader ? 'leader' : 'traveler'
    }
  }

  // Fallback
  return {
    phase: 'Trip in progress',
    stats: null,
    sinceLastVisit,
    nextAction: null,
    nextActionRole: null
  }
}

// ── helpers ──

function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return null
  const fmt = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(startDate)} – ${fmt(endDate)}`
}

function formatSinceLastVisit(sinceData) {
  if (!sinceData) return null
  const parts = []
  if (sinceData.newMessages > 0) {
    parts.push(`${sinceData.newMessages} new message${sinceData.newMessages === 1 ? '' : 's'}`)
  }
  if (sinceData.newWindows > 0) {
    parts.push(`${sinceData.newWindows} new date suggestion${sinceData.newWindows === 1 ? '' : 's'}`)
  }
  if (sinceData.newReactions > 0) {
    parts.push(`${sinceData.newReactions} new reaction${sinceData.newReactions === 1 ? '' : 's'}`)
  }
  if (parts.length === 0) return null
  return { summary: parts.join(', '), ...sinceData }
}
