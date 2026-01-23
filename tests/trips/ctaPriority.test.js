/**
 * Unit tests for ContextCTABar CTA priority logic
 *
 * Tests the priority-based CTA selection including:
 * - Lock dates (leader only)
 * - Vote on dates
 * - Pick your dates
 * - Add ideas
 * - Generate itinerary
 * - Accommodation actions
 * - Prep phase
 * - Edge cases
 */

/**
 * Extracts the CTA config logic from ContextCTABar for testing
 * This mirrors the useMemo logic in the component
 */
function getCTAConfig(trip, user) {
  if (!trip || !user) return null

  const isLeader = trip.leaderId === user.id || trip.createdBy === user.id
  const userId = user.id

  // Check user's availability submission status (supports both new and legacy modes)
  const userAvailability = trip.availability?.find(
    (a) => a.userId === userId
  )
  const hasSubmittedDatePicks = trip.userDatePicks && trip.userDatePicks.length > 0
  const hasSubmittedAvailability = hasSubmittedDatePicks || !!userAvailability?.dates?.length

  // Check voting status
  const votingOpen = trip.votingStatus === 'open' || trip.dateVotingOpen
  const userHasVoted = trip.dateVotes?.some(
    (v) => v.userId === userId
  ) || !!trip.userVote

  // Check if dates are locked
  const datesLocked = trip.datesLocked || trip.lockedDates || trip.status === 'locked'

  // Check user's ideas count
  const userIdeasCount = trip.ideas?.filter(
    (i) => i.userId === userId || i.createdBy === userId
  )?.length || 0

  // Check if itinerary exists/finalized
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  const hasItinerary = trip.itinerary?.days?.length > 0 || itineraryFinalized

  // Check accommodation status
  const accommodationSelected = trip.accommodationSelected ||
    trip.accommodation?.selected ||
    trip.progress?.steps?.accommodationChosen

  // Check if user has voted on accommodation
  const userHasVotedOnAccommodation = trip.accommodationUserVoted ||
    trip.accommodations?.some((a) => a.userVoted)

  // Check prep status
  const prepStarted = trip.prepStatus === 'in_progress' || trip.prepStatus === 'ready'

  // Priority-based CTA selection (lower priority number = higher importance)

  // 1. Lock dates (if leader and can lock - highest priority for leader)
  if (isLeader && !datesLocked) {
    // Check if enough people have submitted to lock
    if (trip.canLockDates || trip.status === 'voting') {
      return {
        label: 'Lock dates',
        overlayType: 'scheduling',
        priority: 1
      }
    }
  }

  // 2. Vote on dates (if voting is open and user hasn't voted)
  if (votingOpen && !userHasVoted && !datesLocked) {
    return {
      label: 'Vote on dates',
      overlayType: 'scheduling',
      priority: 2
    }
  }

  // 3. Pick your dates (if user hasn't submitted availability and dates not locked)
  if (!hasSubmittedAvailability && !datesLocked) {
    return {
      label: 'Pick your dates',
      overlayType: 'scheduling',
      priority: 3
    }
  }

  // 4. Add ideas (only if itinerary not finalized and user has fewer than 3 ideas)
  if (!itineraryFinalized && userIdeasCount < 3 && datesLocked) {
    return {
      label: 'Add ideas',
      overlayType: 'itinerary',
      priority: 4
    }
  }

  // 5. Generate itinerary (if leader and no itinerary)
  if (isLeader && !hasItinerary && datesLocked) {
    return {
      label: 'Generate itinerary',
      overlayType: 'itinerary',
      priority: 5
    }
  }

  // 6. Accommodation actions (after itinerary is finalized)
  if (itineraryFinalized && !accommodationSelected && datesLocked) {
    // Leader: Select accommodation
    if (isLeader) {
      return {
        label: 'Select stay',
        overlayType: 'accommodation',
        priority: 6
      }
    }
    // Traveler: Vote on accommodation (if hasn't voted yet)
    if (!userHasVotedOnAccommodation) {
      return {
        label: 'Vote on stay',
        overlayType: 'accommodation',
        priority: 6
      }
    }
    // Traveler who has voted: View accommodation
    return {
      label: 'View stays',
      overlayType: 'accommodation',
      priority: 6
    }
  }

  // 7. Prep phase (after accommodation selected)
  if (accommodationSelected && !prepStarted) {
    return {
      label: 'Start prep',
      overlayType: 'prep',
      priority: 7
    }
  }

  // No action needed
  return null
}

describe('CTA Priority Logic', () => {
  // Helper to create mock trip
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    name: 'Test Trip',
    leaderId: 'leader-1',
    createdBy: 'leader-1',
    status: 'scheduling',
    ...overrides
  })

  // Helper to create mock user
  const mockUser = (overrides = {}) => ({
    id: 'user-1',
    name: 'Test User',
    ...overrides
  })

  describe('Priority 1: Lock dates (leader only)', () => {
    it('should show "Lock dates" for leader when canLockDates is true', () => {
      const trip = mockTrip({
        canLockDates: true
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Lock dates')
      expect(result.overlayType).toBe('scheduling')
      expect(result.priority).toBe(1)
    })

    it('should show "Lock dates" for leader when status is voting', () => {
      const trip = mockTrip({
        status: 'voting'
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Lock dates')
      expect(result.priority).toBe(1)
    })

    it('should NOT show "Lock dates" for non-leader even when canLockDates', () => {
      const trip = mockTrip({
        canLockDates: true
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      // Non-leader should get "Pick your dates" instead
      expect(result.label).not.toBe('Lock dates')
    })

    it('should NOT show "Lock dates" when dates are already locked', () => {
      const trip = mockTrip({
        canLockDates: true,
        datesLocked: true
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Lock dates')
    })

    it('should recognize leader via createdBy field', () => {
      const trip = mockTrip({
        leaderId: null,
        createdBy: 'creator-1',
        canLockDates: true
      })
      const user = mockUser({ id: 'creator-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Lock dates')
    })
  })

  describe('Priority 2: Vote on dates', () => {
    it('should show "Vote on dates" when voting is open and user has not voted', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        dateVotes: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Vote on dates')
      expect(result.overlayType).toBe('scheduling')
      expect(result.priority).toBe(2)
    })

    it('should show "Vote on dates" when dateVotingOpen is true', () => {
      const trip = mockTrip({
        dateVotingOpen: true,
        dateVotes: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Vote on dates')
    })

    it('should NOT show "Vote on dates" when user has already voted', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        dateVotes: [{ userId: 'traveler-1', optionKey: 'option-1' }]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Vote on dates')
    })

    it('should NOT show "Vote on dates" when userVote is set', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        userVote: { optionKey: 'option-1' }
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Vote on dates')
    })

    it('should NOT show "Vote on dates" when dates are locked', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        datesLocked: true
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Vote on dates')
    })

    it('should prioritize "Lock dates" over "Vote on dates" for leader', () => {
      const trip = mockTrip({
        canLockDates: true,
        votingStatus: 'open',
        dateVotes: []
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      // Leader gets Lock dates (priority 1) even if they haven't voted
      expect(result.label).toBe('Lock dates')
    })
  })

  describe('Priority 3: Pick your dates', () => {
    it('should show "Pick your dates" when user has not submitted availability', () => {
      const trip = mockTrip({
        availability: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Pick your dates')
      expect(result.overlayType).toBe('scheduling')
      expect(result.priority).toBe(3)
    })

    it('should NOT show "Pick your dates" when user has submitted via userDatePicks', () => {
      const trip = mockTrip({
        userDatePicks: ['2024-06-01', '2024-06-02']
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Pick your dates')
    })

    it('should NOT show "Pick your dates" when user has submitted via availability array', () => {
      const trip = mockTrip({
        availability: [
          { userId: 'traveler-1', dates: ['2024-06-01', '2024-06-02'] }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Pick your dates')
    })

    it('should NOT show "Pick your dates" when dates are locked', () => {
      const trip = mockTrip({
        availability: [],
        datesLocked: true
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Pick your dates')
    })

    it('should recognize locked dates via lockedDates field', () => {
      const trip = mockTrip({
        availability: [],
        lockedDates: true
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Pick your dates')
    })

    it('should recognize locked dates via status=locked', () => {
      const trip = mockTrip({
        availability: [],
        status: 'locked'
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Pick your dates')
    })
  })

  describe('Priority 4: Add ideas', () => {
    it('should show "Add ideas" when user has < 3 ideas and dates locked', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: [
          { userId: 'traveler-1', text: 'Idea 1' }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Add ideas')
      expect(result.overlayType).toBe('itinerary')
      expect(result.priority).toBe(4)
    })

    it('should show "Add ideas" when user has 0 ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
    })

    it('should show "Add ideas" when user has exactly 2 ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: [
          { userId: 'traveler-1', text: 'Idea 1' },
          { userId: 'traveler-1', text: 'Idea 2' }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
    })

    it('should NOT show "Add ideas" when user has 3 or more ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: [
          { userId: 'traveler-1', text: 'Idea 1' },
          { userId: 'traveler-1', text: 'Idea 2' },
          { userId: 'traveler-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Add ideas')
    })

    it('should count ideas by createdBy field as well', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: [
          { createdBy: 'traveler-1', text: 'Idea 1' },
          { createdBy: 'traveler-1', text: 'Idea 2' },
          { createdBy: 'traveler-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Add ideas')
    })

    it('should NOT show "Add ideas" when itinerary is finalized (selected)', () => {
      const trip = mockTrip({
        datesLocked: true,
        itineraryStatus: 'selected',
        ideas: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Add ideas')
    })

    it('should NOT show "Add ideas" when itinerary is finalized (published)', () => {
      const trip = mockTrip({
        datesLocked: true,
        itineraryStatus: 'published',
        ideas: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Add ideas')
    })

    it('should NOT show "Add ideas" when dates are not locked', () => {
      const trip = mockTrip({
        datesLocked: false,
        ideas: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      // Should get "Pick your dates" instead
      expect(result?.label).not.toBe('Add ideas')
    })
  })

  describe('Priority 5: Generate itinerary (leader only)', () => {
    it('should show "Generate itinerary" for leader when no itinerary exists', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: null,
        ideas: [
          { userId: 'leader-1', text: 'Idea 1' },
          { userId: 'leader-1', text: 'Idea 2' },
          { userId: 'leader-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Generate itinerary')
      expect(result.overlayType).toBe('itinerary')
      expect(result.priority).toBe(5)
    })

    it('should NOT show "Generate itinerary" for non-leader', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: null,
        ideas: [
          { userId: 'traveler-1', text: 'Idea 1' },
          { userId: 'traveler-1', text: 'Idea 2' },
          { userId: 'traveler-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Generate itinerary')
    })

    it('should NOT show "Generate itinerary" when itinerary has days', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: { days: [{ activities: [] }] },
        ideas: [
          { userId: 'leader-1', text: 'Idea 1' },
          { userId: 'leader-1', text: 'Idea 2' },
          { userId: 'leader-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Generate itinerary')
    })

    it('should NOT show "Generate itinerary" when itineraryStatus is selected', () => {
      const trip = mockTrip({
        datesLocked: true,
        itineraryStatus: 'selected',
        ideas: [
          { userId: 'leader-1', text: 'Idea 1' },
          { userId: 'leader-1', text: 'Idea 2' },
          { userId: 'leader-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Generate itinerary')
    })

    it('should prioritize "Add ideas" over "Generate itinerary" when leader has < 3 ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: null,
        ideas: [{ userId: 'leader-1', text: 'Idea 1' }]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
    })
  })

  describe('Priority 6: Accommodation actions', () => {
    describe('Leader: Select stay', () => {
      it('should show "Select stay" for leader when itinerary finalized', () => {
        const trip = mockTrip({
          datesLocked: true,
          itineraryStatus: 'selected',
          accommodationSelected: false
        })
        const user = mockUser({ id: 'leader-1' })
        const result = getCTAConfig(trip, user)

        expect(result).not.toBeNull()
        expect(result.label).toBe('Select stay')
        expect(result.overlayType).toBe('accommodation')
        expect(result.priority).toBe(6)
      })

      it('should NOT show "Select stay" when accommodation already selected', () => {
        const trip = mockTrip({
          datesLocked: true,
          itineraryStatus: 'selected',
          accommodationSelected: true
        })
        const user = mockUser({ id: 'leader-1' })
        const result = getCTAConfig(trip, user)

        expect(result?.label).not.toBe('Select stay')
      })
    })

    describe('Traveler: Vote on stay', () => {
      it('should show "Vote on stay" for traveler when itinerary finalized and not voted', () => {
        const trip = mockTrip({
          datesLocked: true,
          itineraryStatus: 'selected',
          accommodationSelected: false,
          accommodationUserVoted: false
        })
        const user = mockUser({ id: 'traveler-1' })
        const result = getCTAConfig(trip, user)

        expect(result).not.toBeNull()
        expect(result.label).toBe('Vote on stay')
        expect(result.overlayType).toBe('accommodation')
        expect(result.priority).toBe(6)
      })

      it('should show "View stays" for traveler who has already voted', () => {
        const trip = mockTrip({
          datesLocked: true,
          itineraryStatus: 'selected',
          accommodationSelected: false,
          accommodationUserVoted: true
        })
        const user = mockUser({ id: 'traveler-1' })
        const result = getCTAConfig(trip, user)

        expect(result).not.toBeNull()
        expect(result.label).toBe('View stays')
        expect(result.overlayType).toBe('accommodation')
        expect(result.priority).toBe(6)
      })

      it('should detect user voted via accommodations array', () => {
        const trip = mockTrip({
          datesLocked: true,
          itineraryStatus: 'selected',
          accommodationSelected: false,
          accommodations: [{ id: 'acc-1', userVoted: true }]
        })
        const user = mockUser({ id: 'traveler-1' })
        const result = getCTAConfig(trip, user)

        expect(result.label).toBe('View stays')
      })
    })

    it('should recognize accommodation selected via accommodation.selected', () => {
      const trip = mockTrip({
        datesLocked: true,
        itineraryStatus: 'selected',
        accommodation: { selected: true }
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Select stay')
    })

    it('should recognize accommodation selected via progress.steps.accommodationChosen', () => {
      const trip = mockTrip({
        datesLocked: true,
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } }
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result?.label).not.toBe('Select stay')
    })
  })

  describe('Priority 7: Start prep', () => {
    it('should show "Start prep" when accommodation selected and prep not started', () => {
      const trip = mockTrip({
        datesLocked: true,
        availability: [{ userId: 'traveler-1', dates: ['2024-06-01'] }],
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: null
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).not.toBeNull()
      expect(result.label).toBe('Start prep')
      expect(result.overlayType).toBe('prep')
      expect(result.priority).toBe(7)
    })

    it('should NOT show "Start prep" when prepStatus is in_progress', () => {
      const trip = mockTrip({
        datesLocked: true,
        availability: [{ userId: 'traveler-1', dates: ['2024-06-01'] }],
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: 'in_progress'
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).toBeNull()
    })

    it('should NOT show "Start prep" when prepStatus is ready', () => {
      const trip = mockTrip({
        datesLocked: true,
        availability: [{ userId: 'traveler-1', dates: ['2024-06-01'] }],
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: 'ready'
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should return null when no CTA is needed', () => {
      const trip = mockTrip({
        datesLocked: true,
        availability: [{ userId: 'traveler-1', dates: ['2024-06-01'] }],
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: 'in_progress'
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result).toBeNull()
    })

    it('should return null when trip is null', () => {
      const result = getCTAConfig(null, mockUser())

      expect(result).toBeNull()
    })

    it('should return null when user is null', () => {
      const result = getCTAConfig(mockTrip(), null)

      expect(result).toBeNull()
    })

    it('should return null when trip is undefined', () => {
      const result = getCTAConfig(undefined, mockUser())

      expect(result).toBeNull()
    })

    it('should return null when user is undefined', () => {
      const result = getCTAConfig(mockTrip(), undefined)

      expect(result).toBeNull()
    })

    it('should handle trip with empty ideas array', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
    })

    it('should handle trip with undefined ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        ideas: undefined
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
    })

    it('should handle trip with undefined availability', () => {
      const trip = mockTrip({
        availability: undefined
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Pick your dates')
    })

    it('should handle trip with undefined dateVotes', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        dateVotes: undefined
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Vote on dates')
    })
  })

  describe('Priority ordering', () => {
    it('should prioritize "Lock dates" (1) over "Vote on dates" (2)', () => {
      const trip = mockTrip({
        canLockDates: true,
        votingStatus: 'open',
        dateVotes: []
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Lock dates')
      expect(result.priority).toBe(1)
    })

    it('should prioritize "Vote on dates" (2) over "Pick your dates" (3)', () => {
      const trip = mockTrip({
        votingStatus: 'open',
        dateVotes: [],
        availability: []
      })
      const user = mockUser({ id: 'traveler-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Vote on dates')
      expect(result.priority).toBe(2)
    })

    it('should prioritize "Add ideas" (4) over "Generate itinerary" (5) for leader with < 3 ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: null,
        ideas: [{ userId: 'leader-1', text: 'Idea 1' }]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Add ideas')
      expect(result.priority).toBe(4)
    })

    it('should show "Generate itinerary" (5) for leader with >= 3 ideas', () => {
      const trip = mockTrip({
        datesLocked: true,
        itinerary: null,
        ideas: [
          { userId: 'leader-1', text: 'Idea 1' },
          { userId: 'leader-1', text: 'Idea 2' },
          { userId: 'leader-1', text: 'Idea 3' }
        ]
      })
      const user = mockUser({ id: 'leader-1' })
      const result = getCTAConfig(trip, user)

      expect(result.label).toBe('Generate itinerary')
      expect(result.priority).toBe(5)
    })
  })
})
