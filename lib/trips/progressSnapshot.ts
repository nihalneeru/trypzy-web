/**
 * Trip Progress Snapshot
 * 
 * Unified computation of trip progress state for consistent UI updates.
 * Used by Chat CTAs, Progress Pane, Dashboard Notifications, etc.
 */

import { deriveTripPrimaryStage, TripPrimaryStage } from './stage.js'

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
  const startDate = trip.lockedStartDate || trip.startDate
  const endDate = trip.lockedEndDate || trip.endDate
  
  // User role context
  const isTripLeader = trip.createdBy === user.id
  const isParticipant = trip.isParticipant || trip.viewer?.isParticipant || false
  const hasLeftTrip = trip.viewer?.participantStatus === 'left'
  
  // Dates locked
  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)
  
  // Availability/Scheduling state
  const pickProgress = options.pickProgress || trip.pickProgress
  const everyoneResponded = pickProgress 
    ? pickProgress.respondedCount >= pickProgress.totalCount
    : false
  const leaderNeedsToLock = isTripLeader && 
    trip.type === 'collaborative' && 
    trip.status !== 'locked' && 
    everyoneResponded
  
  // Itinerary state
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  const itineraryPending = datesLocked && !itineraryFinalized
  
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
    datesLocked,
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
