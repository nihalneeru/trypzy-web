import { activeMembershipQuery } from '@/lib/circles/activeMembershipQuery.js'

describe('activeMembershipQuery', () => {
  it('returns correct query shape with userId and circleId', () => {
    const query = activeMembershipQuery('user-1', 'circle-1')
    expect(query).toEqual({
      userId: 'user-1',
      circleId: 'circle-1',
      status: { $ne: 'left' }
    })
  })

  it('returns different query for different inputs', () => {
    const q1 = activeMembershipQuery('a', 'b')
    const q2 = activeMembershipQuery('c', 'd')
    expect(q1.userId).toBe('a')
    expect(q2.userId).toBe('c')
  })
})
