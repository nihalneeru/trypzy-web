/**
 * API tests for leadership transfer endpoints
 *
 * Tests:
 * - POST /api/trips/:tripId/transfer-leadership (initiate pending transfer)
 * - POST /api/trips/:tripId/transfer-leadership/accept
 * - POST /api/trips/:tripId/transfer-leadership/decline
 * - POST /api/trips/:tripId/transfer-leadership/cancel
 *
 * Verifies:
 * - Authentication required
 * - Pending transfer workflow
 * - Only one pending transfer at a time
 * - Accept/decline by recipient only
 * - Cancel by initiator only
 * - Leadership can be transferred multiple times
 */

import { MongoClient } from 'mongodb'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

// Use test database
const TEST_DB_NAME = 'trypzy_test'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Import route handlers
let GET, POST

describe('Transfer Leadership API', () => {
  let client
  let db

  beforeAll(async () => {
    // Setup test database
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    // Import route handlers after env vars are set
    const module = await import('@/app/api/[[...path]]/route.js')
    GET = module.GET
    POST = module.POST
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  // Helper to create test data
  async function createTestTrip({ ownerId, circleId, type = 'collaborative', status = 'proposed' }) {
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

  async function createTestUser({ id, name, email }) {
    const user = {
      id,
      name,
      email,
      createdAt: new Date().toISOString()
    }

    await db.collection('users').insertOne(user)
    return user
  }

  async function createTestCircle({ id, ownerId }) {
    const circle = {
      id,
      name: 'Test Circle',
      ownerId,
      inviteCode: 'TEST123',
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

  async function addParticipant({ tripId, userId, status = 'active' }) {
    await db.collection('trip_participants').insertOne({
      id: `participant-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      tripId,
      userId,
      status,
      joinedAt: new Date().toISOString()
    })
  }

  async function cleanupTestData({ tripId, circleId, userIds = [] }) {
    await db.collection('trips').deleteMany({ id: tripId })
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('users').deleteMany({ id: { $in: userIds } })
    await db.collection('memberships').deleteMany({ circleId })
    await db.collection('trip_participants').deleteMany({ tripId })
    await db.collection('chat_events').deleteMany({ tripId })
  }

  describe('POST /api/trips/:tripId/transfer-leadership (initiate)', () => {
    it('should return 401 when not authenticated', async () => {
      const tripId = 'trip-transfer-noauth'

      const url = new URL(`http://localhost:3000/api/trips/${tripId}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newLeaderId: 'some-user' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'transfer-leadership'] } })

      expect(response.status).toBe(401)
    })

    it('should return 400 when newLeaderId is not provided', async () => {
      const leaderId = 'leader-transfer-noid'
      const circleId = 'circle-transfer-noid'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('newLeaderId is required')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should return 404 when trip not found', async () => {
      const leaderId = 'leader-transfer-404'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })

      const token = createToken(leaderId)
      const url = new URL('http://localhost:3000/api/trips/nonexistent-trip/transfer-leadership')
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: 'some-user' })
      })

      const response = await POST(request, { params: { path: ['trips', 'nonexistent-trip', 'transfer-leadership'] } })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('Trip not found')

      await db.collection('users').deleteMany({ id: leaderId })
    })

    it('should return 403 when non-leader tries to initiate transfer', async () => {
      const leaderId = 'leader-transfer-perm'
      const travelerId = 'traveler-transfer-perm'
      const circleId = 'circle-transfer-perm'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })

      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: leaderId })
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Only the trip leader can transfer leadership')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should return 400 when leader tries to transfer to themselves', async () => {
      const leaderId = 'leader-transfer-self'
      const circleId = 'circle-transfer-self'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addParticipant({ tripId: trip.id, userId: leaderId })

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: leaderId })
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Cannot transfer leadership to yourself')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should return 403 when new leader is not an active traveler', async () => {
      const leaderId = 'leader-transfer-inactive'
      const outsiderId = 'outsider-transfer'
      const circleId = 'circle-transfer-inactive'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: outsiderId, name: 'Outsider', email: 'outsider@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      // outsiderId is NOT a circle member at all

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: outsiderId })
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('New leader must be an active traveler')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, outsiderId] })
    })

    it('should create pending transfer when valid', async () => {
      const leaderId = 'leader-transfer-pending'
      const travelerId = 'traveler-transfer-pending'
      const circleId = 'circle-transfer-pending'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: travelerId })
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toContain('Waiting for acceptance')
      expect(data.pendingLeadershipTransfer).toBeDefined()
      expect(data.pendingLeadershipTransfer.toUserId).toBe(travelerId)
      expect(data.pendingLeadershipTransfer.fromUserId).toBe(leaderId)

      // Verify trip still has original leader
      const updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(leaderId)
      expect(updatedTrip.pendingLeadershipTransfer).toBeDefined()

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should return 400 when pending transfer already exists', async () => {
      const leaderId = 'leader-transfer-dup'
      const travelerId = 'traveler-transfer-dup'
      const traveler2Id = 'traveler2-transfer-dup'
      const circleId = 'circle-transfer-dup'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestUser({ id: traveler2Id, name: 'Traveler2', email: 'traveler2@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addMembership({ userId: traveler2Id, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      await addParticipant({ tripId: trip.id, userId: traveler2Id })

      // Create pending transfer
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: traveler2Id })
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('already pending')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId, traveler2Id] })
    })
  })

  describe('POST /api/trips/:tripId/transfer-leadership/accept', () => {
    it('should return 400 when no pending transfer exists', async () => {
      const leaderId = 'leader-accept-none'
      const travelerId = 'traveler-accept-none'
      const circleId = 'circle-accept-none'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })

      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('No pending leadership transfer')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should return 403 when non-recipient tries to accept', async () => {
      const leaderId = 'leader-accept-wrong'
      const travelerId = 'traveler-accept-wrong'
      const otherId = 'other-accept-wrong'
      const circleId = 'circle-accept-wrong'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestUser({ id: otherId, name: 'Other', email: 'other@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addMembership({ userId: otherId, circleId, role: 'member' })

      // Create pending transfer to travelerId
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      // otherId tries to accept
      const token = createToken(otherId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Only the intended recipient')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId, otherId] })
    })

    it('should successfully transfer leadership on accept', async () => {
      const leaderId = 'leader-accept-success'
      const travelerId = 'traveler-accept-success'
      const circleId = 'circle-accept-success'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })

      // Create pending transfer
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toContain('accepted')
      expect(data.newLeaderId).toBe(travelerId)

      // Verify trip has new leader and no pending transfer
      const updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(travelerId)
      expect(updatedTrip.pendingLeadershipTransfer).toBeUndefined()

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })
  })

  describe('POST /api/trips/:tripId/transfer-leadership/decline', () => {
    it('should return 400 when no pending transfer exists', async () => {
      const leaderId = 'leader-decline-none'
      const travelerId = 'traveler-decline-none'
      const circleId = 'circle-decline-none'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/decline`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'decline'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('No pending leadership transfer')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should return 403 when non-recipient tries to decline', async () => {
      const leaderId = 'leader-decline-wrong'
      const travelerId = 'traveler-decline-wrong'
      const otherId = 'other-decline-wrong'
      const circleId = 'circle-decline-wrong'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestUser({ id: otherId, name: 'Other', email: 'other@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      // Create pending transfer to travelerId
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      // otherId tries to decline
      const token = createToken(otherId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/decline`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'decline'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Only the intended recipient')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId, otherId] })
    })

    it('should clear pending transfer on decline', async () => {
      const leaderId = 'leader-decline-success'
      const travelerId = 'traveler-decline-success'
      const circleId = 'circle-decline-success'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      // Create pending transfer
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/decline`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'decline'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toContain('declined')

      // Verify trip still has original leader and no pending transfer
      const updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(leaderId)
      expect(updatedTrip.pendingLeadershipTransfer).toBeUndefined()

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })
  })

  describe('POST /api/trips/:tripId/transfer-leadership/cancel', () => {
    it('should return 400 when no pending transfer exists', async () => {
      const leaderId = 'leader-cancel-none'
      const circleId = 'circle-cancel-none'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/cancel`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'cancel'] } })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('No pending leadership transfer')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should return 403 when non-leader tries to cancel', async () => {
      const leaderId = 'leader-cancel-wrong'
      const travelerId = 'traveler-cancel-wrong'
      const circleId = 'circle-cancel-wrong'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      // Create pending transfer
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      // travelerId tries to cancel
      const token = createToken(travelerId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/cancel`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'cancel'] } })

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('Only the trip leader')

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should clear pending transfer on cancel', async () => {
      const leaderId = 'leader-cancel-success'
      const travelerId = 'traveler-cancel-success'
      const circleId = 'circle-cancel-success'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })

      // Create pending transfer
      await db.collection('trips').updateOne(
        { id: trip.id },
        {
          $set: {
            pendingLeadershipTransfer: {
              toUserId: travelerId,
              fromUserId: leaderId,
              createdAt: new Date().toISOString()
            }
          }
        }
      )

      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/cancel`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'cancel'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toContain('canceled')

      // Verify trip still has original leader and no pending transfer
      const updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(leaderId)
      expect(updatedTrip.pendingLeadershipTransfer).toBeUndefined()

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })
  })

  describe('Multiple transfers', () => {
    it('should allow leadership to be transferred multiple times', async () => {
      const user1Id = 'user1-multi'
      const user2Id = 'user2-multi'
      const user3Id = 'user3-multi'
      const circleId = 'circle-multi'

      await createTestUser({ id: user1Id, name: 'User1', email: 'user1@test.com' })
      await createTestUser({ id: user2Id, name: 'User2', email: 'user2@test.com' })
      await createTestUser({ id: user3Id, name: 'User3', email: 'user3@test.com' })
      await createTestCircle({ id: circleId, ownerId: user1Id })
      const trip = await createTestTrip({ ownerId: user1Id, circleId })
      await addMembership({ userId: user1Id, circleId, role: 'owner' })
      await addMembership({ userId: user2Id, circleId, role: 'member' })
      await addMembership({ userId: user3Id, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: user1Id })
      await addParticipant({ tripId: trip.id, userId: user2Id })
      await addParticipant({ tripId: trip.id, userId: user3Id })

      // First transfer: user1 -> user2
      let token = createToken(user1Id)
      let url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      let request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: user2Id })
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      // user2 accepts
      token = createToken(user2Id)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      // Verify user2 is now leader
      let updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(user2Id)

      // Second transfer: user2 -> user3
      token = createToken(user2Id)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: user3Id })
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      // user3 accepts
      token = createToken(user3Id)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      // Verify user3 is now leader
      updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(user3Id)

      // Third transfer: user3 -> user1 (back to original)
      token = createToken(user3Id)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: user1Id })
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      // user1 accepts
      token = createToken(user1Id)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      expect(response.status).toBe(200)

      // Verify user1 is leader again
      updatedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(updatedTrip.createdBy).toBe(user1Id)

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [user1Id, user2Id, user3Id] })
    })

    it('should allow new leader to initiate transfer after accepting', async () => {
      const leaderId = 'leader-chain'
      const travelerId = 'traveler-chain'
      const traveler2Id = 'traveler2-chain'
      const circleId = 'circle-chain'

      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestUser({ id: traveler2Id, name: 'Traveler2', email: 'traveler2@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      await addMembership({ userId: traveler2Id, circleId, role: 'member' })
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      await addParticipant({ tripId: trip.id, userId: traveler2Id })

      // First: leader initiates transfer to traveler
      let token = createToken(leaderId)
      let url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      let request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: travelerId })
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      // traveler accepts
      token = createToken(travelerId)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership/accept`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      })
      await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership', 'accept'] } })

      // Now traveler (new leader) can initiate transfer to traveler2
      token = createToken(travelerId)
      url = new URL(`http://localhost:3000/api/trips/${trip.id}/transfer-leadership`)
      request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newLeaderId: traveler2Id })
      })
      const response = await POST(request, { params: { path: ['trips', trip.id, 'transfer-leadership'] } })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.pendingLeadershipTransfer.toUserId).toBe(traveler2Id)
      expect(data.pendingLeadershipTransfer.fromUserId).toBe(travelerId)

      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId, traveler2Id] })
    })
  })
})
