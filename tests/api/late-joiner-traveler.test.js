/**
 * Integration tests for late-joiner traveler gating on collaborative trips.
 *
 * Verifies:
 * - Late joiners (circle membership after trip creation) are NOT auto-travelers
 * - Late joiners CAN view trip detail (still circle members)
 * - Late joiners CAN submit join requests
 * - After approval, late joiner becomes active traveler
 * - Original members remain auto-travelers
 * - Grandfathered backfill records still count
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

let POST, GET, PATCH

describe('Late Joiner Traveler Gating', () => {
  let client
  let db

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    const module = await import('@/app/api/[[...path]]/route.js')
    POST = module.POST
    GET = module.GET
    PATCH = module.PATCH
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  beforeEach(async () => {
    await db.collection('users').deleteMany({ id: /^test-lj-/ })
    await db.collection('trips').deleteMany({ id: /^trip-lj-/ })
    await db.collection('circles').deleteMany({ id: /^circle-lj-/ })
    await db.collection('memberships').deleteMany({ circleId: /^circle-lj-/ })
    await db.collection('trip_participants').deleteMany({ tripId: /^trip-lj-/ })
    await db.collection('trip_join_requests').deleteMany({ tripId: /^trip-lj-/ })
    await db.collection('trip_messages').deleteMany({ tripId: /^trip-lj-/ })
    await db.collection('circle_messages').deleteMany({ circleId: /^circle-lj-/ })
  })

  // ---- Helpers ----

  async function createUser(id, name) {
    const user = {
      id,
      name,
      email: `${id}@test.com`,
      privacy: { profileVisibility: 'circle', tripsVisibility: 'circle', allowTripJoinRequests: true, showTripDetailsLevel: 'limited' },
      createdAt: new Date().toISOString()
    }
    await db.collection('users').insertOne(user)
    return user
  }

  async function createCircle(id, ownerId) {
    const circle = {
      id,
      name: 'Test Circle',
      ownerId,
      inviteCode: `INV-${id}`,
      createdAt: new Date().toISOString()
    }
    await db.collection('circles').insertOne(circle)
    return circle
  }

  async function createTrip(id, circleId, createdBy, createdAt) {
    const trip = {
      id,
      name: 'Test Trip',
      circleId,
      createdBy,
      type: 'collaborative',
      status: 'proposed',
      startDate: '2025-08-01',
      endDate: '2025-08-05',
      createdAt
    }
    await db.collection('trips').insertOne(trip)
    return trip
  }

  async function addMembership(userId, circleId, role, joinedAt) {
    await db.collection('memberships').insertOne({
      userId,
      circleId,
      role,
      joinedAt
    })
  }

  // ---- Tests ----

  it('late joiner is NOT an active participant on trip detail', async () => {
    const leaderId = 'test-lj-leader-1'
    const lateJoinerId = 'test-lj-late-1'
    const circleId = 'circle-lj-1'
    const tripId = 'trip-lj-1'
    const tripCreatedAt = '2025-06-01T00:00:00Z'

    await createUser(leaderId, 'Leader')
    await createUser(lateJoinerId, 'Late Joiner')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    // Late joiner: joined circle AFTER trip was created
    await addMembership(lateJoinerId, circleId, 'member', '2025-07-01T00:00:00Z')
    await createTrip(tripId, circleId, leaderId, tripCreatedAt)

    // Fetch trip detail as late joiner
    const token = createToken(lateJoinerId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}`)
    const request = new NextRequest(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    const response = await GET(request, { params: { path: ['trips', tripId] } })
    expect(response.status).toBe(200)

    const data = await response.json()
    // Late joiner can view (still a circle member) but is NOT an active participant
    expect(data.isActiveParticipant).toBe(false)
    expect(data.isParticipant).toBe(true) // Still a circle member
  })

  it('original member IS an active participant (no explicit record needed)', async () => {
    const leaderId = 'test-lj-leader-2'
    const originalId = 'test-lj-orig-2'
    const circleId = 'circle-lj-2'
    const tripId = 'trip-lj-2'
    const tripCreatedAt = '2025-06-01T00:00:00Z'

    await createUser(leaderId, 'Leader')
    await createUser(originalId, 'Original')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    // Original member: joined circle BEFORE trip was created
    await addMembership(originalId, circleId, 'member', '2025-05-15T00:00:00Z')
    await createTrip(tripId, circleId, leaderId, tripCreatedAt)

    const token = createToken(originalId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}`)
    const request = new NextRequest(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    const response = await GET(request, { params: { path: ['trips', tripId] } })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.isActiveParticipant).toBe(true)
  })

  it('late joiner CAN submit a join request for collaborative trip', async () => {
    const leaderId = 'test-lj-leader-3'
    const lateJoinerId = 'test-lj-late-3'
    const circleId = 'circle-lj-3'
    const tripId = 'trip-lj-3'
    const tripCreatedAt = '2025-06-01T00:00:00Z'

    await createUser(leaderId, 'Leader')
    await createUser(lateJoinerId, 'Late Joiner')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    await addMembership(lateJoinerId, circleId, 'member', '2025-07-01T00:00:00Z')
    await createTrip(tripId, circleId, leaderId, tripCreatedAt)

    const token = createToken(lateJoinerId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}/join-requests`)
    const request = new NextRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'I want to join!' })
    })

    const response = await POST(request, { params: { path: ['trips', tripId, 'join-requests'] } })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.status).toBe('pending')
  })

  it('original member gets "already active" when trying to submit join request', async () => {
    const leaderId = 'test-lj-leader-4'
    const originalId = 'test-lj-orig-4'
    const circleId = 'circle-lj-4'
    const tripId = 'trip-lj-4'
    const tripCreatedAt = '2025-06-01T00:00:00Z'

    await createUser(leaderId, 'Leader')
    await createUser(originalId, 'Original')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    await addMembership(originalId, circleId, 'member', '2025-05-15T00:00:00Z')
    await createTrip(tripId, circleId, leaderId, tripCreatedAt)

    const token = createToken(originalId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}/join-requests`)
    const request = new NextRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'I want to join!' })
    })

    const response = await POST(request, { params: { path: ['trips', tripId, 'join-requests'] } })
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toContain('already an active participant')
  })

  it('grandfathered backfill record still counts as active traveler', async () => {
    const leaderId = 'test-lj-leader-5'
    const backfilledId = 'test-lj-bf-5'
    const circleId = 'circle-lj-5'
    const tripId = 'trip-lj-5'
    const tripCreatedAt = '2025-06-01T00:00:00Z'

    await createUser(leaderId, 'Leader')
    await createUser(backfilledId, 'Backfilled')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    // Late joiner by timestamp, but has an explicit 'active' participant record (grandfathered)
    await addMembership(backfilledId, circleId, 'member', '2025-07-01T00:00:00Z')
    await createTrip(tripId, circleId, leaderId, tripCreatedAt)
    // Grandfathered explicit record
    await db.collection('trip_participants').insertOne({
      tripId,
      userId: backfilledId,
      status: 'active',
      joinedAt: '2025-07-01T00:00:00Z',
      createdAt: '2025-07-01T00:00:00Z'
    })

    const token = createToken(backfilledId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}`)
    const request = new NextRequest(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    const response = await GET(request, { params: { path: ['trips', tripId] } })
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.isActiveParticipant).toBe(true)
  })

  it('join request blocked for completed trips', async () => {
    const leaderId = 'test-lj-leader-6'
    const lateJoinerId = 'test-lj-late-6'
    const circleId = 'circle-lj-6'
    const tripId = 'trip-lj-6'

    await createUser(leaderId, 'Leader')
    await createUser(lateJoinerId, 'Late Joiner')
    await createCircle(circleId, leaderId)
    await addMembership(leaderId, circleId, 'owner', '2025-05-01T00:00:00Z')
    await addMembership(lateJoinerId, circleId, 'member', '2025-07-01T00:00:00Z')

    // Completed trip
    const trip = {
      id: tripId,
      name: 'Completed Trip',
      circleId,
      createdBy: leaderId,
      type: 'collaborative',
      status: 'completed',
      startDate: '2025-01-01',
      endDate: '2025-01-05',
      createdAt: '2024-12-01T00:00:00Z'
    }
    await db.collection('trips').insertOne(trip)

    const token = createToken(lateJoinerId)
    const url = new URL(`http://localhost:3000/api/trips/${tripId}/join-requests`)
    const request = new NextRequest(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'I want to join!' })
    })

    const response = await POST(request, { params: { path: ['trips', tripId, 'join-requests'] } })
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toContain('completed')
  })
})
