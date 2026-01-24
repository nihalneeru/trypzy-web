/**
 * Integration tests for trip cancellation (terminal read-only state)
 *
 * Endpoints tested:
 * - POST /api/trips/:id/cancel (leader cancels active trip)
 * - POST /api/trips/:id/messages (blocked on cancelled trips)
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

let POST

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

describe('Trip Cancellation', () => {
  let client
  let db

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    const module = await import('@/app/api/[[...path]]/route.js')
    POST = module.POST
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  async function createUser({ id, name, email }) {
    await db.collection('users').insertOne({
      id,
      name,
      email,
      createdAt: new Date().toISOString()
    })
  }

  async function createCircle({ id, ownerId }) {
    await db.collection('circles').insertOne({
      id,
      name: 'Test Circle',
      ownerId,
      inviteCode: `CODE-${id}`,
      createdAt: new Date().toISOString()
    })
  }

  async function addMembership({ userId, circleId, role = 'member' }) {
    await db.collection('memberships').insertOne({
      userId,
      circleId,
      role,
      joinedAt: new Date().toISOString()
    })
  }

  async function createTrip({ id, circleId, createdBy, tripStatus = 'ACTIVE', status = 'proposed' }) {
    await db.collection('trips').insertOne({
      id,
      circleId,
      name: 'Test Trip',
      type: 'collaborative',
      tripStatus,
      status,
      createdBy,
      createdAt: new Date().toISOString()
    })
  }

  async function cleanup({ tripId, circleId, userIds = [] }) {
    if (tripId) {
      await db.collection('trips').deleteMany({ id: tripId })
      await db.collection('trip_participants').deleteMany({ tripId })
      await db.collection('trip_messages').deleteMany({ tripId })
    }
    if (circleId) {
      await db.collection('circles').deleteMany({ id: circleId })
      await db.collection('memberships').deleteMany({ circleId })
    }
    if (userIds.length) {
      await db.collection('users').deleteMany({ id: { $in: userIds } })
    }
  }

  describe('POST /api/trips/:id/cancel', () => {
    it('requires authentication', async () => {
      const request = new NextRequest('http://localhost:3000/api/trips/trip-1/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const response = await POST(request, { params: { path: ['trips', 'trip-1', 'cancel'] } })
      expect(response.status).toBe(401)
    })

    it('allows leader to cancel active trip', async () => {
      const leaderId = 'user-leader-cancel-1'
      const circleId = 'circle-cancel-1'
      const tripId = 'trip-cancel-1'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leader1@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.trip.status).toBe('canceled')
      expect(body.trip.tripStatus).toBe('CANCELLED')

      // Verify in database
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      expect(updatedTrip.tripStatus).toBe('CANCELLED')
      expect(updatedTrip.status).toBe('canceled')
      expect(updatedTrip.canceledBy).toBe(leaderId)
      expect(updatedTrip.canceledAt).toBeDefined()

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('allows circle owner to cancel trip they did not create', async () => {
      const circleOwnerId = 'user-circle-owner-1'
      const tripCreatorId = 'user-trip-creator-1'
      const circleId = 'circle-cancel-2'
      const tripId = 'trip-cancel-2'

      await cleanup({ tripId, circleId, userIds: [circleOwnerId, tripCreatorId] })

      await createUser({ id: circleOwnerId, name: 'Circle Owner', email: 'circleowner@example.com' })
      await createUser({ id: tripCreatorId, name: 'Trip Creator', email: 'tripcreator@example.com' })
      await createCircle({ id: circleId, ownerId: circleOwnerId })
      await addMembership({ userId: circleOwnerId, circleId, role: 'owner' })
      await addMembership({ userId: tripCreatorId, circleId, role: 'member' })
      await createTrip({ id: tripId, circleId, createdBy: tripCreatorId })

      const token = createToken(circleOwnerId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })
      expect(response.status).toBe(200)

      await cleanup({ tripId, circleId, userIds: [circleOwnerId, tripCreatorId] })
    })

    it('rejects non-leader from cancelling trip', async () => {
      const leaderId = 'user-leader-cancel-3'
      const memberId = 'user-member-cancel-3'
      const circleId = 'circle-cancel-3'
      const tripId = 'trip-cancel-3'

      await cleanup({ tripId, circleId, userIds: [leaderId, memberId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leader3@example.com' })
      await createUser({ id: memberId, name: 'Member', email: 'member3@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: memberId, circleId, role: 'member' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      const token = createToken(memberId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })
      expect(response.status).toBe(403)

      await cleanup({ tripId, circleId, userIds: [leaderId, memberId] })
    })

    it('rejects cancelling already cancelled trip', async () => {
      const leaderId = 'user-leader-cancel-4'
      const circleId = 'circle-cancel-4'
      const tripId = 'trip-cancel-4'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leader4@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'CANCELLED', status: 'canceled' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.code).toBe('TRIP_ALREADY_CANCELED')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('rejects cancelling completed trip', async () => {
      const leaderId = 'user-leader-cancel-5'
      const circleId = 'circle-cancel-5'
      const tripId = 'trip-cancel-5'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leader5@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'COMPLETED', status: 'completed' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.code).toBe('TRIP_ALREADY_COMPLETED')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('emits system chat message on cancellation', async () => {
      const leaderId = 'user-leader-cancel-6'
      const circleId = 'circle-cancel-6'
      const tripId = 'trip-cancel-6'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leader6@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      await POST(request, { params: { path: ['trips', tripId, 'cancel'] } })

      // Verify chat message was emitted
      const messages = await db.collection('trip_messages').find({ tripId }).toArray()
      const cancelMessage = messages.find(m => m.metadata?.key === 'trip_canceled')
      expect(cancelMessage).toBeDefined()
      expect(cancelMessage.subtype).toBe('milestone')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })
  })

  describe('POST /api/trips/:id/messages (cancelled trip)', () => {
    it('blocks messages on cancelled trips', async () => {
      const leaderId = 'user-leader-msg-1'
      const circleId = 'circle-msg-1'
      const tripId = 'trip-msg-1'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leadermsg@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'CANCELLED', status: 'canceled' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: 'Hello' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'messages'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('canceled')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('allows messages on active trips', async () => {
      const leaderId = 'user-leader-msg-2'
      const circleId = 'circle-msg-2'
      const tripId = 'trip-msg-2'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leadermsg2@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: 'Hello' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'messages'] } })
      expect(response.status).toBe(200)

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })
  })

  describe('Trip creation with tripStatus', () => {
    it('creates new trip with tripStatus = ACTIVE', async () => {
      const leaderId = 'user-leader-create-1'
      const circleId = 'circle-create-1'

      await cleanup({ circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'leadercreate@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })

      const token = createToken(leaderId)
      const request = new NextRequest('http://localhost:3000/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          circleId,
          name: 'New Trip',
          type: 'collaborative'
        })
      })

      const response = await POST(request, { params: { path: ['trips'] } })
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.tripStatus).toBe('ACTIVE')

      await cleanup({ tripId: body.id, circleId, userIds: [leaderId] })
    })
  })
})
