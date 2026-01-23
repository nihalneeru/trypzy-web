/**
 * Tests for accommodation voting API with voter display
 *
 * These tests verify:
 * 1. GET accommodations returns voters array with names
 * 2. GET accommodations returns userVoted boolean
 * 3. POST vote uses isActiveTraveler (not trip_participants)
 * 4. Collaborative trip members can vote
 * 5. Left/removed users cannot vote
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Import route handlers
let GET, POST

describe('Accommodation Voting API', () => {
  let client
  let db

  beforeAll(async () => {
    // Setup test database (sets env vars and resets connection)
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

  beforeEach(async () => {
    // Clean up test data before each test
    await db.collection('users').deleteMany({ id: /^test-/ })
    await db.collection('trips').deleteMany({ id: /^trip-test-/ })
    await db.collection('circles').deleteMany({ id: /^circle-test-/ })
    await db.collection('memberships').deleteMany({ userId: /^test-/ })
    await db.collection('trip_participants').deleteMany({ tripId: /^trip-test-/ })
    await db.collection('accommodation_options').deleteMany({ tripId: /^trip-test-/ })
    await db.collection('accommodation_votes').deleteMany({ tripId: /^trip-test-/ })
  })

  describe('GET /api/trips/:tripId/accommodations', () => {
    it('should return voters array with names', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup users
      await db.collection('users').insertMany([
        { id: userId1, name: 'Alice Smith', email: 'alice@test.com' },
        { id: userId2, name: 'Bob Jones', email: 'bob@test.com' }
      ])

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })

      await db.collection('memberships').insertMany([
        { userId: userId1, circleId, role: 'owner' },
        { userId: userId2, circleId, role: 'member' }
      ])

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId1,
        type: 'collaborative',
        status: 'locked'
      })

      // Create an accommodation option
      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId1,
        createdAt: new Date().toISOString()
      })

      // Create votes from both users
      await db.collection('accommodation_votes').insertMany([
        { id: 'vote-1', tripId, optionId, votedBy: userId1, createdAt: new Date().toISOString() },
        { id: 'vote-2', tripId, optionId, votedBy: userId2, createdAt: new Date().toISOString() }
      ])

      const token = createToken(userId1)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'accommodations'] } })

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(1)

      const option = data[0]
      expect(option.voters).toBeDefined()
      expect(Array.isArray(option.voters)).toBe(true)
      expect(option.voters.length).toBe(2)

      // Check voter details include id and name
      const voterNames = option.voters.map(v => v.name)
      expect(voterNames).toContain('Alice Smith')
      expect(voterNames).toContain('Bob Jones')

      // Each voter should have id and name
      option.voters.forEach(voter => {
        expect(voter.id).toBeDefined()
        expect(voter.name).toBeDefined()
      })
    })

    it('should return userVoted boolean correctly', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId1 = 'option-test-1'
      const optionId2 = 'option-test-2'

      // Setup users
      await db.collection('users').insertMany([
        { id: userId1, name: 'Alice Smith', email: 'alice@test.com' },
        { id: userId2, name: 'Bob Jones', email: 'bob@test.com' }
      ])

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })

      await db.collection('memberships').insertMany([
        { userId: userId1, circleId, role: 'owner' },
        { userId: userId2, circleId, role: 'member' }
      ])

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId1,
        type: 'collaborative',
        status: 'locked'
      })

      // Create two accommodation options
      await db.collection('accommodation_options').insertMany([
        { id: optionId1, tripId, stayRequirementId: 'stay-1', title: 'Beach Resort', addedByUserId: userId1, createdAt: new Date().toISOString() },
        { id: optionId2, tripId, stayRequirementId: 'stay-1', title: 'Mountain Lodge', addedByUserId: userId2, createdAt: new Date().toISOString() }
      ])

      // User 1 votes for option 1
      await db.collection('accommodation_votes').insertOne({
        id: 'vote-1',
        tripId,
        optionId: optionId1,
        votedBy: userId1,
        createdAt: new Date().toISOString()
      })

      const token = createToken(userId1)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'accommodations'] } })

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toBe(2)

      // Find the options
      const option1 = data.find(o => o.id === optionId1)
      const option2 = data.find(o => o.id === optionId2)

      // User 1 voted for option 1
      expect(option1.userVoted).toBe(true)
      // User 1 did not vote for option 2
      expect(option2.userVoted).toBe(false)
    })

    it('should return empty voters array when no votes', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      // Create an accommodation option with no votes
      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      const token = createToken(userId)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const response = await GET(request, { params: { path: ['trips', tripId, 'accommodations'] } })

      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.length).toBe(1)
      expect(data[0].voters).toEqual([])
      expect(data[0].userVoted).toBe(false)
      expect(data[0].voteCount).toBe(0)
    })
  })

  describe('POST /api/trips/:tripId/accommodations/:optionId/vote', () => {
    it('should allow collaborative trip circle member to vote (uses isActiveTraveler)', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup - user is circle member but has NO trip_participants record
      // This tests that isActiveTraveler checks circle membership, not trip_participants
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      // NOTE: No trip_participants record - testing that isActiveTraveler
      // allows circle members on collaborative trips without requiring trip_participants

      const token = createToken(userId)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should succeed because circle member is valid for collaborative trips
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Vote recorded')
      expect(data.voteCount).toBe(1)

      // Verify vote was created
      const vote = await db.collection('accommodation_votes').findOne({ tripId, votedBy: userId })
      expect(vote).toBeDefined()
      expect(vote.optionId).toBe(optionId)
    })

    it('should reject left user from voting (uses isActiveTraveler)', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup - user is circle member but has 'left' status in trip_participants
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      // User has 'left' status - should be rejected
      await db.collection('trip_participants').insertOne({
        tripId,
        userId,
        role: 'traveler',
        status: 'left',
        joinedAt: new Date().toISOString()
      })

      const token = createToken(userId)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should fail because user has 'left' status
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not an active traveler')
    })

    it('should reject removed user from voting (uses isActiveTraveler)', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup - user is circle member but has 'removed' status in trip_participants
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      // User has 'removed' status - should be rejected
      await db.collection('trip_participants').insertOne({
        tripId,
        userId,
        role: 'traveler',
        status: 'removed',
        joinedAt: new Date().toISOString()
      })

      const token = createToken(userId)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should fail because user has 'removed' status
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not an active traveler')
    })

    it('should reject non-circle member from voting', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup - userId2 is NOT a circle member
      await db.collection('users').insertMany([
        { id: userId1, name: 'Alice Smith', email: 'alice@test.com' },
        { id: userId2, name: 'Bob Jones', email: 'bob@test.com' }
      ])

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })

      // Only userId1 is a member
      await db.collection('memberships').insertOne({
        userId: userId1,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId1,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId1,
        createdAt: new Date().toISOString()
      })

      // userId2 tries to vote but is not a circle member
      const token = createToken(userId2)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should fail because user is not a circle member
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not an active traveler')
    })

    it('should prevent duplicate votes', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      // User has already voted
      await db.collection('accommodation_votes').insertOne({
        id: 'vote-existing',
        tripId,
        optionId,
        votedBy: userId,
        createdAt: new Date().toISOString()
      })

      const token = createToken(userId)

      // Execute - try to vote again
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should fail because user already voted
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('already voted')
    })

    it('should allow active collaborative trip member with active participant status to vote', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const optionId = 'option-test-1'

      // Setup - user has both circle membership AND active trip_participants record
      await db.collection('users').insertOne({
        id: userId,
        name: 'Alice Smith',
        email: 'alice@test.com'
      })

      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })

      await db.collection('memberships').insertOne({
        userId,
        circleId,
        role: 'owner'
      })

      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked'
      })

      await db.collection('accommodation_options').insertOne({
        id: optionId,
        tripId,
        stayRequirementId: 'stay-1',
        title: 'Beach Resort',
        addedByUserId: userId,
        createdAt: new Date().toISOString()
      })

      // User has 'active' status in trip_participants
      await db.collection('trip_participants').insertOne({
        tripId,
        userId,
        role: 'traveler',
        status: 'active',
        joinedAt: new Date().toISOString()
      })

      const token = createToken(userId)

      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/accommodations/${optionId}/vote`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'accommodations', optionId, 'vote'] } })

      // Assert - should succeed
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.message).toBe('Vote recorded')
    })
  })
})
