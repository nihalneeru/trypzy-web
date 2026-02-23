/**
 * Tests for public trip sharing API
 *
 * Covers:
 * - PATCH /api/trips/:tripId/share-settings (enable/disable sharing)
 * - GET /api/public/trips/:shareId (public preview endpoint)
 * - Privacy blocking when travelers have tripsVisibility=private
 * - Sanitized response validation (no PII leaks)
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Import route handlers
let PATCH, GET
let publicGET

describe('Public Trip Sharing', () => {
  let client
  let db

  const leaderId = 'test-leader-share'
  const travelerId = 'test-traveler-share'
  const tripId = 'trip-test-share'
  const circleId = 'circle-test-share'

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    const mainModule = await import('@/app/api/[[...path]]/route.js')
    PATCH = mainModule.PATCH
    GET = mainModule.GET

    const publicModule = await import('@/app/api/public/trips/[shareId]/route.js')
    publicGET = publicModule.GET
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  beforeEach(async () => {
    // Clean up test data
    await db.collection('users').deleteMany({ id: { $in: [leaderId, travelerId] } })
    await db.collection('trips').deleteMany({ id: tripId })
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('memberships').deleteMany({ circleId })
    await db.collection('trip_participants').deleteMany({ tripId })
    await db.collection('itinerary_versions').deleteMany({ tripId })
    await db.collection('itinerary_ideas').deleteMany({ tripId })

    // Seed test data
    await db.collection('users').insertMany([
      { id: leaderId, name: 'Leader User', email: 'leader@test.com', createdAt: new Date().toISOString() },
      { id: travelerId, name: 'Traveler User', email: 'traveler@test.com', createdAt: new Date().toISOString() },
    ])

    await db.collection('circles').insertOne({
      id: circleId,
      name: 'Share Test Circle',
      ownerId: leaderId,
      inviteCode: 'SHARE1',
      createdAt: new Date().toISOString(),
    })

    await db.collection('memberships').insertMany([
      { userId: leaderId, circleId, status: 'active', joinedAt: '2025-01-01T00:00:00Z' },
      { userId: travelerId, circleId, status: 'active', joinedAt: '2025-01-01T00:00:00Z' },
    ])

    await db.collection('trips').insertOne({
      id: tripId,
      name: 'Beach Getaway',
      circleId,
      createdBy: leaderId,
      type: 'collaborative',
      status: 'locked',
      destinationHint: 'Cancun',
      lockedStartDate: '2026-06-01',
      lockedEndDate: '2026-06-07',
      duration: 7,
      createdAt: new Date().toISOString(),
    })

    await db.collection('trip_participants').insertMany([
      { tripId, userId: leaderId, status: 'active' },
      { tripId, userId: travelerId, status: 'active' },
    ])
  })

  // Helper to create PATCH request to share-settings
  function makeShareSettingsPatch(token, body) {
    const url = `http://localhost:3000/api/trips/${tripId}/share-settings`
    return new NextRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  // Helper to create public GET request
  function makePublicGet(shareId) {
    const url = `http://localhost:3000/api/public/trips/${shareId}`
    return new NextRequest(url, { method: 'GET' })
  }

  // ---- PATCH share-settings tests ----

  test('leader can enable sharing', async () => {
    const token = createToken(leaderId)
    const req = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const res = await PATCH(req, { params: { path: ['trips', tripId, 'share-settings'] } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.shareId).toBeTruthy()
    expect(data.shareUrl).toBe('/p/' + data.shareId)
    expect(data.shareVisibility).toBe('link_only')

    // Verify DB was updated
    const trip = await db.collection('trips').findOne({ id: tripId })
    expect(trip.shareId).toBe(data.shareId)
    expect(trip.shareVisibility).toBe('link_only')
    expect(trip.sharedAt).toBeTruthy()
  })

  test('leader can disable sharing', async () => {
    const token = createToken(leaderId)

    // Enable first
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const enableData = await enableRes.json()
    const originalShareId = enableData.shareId

    // Disable
    const disableReq = makeShareSettingsPatch(token, { shareVisibility: 'private' })
    const disableRes = await PATCH(disableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const disableData = await disableRes.json()

    expect(disableRes.status).toBe(200)
    expect(disableData.shareVisibility).toBe('private')
    // shareId is preserved even when disabled
    expect(disableData.shareId).toBe(originalShareId)
  })

  test('re-enabling reuses same shareId', async () => {
    const token = createToken(leaderId)

    // Enable
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const firstShareId = (await enableRes.json()).shareId

    // Disable
    const disableReq = makeShareSettingsPatch(token, { shareVisibility: 'private' })
    await PATCH(disableReq, { params: { path: ['trips', tripId, 'share-settings'] } })

    // Re-enable
    const reEnableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const reEnableRes = await PATCH(reEnableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const secondShareId = (await reEnableRes.json()).shareId

    expect(secondShareId).toBe(firstShareId)
  })

  test('non-leader gets 403', async () => {
    const token = createToken(travelerId)
    const req = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const res = await PATCH(req, { params: { path: ['trips', tripId, 'share-settings'] } })

    expect(res.status).toBe(403)
  })

  test('unauthenticated gets 401', async () => {
    const req = makeShareSettingsPatch(null, { shareVisibility: 'link_only' })
    const res = await PATCH(req, { params: { path: ['trips', tripId, 'share-settings'] } })

    expect(res.status).toBe(401)
  })

  test('invalid shareVisibility value gets 400', async () => {
    const token = createToken(leaderId)
    const req = makeShareSettingsPatch(token, { shareVisibility: 'public' })
    const res = await PATCH(req, { params: { path: ['trips', tripId, 'share-settings'] } })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('shareVisibility')
  })

  test('privacy blocking: traveler with tripsVisibility=private blocks enable', async () => {
    // Set one traveler to private
    await db.collection('users').updateOne(
      { id: travelerId },
      { $set: { 'privacy.tripsVisibility': 'private' } }
    )

    const token = createToken(leaderId)
    const req = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const res = await PATCH(req, { params: { path: ['trips', tripId, 'share-settings'] } })

    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('private trip visibility')
  })

  // ---- Public GET tests ----

  test('public GET with valid shareId returns sanitized data', async () => {
    // Enable sharing first
    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    // Add an itinerary version for the response
    await db.collection('itinerary_versions').insertOne({
      tripId,
      version: 1,
      content: 'Day 1: Beach day\nDay 2: Snorkeling',
      createdAt: new Date().toISOString(),
    })

    await db.collection('itinerary_ideas').insertMany([
      { tripId, idea: 'Visit ruins', createdAt: new Date().toISOString() },
      { tripId, idea: 'Sunset cruise', createdAt: new Date().toISOString() },
    ])

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.trip.name).toBe('Beach Getaway')
    expect(data.trip.destinationHint).toBe('Cancun')
    expect(data.trip.lockedStartDate).toBe('2026-06-01')
    expect(data.trip.lockedEndDate).toBe('2026-06-07')
    expect(data.trip.travelerCount).toBeGreaterThan(0)
    expect(data.itinerary).toBeTruthy()
    expect(data.itinerary.content).toContain('Beach day')
    expect(data.itinerary.ideaCount).toBe(2)
    expect(data.circle.name).toBe('Share Test Circle')
    expect(data.circle.inviteCode).toBe('SHARE1')
    expect(data.cta.remixUrl).toContain(shareId)
    expect(data.cta.joinUrl).toContain('SHARE1')
  })

  test('public GET with non-existent shareId returns 404', async () => {
    const req = makePublicGet('non-existent-id')
    const res = await publicGET(req, { params: { shareId: 'non-existent-id' } })

    expect(res.status).toBe(404)
  })

  test('public GET with private (revoked) trip returns 404', async () => {
    // Enable then disable sharing
    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    const disableReq = makeShareSettingsPatch(token, { shareVisibility: 'private' })
    await PATCH(disableReq, { params: { path: ['trips', tripId, 'share-settings'] } })

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })

    expect(res.status).toBe(404)
  })

  test('sanitized response contains NO participant names or IDs', async () => {
    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })
    const data = await res.json()

    const jsonStr = JSON.stringify(data)
    expect(jsonStr).not.toContain(leaderId)
    expect(jsonStr).not.toContain(travelerId)
    expect(jsonStr).not.toContain('Leader User')
    expect(jsonStr).not.toContain('Traveler User')
    expect(jsonStr).not.toContain('leader@test.com')
    expect(jsonStr).not.toContain('traveler@test.com')
  })

  test('sanitized response contains NO chat messages', async () => {
    // Add a chat message
    await db.collection('trip_messages').insertOne({
      tripId,
      userId: leaderId,
      text: 'Secret plan details',
      createdAt: new Date().toISOString(),
    })

    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })
    const data = await res.json()

    const jsonStr = JSON.stringify(data)
    expect(jsonStr).not.toContain('Secret plan details')
    expect(data.messages).toBeUndefined()
  })

  test('public GET blocked when traveler has tripsVisibility=private', async () => {
    // Enable sharing
    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    // Now set a traveler to private AFTER sharing was enabled
    await db.collection('users').updateOne(
      { id: travelerId },
      { $set: { 'privacy.tripsVisibility': 'private' } }
    )

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })

    expect(res.status).toBe(404)
  })

  test('sanitized response contains trip name, dates, and itinerary', async () => {
    await db.collection('itinerary_versions').insertOne({
      tripId,
      version: 1,
      content: 'Day 1: Explore the city',
      createdAt: new Date().toISOString(),
    })

    const token = createToken(leaderId)
    const enableReq = makeShareSettingsPatch(token, { shareVisibility: 'link_only' })
    const enableRes = await PATCH(enableReq, { params: { path: ['trips', tripId, 'share-settings'] } })
    const { shareId } = await enableRes.json()

    const req = makePublicGet(shareId)
    const res = await publicGET(req, { params: { shareId } })
    const data = await res.json()

    expect(data.trip.name).toBe('Beach Getaway')
    expect(data.trip.lockedStartDate).toBe('2026-06-01')
    expect(data.trip.lockedEndDate).toBe('2026-06-07')
    expect(data.trip.duration).toBe(7)
    expect(data.trip.status).toBe('locked')
    expect(data.itinerary.content).toContain('Explore the city')
  })
})
