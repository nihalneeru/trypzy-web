/**
 * Trip Progress Snapshot
 * 
 * Unified computation of trip progress state for consistent UI updates.
 * Used by Chat CTAs, Progress Pane, Dashboard Notifications, etc.
 */

import { deriveTripPrimaryStage, TripPrimaryStage } from './stage.js'
import { getNormalizedTripDates, getTripDateState, TripDateState } from './dateState.js'

/**
 * Trip Progress Snapshot - unified state computation
 */
export type TripProgressSnapshot = {
  // Availability/Scheduling state
  everyoneResponded: boolean
  leaderNeedsToLock: boolean
  datesLocked: boolean
  
  // Itinerary state
  itineraryPending: boolean
  itineraryFinalized: boolean
  
  // Accommodation state
  accommodationPending: boolean
  accommodationChosen: boolean
  
  // Prep state
  prepPending: boolean
  prepStarted: boolean
  
  // Join requests
  pendingJoinRequestsCount: number
  
  // Trip lifecycle
  isOngoing: boolean
  isCompleted: boolean
  
  // User role context
  isTripLeader: boolean
  isParticipant: boolean
  hasLeftTrip: boolean
  
  // Stage
  stage: string
}

/**
 * Compute unified trip progress snapshot
 * 
 * @param {Object} trip - Trip object from API
 * @param {Object} user - Current user object
 * @param {Object} [options] - Additional context
 * @param {Array} [options.joinRequests] - Pending join requests (for leaders)
 * @param {Object} [options.pickProgress] - Pick progress data (respondedCount, totalCount)
 * @returns {TripProgressSnapshot}
 */
export function computeTripProgressSnapshot(
  trip: any,
  user: any,
  options: {
    joinRequests?: Array<any>
    pickProgress?: { respondedCount: number; totalCount: number }
  } = {}
): TripProgressSnapshot {
  if (!trip || !user) {
    return {
      everyoneResponded: false,
      leaderNeedsToLock: false,
      datesLocked: false,
      itineraryPending: false,
      itineraryFinalized: false,
      accommodationPending: false,
      accommodationChosen: false,
      prepPending: false,
      prepStarted: false,
      pendingJoinRequestsCount: 0,
      isOngoing: false,
      isCompleted: false,
      isTripLeader: false,
      isParticipant: false,
      hasLeftTrip: false,
      stage: TripPrimaryStage.PROPOSED
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const { lockedStart, lockedEnd, datesLocked } = getNormalizedTripDates(trip)
  const startDate = lockedStart || trip.startDate
  const endDate = lockedEnd || trip.endDate
  
  // User role context
  const createdById = typeof trip.createdBy === 'string' ? trip.createdBy : trip.createdBy?.id
  const isTripLeader = trip.viewer?.isTripLeader || createdById === user.id
  const isParticipant = trip.isParticipant || trip.viewer?.isParticipant || false
  const hasLeftTrip = trip.viewer?.participantStatus === 'left'
  
  // Dates locked
  const datesLockedResolved = datesLocked
  
  // Availability/Scheduling state
  const pickProgress = options.pickProgress || trip.pickProgress
  const everyoneResponded = pickProgress 
    ? pickProgress.respondedCount >= pickProgress.totalCount
    : false
  const totalMembers = trip.memberCount || trip.activeTravelerCount || (
    Array.isArray(trip.participantsWithStatus)
      ? trip.participantsWithStatus.filter((p: any) => (p.status || 'active') === 'active').length
      : 0
  )
  const dateState = getTripDateState(trip, totalMembers)
  const leaderNeedsToLock = isTripLeader &&
    !datesLockedResolved &&
    (
      (trip.type === 'collaborative' && trip.status !== 'locked' && everyoneResponded) ||
      dateState === TripDateState.READY_TO_LOCK
    )
  
  // Itinerary state
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  const itineraryPending = datesLockedResolved && !itineraryFinalized
  
  // Accommodation state
  const accommodationChosen = trip.progress?.steps?.accommodationChosen || false
  const accommodationPending = itineraryFinalized && !accommodationChosen
  
  // Prep state
  const prepStatus = trip.prepStatus || 'not_started'
  const prepStarted = prepStatus === 'in_progress' || prepStatus === 'complete' || trip.progress?.steps?.prepStarted || false
  const prepPending = accommodationChosen && !prepStarted
  
  // Join requests
  const joinRequests = options.joinRequests || []
  const pendingJoinRequestsCount = joinRequests.filter((r: any) => r.status === 'pending').length
  
  // Trip lifecycle
  const isCompleted = endDate && endDate < today
  const isOngoing = startDate && endDate && today >= startDate && today <= endDate && !isCompleted
  
  // Stage
  const stage = deriveTripPrimaryStage(trip)
  
  return {
    everyoneResponded,
    leaderNeedsToLock,
    datesLocked: datesLockedResolved,
    itineraryPending,
    itineraryFinalized,
    accommodationPending,
    accommodationChosen,
    prepPending,
    prepStarted,
    pendingJoinRequestsCount,
    isOngoing,
    isCompleted,
    isTripLeader,
    isParticipant,
    hasLeftTrip,
    stage
  }
}
