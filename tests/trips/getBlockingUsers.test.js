/**
 * Unit tests for getBlockingUsers helper
 * 
 * Tests blocking user computation across different trip stages.
 */

import { describe, it, expect } from 'vitest'
import { getBlockingUsers } from '@/lib/trips/getBlockingUsers.js'

describe('getBlockingUsers', () => {
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    name: 'Test Trip',
    circleId: 'circle-1',
    createdBy: 'leader-user-id',
    type: 'collaborative',
    status: 'scheduling',
    participants: [
      { id: 'leader-user-id', name: 'Leader' },
      { id: 'user-1', name: 'Alice' },
      { id: 'user-2', name: 'Bob' },
      { id: 'user-3', name: 'Charlie' }
    ],
    pickProgress: {
      respondedCount: 2,
      totalCount: 4,
      respondedUserIds: ['leader-user-id', 'user-1']
    },
    votes: [],
    userVote: null,
    ...overrides
  })

  const mockUser = (overrides = {}) => ({
    id: 'user-1',
    name: 'Alice',
    ...overrides
  })

  describe('Invalid inputs', () => {
    it('should return null for null trip', () => {
      const result = getBlockingUsers(null, mockUser())
      expect(result).toBeNull()
    })

    it('should return null for null user', () => {
      const result = getBlockingUsers(mockTrip(), null)
      expect(result).toBeNull()
    })

    it('should return null for hosted trips', () => {
      const trip = mockTrip({ type: 'hosted' })
      const result = getBlockingUsers(trip, mockUser())
      expect(result).toBeNull()
    })
  })

  describe('Scheduling stage', () => {
    it('should return blockers when some users have not picked', () => {
      const trip = mockTrip({
        status: 'scheduling',
        pickProgress: {
          respondedCount: 2,
          totalCount: 4,
          respondedUserIds: ['leader-user-id', 'user-1']
        }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('picking_dates')
      expect(result.blockers).toHaveLength(2)
      expect(result.blockers.map(b => b.id)).toEqual(expect.arrayContaining(['user-2', 'user-3']))
      expect(result.message).toContain('Waiting on:')
      expect(result.message).toContain('Bob')
      expect(result.message).toContain('Charlie')
    })

    it('should return "waiting on you" when current user has not picked', () => {
      const trip = mockTrip({
        status: 'scheduling',
        pickProgress: {
          respondedCount: 3,
          totalCount: 4,
          respondedUserIds: ['leader-user-id', 'user-2', 'user-3']
        }
      })
      const user = mockUser({ id: 'user-1', name: 'Alice' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('picking_dates')
      expect(result.blockers).toHaveLength(1)
      expect(result.blockers[0].id).toBe('user-1')
      expect(result.blockers[0].name).toBe('Alice')
      expect(result.message).toBe('Waiting on you to pick dates')
    })

    it('should return leader lock message when everyone responded and user is leader', () => {
      const trip = mockTrip({
        status: 'scheduling',
        pickProgress: {
          respondedCount: 4,
          totalCount: 4,
          respondedUserIds: ['leader-user-id', 'user-1', 'user-2', 'user-3']
        }
      })
      const user = mockUser({ id: 'leader-user-id', name: 'Leader' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('leader_lock')
      expect(result.blockers).toHaveLength(0)
      expect(result.message).toBe('Waiting on Trip Leader to lock dates')
    })

    it('should return null when everyone responded and user is not leader', () => {
      const trip = mockTrip({
        status: 'scheduling',
        pickProgress: {
          respondedCount: 4,
          totalCount: 4,
          respondedUserIds: ['leader-user-id', 'user-1', 'user-2', 'user-3']
        }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).toBeNull()
    })

    it('should handle proposed stage same as scheduling', () => {
      const trip = mockTrip({
        status: 'proposed',
        pickProgress: {
          respondedCount: 1,
          totalCount: 4,
          respondedUserIds: ['leader-user-id']
        }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('picking_dates')
    })
  })

  describe('Voting stage', () => {
    it('should return blockers when some users have not voted', () => {
      const trip = mockTrip({
        status: 'voting',
        votes: [
          { userId: 'leader-user-id', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-1', optionKey: '2024-06-01_2024-06-05' }
        ],
        userVote: { optionKey: '2024-06-01_2024-06-05' }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('voting')
      expect(result.blockers).toHaveLength(2)
      expect(result.blockers.map(b => b.id)).toEqual(expect.arrayContaining(['user-2', 'user-3']))
      expect(result.message).toContain('Waiting on:')
    })

    it('should return "waiting on you" when current user has not voted', () => {
      const trip = mockTrip({
        status: 'voting',
        votes: [
          { userId: 'leader-user-id', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-2', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-3', optionKey: '2024-06-01_2024-06-05' }
        ],
        userVote: null
      })
      const user = mockUser({ id: 'user-1', name: 'Alice' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('voting')
      expect(result.blockers).toHaveLength(1)
      expect(result.blockers[0].id).toBe('user-1')
      expect(result.message).toBe('Waiting on you to vote')
    })

    it('should return leader lock message when everyone voted and user is leader', () => {
      const trip = mockTrip({
        status: 'voting',
        votes: [
          { userId: 'leader-user-id', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-1', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-2', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-3', optionKey: '2024-06-01_2024-06-05' }
        ],
        userVote: { optionKey: '2024-06-01_2024-06-05' }
      })
      const user = mockUser({ id: 'leader-user-id', name: 'Leader' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.reasonCode).toBe('leader_lock')
      expect(result.blockers).toHaveLength(0)
      expect(result.message).toBe('Waiting on Trip Leader to lock dates')
    })

    it('should return null when everyone voted and user is not leader', () => {
      const trip = mockTrip({
        status: 'voting',
        votes: [
          { userId: 'leader-user-id', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-1', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-2', optionKey: '2024-06-01_2024-06-05' },
          { userId: 'user-3', optionKey: '2024-06-01_2024-06-05' }
        ],
        userVote: { optionKey: '2024-06-01_2024-06-05' }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).toBeNull()
    })
  })

  describe('Locked/completed stages', () => {
    it('should return null for locked trips', () => {
      const trip = mockTrip({ status: 'locked' })
      const result = getBlockingUsers(trip, mockUser())
      expect(result).toBeNull()
    })

    it('should return null for completed trips', () => {
      const trip = mockTrip({ status: 'completed' })
      const result = getBlockingUsers(trip, mockUser())
      expect(result).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle missing pickProgress gracefully', () => {
      const trip = mockTrip({
        status: 'scheduling',
        pickProgress: null
      })
      const result = getBlockingUsers(trip, mockUser())
      expect(result).toBeNull()
    })

    it('should handle empty participants array', () => {
      const trip = mockTrip({
        status: 'scheduling',
        participants: [],
        pickProgress: {
          respondedCount: 0,
          totalCount: 1,
          respondedUserIds: []
        }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      // Should handle gracefully - may return null or "waiting on you"
      expect(result).not.toBeNull()
    })

    it('should handle participants with missing names', () => {
      const trip = mockTrip({
        status: 'scheduling',
        participants: [
          { id: 'user-1', name: 'Alice' },
          { id: 'user-2' } // Missing name
        ],
        pickProgress: {
          respondedCount: 1,
          totalCount: 2,
          respondedUserIds: ['user-1']
        }
      })
      const user = mockUser({ id: 'user-1' })
      const result = getBlockingUsers(trip, user)
      
      expect(result).not.toBeNull()
      expect(result.blockers[0].name).toBe('Unknown')
    })
  })
})
