/**
 * Unit tests for getVotingStatus helper
 * 
 * Tests voting status computation including:
 * - Vote tallying
 * - Leading option detection
 * - Tie detection
 * - Ready-to-lock logic
 * - Edge cases
 */

import { getVotingStatus, formatLeadingOption } from '@/lib/trips/getVotingStatus.js'

describe('getVotingStatus', () => {
  // Helper to create mock trip
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    name: 'Test Trip',
    status: 'voting',
    type: 'collaborative',
    votes: [],
    promisingWindows: [
      { startDate: '2024-06-01', endDate: '2024-06-05', name: 'Option A' },
      { startDate: '2024-06-08', endDate: '2024-06-12', name: 'Option B' },
      { startDate: '2024-06-15', endDate: '2024-06-19', name: 'Option C' }
    ],
    ...overrides
  })

  // Helper to create mock travelers
  const mockTravelers = (count = 4) => 
    Array.from({ length: count }, (_, i) => ({
      id: `user-${i + 1}`,
      name: `User ${i + 1}`
    }))

  // Helper to create a vote
  const createVote = (userId, optionKey, userName = null) => ({
    userId,
    optionKey,
    userName: userName || `User ${userId.split('-')[1]}`
  })

  describe('Non-voting stages', () => {
    it('should return isVotingStage=false for proposed stage', () => {
      const trip = mockTrip({ status: 'proposed' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.isVotingStage).toBe(false)
      expect(result.options).toEqual([])
    })

    it('should return isVotingStage=false for scheduling stage', () => {
      const trip = mockTrip({ status: 'scheduling' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.isVotingStage).toBe(false)
    })

    it('should return isVotingStage=false for locked stage', () => {
      const trip = mockTrip({ status: 'locked' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.isVotingStage).toBe(false)
    })

    it('should return isVotingStage=false for completed stage', () => {
      const trip = mockTrip({ status: 'completed' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.isVotingStage).toBe(false)
    })

    it('should default hosted trips without status to locked', () => {
      const trip = mockTrip({ status: undefined, type: 'hosted' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.stage).toBe('locked')
      expect(result.isVotingStage).toBe(false)
    })

    it('should default collaborative trips without status to scheduling', () => {
      const trip = mockTrip({ status: undefined, type: 'collaborative' })
      const result = getVotingStatus(trip, mockTravelers(), 'user-1')
      
      expect(result.stage).toBe('scheduling')
      expect(result.isVotingStage).toBe(false)
    })
  })

  describe('Basic vote counting', () => {
    it('should count zero votes correctly', () => {
      const trip = mockTrip({ votes: [] })
      const travelers = mockTravelers(4)
      const result = getVotingStatus(trip, travelers, 'user-1')
      
      expect(result.isVotingStage).toBe(true)
      expect(result.votedCount).toBe(0)
      expect(result.remainingCount).toBe(4)
      expect(result.totalTravelers).toBe(4)
      expect(result.hasCurrentUserVoted).toBe(false)
    })

    it('should count votes correctly', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-08_2024-06-12')
        ]
      })
      const travelers = mockTravelers(4)
      const result = getVotingStatus(trip, travelers, 'user-1')
      
      expect(result.votedCount).toBe(3)
      expect(result.remainingCount).toBe(1)
      expect(result.hasCurrentUserVoted).toBe(true)
    })

    it('should detect when current user has not voted', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-08_2024-06-12')
        ]
      })
      const travelers = mockTravelers(4)
      const result = getVotingStatus(trip, travelers, 'user-1')
      
      expect(result.hasCurrentUserVoted).toBe(false)
    })

    it('should handle empty travelers array', () => {
      const trip = mockTrip({ votes: [] })
      const result = getVotingStatus(trip, [], 'user-1')
      
      expect(result.totalTravelers).toBe(0)
      expect(result.votedCount).toBe(0)
    })

    it('should handle null travelers', () => {
      const trip = mockTrip({ votes: [] })
      const result = getVotingStatus(trip, null, 'user-1')
      
      expect(result.totalTravelers).toBe(0)
    })
  })

  describe('Leading option detection', () => {
    it('should identify leading option correctly', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.leadingOption).not.toBeNull()
      expect(result.leadingOption.optionKey).toBe('2024-06-01_2024-06-05')
      expect(result.leadingVotes).toBe(2)
      expect(result.isTie).toBe(false)
    })

    it('should return null leadingOption when no votes', () => {
      const trip = mockTrip({ votes: [] })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.leadingOption).toBeNull()
      expect(result.leadingVotes).toBe(0)
    })

    it('should sort options by vote count descending', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-15_2024-06-19'), // Option C: 1 vote
          createVote('user-2', '2024-06-08_2024-06-12'), // Option B: 2 votes
          createVote('user-3', '2024-06-08_2024-06-12'),
          createVote('user-4', '2024-06-01_2024-06-05')  // Option A: 1 vote
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.options[0].optionKey).toBe('2024-06-08_2024-06-12')
      expect(result.options[0].votes).toBe(2)
    })
  })

  describe('Tie detection', () => {
    it('should detect tie when top two options have same votes', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.isTie).toBe(true)
      expect(result.leadingVotes).toBe(1)
    })

    it('should not detect tie when clear leader exists', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.isTie).toBe(false)
    })

    it('should use original index for stable tie-breaking order', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      // First option in promisingWindows should be first in tie
      expect(result.options[0].optionKey).toBe('2024-06-01_2024-06-05')
      expect(result.options[1].optionKey).toBe('2024-06-08_2024-06-12')
    })
  })

  describe('Ready to lock logic', () => {
    it('should be ready to lock when >50% voted and clear leader', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.readyToLock).toBe(true)
      expect(result.readyToLockReason).toContain('3/4 voted')
      expect(result.readyToLockReason).toContain('clear leader')
    })

    it('should NOT be ready to lock when <50% voted', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.readyToLock).toBe(false)
    })

    it('should NOT be ready to lock when tie exists (unless all voted)', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-08_2024-06-12'),
          createVote('user-3', '2024-06-01_2024-06-05'),
          createVote('user-4', '2024-06-08_2024-06-12')
        ]
      })
      // 4/4 voted but tie - should still be ready (leader decides)
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.isTie).toBe(true)
      expect(result.readyToLock).toBe(true)
      expect(result.readyToLockReason).toContain('tie')
      expect(result.readyToLockReason).toContain('leader decides')
    })

    it('should be ready to lock when all voted with clear leader', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05'),
          createVote('user-2', '2024-06-01_2024-06-05'),
          createVote('user-3', '2024-06-01_2024-06-05'),
          createVote('user-4', '2024-06-08_2024-06-12')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.readyToLock).toBe(true)
      // When all voted with clear leader, returns "X/X voted, clear leader" message
      expect(result.readyToLockReason).toContain('4/4 voted')
      expect(result.readyToLockReason).toContain('clear leader')
    })

    it('should NOT be ready to lock with zero votes', () => {
      const trip = mockTrip({ votes: [] })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.readyToLock).toBe(false)
    })
  })

  describe('Voter names tracking', () => {
    it('should track voter names on options', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05', 'Alice Smith'),
          createVote('user-2', '2024-06-01_2024-06-05', 'Bob Jones')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      const leadingOption = result.options.find(o => o.optionKey === '2024-06-01_2024-06-05')
      expect(leadingOption.voterNames).toContain('Alice')
      expect(leadingOption.voterNames).toContain('Bob')
    })

    it('should use first name only', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', '2024-06-01_2024-06-05', 'Alice Marie Smith')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      const option = result.options.find(o => o.optionKey === '2024-06-01_2024-06-05')
      expect(option.voterNames).toContain('Alice')
      expect(option.voterNames).not.toContain('Marie')
      expect(option.voterNames).not.toContain('Smith')
    })

    it('should not duplicate voter names', () => {
      const trip = mockTrip({
        votes: [
          { userId: 'user-1', optionKey: '2024-06-01_2024-06-05', voterName: 'Alice' },
          { userId: 'user-1', optionKey: '2024-06-01_2024-06-05', userName: 'Alice' }
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      const option = result.options.find(o => o.optionKey === '2024-06-01_2024-06-05')
      const aliceCount = option.voterNames.filter(n => n === 'Alice').length
      expect(aliceCount).toBe(1)
    })
  })

  describe('Edge cases', () => {
    it('should handle trip with no voting options', () => {
      const trip = mockTrip({ promisingWindows: [], consensusOptions: undefined })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.isVotingStage).toBe(true)
      expect(result.options).toEqual([])
      expect(result.leadingOption).toBeNull()
    })

    it('should use consensusOptions if promisingWindows is empty', () => {
      const trip = mockTrip({
        promisingWindows: undefined,
        consensusOptions: [
          { startDate: '2024-07-01', endDate: '2024-07-05', name: 'Consensus A' }
        ],
        votes: [createVote('user-1', '2024-07-01_2024-07-05')]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      expect(result.options).toHaveLength(1)
      expect(result.options[0].name).toBe('Consensus A')
    })

    it('should handle votes for non-existent options gracefully', () => {
      const trip = mockTrip({
        votes: [
          createVote('user-1', 'non-existent-key')
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      // Vote counted (user voted) but not tallied to any option
      expect(result.votedCount).toBe(1)
      expect(result.options.every(o => o.votes === 0)).toBe(true)
    })

    it('should handle options with missing dates', () => {
      const trip = mockTrip({
        promisingWindows: [
          { name: 'Bad Option' }, // No dates
          { startDate: '2024-06-01', endDate: '2024-06-05', name: 'Good Option' }
        ]
      })
      const result = getVotingStatus(trip, mockTravelers(4), 'user-1')
      
      // Should only have the valid option
      expect(result.options).toHaveLength(1)
      expect(result.options[0].name).toBe('Good Option')
    })

    it('should handle single traveler trip', () => {
      const trip = mockTrip({
        votes: [createVote('user-1', '2024-06-01_2024-06-05')]
      })
      const result = getVotingStatus(trip, mockTravelers(1), 'user-1')
      
      expect(result.totalTravelers).toBe(1)
      expect(result.votedCount).toBe(1)
      expect(result.readyToLock).toBe(true)
      // Single traveler with clear leader returns "1/1 voted, clear leader"
      expect(result.readyToLockReason).toContain('1/1 voted')
      expect(result.readyToLockReason).toContain('clear leader')
    })
  })
})

describe('formatLeadingOption', () => {
  it('should return null when no leading option', () => {
    const votingStatus = { leadingOption: null }
    expect(formatLeadingOption(votingStatus)).toBeNull()
  })

  it('should format leading option with vote count', () => {
    const votingStatus = {
      leadingOption: { name: 'Beach Weekend' },
      leadingVotes: 3,
      isTie: false
    }
    const result = formatLeadingOption(votingStatus)
    
    expect(result).toBe('Leading: Beach Weekend (3 votes)')
  })

  it('should use singular "vote" for 1 vote', () => {
    const votingStatus = {
      leadingOption: { name: 'Beach Weekend' },
      leadingVotes: 1,
      isTie: false
    }
    const result = formatLeadingOption(votingStatus)
    
    expect(result).toBe('Leading: Beach Weekend (1 vote)')
  })

  it('should indicate tie', () => {
    const votingStatus = {
      leadingOption: { name: 'Beach Weekend' },
      leadingVotes: 2,
      isTie: true
    }
    const result = formatLeadingOption(votingStatus)
    
    expect(result).toContain('Tied:')
    expect(result).toContain('Beach Weekend')
    expect(result).toContain('2 votes')
  })

  it('should fall back to label if name missing', () => {
    const votingStatus = {
      leadingOption: { label: 'Jun 1–5' },
      leadingVotes: 2,
      isTie: false
    }
    const result = formatLeadingOption(votingStatus)
    
    expect(result).toBe('Leading: Jun 1–5 (2 votes)')
  })
})
