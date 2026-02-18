/**
 * Nudge Surfacing Integration Tests
 *
 * Tests the end-to-end nudge pipeline:
 * 1. computeNudges returns expected nudges for trip state
 * 2. Dedupe prevents same nudge from appearing twice
 * 3. Chat card messages are created with correct metadata
 */

import { describe, it, expect, vi } from 'vitest'
import { computeNudges } from '@/lib/nudges/NudgeEngine'
import { NudgeType, NudgeChannel, NudgeAudience } from '@/lib/nudges/types'
import { filterSuppressedNudges, createChatCardMessage } from '@/lib/nudges/store'
import { buildChatMessage } from '@/lib/nudges/copy'

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-surfacing',
}))

// Mock events store
vi.mock('@/lib/events/store', () => ({
  recordTripEvent: vi.fn().mockResolvedValue(undefined),
}))

// Helpers
const createTrip = (overrides = {}) => ({
  id: 'trip-surf-1',
  name: 'Surfacing Test Trip',
  type: 'collaborative',
  status: 'proposed',
  createdBy: 'leader-1',
  startDate: null,
  endDate: null,
  lockedStartDate: null,
  lockedEndDate: null,
  datesLocked: false,
  schedulingMode: 'date_windows',
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
})

const createMetrics = (overrides = {}) => ({
  travelerCount: 5,
  availabilitySubmittedCount: 0,
  availabilityCompletionPct: 0,
  overlapBestRange: null,
  overlapBestCoverageCount: 0,
  overlapBestCoveragePct: 0,
  hasProposedWindow: false,
  proposedWindowId: null,
  votingOpen: false,
  voteCount: 0,
  voteThresholdMet: false,
  topOptionId: null,
  topOptionVotes: 0,
  tripStage: 'proposed',
  lockedDates: null,
  viewerWindowCount: 0,
  ...overrides,
})

const createViewer = (overrides = {}) => ({
  userId: 'user-1',
  isLeader: false,
  isParticipant: true,
  hasSubmittedAvailability: false,
  windowCount: 0,
  ...overrides,
})

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

describe('Nudge Surfacing Pipeline', () => {
  describe('nudges are produced for known trip state', () => {
    it('produces FIRST_AVAILABILITY_SUBMITTED when first person submits', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      expect(result.nudges.length).toBeGreaterThanOrEqual(1)

      const nudge = result.nudges.find(
        n => n.type === NudgeType.FIRST_AVAILABILITY_SUBMITTED
      )
      expect(nudge).toBeDefined()
      expect(nudge.channel).toBe(NudgeChannel.CHAT_CARD)
      expect(nudge.audience).toBe(NudgeAudience.ALL)
      expect(nudge.dedupeKey).toBe('first_availability:trip-surf-1')
      expect(nudge.payload.message).toBeTruthy()
    })

    it('produces DATES_LOCKED when trip dates are locked', () => {
      const result = computeNudges({
        trip: createTrip({ status: 'locked', datesLocked: true, lockedStartDate: '2026-03-01', lockedEndDate: '2026-03-05' }),
        metrics: createMetrics({
          tripStage: 'locked',
          lockedDates: { start: '2026-03-01', end: '2026-03-05', label: 'Mar 1 – Mar 5' },
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.DATES_LOCKED
      )
      expect(nudge).toBeDefined()
      expect(nudge.channel).toBe(NudgeChannel.CHAT_CARD)
      expect(nudge.payload.message).toContain('happening')
    })

    it('produces chat message text with emoji', () => {
      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const nudge = result.nudges.find(
        n => n.type === NudgeType.FIRST_AVAILABILITY_SUBMITTED
      )

      const chatText = buildChatMessage(nudge.type, nudge.payload)
      expect(chatText).toContain('🎉')
      expect(chatText).toContain('dates')
    })
  })

  describe('dedupe prevents repeat nudges', () => {
    it('filters out nudges that were recently shown', async () => {
      // Mock DB where nudge was recently shown
      const db = createMockDb({
        findOne: vi.fn().mockResolvedValue({
          tripId: 'trip-surf-1',
          userId: 'user-1',
          dedupeKey: 'first_availability:trip-surf-1',
          status: 'shown',
          createdAt: new Date().toISOString(),
        }),
      })

      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const filtered = await filterSuppressedNudges(
        db,
        'trip-surf-1',
        'user-1',
        result.nudges
      )

      // All nudges should be suppressed since we mock findOne to always return a recent event
      expect(filtered).toHaveLength(0)
    })

    it('allows nudges that have not been shown recently', async () => {
      // Mock DB with no recent events
      const db = createMockDb({
        findOne: vi.fn().mockResolvedValue(null),
      })

      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const filtered = await filterSuppressedNudges(
        db,
        'trip-surf-1',
        'user-1',
        result.nudges
      )

      // Nudges should pass through (not suppressed)
      expect(filtered.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('chat card message creation', () => {
    it('creates message with nudge metadata', async () => {
      const db = createMockDb()

      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const chatCardNudge = result.nudges.find(n => n.channel === NudgeChannel.CHAT_CARD)
      expect(chatCardNudge).toBeDefined()

      const messageText = buildChatMessage(chatCardNudge.type, chatCardNudge.payload)
      const created = await createChatCardMessage(
        db,
        'trip-surf-1',
        'circle-1',
        chatCardNudge,
        messageText
      )

      expect(created).toBe(true)

      // Verify the inserted message has correct structure
      const insertCall = db._mockCollection.insertOne.mock.calls[0][0]
      expect(insertCall.isSystem).toBe(true)
      expect(insertCall.subtype).toBe('nudge')
      expect(insertCall.metadata.eventKey).toBe(chatCardNudge.dedupeKey)
      expect(insertCall.metadata.nudgeType).toBe(chatCardNudge.type)
      expect(insertCall.metadata.source).toBe('nudge_engine')
      expect(insertCall.content).toContain('🎉')
    })

    it('does not create duplicate message', async () => {
      // Mock DB where message already exists
      const db = createMockDb({
        findOne: vi.fn().mockResolvedValue({
          tripId: 'trip-surf-1',
          isSystem: true,
          metadata: { eventKey: 'first_availability:trip-surf-1' },
        }),
      })

      const result = computeNudges({
        trip: createTrip(),
        metrics: createMetrics({
          availabilitySubmittedCount: 1,
          availabilityCompletionPct: 20,
          tripStage: 'scheduling',
        }),
        viewer: createViewer(),
      })

      const chatCardNudge = result.nudges.find(n => n.channel === NudgeChannel.CHAT_CARD)
      const messageText = buildChatMessage(chatCardNudge.type, chatCardNudge.payload)
      const created = await createChatCardMessage(
        db,
        'trip-surf-1',
        'circle-1',
        chatCardNudge,
        messageText
      )

      expect(created).toBe(false)
      // insertOne should NOT have been called
      expect(db._mockCollection.insertOne).not.toHaveBeenCalled()
    })
  })
})
