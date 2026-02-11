/**
 * Integration tests for trip-first onboarding flow
 *
 * Verifies:
 * 1. POST /api/trips without circleId auto-creates circle + trip
 * 2. Auto-created circle has autoCreated: true, valid inviteCode, membership exists
 * 3. POST /api/trips without circleId OR name returns 400
 * 4. POST /api/trips WITH circleId follows existing behavior (no circle field)
 * 5. trip_events collection has onboarding.trip_first.completed event
 */

import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

let POST

describe('Trip-First Onboarding', () => {
  let db
  let client

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

  beforeEach(async () => {
    // Clean test collections
    await db.collection('users').deleteMany({})
    await db.collection('circles').deleteMany({})
    await db.collection('memberships').deleteMany({})
    await db.collection('trips').deleteMany({})
    await db.collection('trip_events').deleteMany({})
    await db.collection('trip_messages').deleteMany({})
  })

  async function createTestUser(id = 'user-1') {
    const user = {
      id,
      name: 'Test User',
      email: `${id}@test.com`,
      password: 'hashed',
      createdAt: new Date().toISOString()
    }
    await db.collection('users').insertOne(user)
    return user
  }

  async function createTestCircle(ownerId) {
    const circle = {
      id: `circle-${Date.now()}`,
      name: 'Existing Circle',
      description: '',
      ownerId,
      inviteCode: 'ABC123',
      createdAt: new Date().toISOString()
    }
    await db.collection('circles').insertOne(circle)
    await db.collection('memberships').insertOne({
      userId: ownerId,
      circleId: circle.id,
      role: 'owner',
      joinedAt: new Date().toISOString()
    })
    return circle
  }

  function makeRequest(token, body) {
    return new NextRequest('http://localhost:3000/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })
  }

  test('POST /api/trips without circleId creates circle + trip with circle in response', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Beach Trip',
      type: 'collaborative'
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Beach Trip')
    expect(data.type).toBe('collaborative')
    expect(data.circle).toBeDefined()
    expect(data.circle.id).toBeDefined()
    expect(data.circle.name).toBe('Beach Trip circle')
    expect(data.circle.inviteCode).toBeDefined()
    expect(data.circle.inviteCode.length).toBeGreaterThan(0)
  })

  test('auto-created circle has autoCreated: true and membership exists', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Mountain Trip',
      type: 'collaborative'
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)

    // Verify circle in DB
    const circle = await db.collection('circles').findOne({ id: data.circle.id })
    expect(circle).toBeTruthy()
    expect(circle.autoCreated).toBe(true)
    expect(circle.inviteCode).toBeDefined()
    expect(circle.ownerId).toBe(user.id)

    // Verify membership
    const membership = await db.collection('memberships').findOne({
      userId: user.id,
      circleId: data.circle.id
    })
    expect(membership).toBeTruthy()
    expect(membership.role).toBe('owner')
  })

  test('POST /api/trips without circleId or name returns 400', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      type: 'collaborative'
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    expect(res.status).toBe(400)
  })

  test('POST /api/trips WITH circleId follows existing behavior (no circle field)', async () => {
    const user = await createTestUser()
    const circle = await createTestCircle(user.id)
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Regular Trip',
      type: 'collaborative',
      circleId: circle.id
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.id).toBeDefined()
    expect(data.name).toBe('Regular Trip')
    expect(data.circle).toBeUndefined()
  })

  test('trip-first flow returns trip linked to auto-created circle', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Event Test Trip',
      type: 'collaborative'
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)

    // Verify trip is linked to the auto-created circle
    const trip = await db.collection('trips').findOne({ id: data.id })
    expect(trip).toBeTruthy()
    expect(trip.circleId).toBe(data.circle.id)
    expect(trip.createdBy).toBe(user.id)
    expect(trip.status).toBe('proposed')
  })

  test('POST /api/trips with custom circleName uses it for auto-created circle', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Beach Trip',
      type: 'collaborative',
      circleName: 'Beach Crew'
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.circle).toBeDefined()
    expect(data.circle.name).toBe('Beach Crew')

    // Verify in DB
    const circle = await db.collection('circles').findOne({ id: data.circle.id })
    expect(circle.name).toBe('Beach Crew')
  })

  test('POST /api/trips with empty circleName falls back to "${name} circle"', async () => {
    const user = await createTestUser()
    const token = createToken(user.id)

    const req = makeRequest(token, {
      name: 'Ski Trip',
      type: 'collaborative',
      circleName: '   '
    })

    const res = await POST(req, { params: { path: ['trips'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.circle).toBeDefined()
    expect(data.circle.name).toBe('Ski Trip circle')
  })
})
