/**
 * Unit tests for scheduling funnel state helper
 *
 * Tests verify:
 * 1. Hosted trips return HOSTED_LOCKED
 * 2. Collaborative trips return correct state based on data
 * 3. Approval threshold calculation is correct
 * 4. Window freezing detection works
 */

import {
  getSchedulingFunnelState,
  SchedulingFunnelState,
  requiredApprovals,
  countApprovals,
  areWindowsFrozen,
  getActiveWindowProposals,
  aggregateWindowPreferences,
  scoreWindowProposals,
  generateDateAdjustments
} from '@/lib/trips/schedulingFunnelState.ts'

describe('Scheduling Funnel State', () => {
  describe('getSchedulingFunnelState', () => {
    it('should return HOSTED_LOCKED for hosted trips with dates', () => {
      const trip = {
        type: 'hosted',
        lockedStartDate: '2025-05-01',
        lockedEndDate: '2025-05-05'
      }
      expect(getSchedulingFunnelState(trip, 1)).toBe(SchedulingFunnelState.HOSTED_LOCKED)
    })

    it('should return HOSTED_LOCKED for hosted trips without dates (defensive)', () => {
      const trip = {
        type: 'hosted',
        lockedStartDate: null,
        lockedEndDate: null
      }
      expect(getSchedulingFunnelState(trip, 1)).toBe(SchedulingFunnelState.HOSTED_LOCKED)
    })

    it('should return DATES_LOCKED when datesLocked is true', () => {
      const trip = {
        type: 'collaborative',
        datesLocked: true,
        lockedStartDate: '2025-05-01',
        lockedEndDate: '2025-05-05'
      }
      expect(getSchedulingFunnelState(trip, 1)).toBe(SchedulingFunnelState.DATES_LOCKED)
    })

    it('should return DATES_LOCKED when status is locked and dates set', () => {
      const trip = {
        type: 'collaborative',
        status: 'locked',
        lockedStartDate: '2025-05-01',
        lockedEndDate: '2025-05-05'
      }
      expect(getSchedulingFunnelState(trip, 1)).toBe(SchedulingFunnelState.DATES_LOCKED)
    })

    it('should return NO_DATES when no windows and no proposal', () => {
      const trip = {
        type: 'collaborative',
        windowProposals: [],
        dateProposal: null
      }
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.NO_DATES)
    })

    it('should return WINDOWS_OPEN when windows exist but no proposal', () => {
      const trip = {
        type: 'collaborative',
        windowProposals: [
          { id: 'w1', description: 'March', archived: false }
        ],
        dateProposal: null
      }
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.WINDOWS_OPEN)
    })

    it('should not count archived windows as active', () => {
      const trip = {
        type: 'collaborative',
        windowProposals: [
          { id: 'w1', description: 'March', archived: true }
        ],
        dateProposal: null
      }
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.NO_DATES)
    })

    it('should return DATE_PROPOSED when proposal exists without enough approvals', () => {
      const trip = {
        type: 'collaborative',
        dateProposal: { startDate: '2025-05-01', endDate: '2025-05-05' },
        dateReactions: [
          { userId: 'u1', reactionType: 'WORKS' }
        ]
      }
      // 3 members, need 2 for majority, only have 1
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.DATE_PROPOSED)
    })

    it('should return DATE_PROPOSED when only CAVEAT reactions exist', () => {
      const trip = {
        type: 'collaborative',
        dateProposal: { startDate: '2025-05-01', endDate: '2025-05-05' },
        dateReactions: [
          { userId: 'u1', reactionType: 'CAVEAT' },
          { userId: 'u2', reactionType: 'CAVEAT' }
        ]
      }
      // CAVEAT doesn't count as approval
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.DATE_PROPOSED)
    })

    it('should return READY_TO_LOCK when majority approves', () => {
      const trip = {
        type: 'collaborative',
        dateProposal: { startDate: '2025-05-01', endDate: '2025-05-05' },
        dateReactions: [
          { userId: 'u1', reactionType: 'WORKS' },
          { userId: 'u2', reactionType: 'WORKS' }
        ]
      }
      // 3 members, need 2 for majority, have 2
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.READY_TO_LOCK)
    })

    it('should return READY_TO_LOCK with exactly majority', () => {
      const trip = {
        type: 'collaborative',
        dateProposal: { startDate: '2025-05-01', endDate: '2025-05-05' },
        dateReactions: [
          { userId: 'u1', reactionType: 'WORKS' },
          { userId: 'u2', reactionType: 'WORKS' },
          { userId: 'u3', reactionType: 'WORKS' }
        ]
      }
      // 4 members, need 2 for majority
      expect(getSchedulingFunnelState(trip, 4)).toBe(SchedulingFunnelState.READY_TO_LOCK)
    })

    it('should handle null trip gracefully', () => {
      expect(getSchedulingFunnelState(null, 1)).toBe(SchedulingFunnelState.NO_DATES)
    })
  })

  describe('requiredApprovals', () => {
    it('should return 1 for 1 member', () => {
      expect(requiredApprovals(1)).toBe(1)
    })

    it('should return 1 for 2 members', () => {
      expect(requiredApprovals(2)).toBe(1)
    })

    it('should return 2 for 3 members', () => {
      expect(requiredApprovals(3)).toBe(2)
    })

    it('should return 2 for 4 members', () => {
      expect(requiredApprovals(4)).toBe(2)
    })

    it('should return 3 for 5 members', () => {
      expect(requiredApprovals(5)).toBe(3)
    })

    it('should handle 0 members (returns 1)', () => {
      expect(requiredApprovals(0)).toBe(1)
    })

    it('should handle negative members (returns 1)', () => {
      expect(requiredApprovals(-1)).toBe(1)
    })
  })

  describe('countApprovals', () => {
    it('should count WORKS reactions', () => {
      const reactions = [
        { userId: 'u1', reactionType: 'WORKS' },
        { userId: 'u2', reactionType: 'WORKS' },
        { userId: 'u3', reactionType: 'CANT' }
      ]
      expect(countApprovals(reactions)).toBe(2)
    })

    it('should not count CAVEAT as approval', () => {
      const reactions = [
        { userId: 'u1', reactionType: 'CAVEAT' },
        { userId: 'u2', reactionType: 'CAVEAT' }
      ]
      expect(countApprovals(reactions)).toBe(0)
    })

    it('should handle empty array', () => {
      expect(countApprovals([])).toBe(0)
    })

    it('should handle null/undefined', () => {
      expect(countApprovals(null)).toBe(0)
      expect(countApprovals(undefined)).toBe(0)
    })
  })

  describe('areWindowsFrozen', () => {
    it('should return true when dateProposal has dates', () => {
      const trip = {
        dateProposal: { startDate: '2025-05-01', endDate: '2025-05-05' }
      }
      expect(areWindowsFrozen(trip)).toBe(true)
    })

    it('should return false when no dateProposal', () => {
      const trip = { dateProposal: null }
      expect(areWindowsFrozen(trip)).toBe(false)
    })

    it('should return false when dateProposal is empty', () => {
      const trip = { dateProposal: {} }
      expect(areWindowsFrozen(trip)).toBe(false)
    })

    it('should return false when dateProposal has only startDate', () => {
      const trip = { dateProposal: { startDate: '2025-05-01' } }
      expect(areWindowsFrozen(trip)).toBe(false)
    })
  })

  describe('getActiveWindowProposals', () => {
    it('should filter out archived windows', () => {
      const proposals = [
        { id: 'w1', description: 'March', archived: false },
        { id: 'w2', description: 'April', archived: true },
        { id: 'w3', description: 'May', archived: false }
      ]
      const active = getActiveWindowProposals(proposals)
      expect(active).toHaveLength(2)
      expect(active.map(w => w.id)).toEqual(['w1', 'w3'])
    })

    it('should handle empty array', () => {
      expect(getActiveWindowProposals([])).toEqual([])
    })

    it('should handle null/undefined', () => {
      expect(getActiveWindowProposals(null)).toEqual([])
      expect(getActiveWindowProposals(undefined)).toEqual([])
    })
  })

  describe('aggregateWindowPreferences', () => {
    it('should count preferences correctly', () => {
      const preferences = [
        { userId: 'u1', windowId: 'w1', preference: 'WORKS' },
        { userId: 'u2', windowId: 'w1', preference: 'WORKS' },
        { userId: 'u3', windowId: 'w1', preference: 'MAYBE' },
        { userId: 'u4', windowId: 'w1', preference: 'NO' }
      ]
      const stats = aggregateWindowPreferences('w1', preferences)
      expect(stats).toEqual({ works: 2, maybe: 1, no: 1 })
    })

    it('should only count preferences for specified window', () => {
      const preferences = [
        { userId: 'u1', windowId: 'w1', preference: 'WORKS' },
        { userId: 'u2', windowId: 'w2', preference: 'WORKS' }
      ]
      const stats = aggregateWindowPreferences('w1', preferences)
      expect(stats).toEqual({ works: 1, maybe: 0, no: 0 })
    })

    it('should handle empty preferences', () => {
      expect(aggregateWindowPreferences('w1', [])).toEqual({ works: 0, maybe: 0, no: 0 })
    })
  })

  describe('scoreWindowProposals', () => {
    it('should score and sort windows by preference', () => {
      const proposals = [
        { id: 'w1', description: 'Low score', archived: false },
        { id: 'w2', description: 'High score', archived: false }
      ]
      const preferences = [
        { userId: 'u1', windowId: 'w1', preference: 'NO' },
        { userId: 'u2', windowId: 'w2', preference: 'WORKS' },
        { userId: 'u3', windowId: 'w2', preference: 'WORKS' }
      ]

      const scored = scoreWindowProposals(proposals, preferences)
      expect(scored[0].id).toBe('w2')  // Higher score first
      expect(scored[0].score).toBe(6)   // 2 WORKS * 3 = 6
      expect(scored[1].id).toBe('w1')
      expect(scored[1].score).toBe(-2)  // 1 NO * -2 = -2
    })

    it('should exclude archived windows', () => {
      const proposals = [
        { id: 'w1', description: 'Active', archived: false },
        { id: 'w2', description: 'Archived', archived: true }
      ]
      const scored = scoreWindowProposals(proposals, [])
      expect(scored).toHaveLength(1)
      expect(scored[0].id).toBe('w1')
    })
  })

  describe('generateDateAdjustments', () => {
    it('should generate +/- 1 week adjustments', () => {
      const proposal = {
        startDate: '2025-05-15',
        endDate: '2025-05-20'
      }
      const adjustments = generateDateAdjustments(proposal)

      expect(adjustments).toHaveLength(2)

      // 1 week earlier
      expect(adjustments[0].startDate).toBe('2025-05-08')
      expect(adjustments[0].endDate).toBe('2025-05-13')
      expect(adjustments[0].label).toBe('1 week earlier')

      // 1 week later
      expect(adjustments[1].startDate).toBe('2025-05-22')
      expect(adjustments[1].endDate).toBe('2025-05-27')
      expect(adjustments[1].label).toBe('1 week later')
    })

    it('should preserve trip duration', () => {
      const proposal = {
        startDate: '2025-05-10',
        endDate: '2025-05-17'  // 7 days
      }
      const adjustments = generateDateAdjustments(proposal)

      // Each adjustment should also be 7 days
      const duration1 = new Date(adjustments[0].endDate).getDate() - new Date(adjustments[0].startDate).getDate()
      const duration2 = new Date(adjustments[1].endDate).getDate() - new Date(adjustments[1].startDate).getDate()
      expect(duration1).toBe(7)
      expect(duration2).toBe(7)
    })

    it('should handle null proposal', () => {
      expect(generateDateAdjustments(null)).toEqual([])
    })

    it('should handle missing dates', () => {
      expect(generateDateAdjustments({ startDate: '2025-05-10' })).toEqual([])
      expect(generateDateAdjustments({ endDate: '2025-05-20' })).toEqual([])
    })
  })
})

describe('Trip Type Validation', () => {
  describe('Hosted trips', () => {
    it('should always be HOSTED_LOCKED regardless of other fields', () => {
      const hostedTrip = {
        type: 'hosted',
        lockedStartDate: '2025-05-01',
        lockedEndDate: '2025-05-05',
        windowProposals: [{ id: 'w1', archived: false }],  // Should be ignored
        dateProposal: { startDate: '2025-06-01', endDate: '2025-06-05' }  // Should be ignored
      }
      expect(getSchedulingFunnelState(hostedTrip, 5)).toBe(SchedulingFunnelState.HOSTED_LOCKED)
    })
  })

  describe('Collaborative trips', () => {
    it('should progress through states correctly', () => {
      // Start: NO_DATES
      let trip = { type: 'collaborative' }
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.NO_DATES)

      // Add window: WINDOWS_OPEN
      trip.windowProposals = [{ id: 'w1', archived: false }]
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.WINDOWS_OPEN)

      // Propose dates: DATE_PROPOSED
      trip.dateProposal = { startDate: '2025-05-01', endDate: '2025-05-05' }
      trip.dateReactions = []
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.DATE_PROPOSED)

      // Add some approvals (not enough): still DATE_PROPOSED
      trip.dateReactions = [{ userId: 'u1', reactionType: 'WORKS' }]
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.DATE_PROPOSED)

      // Add enough approvals: READY_TO_LOCK
      trip.dateReactions.push({ userId: 'u2', reactionType: 'WORKS' })
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.READY_TO_LOCK)

      // Lock dates: DATES_LOCKED
      trip.datesLocked = true
      trip.lockedStartDate = '2025-05-01'
      trip.lockedEndDate = '2025-05-05'
      expect(getSchedulingFunnelState(trip, 3)).toBe(SchedulingFunnelState.DATES_LOCKED)
    })
  })
})
