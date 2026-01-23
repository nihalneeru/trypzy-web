/**
 * Unit tests for deriveBlocker helper
 *
 * Tests blocker derivation across different trip stages:
 * - DATES: When dates are not locked
 * - ITINERARY: When dates locked but no itinerary
 * - ACCOMMODATION: When itinerary done but no accommodation
 * - PREP: When accommodation selected but prep not started
 * - READY: When prep started
 */

// Mock icon components
const mockIcon = () => null

// Extract deriveBlocker logic for testing
// This mirrors the function in CommandCenterV2.tsx
function deriveBlocker(trip, user) {
  if (!trip) {
    return {
      type: 'DATES',
      title: 'Pick your dates',
      description: 'Start by finding dates that work for everyone',
      ctaLabel: 'Pick Dates',
      icon: mockIcon,
      overlayType: 'scheduling'
    }
  }

  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)

  // Blocker 1: Dates not locked
  if (!datesLocked) {
    const userHasPicked = trip.userDatePicks && trip.userDatePicks.length > 0
    const userHasVoted = !!trip.userVote
    const canLockDates = trip.canLockDates || trip.status === 'voting'

    if (trip.status === 'voting') {
      return {
        type: 'DATES',
        title: userHasVoted ? 'Waiting on votes' : 'Vote on dates',
        description: userHasVoted
          ? 'Waiting for others to vote before dates can be locked'
          : 'Choose your preferred date window',
        ctaLabel: userHasVoted ? 'View Votes' : 'Vote Now',
        icon: mockIcon,
        overlayType: 'scheduling'
      }
    }

    // If everyone has picked and dates can be locked, show "Waiting on dates to be locked"
    if (canLockDates && userHasPicked) {
      return {
        type: 'DATES',
        title: 'Waiting on dates to be locked',
        description: 'Everyone has responded. Waiting for trip leader to lock dates',
        ctaLabel: 'View Dates',
        icon: mockIcon,
        overlayType: 'scheduling'
      }
    }

    return {
      type: 'DATES',
      title: userHasPicked ? 'Waiting on dates' : 'Pick your dates',
      description: userHasPicked
        ? 'Waiting for others to respond before dates can be locked'
        : 'Share your date preferences to help coordinate the trip',
      ctaLabel: userHasPicked ? 'View Progress' : 'Pick Dates',
      icon: mockIcon,
      overlayType: 'scheduling'
    }
  }

  // Blocker 2: Itinerary not finalized
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'

  if (!itineraryFinalized) {
    return {
      type: 'ITINERARY',
      title: 'Plan the itinerary',
      description: 'Add ideas and build a day-by-day plan together',
      ctaLabel: 'Plan Itinerary',
      icon: mockIcon,
      overlayType: 'itinerary'
    }
  }

  // Blocker 3: Accommodation not decided
  const accommodationChosen = trip.progress?.steps?.accommodationChosen ||
    trip.accommodationSelected ||
    trip.accommodation?.selected

  if (!accommodationChosen) {
    return {
      type: 'ACCOMMODATION',
      title: 'Choose where to stay',
      description: 'Find and decide on accommodation for the trip',
      ctaLabel: 'Find Stays',
      icon: mockIcon,
      overlayType: 'accommodation'
    }
  }

  // Blocker 4: Prep not started
  const prepStarted = trip.prepStatus === 'in_progress' || trip.prepStatus === 'ready' ||
    trip.progress?.steps?.prepStarted

  if (!prepStarted) {
    return {
      type: 'PREP',
      title: 'Prepare for the trip',
      description: 'Add transport, packing lists, and documents',
      ctaLabel: 'Start Prep',
      icon: mockIcon,
      overlayType: 'prep'
    }
  }

  // No blockers - trip is ready
  return {
    type: 'READY',
    title: 'Ready to go!',
    description: 'All decisions are made. Time to enjoy the trip!',
    ctaLabel: 'View Trip',
    icon: mockIcon,
    overlayType: null
  }
}

describe('deriveBlocker', () => {
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    name: 'Test Trip',
    status: 'scheduling',
    lockedStartDate: null,
    lockedEndDate: null,
    userDatePicks: [],
    userVote: null,
    canLockDates: false,
    itineraryStatus: null,
    accommodationSelected: false,
    accommodation: null,
    progress: null,
    prepStatus: null,
    ...overrides
  })

  const mockUser = (overrides = {}) => ({
    id: 'user-1',
    name: 'Alice',
    ...overrides
  })

  describe('Null trip handling', () => {
    it('should return DATES blocker for null trip', () => {
      const result = deriveBlocker(null, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Pick your dates')
      expect(result.description).toBe('Start by finding dates that work for everyone')
      expect(result.ctaLabel).toBe('Pick Dates')
      expect(result.overlayType).toBe('scheduling')
    })

    it('should return DATES blocker for undefined trip', () => {
      const result = deriveBlocker(undefined, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Pick your dates')
    })
  })

  describe('DATES blocker - when dates not locked', () => {
    it('should return DATES blocker when status is scheduling and user has not picked', () => {
      const trip = mockTrip({ status: 'scheduling', userDatePicks: [] })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Pick your dates')
      expect(result.description).toBe('Share your date preferences to help coordinate the trip')
      expect(result.ctaLabel).toBe('Pick Dates')
      expect(result.overlayType).toBe('scheduling')
    })

    it('should return "Waiting on dates" when user has picked but dates not locked', () => {
      const trip = mockTrip({
        status: 'scheduling',
        userDatePicks: ['2024-06-01', '2024-06-05']
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Waiting on dates')
      expect(result.description).toBe('Waiting for others to respond before dates can be locked')
      expect(result.ctaLabel).toBe('View Progress')
    })

    it('should return "Waiting on dates to be locked" when canLockDates and user has picked', () => {
      const trip = mockTrip({
        status: 'scheduling',
        userDatePicks: ['2024-06-01', '2024-06-05'],
        canLockDates: true
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Waiting on dates to be locked')
      expect(result.description).toBe('Everyone has responded. Waiting for trip leader to lock dates')
      expect(result.ctaLabel).toBe('View Dates')
    })

    describe('Voting status', () => {
      it('should return "Vote on dates" when status is voting and user has not voted', () => {
        const trip = mockTrip({
          status: 'voting',
          userVote: null
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('DATES')
        expect(result.title).toBe('Vote on dates')
        expect(result.description).toBe('Choose your preferred date window')
        expect(result.ctaLabel).toBe('Vote Now')
      })

      it('should return "Waiting on votes" when status is voting and user has voted', () => {
        const trip = mockTrip({
          status: 'voting',
          userVote: { optionKey: '2024-06-01_2024-06-05' }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('DATES')
        expect(result.title).toBe('Waiting on votes')
        expect(result.description).toBe('Waiting for others to vote before dates can be locked')
        expect(result.ctaLabel).toBe('View Votes')
      })
    })

    describe('Dates locked detection', () => {
      it('should detect dates locked via status === locked', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: null
        })
        const result = deriveBlocker(trip, mockUser())

        // Should move past DATES to ITINERARY
        expect(result.type).toBe('ITINERARY')
      })

      it('should detect dates locked via lockedStartDate and lockedEndDate', () => {
        const trip = mockTrip({
          status: 'scheduling',
          lockedStartDate: '2024-06-01',
          lockedEndDate: '2024-06-05',
          itineraryStatus: null
        })
        const result = deriveBlocker(trip, mockUser())

        // Should move past DATES to ITINERARY
        expect(result.type).toBe('ITINERARY')
      })

      it('should not detect dates locked if only lockedStartDate is set', () => {
        const trip = mockTrip({
          status: 'scheduling',
          lockedStartDate: '2024-06-01',
          lockedEndDate: null
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('DATES')
      })
    })
  })

  describe('ITINERARY blocker - when dates locked but no itinerary', () => {
    it('should return ITINERARY blocker when dates locked and itinerary not finalized', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: null
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ITINERARY')
      expect(result.title).toBe('Plan the itinerary')
      expect(result.description).toBe('Add ideas and build a day-by-day plan together')
      expect(result.ctaLabel).toBe('Plan Itinerary')
      expect(result.overlayType).toBe('itinerary')
    })

    it('should return ITINERARY blocker when itineraryStatus is draft', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'draft'
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ITINERARY')
    })

    it('should move past ITINERARY when itineraryStatus is selected', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected'
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ACCOMMODATION')
    })

    it('should move past ITINERARY when itineraryStatus is published', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'published'
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ACCOMMODATION')
    })
  })

  describe('ACCOMMODATION blocker - when itinerary done but no accommodation', () => {
    it('should return ACCOMMODATION blocker when itinerary finalized but no accommodation', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        accommodationSelected: false
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ACCOMMODATION')
      expect(result.title).toBe('Choose where to stay')
      expect(result.description).toBe('Find and decide on accommodation for the trip')
      expect(result.ctaLabel).toBe('Find Stays')
      expect(result.overlayType).toBe('accommodation')
    })

    describe('Multiple field variations for accommodation detection', () => {
      it('should detect accommodation via accommodationSelected field', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('PREP')
      })

      it('should detect accommodation via progress.steps.accommodationChosen', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          progress: {
            steps: {
              accommodationChosen: true
            }
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('PREP')
      })

      it('should detect accommodation via accommodation.selected', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodation: {
            selected: true
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('PREP')
      })

      it('should not detect accommodation if accommodation.selected is false', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodation: {
            selected: false
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('ACCOMMODATION')
      })

      it('should not detect accommodation if progress.steps.accommodationChosen is false', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          progress: {
            steps: {
              accommodationChosen: false
            }
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('ACCOMMODATION')
      })
    })
  })

  describe('PREP blocker (NEW) - when accommodation selected but prep not started', () => {
    it('should return PREP blocker when accommodation selected but prep not started', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: null
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('PREP')
      expect(result.title).toBe('Prepare for the trip')
      expect(result.description).toBe('Add transport, packing lists, and documents')
      expect(result.ctaLabel).toBe('Start Prep')
      expect(result.overlayType).toBe('prep')
    })

    describe('Multiple field variations for prep detection', () => {
      it('should detect prep started via prepStatus === in_progress', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true,
          prepStatus: 'in_progress'
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('READY')
      })

      it('should detect prep started via prepStatus === ready', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true,
          prepStatus: 'ready'
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('READY')
      })

      it('should detect prep started via progress.steps.prepStarted', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true,
          progress: {
            steps: {
              prepStarted: true
            }
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('READY')
      })

      it('should not detect prep started if prepStatus is draft', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true,
          prepStatus: 'draft'
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('PREP')
      })

      it('should not detect prep started if progress.steps.prepStarted is false', () => {
        const trip = mockTrip({
          status: 'locked',
          itineraryStatus: 'selected',
          accommodationSelected: true,
          progress: {
            steps: {
              prepStarted: false
            }
          }
        })
        const result = deriveBlocker(trip, mockUser())

        expect(result.type).toBe('PREP')
      })
    })
  })

  describe('READY state - when prep started', () => {
    it('should return READY when all blockers are resolved', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        accommodationSelected: true,
        prepStatus: 'in_progress'
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('READY')
      expect(result.title).toBe('Ready to go!')
      expect(result.description).toBe('All decisions are made. Time to enjoy the trip!')
      expect(result.ctaLabel).toBe('View Trip')
      expect(result.overlayType).toBeNull()
    })

    it('should return READY with prepStatus ready', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'published',
        accommodation: { selected: true },
        prepStatus: 'ready'
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('READY')
    })

    it('should return READY with progress.steps.prepStarted true', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'published',
        progress: {
          steps: {
            accommodationChosen: true,
            prepStarted: true
          }
        }
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('READY')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty progress object', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: {}
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ACCOMMODATION')
    })

    it('should handle progress with empty steps', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: {} }
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('ACCOMMODATION')
    })

    it('should handle empty userDatePicks array', () => {
      const trip = mockTrip({
        status: 'scheduling',
        userDatePicks: []
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Pick your dates')
    })

    it('should handle null userDatePicks', () => {
      const trip = mockTrip({
        status: 'scheduling',
        userDatePicks: null
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Pick your dates')
    })

    it('should handle canLockDates via voting status', () => {
      // When status is voting, canLockDates is implicitly true for the condition check
      // but the voting branch takes precedence
      const trip = mockTrip({
        status: 'voting',
        userDatePicks: ['2024-06-01'],
        userVote: null
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('DATES')
      expect(result.title).toBe('Vote on dates')
    })

    it('should handle combined accommodation flags (first truthy wins)', () => {
      const trip = mockTrip({
        status: 'locked',
        itineraryStatus: 'selected',
        progress: { steps: { accommodationChosen: true } },
        accommodationSelected: false, // Should be ignored since progress check comes first
        accommodation: { selected: false }
      })
      const result = deriveBlocker(trip, mockUser())

      expect(result.type).toBe('PREP')
    })
  })
})
