import { isLateJoinerForTrip } from '../../lib/trips/isLateJoiner.js'

describe('isLateJoinerForTrip', () => {
  it('returns false for null membership', () => {
    expect(isLateJoinerForTrip(null, { createdAt: '2025-01-01T00:00:00Z' })).toBe(false)
  })

  it('returns false for null trip', () => {
    expect(isLateJoinerForTrip({ joinedAt: '2025-01-01T00:00:00Z' }, null)).toBe(false)
  })

  it('returns false when membership.joinedAt is missing (legacy data)', () => {
    const membership = {}
    const trip = { createdAt: '2025-01-01T00:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(false)
  })

  it('returns false when trip.createdAt is missing (legacy data)', () => {
    const membership = { joinedAt: '2025-06-01T00:00:00Z' }
    const trip = {}
    expect(isLateJoinerForTrip(membership, trip)).toBe(false)
  })

  it('returns false for original member (joinedAt before createdAt)', () => {
    const membership = { joinedAt: '2025-01-01T00:00:00Z' }
    const trip = { createdAt: '2025-06-01T00:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(false)
  })

  it('returns true for late joiner (joinedAt after createdAt)', () => {
    const membership = { joinedAt: '2025-06-15T00:00:00Z' }
    const trip = { createdAt: '2025-06-01T00:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(true)
  })

  it('returns false when timestamps are equal (not strictly after)', () => {
    const ts = '2025-06-01T12:00:00Z'
    const membership = { joinedAt: ts }
    const trip = { createdAt: ts }
    expect(isLateJoinerForTrip(membership, trip)).toBe(false)
  })

  it('handles ISO string comparison correctly for same-day different times', () => {
    const membership = { joinedAt: '2025-06-01T12:00:01Z' }
    const trip = { createdAt: '2025-06-01T12:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(true)
  })

  it('returns false when both membership and trip are null', () => {
    expect(isLateJoinerForTrip(null, null)).toBe(false)
  })

  it('returns false for trip creator even if joinedAt is after createdAt', () => {
    const membership = { userId: 'user-1', joinedAt: '2025-06-15T00:00:00Z' }
    const trip = { createdBy: 'user-1', createdAt: '2025-06-01T00:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(false)
  })

  it('returns true for non-creator with joinedAt after createdAt', () => {
    const membership = { userId: 'user-2', joinedAt: '2025-06-15T00:00:00Z' }
    const trip = { createdBy: 'user-1', createdAt: '2025-06-01T00:00:00Z' }
    expect(isLateJoinerForTrip(membership, trip)).toBe(true)
  })
})
