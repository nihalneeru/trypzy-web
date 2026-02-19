import { describe, it, expect, vi, beforeEach } from 'vitest'
import { tryRecordPush, isDailyCapped, isP0Type } from '@/lib/push/pushDedupe'

// Reusable mock DB factory
function createMockDb(overrides = {}) {
  const mockCollection = {
    updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
  return {
    collection: vi.fn().mockReturnValue(mockCollection),
    _col: mockCollection,
  }
}

describe('tryRecordPush', () => {
  it('returns true when event is new (upserted)', async () => {
    const db = createMockDb()
    const result = await tryRecordPush(db, {
      userId: 'user-1',
      dedupeKey: 'trip_created:trip-1:user-1',
      pushType: 'trip_created_notify',
      tripId: 'trip-1',
    })
    expect(result).toBe(true)
    expect(db._col.updateOne).toHaveBeenCalledWith(
      { userId: 'user-1', dedupeKey: 'trip_created:trip-1:user-1' },
      expect.objectContaining({ $setOnInsert: expect.any(Object) }),
      { upsert: true }
    )
  })

  it('returns false when event is duplicate (not upserted)', async () => {
    const db = createMockDb({ updateOne: vi.fn().mockResolvedValue({ upsertedCount: 0 }) })
    const result = await tryRecordPush(db, {
      userId: 'user-1',
      dedupeKey: 'trip_created:trip-1:user-1',
      pushType: 'trip_created_notify',
      tripId: 'trip-1',
    })
    expect(result).toBe(false)
  })

  it('includes sentAt timestamp in $setOnInsert', async () => {
    const db = createMockDb()
    await tryRecordPush(db, {
      userId: 'user-1',
      dedupeKey: 'test:key',
      pushType: 'test_type',
      tripId: 'trip-1',
    })
    const setOnInsert = db._col.updateOne.mock.calls[0][1].$setOnInsert
    expect(setOnInsert.sentAt).toBeInstanceOf(Date)
  })
})

describe('isDailyCapped', () => {
  it('returns false when under cap (< 3)', async () => {
    const db = createMockDb({ countDocuments: vi.fn().mockResolvedValue(2) })
    expect(await isDailyCapped(db, 'user-1')).toBe(false)
  })

  it('returns true when at cap (= 3)', async () => {
    const db = createMockDb({ countDocuments: vi.fn().mockResolvedValue(3) })
    expect(await isDailyCapped(db, 'user-1')).toBe(true)
  })

  it('returns true when over cap (> 3)', async () => {
    const db = createMockDb({ countDocuments: vi.fn().mockResolvedValue(5) })
    expect(await isDailyCapped(db, 'user-1')).toBe(true)
  })

  it('queries from UTC midnight', async () => {
    const db = createMockDb()
    await isDailyCapped(db, 'user-1')
    const query = db._col.countDocuments.mock.calls[0][0]
    expect(query.userId).toBe('user-1')
    const sentAt = query.sentAt.$gte
    expect(sentAt).toBeInstanceOf(Date)
    expect(sentAt.getUTCHours()).toBe(0)
    expect(sentAt.getUTCMinutes()).toBe(0)
    expect(sentAt.getUTCSeconds()).toBe(0)
  })
})

describe('isP0Type', () => {
  const P0_TYPES = [
    'trip_created_notify',
    'trip_canceled',
    'first_dates_suggested',
    'dates_proposed_by_leader',
    'dates_locked',
    'itinerary_generated',
    'join_request_received',
    'join_request_approved',
  ]

  for (const type of P0_TYPES) {
    it(`${type} is P0 (cap-exempt)`, () => {
      expect(isP0Type(type)).toBe(true)
    })
  }

  const P1_TYPES = [
    'leader_ready_to_propose',
    'window_supported_author',
    'expense_added',
    'accommodation_selected',
    'first_idea_contributed',
    'prep_reminder_7d',
    'trip_started',
    'leader_transferred',
  ]

  for (const type of P1_TYPES) {
    it(`${type} is P1 (subject to daily cap)`, () => {
      expect(isP0Type(type)).toBe(false)
    })
  }
})
