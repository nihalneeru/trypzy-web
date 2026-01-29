/**
 * Event Emitter Tests
 *
 * Tests for lib/events/emit.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Mock MongoDB
const mockInsertOne = vi.fn()
const mockDb = {
  collection: vi.fn(() => ({
    insertOne: mockInsertOne,
  })),
}

vi.mock('@/lib/server/db', () => ({
  connectToMongo: vi.fn(() => Promise.resolve(mockDb)),
}))

// Import after mocking
const { emitTripEvent } = await import('@/lib/events/emit')

// Valid ObjectId-format strings for testing
const TRIP_ID = new ObjectId().toString()
const CIRCLE_ID = new ObjectId().toString()
const USER_ID = new ObjectId().toString()
const WINDOW_ID = new ObjectId().toString()
const NUDGE_EVENT_ID = new ObjectId().toString()

describe('emitTripEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsertOne.mockReset()
  })

  it('should emit a basic event with required fields', async () => {
    const mockResult = { insertedId: { toString: () => 'event_123' } }
    mockInsertOne.mockResolvedValue(mockResult)

    const tripId = TRIP_ID
    const circleId = CIRCLE_ID
    const eventType = 'trip.lifecycle.created'
    const actorId = USER_ID
    const tripCreatedAt = new Date('2026-01-01')

    const result = await emitTripEvent(
      tripId,
      circleId,
      eventType,
      actorId,
      'leader',
      tripCreatedAt,
      { tripType: 'collaborative' }
    )

    expect(result).toBe('event_123')
    expect(mockDb.collection).toHaveBeenCalledWith('trip_events')
    expect(mockInsertOne).toHaveBeenCalledTimes(1)

    const insertedEvent = mockInsertOne.mock.calls[0][0]
    expect(insertedEvent.schemaVersion).toBe(1)
    expect(insertedEvent.eventType).toBe(eventType)
    expect(insertedEvent.actorRole).toBe('leader')
    expect(insertedEvent.payload).toEqual({ tripType: 'collaborative' })
    expect(insertedEvent.tripAgeMs).toBeGreaterThan(0)
    expect(insertedEvent.timestamp).toBeInstanceOf(Date)
  })

  it('should return null on duplicate idempotencyKey error', async () => {
    const duplicateError = new Error('Duplicate key')
    duplicateError.code = 11000
    mockInsertOne.mockRejectedValue(duplicateError)

    const result = await emitTripEvent(
      TRIP_ID,
      CIRCLE_ID,
      'scheduling.window.supported',
      USER_ID,
      'traveler',
      new Date(),
      { windowId: WINDOW_ID },
      { idempotencyKey: `${TRIP_ID}:${USER_ID}:${WINDOW_ID}:support` }
    )

    expect(result).toBeNull()
  })

  it('should throw on non-duplicate errors', async () => {
    const otherError = new Error('Connection failed')
    otherError.code = 12345
    mockInsertOne.mockRejectedValue(otherError)

    await expect(
      emitTripEvent(
        TRIP_ID,
        CIRCLE_ID,
        'scheduling.window.supported',
        USER_ID,
        'traveler',
        new Date(),
        { windowId: WINDOW_ID }
      )
    ).rejects.toThrow('Connection failed')
  })

  it('should include context when precedingEventId is provided', async () => {
    const mockResult = { insertedId: { toString: () => 'event_456' } }
    mockInsertOne.mockResolvedValue(mockResult)

    await emitTripEvent(
      TRIP_ID,
      CIRCLE_ID,
      'nudge.system.correlated_action',
      USER_ID,
      'traveler',
      new Date(),
      { nudgeType: 'first_availability_prompt', actionType: 'window_suggested' },
      {
        precedingEventId: NUDGE_EVENT_ID,
        latencyFromPrecedingMs: 5000,
      }
    )

    const insertedEvent = mockInsertOne.mock.calls[0][0]
    expect(insertedEvent.context).toBeDefined()
    expect(insertedEvent.context.latencyFromPrecedingMs).toBe(5000)
  })

  it('should handle null actorId for system events', async () => {
    const mockResult = { insertedId: { toString: () => 'event_789' } }
    mockInsertOne.mockResolvedValue(mockResult)

    await emitTripEvent(
      TRIP_ID,
      CIRCLE_ID,
      'trip.lifecycle.completed',
      null,
      'system',
      new Date(),
      { durationDays: 5 }
    )

    const insertedEvent = mockInsertOne.mock.calls[0][0]
    expect(insertedEvent.actorId).toBeNull()
    expect(insertedEvent.actorRole).toBe('system')
  })
})
