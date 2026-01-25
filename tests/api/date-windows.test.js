import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

describe('Date Windows API - Date Locking Funnel V2', () => {
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
      inviteCode: 'TEST123',
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

  describe('GET /api/trips/:tripId/date-windows', () => {
    const tripId = 'trip-get-windows-1'
    const circleId = 'circle-get-windows-1'
    const leaderId = 'leader-get-windows-1'
    const memberId = 'member-get-windows-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-get@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-get@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should return empty windows array for new trip', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.phase).toBe('COLLECTING')
      expect(data.windows).toEqual([])
      expect(data.proposalStatus).toBeDefined()
      expect(data.proposalStatus.proposalReady).toBe(false)
    })

    it('should return windows with support counts', async () => {
      // Add a window
      await db.collection('date_windows').insertOne({
        id: 'window-1',
        tripId,
        proposedBy: memberId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
      await db.collection('window_supports').insertOne({
        id: 'support-1',
        windowId: 'window-1',
        tripId,
        userId: memberId,
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.windows).toHaveLength(1)
      expect(data.windows[0].supportCount).toBe(1)
      expect(data.windows[0].supporterIds).toContain(memberId)
    })

    it('should identify leader correctly', async () => {
      const leaderToken = createToken(leaderId)
      const memberToken = createToken(memberId)

      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)

      const leaderRequest = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${leaderToken}` }
      })
      const leaderResponse = await GET(leaderRequest, { params: { path: ['trips', tripId, 'date-windows'] } })
      const leaderData = await leaderResponse.json()
      expect(leaderData.isLeader).toBe(true)

      const memberRequest = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${memberToken}` }
      })
      const memberResponse = await GET(memberRequest, { params: { path: ['trips', tripId, 'date-windows'] } })
      const memberData = await memberResponse.json()
      expect(memberData.isLeader).toBe(false)
    })
  })

  describe('POST /api/trips/:tripId/date-windows', () => {
    const tripId = 'trip-post-windows-1'
    const circleId = 'circle-post-windows-1'
    const leaderId = 'leader-post-windows-1'
    const memberId = 'member-post-windows-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-post@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-post@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should create a new window and auto-support it', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-10',
          endDate: '2025-03-15'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.window).toBeDefined()
      expect(data.window.startDate).toBe('2025-03-10')
      expect(data.window.endDate).toBe('2025-03-15')

      // Verify auto-support
      const supports = await db.collection('window_supports').find({ windowId: data.window.id }).toArray()
      expect(supports).toHaveLength(1)
      expect(supports[0].userId).toBe(memberId)
    })

    it('should reject invalid date format', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: 'March 10, 2025',
          endDate: '2025-03-15'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(400)
    })

    it('should reject when start date is after end date', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-20',
          endDate: '2025-03-15'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(400)
    })

    it('should block window creation when proposal is active', async () => {
      // Set proposed window
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { proposedWindowId: 'some-window' } }
      )

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-10',
          endDate: '2025-03-15'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('proposal is active')
    })
  })

  describe('POST /api/trips/:tripId/propose-dates', () => {
    const tripId = 'trip-propose-1'
    const circleId = 'circle-propose-1'
    const leaderId = 'leader-propose-1'
    const memberId = 'member-propose-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-propose@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-propose@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Add a window with support
      await db.collection('date_windows').insertOne({
        id: 'window-propose-1',
        tripId,
        proposedBy: memberId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
      await db.collection('window_supports').insertOne({
        id: 'support-propose-1',
        windowId: 'window-propose-1',
        tripId,
        userId: memberId,
        createdAt: new Date().toISOString()
      })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
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
          windowId: 'window-propose-1'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(403)
    })

    it('should allow leader to propose with override when threshold not met', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'window-propose-1',
          leaderOverride: true
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.message).toBe('Dates proposed')

      // Verify trip updated
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBe('window-propose-1')
    })

    it('should reject proposal without override when threshold not met', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'window-propose-1',
          leaderOverride: false
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Not enough travelers')
    })
  })

  describe('POST /api/trips/:tripId/withdraw-proposal', () => {
    const tripId = 'trip-withdraw-1'
    const circleId = 'circle-withdraw-1'
    const leaderId = 'leader-withdraw-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-withdraw@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Set up a proposed window
      await db.collection('date_windows').insertOne({
        id: 'window-withdraw-1',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { proposedWindowId: 'window-withdraw-1' } }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId] })
    })

    it('should allow leader to withdraw proposal', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })
      expect(response.status).toBe(200)

      // Verify trip updated
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBeUndefined()
    })

    it('should reject withdrawal when no proposal exists', async () => {
      // Remove proposal first
      await db.collection('trips').updateOne(
        { id: tripId },
        { $unset: { proposedWindowId: '' } }
      )

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('No date proposal')
    })
  })

  describe('POST /api/trips/:tripId/lock-proposed', () => {
    const tripId = 'trip-lock-proposed-1'
    const circleId = 'circle-lock-proposed-1'
    const leaderId = 'leader-lock-proposed-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-lock@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Set up a proposed window
      await db.collection('date_windows').insertOne({
        id: 'window-lock-1',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { proposedWindowId: 'window-lock-1' } }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId] })
    })

    it('should lock dates from proposed window', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/lock-proposed`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.status).toBe('locked')
      expect(data.lockedStartDate).toBe('2025-03-10')
      expect(data.lockedEndDate).toBe('2025-03-15')
    })

    it('should reject lock when no proposal exists', async () => {
      // Remove proposal
      await db.collection('trips').updateOne(
        { id: tripId },
        { $unset: { proposedWindowId: '' } }
      )

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/lock-proposed`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('No dates are proposed')
    })

    it('should reject lock from non-leader', async () => {
      await createTestUser({ id: 'member-lock-1', name: 'Member', email: 'member-lock@test.com' })
      await addMembership({ userId: 'member-lock-1', circleId })

      const token = createToken('member-lock-1')
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/lock-proposed`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(403)

      // Cleanup extra user
      await db.collection('users').deleteOne({ id: 'member-lock-1' })
    })
  })

  describe('Per-user window cap enforcement', () => {
    const tripId = 'trip-cap-1'
    const circleId = 'circle-cap-1'
    const leaderId = 'leader-cap-1'
    const memberId = 'member-cap-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-cap@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-cap@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should return userWindowCount and maxWindows in GET response', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.userWindowCount).toBe(0)
      expect(data.maxWindows).toBe(2)
      expect(data.canCreateWindow).toBe(true)
    })

    it('should allow first window creation', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-10',
          endDate: '2025-03-15'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)
    })

    it('should allow second window creation', async () => {
      // Create first window
      await db.collection('date_windows').insertOne({
        id: 'first-window',
        tripId,
        proposedBy: memberId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-20',
          endDate: '2025-03-25'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)
    })

    it('should reject third window creation (cap of 2)', async () => {
      // Create two existing windows
      await db.collection('date_windows').insertMany([
        {
          id: 'first-window',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          createdAt: new Date().toISOString()
        },
        {
          id: 'second-window',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          createdAt: new Date().toISOString()
        }
      ])

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-28',
          endDate: '2025-03-30'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.code).toBe('USER_WINDOW_CAP_REACHED')
      expect(data.userWindowCount).toBe(2)
      expect(data.maxWindows).toBe(2)
    })

    it('should track caps per user (other users can still create)', async () => {
      // Member already has 2 windows
      await db.collection('date_windows').insertMany([
        {
          id: 'member-window-1',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-10',
          endDate: '2025-03-15',
          createdAt: new Date().toISOString()
        },
        {
          id: 'member-window-2',
          tripId,
          proposedBy: memberId,
          startDate: '2025-03-20',
          endDate: '2025-03-25',
          createdAt: new Date().toISOString()
        }
      ])

      // Leader should still be able to create windows
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-05',
          endDate: '2025-03-08'
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)
    })
  })

  describe('Overlap detection and similarity nudge', () => {
    const tripId = 'trip-overlap-1'
    const circleId = 'circle-overlap-1'
    const leaderId = 'leader-overlap-1'
    const memberId = 'member-overlap-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-overlap@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-overlap@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should detect similar window and return similarWindowId', async () => {
      // Create an existing window
      await db.collection('date_windows').insertOne({
        id: 'existing-window',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        normalizedStart: '2025-03-10',
        normalizedEnd: '2025-03-15',
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-11',
          endDate: '2025-03-14' // Fully contained in existing window
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.similarWindowId).toBe('existing-window')
      expect(data.similarScore).toBeGreaterThanOrEqual(0.6)
    })

    it('should not flag similarity for non-overlapping windows', async () => {
      // Create an existing window
      await db.collection('date_windows').insertOne({
        id: 'existing-window',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-01',
        endDate: '2025-03-05',
        normalizedStart: '2025-03-01',
        normalizedEnd: '2025-03-05',
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-20',
          endDate: '2025-03-25' // No overlap
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.similarWindowId).toBeUndefined()
      expect(data.similarScore).toBeUndefined()
    })

    it('should still create window even with overlap (user can ignore nudge)', async () => {
      // Create an existing window
      await db.collection('date_windows').insertOne({
        id: 'existing-window',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        normalizedStart: '2025-03-10',
        normalizedEnd: '2025-03-15',
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate: '2025-03-10',
          endDate: '2025-03-15' // Identical
        })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      // Window was still created
      expect(data.window).toBeDefined()
      expect(data.window.id).toBeDefined()
      // But similarity was flagged
      expect(data.similarWindowId).toBe('existing-window')
    })
  })

  describe('Leader backtracking after threshold met', () => {
    const tripId = 'trip-backtrack-1'
    const circleId = 'circle-backtrack-1'
    const leaderId = 'leader-backtrack-1'
    const member1Id = 'member1-backtrack-1'
    const member2Id = 'member2-backtrack-1'
    const member3Id = 'member3-backtrack-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-backtrack@test.com' })
      await createTestUser({ id: member1Id, name: 'Member1', email: 'member1-backtrack@test.com' })
      await createTestUser({ id: member2Id, name: 'Member2', email: 'member2-backtrack@test.com' })
      await createTestUser({ id: member3Id, name: 'Member3', email: 'member3-backtrack@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: member1Id, circleId })
      await addMembership({ userId: member2Id, circleId })
      await addMembership({ userId: member3Id, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Create a window with enough support to meet threshold (3 of 4 = majority)
      await db.collection('date_windows').insertOne({
        id: 'threshold-window',
        tripId,
        proposedBy: member1Id,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
      await db.collection('window_supports').insertMany([
        { id: 'support-1', windowId: 'threshold-window', tripId, userId: member1Id, createdAt: new Date().toISOString() },
        { id: 'support-2', windowId: 'threshold-window', tripId, userId: member2Id, createdAt: new Date().toISOString() },
        { id: 'support-3', windowId: 'threshold-window', tripId, userId: member3Id, createdAt: new Date().toISOString() }
      ])

      // Set up proposed state
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { proposedWindowId: 'threshold-window' } }
      )
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, member1Id, member2Id, member3Id] })
    })

    it('should allow leader to withdraw even after threshold is met', async () => {
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })
      expect(response.status).toBe(200)

      // Verify trip is back to COLLECTING phase
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBeUndefined()
    })

    it('should allow leader to change proposal to different window', async () => {
      // Create another window
      await db.collection('date_windows').insertOne({
        id: 'alternative-window',
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-20',
        endDate: '2025-03-25',
        createdAt: new Date().toISOString()
      })

      // Withdraw current proposal
      const withdrawToken = createToken(leaderId)
      const withdrawUrl = new URL(`http://localhost:3000/api/trips/${tripId}/withdraw-proposal`)
      const withdrawRequest = new NextRequest(withdrawUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${withdrawToken}` }
      })
      await POST(withdrawRequest, { params: { path: ['trips', tripId, 'withdraw-proposal'] } })

      // Propose new window (with override since alternative doesn't have enough support)
      const proposeToken = createToken(leaderId)
      const proposeUrl = new URL(`http://localhost:3000/api/trips/${tripId}/propose-dates`)
      const proposeRequest = new NextRequest(proposeUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${proposeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          windowId: 'alternative-window',
          leaderOverride: true
        })
      })

      const response = await POST(proposeRequest, { params: { path: ['trips', tripId, 'propose-dates'] } })
      expect(response.status).toBe(200)

      // Verify new window is proposed
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.proposedWindowId).toBe('alternative-window')
    })

    it('should show proposalReady as true when threshold is met', async () => {
      // First withdraw to get back to COLLECTING
      await db.collection('trips').updateOne(
        { id: tripId },
        { $unset: { proposedWindowId: '' } }
      )

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'date-windows'] } })
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.proposalStatus.proposalReady).toBe(true)
      expect(data.proposalStatus.leadingWindow.id).toBe('threshold-window')
      expect(data.proposalStatus.stats.leaderCount).toBe(3)
    })
  })

  describe('Window support endpoints', () => {
    const tripId = 'trip-support-1'
    const circleId = 'circle-support-1'
    const leaderId = 'leader-support-1'
    const memberId = 'member-support-1'
    const windowId = 'window-support-1'

    beforeEach(async () => {
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader-support@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member-support@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId })
      await createTestTrip({ id: tripId, circleId, createdBy: leaderId })

      // Add a window
      await db.collection('date_windows').insertOne({
        id: windowId,
        tripId,
        proposedBy: leaderId,
        startDate: '2025-03-10',
        endDate: '2025-03-15',
        createdAt: new Date().toISOString()
      })
    })

    afterEach(async () => {
      await cleanupTestData({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('should add support to a window', async () => {
      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows/${windowId}/support`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows', windowId, 'support'] } })
      expect(response.status).toBe(200)

      // Verify support added
      const support = await db.collection('window_supports').findOne({ windowId, userId: memberId })
      expect(support).toBeDefined()
    })

    it('should reject duplicate support', async () => {
      // Add support first
      await db.collection('window_supports').insertOne({
        id: 'existing-support',
        windowId,
        tripId,
        userId: memberId,
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows/${windowId}/support`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows', windowId, 'support'] } })
      expect(response.status).toBe(400)
    })

    it('should remove support from a window', async () => {
      // Add support first
      await db.collection('window_supports').insertOne({
        id: 'support-to-remove',
        windowId,
        tripId,
        userId: memberId,
        createdAt: new Date().toISOString()
      })

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows/${windowId}/support`)
      const request = new NextRequest(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await DELETE(request, { params: { path: ['trips', tripId, 'date-windows', windowId, 'support'] } })
      expect(response.status).toBe(200)

      // Verify support removed
      const support = await db.collection('window_supports').findOne({ windowId, userId: memberId })
      expect(support).toBeNull()
    })

    it('should block support changes when proposal is active', async () => {
      // Set proposed window
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { proposedWindowId: windowId } }
      )

      const token = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/date-windows/${windowId}/support`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'date-windows', windowId, 'support'] } })
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('proposal is active')
    })
  })
})
