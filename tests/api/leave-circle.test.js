/**
 * API tests for leave circle functionality
 *
 * Tests:
 * - POST /api/circles/:circleId/leave
 * - Rejoin via POST /api/circles/join
 * - Past-trip visibility after leaving
 *
 * Verifies:
 * - Owner cannot leave (403)
 * - Member with active trips gets 409 + blocking trip list
 * - Member with no active trips can leave (200)
 * - Left member doesn't appear in circle member lists
 * - Left member can still view completed trips
 * - Rejoin via invite code reactivates membership
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

let GET, POST

describe('Leave Circle API', () => {
  let client
  let db

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    const module = await import('@/app/api/[[...path]]/route.js')
    GET = module.GET
    POST = module.POST
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  // Helpers
  async function createTestUser({ id, name, email }) {
    const user = { id, name, email, createdAt: new Date().toISOString() }
    await db.collection('users').insertOne(user)
    return user
  }

  async function createTestCircle({ id, ownerId, inviteCode = 'INVITE1' }) {
    const circle = {
      id,
      name: 'Test Circle',
      ownerId,
      inviteCode,
      createdAt: new Date().toISOString()
    }
    await db.collection('circles').insertOne(circle)
    return circle
  }

  async function addMembership({ userId, circleId, role = 'member' }) {
    await db.collection('memberships').insertOne({
      userId,
      circleId,
      role,
      joinedAt: new Date().toISOString()
    })
  }

  async function createTestTrip({ ownerId, circleId, status = 'proposed', type = 'collaborative' }) {
    const trip = {
      id: `trip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: 'Test Trip',
      circleId,
      createdBy: ownerId,
      type,
      status,
      startDate: '2025-06-01',
      endDate: '2025-06-05'
    }
    await db.collection('trips').insertOne(trip)
    return trip
  }

  async function cleanup({ circleId, userIds = [], tripIds = [] }) {
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('users').deleteMany({ id: { $in: userIds } })
    await db.collection('memberships').deleteMany({ circleId })
    for (const tripId of tripIds) {
      await db.collection('trips').deleteMany({ id: tripId })
      await db.collection('trip_participants').deleteMany({ tripId })
    }
  }

  function makeLeaveRequest(circleId, token) {
    const url = new URL(`http://localhost:3000/api/circles/${circleId}/leave`)
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
  }

  describe('POST /api/circles/:circleId/leave', () => {
    it('should return 401 when not authenticated', async () => {
      const url = new URL('http://localhost:3000/api/circles/some-circle/leave')
      const request = new NextRequest(url, { method: 'POST' })
      const response = await POST(request, { params: { path: ['circles', 'some-circle', 'leave'] } })
      expect(response.status).toBe(401)
    })

    it('should return 403 when owner tries to leave', async () => {
      const ownerId = 'owner-leave-1'
      const circleId = 'circle-leave-owner'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })

      const token = createToken(ownerId)
      const request = makeLeaveRequest(circleId, token)
      const response = await POST(request, { params: { path: ['circles', circleId, 'leave'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Circle owners cannot leave')

      await cleanup({ circleId, userIds: [ownerId] })
    })

    it('should return 409 when member has active trips', async () => {
      const ownerId = 'owner-leave-2'
      const memberId = 'member-leave-2'
      const circleId = 'circle-leave-active'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'owner2@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member2@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      // Create an active trip (proposed status)
      const trip = await createTestTrip({ ownerId, circleId, status: 'proposed' })

      const token = createToken(memberId)
      const request = makeLeaveRequest(circleId, token)
      const response = await POST(request, { params: { path: ['circles', circleId, 'leave'] } })

      expect(response.status).toBe(409)
      const data = await response.json()
      expect(data.error).toContain('active trips')
      expect(data.blockingTrips).toHaveLength(1)
      expect(data.blockingTrips[0].id).toBe(trip.id)

      await cleanup({ circleId, userIds: [ownerId, memberId], tripIds: [trip.id] })
    })

    it('should return 200 when member has no active trips', async () => {
      const ownerId = 'owner-leave-3'
      const memberId = 'member-leave-3'
      const circleId = 'circle-leave-ok'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'owner3@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member3@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      const token = createToken(memberId)
      const request = makeLeaveRequest(circleId, token)
      const response = await POST(request, { params: { path: ['circles', circleId, 'leave'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)

      // Verify membership is soft-deleted
      const membership = await db.collection('memberships').findOne({
        userId: memberId,
        circleId
      })
      expect(membership.status).toBe('left')
      expect(membership.leftAt).toBeDefined()

      await cleanup({ circleId, userIds: [ownerId, memberId] })
    })

    it('should allow leaving when only completed/canceled trips exist', async () => {
      const ownerId = 'owner-leave-4'
      const memberId = 'member-leave-4'
      const circleId = 'circle-leave-completed'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'owner4@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member4@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      const completedTrip = await createTestTrip({ ownerId, circleId, status: 'completed' })
      const canceledTrip = await createTestTrip({ ownerId, circleId, status: 'canceled' })

      const token = createToken(memberId)
      const request = makeLeaveRequest(circleId, token)
      const response = await POST(request, { params: { path: ['circles', circleId, 'leave'] } })

      expect(response.status).toBe(200)

      await cleanup({ circleId, userIds: [ownerId, memberId], tripIds: [completedTrip.id, canceledTrip.id] })
    })

    it('should return 404 when not a member', async () => {
      const userId = 'nonmember-leave'
      const ownerId = 'owner-leave-5'
      const circleId = 'circle-leave-nonmember'

      await createTestUser({ id: userId, name: 'NonMember', email: 'nonmember@test.com' })
      await createTestUser({ id: ownerId, name: 'Owner', email: 'owner5@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })

      const token = createToken(userId)
      const request = makeLeaveRequest(circleId, token)
      const response = await POST(request, { params: { path: ['circles', circleId, 'leave'] } })

      expect(response.status).toBe(404)

      await cleanup({ circleId, userIds: [userId, ownerId] })
    })
  })

  describe('Left member is excluded from member lists', () => {
    it('should not include left member in circle detail member list', async () => {
      const ownerId = 'owner-memberlist-1'
      const memberId = 'member-memberlist-1'
      const circleId = 'circle-memberlist'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'ownerml@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'memberml@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      // Leave the circle
      const leaveToken = createToken(memberId)
      const leaveRequest = makeLeaveRequest(circleId, leaveToken)
      await POST(leaveRequest, { params: { path: ['circles', circleId, 'leave'] } })

      // Fetch circle detail as owner
      const ownerToken = createToken(ownerId)
      const url = new URL(`http://localhost:3000/api/circles/${circleId}`)
      const getRequest = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${ownerToken}` }
      })
      const response = await GET(getRequest, { params: { path: ['circles', circleId] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      const memberIds = data.members.map(m => m.id)
      expect(memberIds).toContain(ownerId)
      expect(memberIds).not.toContain(memberId)

      await cleanup({ circleId, userIds: [ownerId, memberId] })
    })
  })

  describe('Past trip visibility for former members', () => {
    it('should allow former member to view completed trip', async () => {
      const ownerId = 'owner-past-1'
      const memberId = 'member-past-1'
      const circleId = 'circle-past-trip'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'ownerpast@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'memberpast@test.com' })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      const completedTrip = await createTestTrip({ ownerId, circleId, status: 'completed' })

      // Leave the circle
      const leaveToken = createToken(memberId)
      const leaveRequest = makeLeaveRequest(circleId, leaveToken)
      await POST(leaveRequest, { params: { path: ['circles', circleId, 'leave'] } })

      // Try to view the completed trip as former member
      const memberToken = createToken(memberId)
      const url = new URL(`http://localhost:3000/api/trips/${completedTrip.id}`)
      const getRequest = new NextRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${memberToken}` }
      })
      const response = await GET(getRequest, { params: { path: ['trips', completedTrip.id] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.viewer.isFormerMember).toBe(true)
      expect(data.viewer.isActiveParticipant).toBe(false)

      await cleanup({ circleId, userIds: [ownerId, memberId], tripIds: [completedTrip.id] })
    })
  })

  describe('Rejoin via invite code', () => {
    it('should reactivate left membership on rejoin', async () => {
      const ownerId = 'owner-rejoin-1'
      const memberId = 'member-rejoin-1'
      const circleId = 'circle-rejoin'

      await createTestUser({ id: ownerId, name: 'Owner', email: 'ownerrejoin@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'memberrejoin@test.com' })
      await createTestCircle({ id: circleId, ownerId, inviteCode: 'REJOIN1' })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })

      // Leave the circle
      const leaveToken = createToken(memberId)
      const leaveRequest = makeLeaveRequest(circleId, leaveToken)
      await POST(leaveRequest, { params: { path: ['circles', circleId, 'leave'] } })

      // Verify left
      let membership = await db.collection('memberships').findOne({ userId: memberId, circleId })
      expect(membership.status).toBe('left')

      // Rejoin via invite code
      const joinUrl = new URL('http://localhost:3000/api/circles/join')
      const joinRequest = new NextRequest(joinUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaveToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inviteCode: 'REJOIN1' })
      })
      const joinResponse = await POST(joinRequest, { params: { path: ['circles', 'join'] } })

      expect(joinResponse.status).toBe(200)

      // Verify reactivated
      membership = await db.collection('memberships').findOne({ userId: memberId, circleId })
      expect(membership.status).toBeUndefined()
      expect(membership.rejoinedAt).toBeDefined()

      await cleanup({ circleId, userIds: [ownerId, memberId] })
    })
  })
})
