/**
 * Tests for public trip brief API
 *
 * Covers:
 * - POST /api/trips/:tripId/brief/share (leader generates briefToken)
 * - DELETE /api/trips/:tripId/brief/share (leader revokes briefToken)
 * - GET /api/public/brief/:briefToken (public no-auth endpoint)
 * - Security: no userIds in public response, invalid/revoked token returns 404
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

let POST, DELETE_handler, GET
let publicBriefGET

describe('Public Trip Brief', () => {
  let client
  let db

  const leaderId = 'test-leader-brief'
  const travelerId = 'test-traveler-brief'
  const outsiderId = 'test-outsider-brief'
  const tripId = 'trip-test-brief'
  const circleId = 'circle-test-brief'

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    const mainModule = await import('@/app/api/[[...path]]/route.js')
    POST = mainModule.POST
    DELETE_handler = mainModule.DELETE

    const publicModule = await import('@/app/api/public/brief/[briefToken]/route.js')
    publicBriefGET = publicModule.GET
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  beforeEach(async () => {
    // Clean up test data
    await db.collection('users').deleteMany({ id: { $in: [leaderId, travelerId, outsiderId] } })
    await db.collection('trips').deleteMany({ id: tripId })
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('memberships').deleteMany({ circleId })
    await db.collection('trip_participants').deleteMany({ tripId })
    await db.collection('accommodation_options').deleteMany({ tripId })
    await db.collection('itinerary_versions').deleteMany({ tripId })
    await db.collection('prep_items').deleteMany({ tripId })

    // Seed test data
    await db.collection('users').insertMany([
      { id: leaderId, name: 'Brief Leader', email: 'brief-leader@test.com', createdAt: new Date().toISOString() },
      { id: travelerId, name: 'Brief Traveler', email: 'brief-traveler@test.com', createdAt: new Date().toISOString() },
      { id: outsiderId, name: 'Outsider', email: 'outsider@test.com', createdAt: new Date().toISOString() },
    ])

    await db.collection('circles').insertOne({
      id: circleId,
      name: 'Brief Test Circle',
      ownerId: leaderId,
      inviteCode: 'BRIEF1',
      createdAt: new Date().toISOString(),
    })

    await db.collection('memberships').insertMany([
      { userId: leaderId, circleId, status: 'active', joinedAt: '2025-01-01T00:00:00Z' },
      { userId: travelerId, circleId, status: 'active', joinedAt: '2025-01-01T00:00:00Z' },
    ])

    await db.collection('trips').insertOne({
      id: tripId,
      name: 'Iceland Adventure',
      circleId,
      createdBy: leaderId,
      type: 'collaborative',
      status: 'locked',
      destinationHint: 'Reykjavik',
      lockedStartDate: '2026-08-01',
      lockedEndDate: '2026-08-07',
      createdAt: new Date().toISOString(),
    })

    await db.collection('trip_participants').insertMany([
      { tripId, userId: leaderId, status: 'active' },
      { tripId, userId: travelerId, status: 'active' },
    ])
  })

  // ---- Helpers ----

  function makeSharePost(token) {
    const url = `http://localhost:3000/api/trips/${tripId}/brief/share`
    return new NextRequest(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }

  function makeShareDelete(token) {
    const url = `http://localhost:3000/api/trips/${tripId}/brief/share`
    return new NextRequest(url, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }

  function makePublicGet(briefToken) {
    return new NextRequest(`http://localhost:3000/api/public/brief/${briefToken}`, { method: 'GET' })
  }

  // ---- POST /api/trips/:tripId/brief/share ----

  test('leader can generate briefToken', async () => {
    const token = createToken(leaderId)
    const res = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.briefToken).toBeTruthy()
    expect(data.briefUrl).toBe('/t/' + data.briefToken)

    // Verify DB was updated
    const trip = await db.collection('trips').findOne({ id: tripId })
    expect(trip.briefToken).toBe(data.briefToken)
    expect(trip.briefTokenCreatedAt).toBeTruthy()
  })

  test('leader reuses existing briefToken', async () => {
    const token = createToken(leaderId)

    // First call
    const res1 = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const data1 = await res1.json()

    // Second call — should return the same token
    const res2 = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const data2 = await res2.json()

    expect(data2.briefToken).toBe(data1.briefToken)
  })

  test('non-leader gets 403 on POST', async () => {
    const token = createToken(travelerId)
    const res = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })

    expect(res.status).toBe(403)
  })

  test('unauthenticated gets 401 on POST', async () => {
    const res = await POST(makeSharePost(null), { params: { path: ['trips', tripId, 'brief', 'share'] } })

    expect(res.status).toBe(401)
  })

  // ---- DELETE /api/trips/:tripId/brief/share ----

  test('leader can revoke briefToken', async () => {
    // Generate first
    const token = createToken(leaderId)
    await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })

    // Revoke
    const res = await DELETE_handler(makeShareDelete(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)

    // Verify DB was cleared
    const trip = await db.collection('trips').findOne({ id: tripId })
    expect(trip.briefToken).toBeNull()
  })

  test('non-leader gets 403 on DELETE', async () => {
    const token = createToken(travelerId)
    const res = await DELETE_handler(makeShareDelete(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })

    expect(res.status).toBe(403)
  })

  // ---- GET /api/public/brief/:briefToken ----

  test('public GET with valid briefToken returns brief data', async () => {
    // Generate token
    const token = createToken(leaderId)
    const shareRes = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const { briefToken } = await shareRes.json()

    // Add some data
    await db.collection('accommodation_options').insertOne({
      tripId,
      title: 'Hilton Reykjavik',
      status: 'selected',
      source: 'Reykjavik',
      createdAt: new Date().toISOString()
    })

    await db.collection('prep_items').insertOne({
      tripId,
      name: 'First aid kit',
      category: 'packing',
      scope: 'group',
      createdAt: new Date().toISOString()
    })

    const res = await publicBriefGET(makePublicGet(briefToken), { params: { briefToken } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.overview.name).toBe('Iceland Adventure')
    expect(data.overview.destinationHint).toBe('Reykjavik')
    expect(data.overview.lockedStartDate).toBe('2026-08-01')
    expect(data.overview.travelerCount).toBeGreaterThan(0)
    expect(data.accommodation.chosen.name).toBe('Hilton Reykjavik')
    expect(data.packingReminders.length).toBe(1)
    expect(data.packingReminders[0].name).toBe('First aid kit')
  })

  test('public GET with invalid briefToken returns 404', async () => {
    const res = await publicBriefGET(
      makePublicGet('nonexistent-token-xyz'),
      { params: { briefToken: 'nonexistent-token-xyz' } }
    )

    expect(res.status).toBe(404)
  })

  test('revoked briefToken returns 404', async () => {
    // Generate
    const token = createToken(leaderId)
    const shareRes = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const { briefToken } = await shareRes.json()

    // Revoke
    await DELETE_handler(makeShareDelete(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })

    // Public GET should now 404
    const res = await publicBriefGET(makePublicGet(briefToken), { params: { briefToken } })

    expect(res.status).toBe(404)
  })

  test('public response contains no userIds', async () => {
    const token = createToken(leaderId)
    const shareRes = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const { briefToken } = await shareRes.json()

    const res = await publicBriefGET(makePublicGet(briefToken), { params: { briefToken } })
    const data = await res.json()

    const jsonStr = JSON.stringify(data)
    expect(jsonStr).not.toContain(leaderId)
    expect(jsonStr).not.toContain(travelerId)
    expect(jsonStr).not.toContain('Brief Leader')
    expect(jsonStr).not.toContain('Brief Traveler')
    expect(jsonStr).not.toContain('brief-leader@test.com')
    expect(jsonStr).not.toContain('brief-traveler@test.com')
  })

  test('public response has Cache-Control: no-store and X-Robots-Tag: noindex', async () => {
    const token = createToken(leaderId)
    const shareRes = await POST(makeSharePost(token), { params: { path: ['trips', tripId, 'brief', 'share'] } })
    const { briefToken } = await shareRes.json()

    const res = await publicBriefGET(makePublicGet(briefToken), { params: { briefToken } })

    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
  })
})
