import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

describe('Date Shortlist - Multi-Window Proposals', () => {
  let client, db
  let POST, GET, DELETE

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    // Import route handlers AFTER env vars are set
    const module = await import('@/app/api/[[...path]]/route.js')
    POST = module.POST
    GET = module.GET
    DELETE = module.DELETE
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  // Helper to create JWT token
  function createToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET)
  }

  // Helper to create test user
  async function createTestUser({ id, name, email }) {
    await db.collection('users').insertOne({
      id,
      name,
      email,
      createdAt: new Date().toISOString()
    })
  }

  // Helper to create test circle
  async function createTestCircle({ id, ownerId }) {
    await db.collection('circles').insertOne({
      id,
      name: 'Test Circle',
      ownerId,
      inviteCode: 'SHORTLIST123',
      createdAt: new Date().toISOString()
    })
  }

  // Helper to create test trip
  async function createTestTrip({ id, circleId, createdBy, schedulingMode = 'date_windows', status = 'scheduling' }) {
    const trip = {
      id,
      name: 'Test Trip',
      circleId,
      createdBy,
      type: 'collaborative',
      schedulingMode,
      status,
      startDate: '2025-03-01',
      endDate: '2025-03-31',
      createdAt: new Date().toISOString()
    }
    await db.collection('trips').insertOne(trip)
    return trip
  }

  // Helper to add membership
  async function addMembership({ userId, circleId, role = 'member' }) {
    await db.collection('memberships').insertOne({
      userId,
      circleId,
      role,
      joinedAt: new Date().toISOString()
    })
  }

  // Helper to clean up test data
  async function cleanupTestData(ids) {
    const { tripId, circleId, userIds = [] } = ids
    if (tripId) {
      await db.collection('trips').deleteMany({ id: tripId })
      await db.collection('date_windows').deleteMany({ tripId })
      await db.collection('window_supports').deleteMany({ tripId })
      await db.collection('trip_messages').deleteMany({ tripId })
    }
    if (circleId) {
      await db.collection('circles').deleteMany({ id: circleId })
      await db.collection('memberships').deleteMany({ circleId })
    }
    if (userIds.length > 0) {
      await db.collection('users').deleteMany({ id: { $in: userIds } })
    }
  }

  // ---------------------------------------------------------------------------
  // 1. POST /propose-dates with windowIds
  // ---------------------------------------------------------------------------
  describe('POST /propose-dates with windowIds', () => {
    const tripId = 'trip-multi-propose-1'
    const circleId = 'circle-multi-propose-1'
    const leaderId = 'leader-multi-propose-1'
    const memberId = 'member-multi-propose-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-multi-propose@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-multi-propose@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Insert two windows with concrete dates
      await db.collection('date_windows').insertMany([
        {
          id: 'mp-w1',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          normalizedStart: '2025-03-10',
          normalizedEnd: '2025-03-15',
          precision: 'exact',
          createdAt: new Date().toISOString()
        },
        {
          id: 'mp-w2',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          normalizedStart: '2025-03-20',
          normalizedEnd: '2025-03-25',
          precision: 'exact',
          createdAt: new Date().toISOString()
        }
      ])
      // Add support so proposal readiness doesn't block
      await db.collection('window_supports').insertMany([
        { id: 'mp-sup-1', windowId: 'mp-w1', tripId, userId: memberId, createdAt: new Date().toISOString() },
        { id: 'mp-sup-2', windowId: 'mp-w2', tripId, userId: memberId, createdAt: new Date().toISOString() }
      ])
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should propose multiple windows and set both proposedWindowId and proposedWindowIds', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowIds: ['mp-w1', 'mp-w2'],
          leaderOverride: true
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.message).toBe('Dates proposed')

      // Verify trip has both fields set correctly
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBe('mp-w1')
      expect(trip.proposedWindowIds).toEqual(['mp-w1', 'mp-w2'])
    })

    it('should reject more than 3 windows', async () => {
      // Insert two more windows for a total of 4
      await db.collection('date_windows').insertMany([
        {
          id: 'mp-w3',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-05',
          endDate: '2025-03-08',
          precision: 'exact',
          createdAt: new Date().toISOString()
        },
        {
          id: 'mp-w4',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-27',
          endDate: '2025-03-30',
          precision: 'exact',
          createdAt: new Date().toISOString()
        }
      ])

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowIds: ['mp-w1', 'mp-w2', 'mp-w3', 'mp-w4'],
          leaderOverride: true
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('1-3')
    })

    it('should reject blocker windows in proposal', async () => {
      // Insert a blocker window
      await db.collection('date_windows').insertOne({
        id: 'mp-blocker',
        tripId,
        proposedBy: memberId,
        startDate: '2025-03-12',
        endDate: '2025-03-14',
        windowType: 'blocker',
        precision: 'exact',
        createdAt: new Date().toISOString()
      })

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowIds: ['mp-w1', 'mp-blocker'],
          leaderOverride: true
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('blocker')
    })

    it('should reject non-leader attempting to propose', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowIds: ['mp-w1', 'mp-w2'],
          leaderOverride: true
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(403)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. POST /proposed-window/react with windowId
  // ---------------------------------------------------------------------------
  describe('POST /proposed-window/react with windowId', () => {
    const tripId = 'trip-multi-react-1'
    const circleId = 'circle-multi-react-1'
    const leaderId = 'leader-multi-react-1'
    const memberId = 'member-multi-react-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-multi-react@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-multi-react@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Insert two proposed windows
      await db.collection('date_windows').insertMany([
        {
          id: 'mr-w1',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          reactions: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'mr-w2',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          reactions: [],
          createdAt: new Date().toISOString()
        }
      ])

      // Set trip to PROPOSED phase with multi-window proposal
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            proposedWindowId: 'mr-w1',
            proposedWindowIds: ['mr-w1', 'mr-w2'],
            proposedAt: new Date().toISOString(),
            proposedWindowReactions: []
          }
        }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should react to a specific proposed window', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/proposed-window/react`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'mr-w1',
          reactionType: 'WORKS'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'proposed-window', 'react'] } })
      expect(response.status).toBe(200)

      const data = await response.json()

      // Verify reaction stored on the date_windows document
      const window = await db.collection('date_windows').findOne({ id: 'mr-w1' })
      expect(window.reactions).toHaveLength(1)
      expect(window.reactions[0].userId).toBe(memberId)
      expect(window.reactions[0].reactionType).toBe('WORKS')

      // Verify response includes approvalSummaries
      expect(data.approvalSummaries).toBeDefined()
      expect(data.approvalSummaries['mr-w1']).toBeDefined()
      expect(data.approvalSummaries['mr-w1'].approvals).toBe(1)
    })

    it('should react to second proposed window independently', async () => {
      const token = createToken(memberId)

      // React to w1 with WORKS
      const url1 = new URL(`http://localhost:3000/api/trips/${tripId}/proposed-window/react`)
      const request1 = new NextRequest(url1, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'mr-w1',
          reactionType: 'WORKS'
        })
      })
      const response1 = await POST(request1, { params: { path: ['trips', tripId, 'proposed-window', 'react'] } })
      expect(response1.status).toBe(200)

      // React to w2 with CANT
      const url2 = new URL(`http://localhost:3000/api/trips/${tripId}/proposed-window/react`)
      const request2 = new NextRequest(url2, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'mr-w2',
          reactionType: 'CANT'
        })
      })
      const response2 = await POST(request2, { params: { path: ['trips', tripId, 'proposed-window', 'react'] } })
      expect(response2.status).toBe(200)

      // Verify both windows have independent reactions
      const w1 = await db.collection('date_windows').findOne({ id: 'mr-w1' })
      expect(w1.reactions).toHaveLength(1)
      expect(w1.reactions[0].reactionType).toBe('WORKS')

      const w2 = await db.collection('date_windows').findOne({ id: 'mr-w2' })
      expect(w2.reactions).toHaveLength(1)
      expect(w2.reactions[0].reactionType).toBe('CANT')

      // Verify approvalSummaries reflects both independently
      const data2 = await response2.json()
      expect(data2.approvalSummaries['mr-w1'].approvals).toBe(1)
      expect(data2.approvalSummaries['mr-w1'].cants).toBe(0)
      expect(data2.approvalSummaries['mr-w2'].approvals).toBe(0)
      expect(data2.approvalSummaries['mr-w2'].cants).toBe(1)
    })
  })

  // ---------------------------------------------------------------------------
  // 3. POST /lock-proposed with windowId
  // ---------------------------------------------------------------------------
  describe('POST /lock-proposed with windowId', () => {
    const tripId = 'trip-multi-lock-1'
    const circleId = 'circle-multi-lock-1'
    const leaderId = 'leader-multi-lock-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-multi-lock@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Insert two proposed windows
      await db.collection('date_windows').insertMany([
        {
          id: 'ml-w1',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          reactions: [],
          createdAt: new Date().toISOString()
        },
        {
          id: 'ml-w2',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          reactions: [],
          createdAt: new Date().toISOString()
        }
      ])

      // Set trip to PROPOSED phase with multi-window proposal
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            proposedWindowId: 'ml-w1',
            proposedWindowIds: ['ml-w1', 'ml-w2'],
            proposedAt: new Date().toISOString(),
            proposedWindowReactions: []
          }
        }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId] })
    })

    it('should lock a specific proposed window by windowId', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/lock-proposed`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ windowId: 'ml-w2', leaderOverride: true })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('locked')
      expect(data.lockedStartDate).toBe('2025-03-20')
      expect(data.lockedEndDate).toBe('2025-03-25')
      expect(data.lockedFromWindowId).toBe('ml-w2')
    })

    it('should default to locking first proposed window when no windowId given', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/lock-proposed`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ leaderOverride: true })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('locked')
      expect(data.lockedStartDate).toBe('2025-03-10')
      expect(data.lockedEndDate).toBe('2025-03-15')
      expect(data.lockedFromWindowId).toBe('ml-w1')
    })
  })

  // ---------------------------------------------------------------------------
  // 4. POST /withdraw-proposal clears multi-window
  // ---------------------------------------------------------------------------
  describe('POST /withdraw-proposal clears multi-window', () => {
    const tripId = 'trip-multi-withdraw-1'
    const circleId = 'circle-multi-withdraw-1'
    const leaderId = 'leader-multi-withdraw-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-multi-withdraw@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Insert two proposed windows with reactions
      await db.collection('date_windows').insertMany([
        {
          id: 'mw-w1',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          reactions: [
            { userId: 'some-user', userName: 'Some User', reactionType: 'WORKS', createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        },
        {
          id: 'mw-w2',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          reactions: [
            { userId: 'some-user', userName: 'Some User', reactionType: 'CANT', createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        }
      ])

      // Set trip to PROPOSED phase with multi-window proposal
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            proposedWindowId: 'mw-w1',
            proposedWindowIds: ['mw-w1', 'mw-w2'],
            proposedAt: new Date().toISOString(),
            proposedWindowReactions: []
          }
        }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId] })
    })

    it('should clear proposedWindowId and proposedWindowIds on withdrawal', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })
      expect(response.status).toBe(200)

      // Verify trip has no proposed window fields
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBeUndefined()
      expect(trip.proposedWindowIds).toBeUndefined()
      expect(trip.proposedAt).toBeUndefined()
    })

    it('should clear per-window reactions on withdrawal', async () => {
      // Verify reactions exist before withdrawal
      const w1Before = await db.collection('date_windows').findOne({ id: 'mw-w1' })
      expect(w1Before.reactions).toHaveLength(1)
      const w2Before = await db.collection('date_windows').findOne({ id: 'mw-w2' })
      expect(w2Before.reactions).toHaveLength(1)

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })
      expect(response.status).toBe(200)

      // Verify reactions cleared on both windows
      const w1After = await db.collection('date_windows').findOne({ id: 'mw-w1' })
      expect(w1After.reactions).toEqual([])
      const w2After = await db.collection('date_windows').findOne({ id: 'mw-w2' })
      expect(w2After.reactions).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // 5. GET /date-windows returns proposedWindowIds
  // ---------------------------------------------------------------------------
  describe('GET /date-windows returns proposedWindowIds', () => {
    const tripId = 'trip-multi-get-1'
    const circleId = 'circle-multi-get-1'
    const leaderId = 'leader-multi-get-1'
    const memberId = 'member-multi-get-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-multi-get@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-multi-get@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Insert two proposed windows with reactions
      await db.collection('date_windows').insertMany([
        {
          id: 'mg-w1',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          reactions: [
            { userId: memberId, userName: 'Member', reactionType: 'WORKS', createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        },
        {
          id: 'mg-w2',
          tripId,
          proposedBy: leaderId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          reactions: [
            { userId: memberId, userName: 'Member', reactionType: 'CANT', createdAt: new Date().toISOString() }
          ],
          createdAt: new Date().toISOString()
        }
      ])

      // Set trip to PROPOSED phase with multi-window proposal
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            proposedWindowId: 'mg-w1',
            proposedWindowIds: ['mg-w1', 'mg-w2'],
            proposedAt: new Date().toISOString(),
            proposedWindowReactions: []
          }
        }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should return proposedWindowIds array in response', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.proposedWindowIds).toBeDefined()
      expect(data.proposedWindowIds).toEqual(['mg-w1', 'mg-w2'])
      expect(data.proposedWindowId).toBe('mg-w1')
      expect(data.phase).toBe('PROPOSED')
    })

    it('should return approvalSummaries keyed by window ID', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.approvalSummaries).toBeDefined()

      // w1 has a WORKS reaction
      expect(data.approvalSummaries['mg-w1']).toBeDefined()
      expect(data.approvalSummaries['mg-w1'].approvals).toBe(1)
      expect(data.approvalSummaries['mg-w1'].cants).toBe(0)
      expect(data.approvalSummaries['mg-w1'].userReaction).toBe('WORKS')

      // w2 has a CANT reaction
      expect(data.approvalSummaries['mg-w2']).toBeDefined()
      expect(data.approvalSummaries['mg-w2'].approvals).toBe(0)
      expect(data.approvalSummaries['mg-w2'].cants).toBe(1)
      expect(data.approvalSummaries['mg-w2'].userReaction).toBe('CANT')
    })
  })
})
