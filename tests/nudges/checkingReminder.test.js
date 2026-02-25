import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkStaleCheckingReactions } from '@/lib/nudges/checkingReminder.js'

// Mock uuid
vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

// Helper to create a mock db
function createMockDb() {
  const insertedMessages = []
  const existingMessages = []

  return {
    insertedMessages,
    existingMessages,
    collection: (name) => {
      if (name === 'trip_messages') {
        return {
          findOne: vi.fn(async (query) => {
            // Check if any existing message matches the eventKey
            return existingMessages.find(m =>
              m.tripId === query.tripId &&
              m.isSystem === true &&
              m.metadata?.eventKey === query['metadata.eventKey']
            ) || null
          }),
          find: vi.fn(() => ({
            sort: () => ({
              limit: () => ({
                toArray: async () => existingMessages
              })
            })
          })),
          insertOne: vi.fn(async (doc) => {
            insertedMessages.push(doc)
            return { insertedId: doc.id }
          })
        }
      }
      return {
        findOne: vi.fn(async () => null),
        find: vi.fn(() => ({ sort: () => ({ limit: () => ({ toArray: async () => [] }) }) })),
        insertOne: vi.fn(async () => ({}))
      }
    }
  }
}

const FORTY_NINE_HOURS_AGO = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
const TWENTY_HOURS_AGO = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()

describe('checkStaleCheckingReactions', () => {
  let db

  beforeEach(() => {
    db = createMockDb()
  })

  it('inserts a chat message for CAVEAT reactions older than 48h', async () => {
    const trip = {
      _id: 'trip-1',
      circleId: 'circle-1',
      proposedWindowReactions: [
        {
          userId: 'user-1',
          userName: 'Alex',
          reactionType: 'CAVEAT',
          windowId: 'win-1',
          createdAt: FORTY_NINE_HOURS_AGO
        }
      ]
    }

    const windows = [
      { id: 'win-1', startDate: '2026-03-10', endDate: '2026-03-15' }
    ]

    await checkStaleCheckingReactions(db, trip, ['win-1'], windows)

    expect(db.insertedMessages.length).toBe(1)
    expect(db.insertedMessages[0].content).toContain('Alex')
    expect(db.insertedMessages[0].content).toContain('Mar 10')
    expect(db.insertedMessages[0].isSystem).toBe(true)
    expect(db.insertedMessages[0].metadata.nudgeType).toBe('checking_reminder')
  })

  it('does NOT insert for CAVEAT reactions younger than 48h', async () => {
    const trip = {
      _id: 'trip-2',
      circleId: 'circle-1',
      proposedWindowReactions: [
        {
          userId: 'user-2',
          userName: 'Jamie',
          reactionType: 'CAVEAT',
          windowId: 'win-2',
          createdAt: TWENTY_HOURS_AGO
        }
      ]
    }

    const windows = [
      { id: 'win-2', startDate: '2026-04-01', endDate: '2026-04-05' }
    ]

    await checkStaleCheckingReactions(db, trip, ['win-2'], windows)

    expect(db.insertedMessages.length).toBe(0)
  })

  it('does NOT insert for WORKS reactions (even if old)', async () => {
    const trip = {
      _id: 'trip-3',
      circleId: 'circle-1',
      proposedWindowReactions: [
        {
          userId: 'user-3',
          userName: 'Sam',
          reactionType: 'WORKS',
          windowId: 'win-3',
          createdAt: FORTY_NINE_HOURS_AGO
        }
      ]
    }

    const windows = [
      { id: 'win-3', startDate: '2026-05-01', endDate: '2026-05-05' }
    ]

    await checkStaleCheckingReactions(db, trip, ['win-3'], windows)

    expect(db.insertedMessages.length).toBe(0)
  })

  it('deduplicates — no duplicate if message already exists', async () => {
    const trip = {
      _id: 'trip-4',
      circleId: 'circle-1',
      proposedWindowReactions: [
        {
          userId: 'user-4',
          userName: 'Pat',
          reactionType: 'CAVEAT',
          windowId: 'win-4',
          createdAt: FORTY_NINE_HOURS_AGO
        }
      ]
    }

    const windows = [
      { id: 'win-4', startDate: '2026-06-01', endDate: '2026-06-05' }
    ]

    // Pre-populate existing message with matching eventKey
    db.existingMessages.push({
      tripId: 'trip-4',
      isSystem: true,
      metadata: { eventKey: 'checking_reminder:trip-4:user-4:win-4' }
    })

    await checkStaleCheckingReactions(db, trip, ['win-4'], windows)

    expect(db.insertedMessages.length).toBe(0)
  })

  it('handles empty reactions array gracefully', async () => {
    const trip = {
      _id: 'trip-5',
      circleId: 'circle-1',
      proposedWindowReactions: []
    }

    await checkStaleCheckingReactions(db, trip, ['win-5'], [])

    expect(db.insertedMessages.length).toBe(0)
  })

  it('handles missing proposedWindowReactions gracefully', async () => {
    const trip = {
      _id: 'trip-6',
      circleId: 'circle-1'
    }

    await checkStaleCheckingReactions(db, trip, ['win-6'], [])

    expect(db.insertedMessages.length).toBe(0)
  })
})
