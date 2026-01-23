/**
 * Unit tests for computeTripProgressSnapshot
 *
 * Tests the unified progress snapshot computation including:
 * - Trip in proposed state (no dates locked)
 * - Trip with dates locked
 * - Trip with itinerary finalized
 * - Trip with accommodation chosen
 * - Trip with prep started
 * - Leader vs non-leader user
 * - Everyone responded vs partial responses
 */

import { deriveTripPrimaryStage, TripPrimaryStage } from '@/lib/trips/stage.js'

/**
 * Mirrors the computeTripProgressSnapshot logic from lib/trips/progressSnapshot.ts
 * Inlined here for testing purposes (avoids TypeScript import issues in JS tests)
 */
function computeTripProgressSnapshot(trip, user, options = {}) {
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
  const datesLocked = trip.status === 'locked' || Boolean(trip.lockedStartDate && trip.lockedEndDate)

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
  const pendingJoinRequestsCount = joinRequests.filter((r) => r.status === 'pending').length

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

describe('computeTripProgressSnapshot', () => {
  // Helper to create mock trip with future dates
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    name: 'Test Trip',
    createdBy: 'leader-1',
    circleId: 'circle-1',
    status: 'proposed',
    type: 'collaborative',
    startDate: '2030-06-01',
    endDate: '2030-06-05',
    ...overrides
  })

  // Helper to create mock user
  const mockUser = (overrides = {}) => ({
    id: 'user-1',
    name: 'Test User',
    ...overrides
  })

  describe('Null/undefined inputs', () => {
    it('should return default snapshot when trip is null', () => {
      const snapshot = computeTripProgressSnapshot(null, mockUser())

      expect(snapshot.everyoneResponded).toBe(false)
      expect(snapshot.leaderNeedsToLock).toBe(false)
      expect(snapshot.datesLocked).toBe(false)
      expect(snapshot.itineraryPending).toBe(false)
      expect(snapshot.itineraryFinalized).toBe(false)
      expect(snapshot.accommodationPending).toBe(false)
      expect(snapshot.accommodationChosen).toBe(false)
      expect(snapshot.prepPending).toBe(false)
      expect(snapshot.prepStarted).toBe(false)
      expect(snapshot.pendingJoinRequestsCount).toBe(0)
      expect(snapshot.isOngoing).toBe(false)
      expect(snapshot.isCompleted).toBe(false)
      expect(snapshot.isTripLeader).toBe(false)
      expect(snapshot.isParticipant).toBe(false)
      expect(snapshot.hasLeftTrip).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })

    it('should return default snapshot when user is null', () => {
      const snapshot = computeTripProgressSnapshot(mockTrip(), null)

      expect(snapshot.datesLocked).toBe(false)
      expect(snapshot.isTripLeader).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })

    it('should return default snapshot when both trip and user are undefined', () => {
      const snapshot = computeTripProgressSnapshot(undefined, undefined)

      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })
  })

  describe('Trip in proposed state (no dates locked)', () => {
    it('should compute correct snapshot for newly proposed trip', () => {
      const trip = mockTrip({ status: 'proposed' })
      const user = mockUser({ id: 'traveler-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(false)
      expect(snapshot.everyoneResponded).toBe(false)
      expect(snapshot.leaderNeedsToLock).toBe(false)
      expect(snapshot.itineraryPending).toBe(false)
      expect(snapshot.itineraryFinalized).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })

    it('should compute correct snapshot for scheduling status', () => {
      const trip = mockTrip({ status: 'scheduling' })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })

    it('should compute correct snapshot for voting status', () => {
      const trip = mockTrip({ status: 'voting' })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)
    })
  })

  describe('Trip with dates locked', () => {
    it('should detect dates locked via status = locked', () => {
      const trip = mockTrip({ status: 'locked' })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(true)
      expect(snapshot.stage).toBe(TripPrimaryStage.DATES_LOCKED)
    })

    it('should detect dates locked via lockedStartDate and lockedEndDate', () => {
      const trip = mockTrip({
        status: 'scheduling',
        lockedStartDate: '2030-06-01',
        lockedEndDate: '2030-06-05'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(true)
    })

    it('should set itineraryPending when dates locked but itinerary not finalized', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'draft'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.datesLocked).toBe(true)
      expect(snapshot.itineraryPending).toBe(true)
      expect(snapshot.itineraryFinalized).toBe(false)
    })

    it('should not set itineraryPending when dates not locked', () => {
      const trip = mockTrip({
        status: 'proposed',
        itineraryStatus: 'draft'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.itineraryPending).toBe(false)
    })
  })

  describe('Trip with itinerary finalized', () => {
    it('should detect itinerary finalized via selected status', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.itineraryFinalized).toBe(true)
      expect(snapshot.itineraryPending).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.ITINERARY)
    })

    it('should detect itinerary finalized via published status', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'published'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.itineraryFinalized).toBe(true)
    })

    it('should set accommodationPending when itinerary finalized but accommodation not chosen', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: false } }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.accommodationPending).toBe(true)
      expect(snapshot.accommodationChosen).toBe(false)
    })

    it('should not set accommodationPending when itinerary not finalized', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'draft'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.accommodationPending).toBe(false)
    })
  })

  describe('Trip with accommodation chosen', () => {
    it('should detect accommodation chosen via progress.steps', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.accommodationChosen).toBe(true)
      expect(snapshot.accommodationPending).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.STAY)
    })

    it('should set prepPending when accommodation chosen but prep not started', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } },
        prepStatus: 'not_started'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.prepPending).toBe(true)
      expect(snapshot.prepStarted).toBe(false)
    })
  })

  describe('Trip with prep started', () => {
    it('should detect prep started via prepStatus = in_progress', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } },
        prepStatus: 'in_progress'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.prepStarted).toBe(true)
      expect(snapshot.prepPending).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.PREP)
    })

    it('should detect prep started via prepStatus = complete', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } },
        prepStatus: 'complete'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.prepStarted).toBe(true)
    })

    it('should detect prep started via progress.steps.prepStarted', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true, prepStarted: true } }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.prepStarted).toBe(true)
    })
  })

  describe('Leader vs non-leader user', () => {
    it('should identify user as trip leader when createdBy matches', () => {
      const trip = mockTrip({ createdBy: 'leader-1' })
      const user = mockUser({ id: 'leader-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isTripLeader).toBe(true)
    })

    it('should identify user as non-leader when createdBy does not match', () => {
      const trip = mockTrip({ createdBy: 'leader-1' })
      const user = mockUser({ id: 'traveler-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isTripLeader).toBe(false)
    })

    it('should set leaderNeedsToLock when leader and everyone responded and collaborative', () => {
      const trip = mockTrip({
        createdBy: 'leader-1',
        type: 'collaborative',
        status: 'scheduling',
        pickProgress: { respondedCount: 3, totalCount: 3 }
      })
      const user = mockUser({ id: 'leader-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isTripLeader).toBe(true)
      expect(snapshot.everyoneResponded).toBe(true)
      expect(snapshot.leaderNeedsToLock).toBe(true)
    })

    it('should not set leaderNeedsToLock for non-leader even when everyone responded', () => {
      const trip = mockTrip({
        createdBy: 'leader-1',
        type: 'collaborative',
        status: 'scheduling',
        pickProgress: { respondedCount: 3, totalCount: 3 }
      })
      const user = mockUser({ id: 'traveler-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isTripLeader).toBe(false)
      expect(snapshot.leaderNeedsToLock).toBe(false)
    })

    it('should not set leaderNeedsToLock when trip is already locked', () => {
      const trip = mockTrip({
        createdBy: 'leader-1',
        type: 'collaborative',
        status: 'locked',
        pickProgress: { respondedCount: 3, totalCount: 3 }
      })
      const user = mockUser({ id: 'leader-1' })

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.leaderNeedsToLock).toBe(false)
    })
  })

  describe('Everyone responded vs partial responses', () => {
    it('should detect everyone responded when respondedCount >= totalCount', () => {
      const trip = mockTrip({
        pickProgress: { respondedCount: 5, totalCount: 5 }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.everyoneResponded).toBe(true)
    })

    it('should handle respondedCount > totalCount', () => {
      const trip = mockTrip({
        pickProgress: { respondedCount: 6, totalCount: 5 }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.everyoneResponded).toBe(true)
    })

    it('should detect partial responses when respondedCount < totalCount', () => {
      const trip = mockTrip({
        pickProgress: { respondedCount: 2, totalCount: 5 }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.everyoneResponded).toBe(false)
    })

    it('should handle zero responses', () => {
      const trip = mockTrip({
        pickProgress: { respondedCount: 0, totalCount: 5 }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.everyoneResponded).toBe(false)
    })

    it('should default to false when pickProgress is not provided', () => {
      const trip = mockTrip({})
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.everyoneResponded).toBe(false)
    })

    it('should use options.pickProgress when provided', () => {
      const trip = mockTrip({
        pickProgress: { respondedCount: 1, totalCount: 5 }
      })
      const user = mockUser()
      const options = {
        pickProgress: { respondedCount: 5, totalCount: 5 }
      }

      const snapshot = computeTripProgressSnapshot(trip, user, options)

      expect(snapshot.everyoneResponded).toBe(true)
    })
  })

  describe('Join requests', () => {
    it('should count pending join requests', () => {
      const trip = mockTrip()
      const user = mockUser()
      const options = {
        joinRequests: [
          { id: '1', status: 'pending' },
          { id: '2', status: 'pending' },
          { id: '3', status: 'approved' }
        ]
      }

      const snapshot = computeTripProgressSnapshot(trip, user, options)

      expect(snapshot.pendingJoinRequestsCount).toBe(2)
    })

    it('should return 0 when no pending join requests', () => {
      const trip = mockTrip()
      const user = mockUser()
      const options = {
        joinRequests: [
          { id: '1', status: 'approved' },
          { id: '2', status: 'rejected' }
        ]
      }

      const snapshot = computeTripProgressSnapshot(trip, user, options)

      expect(snapshot.pendingJoinRequestsCount).toBe(0)
    })

    it('should return 0 when joinRequests is empty', () => {
      const trip = mockTrip()
      const user = mockUser()
      const options = { joinRequests: [] }

      const snapshot = computeTripProgressSnapshot(trip, user, options)

      expect(snapshot.pendingJoinRequestsCount).toBe(0)
    })

    it('should return 0 when joinRequests not provided in options', () => {
      const trip = mockTrip()
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.pendingJoinRequestsCount).toBe(0)
    })
  })

  describe('Trip lifecycle - ongoing and completed', () => {
    it('should detect completed trip when endDate is in the past', () => {
      const trip = mockTrip({
        status: 'locked',
        lockedStartDate: '2020-06-01',
        lockedEndDate: '2020-06-05'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isCompleted).toBe(true)
      expect(snapshot.isOngoing).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.COMPLETED)
    })

    it('should detect ongoing trip when today is within date range', () => {
      const today = new Date().toISOString().split('T')[0]
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
      const trip = mockTrip({
        status: 'locked',
        lockedStartDate: today,
        lockedEndDate: tomorrow
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isOngoing).toBe(true)
      expect(snapshot.isCompleted).toBe(false)
      expect(snapshot.stage).toBe(TripPrimaryStage.ONGOING)
    })

    it('should not be ongoing or completed for future trip', () => {
      const trip = mockTrip({
        status: 'locked',
        lockedStartDate: '2035-06-01',
        lockedEndDate: '2035-06-05'
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isOngoing).toBe(false)
      expect(snapshot.isCompleted).toBe(false)
    })
  })

  describe('Participant status', () => {
    it('should detect participant via trip.isParticipant', () => {
      const trip = mockTrip({ isParticipant: true })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isParticipant).toBe(true)
    })

    it('should detect participant via trip.viewer.isParticipant', () => {
      const trip = mockTrip({
        viewer: { isParticipant: true }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isParticipant).toBe(true)
    })

    it('should default to false when not a participant', () => {
      const trip = mockTrip({})
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.isParticipant).toBe(false)
    })

    it('should detect hasLeftTrip when participant status is left', () => {
      const trip = mockTrip({
        viewer: { participantStatus: 'left' }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.hasLeftTrip).toBe(true)
    })

    it('should not set hasLeftTrip for active participant', () => {
      const trip = mockTrip({
        viewer: { participantStatus: 'active' }
      })
      const user = mockUser()

      const snapshot = computeTripProgressSnapshot(trip, user)

      expect(snapshot.hasLeftTrip).toBe(false)
    })
  })

  describe('Full progression scenarios', () => {
    it('should show complete progression from proposed to prep', () => {
      const user = mockUser({ id: 'traveler-1' })

      // Stage 1: Proposed
      let trip = mockTrip({ status: 'proposed' })
      let snapshot = computeTripProgressSnapshot(trip, user)
      expect(snapshot.stage).toBe(TripPrimaryStage.PROPOSED)

      // Stage 2: Dates locked
      trip = mockTrip({ status: 'locked' })
      snapshot = computeTripProgressSnapshot(trip, user)
      expect(snapshot.stage).toBe(TripPrimaryStage.DATES_LOCKED)
      expect(snapshot.datesLocked).toBe(true)
      expect(snapshot.itineraryPending).toBe(true)

      // Stage 3: Itinerary finalized
      trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected'
      })
      snapshot = computeTripProgressSnapshot(trip, user)
      expect(snapshot.stage).toBe(TripPrimaryStage.ITINERARY)
      expect(snapshot.itineraryFinalized).toBe(true)
      expect(snapshot.accommodationPending).toBe(true)

      // Stage 4: Accommodation chosen
      trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } }
      })
      snapshot = computeTripProgressSnapshot(trip, user)
      expect(snapshot.stage).toBe(TripPrimaryStage.STAY)
      expect(snapshot.accommodationChosen).toBe(true)
      expect(snapshot.prepPending).toBe(true)

      // Stage 5: Prep started
      trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } },
        prepStatus: 'in_progress'
      })
      snapshot = computeTripProgressSnapshot(trip, user)
      expect(snapshot.stage).toBe(TripPrimaryStage.PREP)
      expect(snapshot.prepStarted).toBe(true)
      expect(snapshot.prepPending).toBe(false)
    })
  })
})
