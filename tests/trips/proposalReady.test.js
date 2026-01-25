import { describe, it, expect } from 'vitest'
import {
  computeProposalReady,
  canLeaderPropose,
  getSchedulingPhase,
  canSubmitWindow
} from '@/lib/trips/proposalReady.js'

// Helper to create mock data
const createWindow = (id, startDate, endDate) => ({
  id,
  tripId: 'trip-1',
  proposedBy: 'user-1',
  startDate,
  endDate,
  createdAt: new Date().toISOString()
})

const createSupport = (windowId, userId) => ({
  id: `support-${windowId}-${userId}`,
  windowId,
  tripId: 'trip-1',
  userId,
  createdAt: new Date().toISOString()
})

const createTravelers = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: `user-${i + 1}`,
    name: `User ${i + 1}`
  }))

const baseTripCollecting = {
  id: 'trip-1',
  status: 'scheduling',
  proposedWindowId: null,
  lockedStartDate: null
}

describe('computeProposalReady', () => {
  describe('no windows case', () => {
    it('should return not ready when no windows exist', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(6)
      const windows = []
      const supports = []

      const result = computeProposalReady(trip, travelers, windows, supports)

      expect(result.proposalReady).toBe(false)
      expect(result.reason).toBe('no_windows')
      expect(result.leadingWindow).toBeNull()
    })
  })

  describe('small group threshold (≤10 travelers)', () => {
    it('should require majority of total travelers (4 of 6)', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(6)
      const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w1', 'user-3')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      expect(result.proposalReady).toBe(false)
      expect(result.stats.thresholdNeeded).toBe(4) // majority of 6
      expect(result.stats.leaderCount).toBe(3)
    })

    it('should be ready when majority threshold is met', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(6)
      const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w1', 'user-3'),
        createSupport('w1', 'user-4')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      expect(result.proposalReady).toBe(true)
      expect(result.reason).toBe('threshold_met')
      expect(result.stats.leaderCount).toBe(4)
    })

    it('should handle 10 travelers (boundary case)', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(10)
      const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]

      // Need 6 (majority of 10)
      const supports = Array.from({ length: 5 }, (_, i) =>
        createSupport('w1', `user-${i + 1}`)
      )

      const result = computeProposalReady(trip, travelers, windows, supports)

      expect(result.proposalReady).toBe(false)
      expect(result.stats.thresholdNeeded).toBe(6)

      // Add one more support
      supports.push(createSupport('w1', 'user-6'))
      const result2 = computeProposalReady(trip, travelers, windows, supports)

      expect(result2.proposalReady).toBe(true)
    })
  })

  describe('large group threshold (>10 travelers)', () => {
    it('should require majority of responders AND minimum 5', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(15)
      const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]

      // Only 4 responders, all supporting same window
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w1', 'user-3'),
        createSupport('w1', 'user-4')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      // 4 is majority of 4 responders, but less than minimum 5
      expect(result.proposalReady).toBe(false)
      expect(result.stats.thresholdNeeded).toBe(5) // minimum 5
    })

    it('should be ready when both conditions met', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(15)
      const windows = [
        createWindow('w1', '2025-03-01', '2025-03-05'),
        createWindow('w2', '2025-03-08', '2025-03-12')
      ]

      // 8 responders: 5 support w1, 3 support w2
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w1', 'user-3'),
        createSupport('w1', 'user-4'),
        createSupport('w1', 'user-5'),
        createSupport('w2', 'user-6'),
        createSupport('w2', 'user-7'),
        createSupport('w2', 'user-8')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      // 5 supports on w1, majority of 8 responders is 4, minimum is 5
      expect(result.proposalReady).toBe(true)
      expect(result.leadingWindow.id).toBe('w1')
      expect(result.stats.leaderCount).toBe(5)
    })
  })

  describe('window ranking', () => {
    it('should return leading window by support count', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(6)
      const windows = [
        createWindow('w1', '2025-03-01', '2025-03-05'),
        createWindow('w2', '2025-03-08', '2025-03-12')
      ]
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w2', 'user-3'),
        createSupport('w2', 'user-4'),
        createSupport('w2', 'user-5'),
        createSupport('w2', 'user-6')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      expect(result.leadingWindow.id).toBe('w2')
      expect(result.leaderCount).toBe(4)
      expect(result.runnerUp.window.id).toBe('w1')
      expect(result.runnerUp.count).toBe(2)
    })

    it('should break ties by earlier creation date', () => {
      const trip = { ...baseTripCollecting }
      const travelers = createTravelers(4)

      const earlierWindow = {
        ...createWindow('w1', '2025-03-01', '2025-03-05'),
        createdAt: '2025-01-01T00:00:00Z'
      }
      const laterWindow = {
        ...createWindow('w2', '2025-03-08', '2025-03-12'),
        createdAt: '2025-01-02T00:00:00Z'
      }

      const windows = [laterWindow, earlierWindow] // intentionally out of order
      const supports = [
        createSupport('w1', 'user-1'),
        createSupport('w1', 'user-2'),
        createSupport('w2', 'user-3'),
        createSupport('w2', 'user-4')
      ]

      const result = computeProposalReady(trip, travelers, windows, supports)

      // Tie: both have 2 supports, earlier window wins
      expect(result.leadingWindow.id).toBe('w1')
    })
  })
})

describe('canLeaderPropose', () => {
  it('should allow proposal when threshold met', () => {
    const trip = { ...baseTripCollecting }
    const travelers = createTravelers(6)
    const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]
    const supports = Array.from({ length: 4 }, (_, i) =>
      createSupport('w1', `user-${i + 1}`)
    )

    const result = canLeaderPropose(trip, travelers, windows, supports, false)

    expect(result.canPropose).toBe(true)
    expect(result.proposalReady).toBe(true)
    expect(result.leaderOverride).toBe(false)
  })

  it('should block proposal when threshold not met and no override', () => {
    const trip = { ...baseTripCollecting }
    const travelers = createTravelers(6)
    const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]
    const supports = [createSupport('w1', 'user-1')]

    const result = canLeaderPropose(trip, travelers, windows, supports, false)

    expect(result.canPropose).toBe(false)
    expect(result.proposalReady).toBe(false)
  })

  it('should allow proposal with leader override', () => {
    const trip = { ...baseTripCollecting }
    const travelers = createTravelers(6)
    const windows = [createWindow('w1', '2025-03-01', '2025-03-05')]
    const supports = [createSupport('w1', 'user-1')]

    const result = canLeaderPropose(trip, travelers, windows, supports, true)

    expect(result.canPropose).toBe(true)
    expect(result.proposalReady).toBe(false)
    expect(result.leaderOverride).toBe(true)
  })
})

describe('getSchedulingPhase', () => {
  it('should return COLLECTING for new trips', () => {
    const trip = {
      status: 'scheduling',
      proposedWindowId: null,
      lockedStartDate: null
    }

    expect(getSchedulingPhase(trip)).toBe('COLLECTING')
  })

  it('should return PROPOSED when proposedWindowId is set', () => {
    const trip = {
      status: 'scheduling',
      proposedWindowId: 'w1',
      lockedStartDate: null
    }

    expect(getSchedulingPhase(trip)).toBe('PROPOSED')
  })

  it('should return LOCKED when status is locked', () => {
    const trip = {
      status: 'locked',
      proposedWindowId: 'w1',
      lockedStartDate: '2025-03-01'
    }

    expect(getSchedulingPhase(trip)).toBe('LOCKED')
  })

  it('should return LOCKED when lockedStartDate is set', () => {
    const trip = {
      status: 'scheduling', // even if status not updated
      proposedWindowId: null,
      lockedStartDate: '2025-03-01'
    }

    expect(getSchedulingPhase(trip)).toBe('LOCKED')
  })
})

describe('canSubmitWindow', () => {
  it('should allow window submission in COLLECTING phase', () => {
    const trip = {
      status: 'scheduling',
      proposedWindowId: null,
      lockedStartDate: null
    }

    expect(canSubmitWindow(trip)).toBe(true)
  })

  it('should block window submission in PROPOSED phase', () => {
    const trip = {
      status: 'scheduling',
      proposedWindowId: 'w1',
      lockedStartDate: null
    }

    expect(canSubmitWindow(trip)).toBe(false)
  })

  it('should block window submission in LOCKED phase', () => {
    const trip = {
      status: 'locked',
      proposedWindowId: null,
      lockedStartDate: '2025-03-01'
    }

    expect(canSubmitWindow(trip)).toBe(false)
  })
})
