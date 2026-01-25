import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  wasNudgeSuppressed,
  filterSuppressedNudges,
  recordNudgeEvent,
  hasChatMessageWithEventKey,
  createChatCardMessage,
} from '@/lib/nudges/store'
import { NudgeType, NudgeChannel, NudgeAudience, NudgePriority } from '@/lib/nudges/types'

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-123',
}))

// Mock the events store
vi.mock('@/lib/events/store', () => ({
  recordTripEvent: vi.fn().mockResolvedValue(undefined),
}))

// Helper to create mock nudge
const createNudge = (overrides = {}) => ({
  id: 'nudge-1',
  type: NudgeType.FIRST_AVAILABILITY_SUBMITTED,
  channel: NudgeChannel.CHAT_CARD,
  audience: NudgeAudience.ALL,
  priority: NudgePriority.LOW,
  payload: { message: 'Test message' },
  dedupeKey: 'first_availability:trip-1',
  cooldownHours: 8760,
  ...overrides,
})

// Helper to create mock DB
const createMockDb = (overrides = {}) => {
  const mockCollection = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    updateOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'test-id' }),
    ...overrides,
  }

  return {
    collection: vi.fn().mockReturnValue(mockCollection),
    _mockCollection: mockCollection,
  }
}

describe('wasNudgeSuppressed', () => {
  it('should return false when no recent event exists', async () => {
    const db = createMockDb()

    const result = await wasNudgeSuppressed(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'first_availability:trip-1',
      cooldownHours: 24,
    })

    expect(result).toBe(false)
    expect(db.collection).toHaveBeenCalledWith('nudge_events')
  })

  it('should return true when recent shown event exists', async () => {
    const recentEvent = {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'first_availability:trip-1',
      status: 'shown',
      createdAt: new Date().toISOString(),
    }

    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue(recentEvent),
    })

    const result = await wasNudgeSuppressed(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'first_availability:trip-1',
      cooldownHours: 24,
    })

    expect(result).toBe(true)
  })

  it('should return true when recent dismissed event exists', async () => {
    const recentEvent = {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'first_availability:trip-1',
      status: 'dismissed',
      createdAt: new Date().toISOString(),
    }

    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue(recentEvent),
    })

    const result = await wasNudgeSuppressed(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'first_availability:trip-1',
      cooldownHours: 24,
    })

    expect(result).toBe(true)
  })

  it('should calculate cooldown cutoff correctly', async () => {
    const db = createMockDb()
    const cooldownHours = 72 // 3 days

    await wasNudgeSuppressed(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      dedupeKey: 'test-key',
      cooldownHours,
    })

    // Verify the query includes the correct cutoff calculation
    const findOneCall = db._mockCollection.findOne.mock.calls[0][0]
    expect(findOneCall.tripId).toBe('trip-1')
    expect(findOneCall.userId).toBe('user-1')
    expect(findOneCall.dedupeKey).toBe('test-key')
    expect(findOneCall.status.$in).toEqual(['shown', 'dismissed'])
    expect(findOneCall.createdAt.$gte).toBeDefined()
  })
})

describe('filterSuppressedNudges', () => {
  it('should return all nudges when none are suppressed', async () => {
    const db = createMockDb()
    const nudges = [
      createNudge({ dedupeKey: 'key-1' }),
      createNudge({ dedupeKey: 'key-2' }),
    ]

    const result = await filterSuppressedNudges(db, 'trip-1', 'user-1', nudges)

    expect(result).toHaveLength(2)
  })

  it('should filter out suppressed nudges', async () => {
    // First nudge is suppressed, second is not
    let callCount = 0
    const db = createMockDb({
      findOne: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? { status: 'shown' } : null
      }),
    })

    const nudges = [
      createNudge({ dedupeKey: 'suppressed-key' }),
      createNudge({ dedupeKey: 'not-suppressed-key' }),
    ]

    const result = await filterSuppressedNudges(db, 'trip-1', 'user-1', nudges)

    expect(result).toHaveLength(1)
    expect(result[0].dedupeKey).toBe('not-suppressed-key')
  })

  it('should return empty array when all nudges are suppressed', async () => {
    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue({ status: 'shown' }),
    })

    const nudges = [
      createNudge({ dedupeKey: 'key-1' }),
      createNudge({ dedupeKey: 'key-2' }),
    ]

    const result = await filterSuppressedNudges(db, 'trip-1', 'user-1', nudges)

    expect(result).toHaveLength(0)
  })
})

describe('recordNudgeEvent', () => {
  it('should record a nudge event with correct data', async () => {
    const db = createMockDb()
    const nudge = createNudge()

    const result = await recordNudgeEvent(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      nudge,
      status: 'shown',
    })

    expect(result.id).toBe('test-uuid-123')
    expect(result.tripId).toBe('trip-1')
    expect(result.userId).toBe('user-1')
    expect(result.nudgeId).toBe(nudge.id)
    expect(result.nudgeType).toBe(nudge.type)
    expect(result.dedupeKey).toBe(nudge.dedupeKey)
    expect(result.status).toBe('shown')
    expect(result.channel).toBe(nudge.channel)
  })

  it('should upsert to handle duplicates', async () => {
    const db = createMockDb()
    const nudge = createNudge()

    await recordNudgeEvent(db, {
      tripId: 'trip-1',
      userId: 'user-1',
      nudge,
      status: 'shown',
    })

    expect(db._mockCollection.updateOne).toHaveBeenCalled()
    const updateCall = db._mockCollection.updateOne.mock.calls[0]
    expect(updateCall[2]).toEqual({ upsert: true })
  })
})

describe('hasChatMessageWithEventKey', () => {
  it('should return false when no message exists', async () => {
    const db = createMockDb()

    const result = await hasChatMessageWithEventKey(db, 'trip-1', 'test-event-key')

    expect(result).toBe(false)
    expect(db.collection).toHaveBeenCalledWith('trip_messages')
  })

  it('should return true when message with eventKey exists', async () => {
    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue({
        tripId: 'trip-1',
        isSystem: true,
        metadata: { eventKey: 'test-event-key' },
      }),
    })

    const result = await hasChatMessageWithEventKey(db, 'trip-1', 'test-event-key')

    expect(result).toBe(true)
  })

  it('should check recent system messages for dedupeKey match', async () => {
    const recentMessages = [
      {
        tripId: 'trip-1',
        isSystem: true,
        metadata: { dedupeKey: 'test-event-key' },
      },
    ]

    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue(null), // No direct eventKey match
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(recentMessages),
          }),
        }),
      }),
    })

    const result = await hasChatMessageWithEventKey(db, 'trip-1', 'test-event-key')

    expect(result).toBe(true)
  })
})

describe('createChatCardMessage', () => {
  it('should create message when no duplicate exists', async () => {
    const db = createMockDb()
    const nudge = createNudge()

    const result = await createChatCardMessage(
      db,
      'trip-1',
      'circle-1',
      nudge,
      'Test chat message'
    )

    expect(result).toBe(true)
    expect(db._mockCollection.insertOne).toHaveBeenCalled()

    const insertedMessage = db._mockCollection.insertOne.mock.calls[0][0]
    expect(insertedMessage.tripId).toBe('trip-1')
    expect(insertedMessage.circleId).toBe('circle-1')
    expect(insertedMessage.content).toBe('Test chat message')
    expect(insertedMessage.isSystem).toBe(true)
    expect(insertedMessage.subtype).toBe('nudge')
    expect(insertedMessage.metadata.eventKey).toBe(nudge.dedupeKey)
    expect(insertedMessage.metadata.nudgeType).toBe(nudge.type)
  })

  it('should not create message when duplicate exists', async () => {
    const db = createMockDb({
      findOne: vi.fn().mockResolvedValue({
        tripId: 'trip-1',
        isSystem: true,
        metadata: { eventKey: 'first_availability:trip-1' },
      }),
    })
    const nudge = createNudge()

    const result = await createChatCardMessage(
      db,
      'trip-1',
      'circle-1',
      nudge,
      'Test chat message'
    )

    expect(result).toBe(false)
    expect(db._mockCollection.insertOne).not.toHaveBeenCalled()
  })
})
