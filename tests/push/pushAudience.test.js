import { describe, it, expect, vi } from 'vitest'
import { getActiveTravelerIds, resolveTargetUsers } from '@/lib/push/pushAudience'

// ── Mock DB factory ──

function createMockDb({ memberships = [], participants = [] } = {}) {
  return {
    collection: vi.fn((name) => ({
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(
          name === 'memberships' ? memberships : participants
        ),
      }),
    })),
  }
}

// ── Fixtures ──

const COLLAB_TRIP = { id: 'trip-1', type: 'collaborative', circleId: 'circle-1', createdBy: 'leader' }
const HOSTED_TRIP = { id: 'trip-2', type: 'hosted', circleId: 'circle-1', createdBy: 'leader' }

const MEMBERSHIPS = [
  { userId: 'leader', circleId: 'circle-1' },
  { userId: 'alice', circleId: 'circle-1' },
  { userId: 'bob', circleId: 'circle-1' },
]

const ACTIVE_PARTICIPANTS = [
  { userId: 'leader', tripId: 'trip-2', status: 'active' },
  { userId: 'alice', tripId: 'trip-2', status: 'active' },
]

// ── getActiveTravelerIds ──

describe('getActiveTravelerIds', () => {
  it('collaborative trip: returns circle members minus left/removed', async () => {
    const participants = [
      { userId: 'bob', tripId: 'trip-1', status: 'left' },
    ]
    const db = createMockDb({ memberships: MEMBERSHIPS, participants })
    const result = await getActiveTravelerIds(db, COLLAB_TRIP)
    expect(result).toContain('leader')
    expect(result).toContain('alice')
    expect(result).not.toContain('bob')
  })

  it('collaborative trip: returns all if no one left', async () => {
    const db = createMockDb({ memberships: MEMBERSHIPS, participants: [] })
    const result = await getActiveTravelerIds(db, COLLAB_TRIP)
    expect(result).toEqual(['leader', 'alice', 'bob'])
  })

  it('hosted trip: returns only active participants', async () => {
    const db = createMockDb({ participants: ACTIVE_PARTICIPANTS })
    const result = await getActiveTravelerIds(db, HOSTED_TRIP)
    expect(result).toEqual(['leader', 'alice'])
  })
})

// ── resolveTargetUsers ──

describe('resolveTargetUsers', () => {
  const db = createMockDb({ memberships: MEMBERSHIPS, participants: [] })

  it('trip_created_notify: excludes actor', async () => {
    const result = await resolveTargetUsers(db, 'trip_created_notify', COLLAB_TRIP, { actorUserId: 'leader' })
    expect(result).not.toContain('leader')
    expect(result).toContain('alice')
    expect(result).toContain('bob')
  })

  it('trip_canceled: excludes actor', async () => {
    const result = await resolveTargetUsers(db, 'trip_canceled', COLLAB_TRIP, { actorUserId: 'leader' })
    expect(result).not.toContain('leader')
  })

  it('dates_locked: includes leader (different copy)', async () => {
    const result = await resolveTargetUsers(db, 'dates_locked', COLLAB_TRIP, {})
    expect(result).toContain('leader')
    expect(result).toContain('alice')
    expect(result).toContain('bob')
  })

  it('itinerary_generated: excludes leader (who triggered)', async () => {
    const result = await resolveTargetUsers(db, 'itinerary_generated', COLLAB_TRIP, {})
    expect(result).not.toContain('leader')
    expect(result).toContain('alice')
  })

  it('join_request_received: leader only', async () => {
    const result = await resolveTargetUsers(db, 'join_request_received', COLLAB_TRIP, { actorUserId: 'sam' })
    expect(result).toEqual(['leader'])
  })

  it('join_request_approved: requester only', async () => {
    const result = await resolveTargetUsers(db, 'join_request_approved', COLLAB_TRIP, { requesterId: 'sam' })
    expect(result).toEqual(['sam'])
  })

  it('leader_transferred: new leader only', async () => {
    const result = await resolveTargetUsers(db, 'leader_transferred', COLLAB_TRIP, { newLeaderId: 'alice' })
    expect(result).toEqual(['alice'])
  })

  it('leader_ready_to_propose: leader only', async () => {
    const result = await resolveTargetUsers(db, 'leader_ready_to_propose', COLLAB_TRIP, {})
    expect(result).toEqual(['leader'])
  })

  it('window_supported_author: author only, excludes self-support', async () => {
    const result = await resolveTargetUsers(db, 'window_supported_author', COLLAB_TRIP, {
      authorUserId: 'alice',
      actorUserId: 'bob',
    })
    expect(result).toEqual(['alice'])
  })

  it('window_supported_author: returns empty if supporter is author', async () => {
    const result = await resolveTargetUsers(db, 'window_supported_author', COLLAB_TRIP, {
      authorUserId: 'alice',
      actorUserId: 'alice',
    })
    expect(result).toEqual([])
  })

  it('unknown type: returns empty', async () => {
    const result = await resolveTargetUsers(db, 'unknown_type', COLLAB_TRIP, {})
    expect(result).toEqual([])
  })
})
