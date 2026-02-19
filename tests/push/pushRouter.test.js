import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies before importing pushRouter
vi.mock('@/lib/push/pushCopy', () => ({
  PUSH_COPY: {
    trip_created_notify: (ctx) => ({ title: ctx.tripName, body: `${ctx.actorName} started planning.` }),
    dates_locked: (ctx, { userId, trip }) => ({
      title: ctx.tripName,
      body: trip.createdBy === userId ? 'You locked it.' : 'Dates locked!',
    }),
  },
}))

vi.mock('@/lib/push/pushAudience', () => ({
  resolveTargetUsers: vi.fn().mockResolvedValue(['alice', 'bob']),
}))

vi.mock('@/lib/push/pushDedupe', () => ({
  tryRecordPush: vi.fn().mockResolvedValue(true),
  isDailyCapped: vi.fn().mockResolvedValue(false),
  isP0Type: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/push/pushDeepLink', () => ({
  buildDeepLink: vi.fn().mockReturnValue({ tripId: 'trip-1' }),
}))

vi.mock('@/lib/push/sendPush', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
}))

import { pushRouter } from '@/lib/push/pushRouter'
import { resolveTargetUsers } from '@/lib/push/pushAudience'
import { tryRecordPush, isDailyCapped, isP0Type } from '@/lib/push/pushDedupe'
import { sendPush } from '@/lib/push/sendPush'

const TRIP = { id: 'trip-1', name: 'Beach Trip', createdBy: 'leader' }
const DB = {} // mock db passed through

describe('pushRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveTargetUsers.mockResolvedValue(['alice', 'bob'])
    tryRecordPush.mockResolvedValue(true)
    isDailyCapped.mockResolvedValue(false)
    isP0Type.mockReturnValue(true)
    sendPush.mockResolvedValue(undefined)
  })

  it('sends push to all eligible users', async () => {
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', actorName: 'Leader', actorUserId: 'leader' },
    })
    expect(stats.sent).toBe(2)
    expect(stats.suppressed).toBe(0)
    expect(stats.failed).toBe(0)
    expect(sendPush).toHaveBeenCalledTimes(2)
  })

  it('suppresses duplicate pushes', async () => {
    tryRecordPush
      .mockResolvedValueOnce(true)   // alice: new
      .mockResolvedValueOnce(false)  // bob: duplicate

    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', actorName: 'Leader', actorUserId: 'leader' },
    })
    expect(stats.sent).toBe(1)
    expect(stats.suppressed).toBe(1)
  })

  it('returns empty stats when no audience', async () => {
    resolveTargetUsers.mockResolvedValue([])
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Trip' },
    })
    expect(stats.sent).toBe(0)
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('returns empty stats for unknown type', async () => {
    const stats = await pushRouter(DB, {
      type: 'nonexistent_type',
      tripId: 'trip-1',
      trip: TRIP,
      context: {},
    })
    expect(stats.sent).toBe(0)
    expect(resolveTargetUsers).not.toHaveBeenCalled()
  })

  it('daily cap suppresses P1 types', async () => {
    isP0Type.mockReturnValue(false)
    isDailyCapped.mockResolvedValue(true)
    // tryRecordPush still returns true (new event), but cap blocks send
    // However the implementation records first then checks cap, so both get suppressed
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', actorName: 'Leader' },
    })
    expect(stats.suppressed).toBe(2)
    expect(stats.sent).toBe(0)
  })

  it('P0 types skip daily cap check', async () => {
    isP0Type.mockReturnValue(true)
    isDailyCapped.mockResolvedValue(true) // Would block if checked
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', actorName: 'Leader' },
    })
    expect(stats.sent).toBe(2)
    expect(isDailyCapped).not.toHaveBeenCalled()
  })

  it('never throws — catches errors gracefully', async () => {
    resolveTargetUsers.mockRejectedValue(new Error('DB down'))
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: {},
    })
    expect(stats.sent).toBe(0)
    // Should not throw
  })

  it('send failure increments failed count', async () => {
    sendPush.mockRejectedValue(new Error('APNS timeout'))
    const stats = await pushRouter(DB, {
      type: 'trip_created_notify',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', actorName: 'Leader' },
    })
    expect(stats.failed).toBe(2)
    expect(stats.sent).toBe(0)
  })

  it('dates_locked sends role-aware copy', async () => {
    resolveTargetUsers.mockResolvedValue(['leader', 'alice'])
    const stats = await pushRouter(DB, {
      type: 'dates_locked',
      tripId: 'trip-1',
      trip: TRIP,
      context: { tripName: 'Beach Trip', dates: 'Feb 7–Feb 9' },
    })
    expect(stats.sent).toBe(2)
    // First call for leader, second for alice — different copy
    const leaderCall = sendPush.mock.calls.find(c => c[1][0] === 'leader')
    const aliceCall = sendPush.mock.calls.find(c => c[1][0] === 'alice')
    expect(leaderCall[2].body).toContain('You locked')
    expect(aliceCall[2].body).toContain('Dates locked')
  })
})
