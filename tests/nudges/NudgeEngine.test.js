import { describe, it, expect } from 'vitest'
import {
  computeNudges,
  evaluateTooManyWindows,
  evaluateLowCoverageProposal,
  AVAILABILITY_HALF_THRESHOLD,
  STRONG_OVERLAP_THRESHOLD,
} from '@/lib/nudges/NudgeEngine'
import { NudgeType, NudgeChannel, NudgeAudience } from '@/lib/nudges/types'

// Helper to create minimal trip data
const createTrip = (overrides = {}) => ({
  id: 'trip-1',
  name: 'Test Trip',
  type: 'collaborative',
  status: 'proposed',
  createdBy: 'leader-1',
  startDate: null,
  endDate: null,
  lockedStartDate: null,
  lockedEndDate: null,
  datesLocked: false,
  schedulingMode: 'date_windows',
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
})

// Helper to create metrics
const createMetrics = (overrides = {}) => ({
  travelerCount: 5,
  availabilitySubmittedCount: 0,
  availabilityCompletionPct: 0,
  overlapBestRange: null,
  overlapBestCoverageCount: 0,
  overlapBestCoveragePct: 0,
  hasProposedWindow: false,
  proposedWindowId: null,
  votingOpen: false,
  voteCount: 0,
  voteThresholdMet: false,
  topOptionId: null,
  topOptionVotes: 0,
  tripStage: 'proposed',
  lockedDates: null,
  viewerWindowCount: 0,
  ...overrides,
})

// Helper to create viewer context
const createViewer = (overrides = {}) => ({
  userId: 'user-1',
  isLeader: false,
  isParticipant: true,
  hasSubmittedAvailability: false,
  windowCount: 0,
  ...overrides,
})

describe('computeNudges', () => {
  describe('hosted trips', () => {
    it('should return no nudges for hosted trips', () => {
      const result = computeNudges({
        trip: createTrip({ type: 'hosted' }),
        metrics: createMetrics(),
        viewer: createViewer(),
      })

      expect(result.nudges).toHaveLength(0)
      expect(result.actionNudge).toBeNull()
      expect(result.celebratorNudge).toBeNull()
    })
  })

  describe('FIRST_AVAILABILITY_SUBMITTED', () => {
    it('should trigger when first person submits availability', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.FIRST_AVAILABILITY_SUBMITTED
      )

      expect(nudge).toBeDefined()
      expect(nudge.channel).toBe(NudgeChannel.CHAT_CARD)
      expect(nudge.audience).toBe(NudgeAudience.ALL)
    })

    it('should NOT trigger when more than 1 person has submitted', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 2,
          availabilityCompletionPct: 40,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.FIRST_AVAILABILITY_SUBMITTED
      )

      expect(nudge).toBeUndefined()
    })
  })

  describe('AVAILABILITY_HALF_SUBMITTED', () => {
    it('should trigger when 50%+ have submitted availability', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 10,
          availabilitySubmittedCount: 5,
          availabilityCompletionPct: 50,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.AVAILABILITY_HALF_SUBMITTED
      )

      expect(nudge).toBeDefined()
      expect(nudge.payload.travelerCount).toBe(5)
    })

    it('should NOT trigger below 50% threshold', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 10,
          availabilitySubmittedCount: 4,
          availabilityCompletionPct: 40,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.AVAILABILITY_HALF_SUBMITTED
      )

      expect(nudge).toBeUndefined()
    })
  })

  describe('STRONG_OVERLAP_DETECTED', () => {
    it('should trigger when overlap coverage is 60%+', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 5,
          availabilitySubmittedCount: 4,
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          overlapBestCoverageCount: 4,
          overlapBestCoveragePct: 80,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.STRONG_OVERLAP_DETECTED
      )

      expect(nudge).toBeDefined()
      expect(nudge.payload.dateRange.label).toBe('Mar 1 – Mar 3')
    })

    it('should NOT trigger below 60% threshold', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          overlapBestCoverageCount: 2,
          overlapBestCoveragePct: 40,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.STRONG_OVERLAP_DETECTED
      )

      expect(nudge).toBeUndefined()
    })
  })

  describe('LEADER_READY_TO_PROPOSE', () => {
    it('should trigger for leader when good overlap exists', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 5,
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          overlapBestCoverageCount: 3,
          overlapBestCoveragePct: 60,
          hasProposedWindow: false,
          tripStage: 'scheduling',
        }),
        viewer: createViewer({ isLeader: true, userId: 'leader-1' }),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.LEADER_READY_TO_PROPOSE
      )

      expect(nudge).toBeDefined()
      expect(nudge.channel).toBe(NudgeChannel.CTA_HIGHLIGHT)
      expect(nudge.audience).toBe(NudgeAudience.LEADER)
    })

    it('should NOT trigger for non-leaders', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          overlapBestCoverageCount: 3,
          overlapBestCoveragePct: 60,
        }),
        viewer: createViewer({ isLeader: false }),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.LEADER_READY_TO_PROPOSE
      )

      expect(nudge).toBeUndefined()
    })

    it('should NOT trigger if already proposed', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          hasProposedWindow: true,
        }),
        viewer: createViewer({ isLeader: true }),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.LEADER_READY_TO_PROPOSE
      )

      expect(nudge).toBeUndefined()
    })
  })

  describe('LEADER_CAN_LOCK_DATES', () => {
    it('should trigger when proposed dates have support', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 5,
          hasProposedWindow: true,
          proposedWindowId: 'window-1',
          topOptionId: 'window-1',
          topOptionVotes: 3,
          tripStage: 'scheduling',
        }),
        viewer: createViewer({ isLeader: true, userId: 'leader-1' }),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.LEADER_CAN_LOCK_DATES
      )

      expect(nudge).toBeDefined()
      expect(nudge.payload.ctaAction).toBe('lock_dates')
    })
  })

  describe('max nudges limit', () => {
    it('should return max 2 nudges (1 action + 1 celebrator)', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          travelerCount: 5,
          availabilitySubmittedCount: 3,
          availabilityCompletionPct: 60,
          overlapBestRange: {
            start: '2025-03-01',
            end: '2025-03-03',
            label: 'Mar 1 – Mar 3',
          },
          overlapBestCoverageCount: 4,
          overlapBestCoveragePct: 80,
          tripStage: 'scheduling',
        }),
        viewer: createViewer({ isLeader: true, userId: 'leader-1' }),
      })

      expect(result.nudges.length).toBeLessThanOrEqual(2)
    })
  })
})

describe('evaluateTooManyWindows', () => {
  it('should return nudge when user has max windows', () => {
    const nudge = evaluateTooManyWindows(
      { action: 'add_window', currentWindowCount: 2 },
      'trip-1'
    )

    expect(nudge).not.toBeNull()
    expect(nudge.type).toBe(NudgeType.TRAVELER_TOO_MANY_WINDOWS)
    expect(nudge.channel).toBe(NudgeChannel.INLINE_HINT)
  })

  it('should return null when under limit', () => {
    const nudge = evaluateTooManyWindows(
      { action: 'add_window', currentWindowCount: 1 },
      'trip-1'
    )

    expect(nudge).toBeNull()
  })

  it('should return null for wrong action', () => {
    const nudge = evaluateTooManyWindows(
      { action: 'propose_window', currentWindowCount: 5 },
      'trip-1'
    )

    expect(nudge).toBeNull()
  })
})

describe('evaluateLowCoverageProposal', () => {
  it('should return nudge when coverage is below 40%', () => {
    const nudge = evaluateLowCoverageProposal(
      {
        action: 'propose_window',
        proposedWindowCoverage: 1,
        proposedWindowTotal: 5,
      },
      'trip-1',
      5
    )

    expect(nudge).not.toBeNull()
    expect(nudge.type).toBe(NudgeType.LEADER_PROPOSING_LOW_COVERAGE)
    expect(nudge.channel).toBe(NudgeChannel.CONFIRM_DIALOG)
  })

  it('should return null when coverage is 40%+', () => {
    const nudge = evaluateLowCoverageProposal(
      {
        action: 'propose_window',
        proposedWindowCoverage: 2,
        proposedWindowTotal: 5,
      },
      'trip-1',
      5
    )

    expect(nudge).toBeNull()
  })

  it('should return null for wrong action', () => {
    const nudge = evaluateLowCoverageProposal(
      {
        action: 'add_window',
        proposedWindowCoverage: 1,
        proposedWindowTotal: 5,
      },
      'trip-1',
      5
    )

    expect(nudge).toBeNull()
  })
})
