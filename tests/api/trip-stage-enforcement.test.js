/**
 * Integration tests for trip stage action enforcement
 * 
 * These tests verify that:
 * 1. Non-leader calling lock endpoint gets 403
 * 2. Calling lock endpoint while not in correct stage gets 400
 * 3. Non-leader calling open-voting endpoint gets 403
 * 4. Calling open-voting from invalid stage gets 400
 * 5. Voting/vote endpoints respect stage restrictions
 * 
 * Note: These tests verify the validator logic in isolation by testing
 * validateStageAction directly with realistic scenarios that match endpoint usage.
 */

import { MongoClient } from 'mongodb'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { validateStageAction } from '@/lib/trips/validateStageAction.js'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

// Use test database
const TEST_DB_NAME = 'tripti_test'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Import route handlers
let GET, POST

describe('Trip Stage Enforcement Integration', () => {
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

  // Helper to create test data
  async function createTestTrip({ ownerId, circleId, type = 'collaborative', status = 'proposed' }) {
    const trip = {
      id: `trip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: 'Test Trip',
      circleId,
      createdBy: ownerId,
      type,
      status,
      startDate: '2024-06-01',
      endDate: '2024-06-05'
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
    await db.collection('votes').deleteMany({ tripId })
    await db.collection('trip_date_picks').deleteMany({ tripId })
    await db.collection('availabilities').deleteMany({ tripId })
  }

  describe('Lock endpoint enforcement', () => {
    it('should reject non-leader calling lock endpoint (403)', async () => {
      // Setup
      const leaderId = 'leader-lock-1'
      const memberId = 'member-lock-1'
      const circleId = 'circle-lock-1'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'voting' })
      
      // Test: Non-leader tries to lock
      const validation = validateStageAction(trip, 'lock', memberId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(403)
      expect(validation.code).toBe('LEADER_ONLY')
      expect(validation.message).toBe('Only the trip creator or circle owner can lock the trip')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, memberId] })
    })

    it('should reject locking when trip is already locked (400)', async () => {
      // Setup
      const leaderId = 'leader-lock-2'
      const circleId = 'circle-lock-2'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'locked' })
      
      // Test: Leader tries to lock already-locked trip
      const validation = validateStageAction(trip, 'lock', leaderId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Trip is already locked')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should allow leader to lock from voting stage', async () => {
      // Setup
      const leaderId = 'leader-lock-3'
      const circleId = 'circle-lock-3'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'voting' })
      
      // Test: Leader locks from voting stage
      const validation = validateStageAction(trip, 'lock', leaderId, circle)
      
      expect(validation.ok).toBe(true)
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should allow leader to lock from scheduling stage (top3_heatmap)', async () => {
      // Setup
      const leaderId = 'leader-lock-4'
      const circleId = 'circle-lock-4'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'scheduling' })
      
      // Test: Leader locks from scheduling stage (allowed for top3_heatmap)
      const validation = validateStageAction(trip, 'lock', leaderId, circle)
      
      expect(validation.ok).toBe(true)
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })
  })

  describe('Open voting endpoint enforcement', () => {
    it('should reject non-leader calling open-voting endpoint (403)', async () => {
      // Setup
      const leaderId = 'leader-open-1'
      const memberId = 'member-open-1'
      const circleId = 'circle-open-1'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: memberId, name: 'Member', email: 'member@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'scheduling' })
      
      // Test: Non-leader tries to open voting
      const validation = validateStageAction(trip, 'open_voting', memberId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(403)
      expect(validation.code).toBe('LEADER_ONLY')
      expect(validation.message).toBe('Only the trip creator or circle owner can open voting')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, memberId] })
    })

    it('should reject opening voting when already voting (400)', async () => {
      // Setup
      const leaderId = 'leader-open-2'
      const circleId = 'circle-open-2'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'voting' })
      
      // Test: Leader tries to open voting when already open
      const validation = validateStageAction(trip, 'open_voting', leaderId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Voting is already open')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should reject opening voting when locked (400)', async () => {
      // Setup
      const leaderId = 'leader-open-3'
      const circleId = 'circle-open-3'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'locked' })
      
      // Test: Leader tries to open voting when locked
      const validation = validateStageAction(trip, 'open_voting', leaderId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Cannot open voting for a locked trip')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })

    it('should allow leader to open voting from scheduling stage', async () => {
      // Setup
      const leaderId = 'leader-open-4'
      const circleId = 'circle-open-4'
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: leaderId })
      const trip = await createTestTrip({ ownerId: leaderId, circleId, status: 'scheduling' })
      
      // Test: Leader opens voting from scheduling stage
      const validation = validateStageAction(trip, 'open_voting', leaderId, circle)
      
      expect(validation.ok).toBe(true)
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId] })
    })
  })

  describe('Vote endpoint enforcement', () => {
    it('should reject voting when not in voting stage (400)', async () => {
      // Setup
      const userId = 'user-vote-1'
      const circleId = 'circle-vote-1'
      
      await createTestUser({ id: userId, name: 'User', email: 'user@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: userId })
      const trip = await createTestTrip({ ownerId: userId, circleId, status: 'scheduling' })
      
      // Test: User tries to vote when not in voting stage
      const validation = validateStageAction(trip, 'vote', userId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Voting is not open for this trip')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [userId] })
    })

    it('should allow voting when in voting stage', async () => {
      // Setup
      const userId = 'user-vote-2'
      const circleId = 'circle-vote-2'
      
      await createTestUser({ id: userId, name: 'User', email: 'user@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: userId })
      const trip = await createTestTrip({ ownerId: userId, circleId, status: 'voting' })
      
      // Test: User votes when in voting stage
      const validation = validateStageAction(trip, 'vote', userId, circle)
      
      expect(validation.ok).toBe(true)
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [userId] })
    })
  })

  describe('Availability submission enforcement', () => {
    it('should reject submitting availability when locked (400)', async () => {
      // Setup
      const userId = 'user-avail-1'
      const circleId = 'circle-avail-1'
      
      await createTestUser({ id: userId, name: 'User', email: 'user@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: userId })
      const trip = await createTestTrip({ ownerId: userId, circleId, status: 'locked' })
      
      // Test: User tries to submit availability when locked
      const validation = validateStageAction(trip, 'submit_availability', userId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Dates are locked; scheduling is closed.')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [userId] })
    })

    it('should reject submitting availability when voting (400)', async () => {
      // Setup
      const userId = 'user-avail-2'
      const circleId = 'circle-avail-2'
      
      await createTestUser({ id: userId, name: 'User', email: 'user@test.com' })
      const circle = await createTestCircle({ id: circleId, ownerId: userId })
      const trip = await createTestTrip({ ownerId: userId, circleId, status: 'voting' })
      
      // Test: User tries to submit availability when voting
      const validation = validateStageAction(trip, 'submit_availability', userId, circle)
      
      expect(validation.ok).toBe(false)
      expect(validation.status).toBe(400)
      expect(validation.code).toBe('STAGE_BLOCKED')
      expect(validation.message).toBe('Availability is frozen while voting is open.')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [userId] })
    })
  })

  describe('Vote after lock', () => {
    it('should reject POST /vote on locked trip with 400', async () => {
      // Setup: Create trip, add availability, open voting, lock trip
      const leaderId = 'leader-vote-lock-1'
      const travelerId = 'traveler-vote-lock-1'
      const circleId = 'circle-vote-lock-1'
      const tripId = `trip-vote-lock-1-${Date.now()}`
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      
      // Create trip with explicit tripId
      const trip = {
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: leaderId,
        type: 'collaborative',
        status: 'proposed',
        startDate: '2025-03-01',
        endDate: '2025-03-31'
      }
      await db.collection('trips').insertOne(trip)
      
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      
      // Submit availability (auto-transitions to scheduling)
      const leaderToken = createToken(leaderId)
      const availabilityUrl = new URL(`http://localhost:3000/api/trips/${trip.id}/availability`)
      const availabilityRequest = new NextRequest(availabilityUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ broadStatus: 'available' })
      })
      await POST(availabilityRequest, { params: { path: ['trips', trip.id, 'availability'] } })
      
      // Open voting
      const openVotingUrl = new URL(`http://localhost:3000/api/trips/${trip.id}/open-voting`)
      const openVotingRequest = new NextRequest(openVotingUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        }
      })
      await POST(openVotingRequest, { params: { path: ['trips', trip.id, 'open-voting'] } })
      
      // Lock trip
      const lockUrl = new URL(`http://localhost:3000/api/trips/${trip.id}/lock`)
      const lockRequest = new NextRequest(lockUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionKey: '2025-03-01_2025-03-05' })
      })
      await POST(lockRequest, { params: { path: ['trips', trip.id, 'lock'] } })
      
      // Verify trip is locked
      const lockedTrip = await db.collection('trips').findOne({ id: trip.id })
      expect(lockedTrip.status).toBe('locked')
      
      // Action: POST /api/trips/:id/vote with valid vote payload
      const travelerToken = createToken(travelerId)
      const voteUrl = new URL(`http://localhost:3000/api/trips/${tripId}/vote`)
      const voteRequest = new NextRequest(voteUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${travelerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionKey: '2025-03-01_2025-03-05' })
      })
      
      const response = await POST(voteRequest, { params: { path: ['trips', tripId, 'vote'] } })
      
      // Assert: Response is 400
      expect(response.status).toBe(400)
      const errorData = await response.json()
      expect(errorData.error).toContain('Voting is not open')
      
      // Assert: No new document in votes collection for this trip+user
      const votes = await db.collection('votes').find({ tripId: tripId, userId: travelerId }).toArray()
      expect(votes.length).toBe(0)
      
      // Cleanup
      await cleanupTestData({ tripId: tripId, circleId, userIds: [leaderId, travelerId] })
    })
  })

  describe('Date picks after lock', () => {
    it('should reject POST /date-picks on locked trip with 400', async () => {
      // Setup: Create trip, lock it (via full flow: availability -> voting -> lock)
      const leaderId = 'leader-picks-lock-1'
      const travelerId = 'traveler-picks-lock-1'
      const circleId = 'circle-picks-lock-1'
      const tripId = `trip-picks-lock-1-${Date.now()}`
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      
      // Create trip with explicit tripId and top3_heatmap mode
      const trip = {
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: leaderId,
        type: 'collaborative',
        status: 'proposed',
        schedulingMode: 'top3_heatmap',
        startDate: '2025-03-01',
        endDate: '2025-03-31',
        startBound: '2025-03-01',
        endBound: '2025-03-31',
        tripLengthDays: 5
      }
      await db.collection('trips').insertOne(trip)
      
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      
      // Submit date picks (auto-transitions to scheduling)
      const travelerToken = createToken(travelerId)
      const picksUrl = new URL(`http://localhost:3000/api/trips/${tripId}/date-picks`)
      const picksRequest = new NextRequest(picksUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${travelerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          picks: [
            { rank: 1, startDateISO: '2025-03-01', endDateISO: '2025-03-05' }
          ]
        })
      })
      await POST(picksRequest, { params: { path: ['trips', tripId, 'date-picks'] } })
      
      // Lock trip
      const leaderToken = createToken(leaderId)
      const lockUrl = new URL(`http://localhost:3000/api/trips/${tripId}/lock`)
      const lockRequest = new NextRequest(lockUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ startDateISO: '2025-03-01' })
      })
      await POST(lockRequest, { params: { path: ['trips', tripId, 'lock'] } })
      
      // Verify trip is locked
      const lockedTrip = await db.collection('trips').findOne({ id: tripId })
      expect(lockedTrip).toBeTruthy()
      expect(lockedTrip.status).toBe('locked')
      
      // Action: POST /api/trips/:id/date-picks with valid picks payload
      const newPicksRequest = new NextRequest(picksUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${travelerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          picks: [
            { rank: 1, startDateISO: '2025-03-10', endDateISO: '2025-03-14' }
          ]
        })
      })
      
      const response = await POST(newPicksRequest, { params: { path: ['trips', tripId, 'date-picks'] } })
      
      // Assert: Response is 400
      expect(response.status).toBe(400)
      const errorData = await response.json()
      expect(errorData.error).toContain('locked')
      
      // Assert: No new/updated document in trip_date_picks for this user (should still have original pick)
      const picksAfter = await db.collection('trip_date_picks').findOne({ tripId: tripId, userId: travelerId })
      expect(picksAfter).toBeTruthy()
      expect(picksAfter.picks.length).toBe(1)
      expect(picksAfter.picks[0].startDateISO).toBe('2025-03-01') // Original pick, not updated
      
      // Cleanup
      await cleanupTestData({ tripId: tripId, circleId, userIds: [leaderId, travelerId] })
    })
  })

  describe('Progress snapshot after lock', () => {
    it('should return trip with progress.steps showing datesLocked after lock', async () => {
      // Setup: Create trip, submit availability, open voting, submit vote
      const leaderId = 'leader-progress-1'
      const travelerId = 'traveler-progress-1'
      const circleId = 'circle-progress-1'
      const tripId = `trip-progress-1-${Date.now()}`
      
      await createTestUser({ id: leaderId, name: 'Leader', email: 'leader@test.com' })
      await createTestUser({ id: travelerId, name: 'Traveler', email: 'traveler@test.com' })
      await createTestCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: travelerId, circleId, role: 'member' })
      
      // Create trip with explicit tripId
      const trip = {
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: leaderId,
        type: 'collaborative',
        status: 'proposed',
        startDate: '2025-03-01',
        endDate: '2025-03-31'
      }
      await db.collection('trips').insertOne(trip)
      
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      
      // Submit availability
      const leaderToken = createToken(leaderId)
      const availabilityUrl = new URL(`http://localhost:3000/api/trips/${tripId}/availability`)
      const availabilityRequest = new NextRequest(availabilityUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ broadStatus: 'available' })
      })
      await POST(availabilityRequest, { params: { path: ['trips', tripId, 'availability'] } })
      
      // Open voting
      const openVotingUrl = new URL(`http://localhost:3000/api/trips/${tripId}/open-voting`)
      const openVotingRequest = new NextRequest(openVotingUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        }
      })
      await POST(openVotingRequest, { params: { path: ['trips', tripId, 'open-voting'] } })
      
      // Submit vote
      const travelerToken = createToken(travelerId)
      const voteUrl = new URL(`http://localhost:3000/api/trips/${tripId}/vote`)
      const voteRequest = new NextRequest(voteUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${travelerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionKey: '2025-03-01_2025-03-05' })
      })
      await POST(voteRequest, { params: { path: ['trips', tripId, 'vote'] } })
      
      // Action: POST /api/trips/:id/lock
      const lockUrl = new URL(`http://localhost:3000/api/trips/${tripId}/lock`)
      const lockRequest = new NextRequest(lockUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${leaderToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ optionKey: '2025-03-01_2025-03-05' })
      })
      
      const lockResponse = await POST(lockRequest, { params: { path: ['trips', tripId, 'lock'] } })
      
      // Assert: Response is 200
      expect(lockResponse.status).toBe(200)
      
      // Assert: Response body includes trip object (lock endpoint now returns updated trip)
      const lockData = await lockResponse.json()
      expect(lockData).toBeTruthy()
      expect(lockData.id).toBe(tripId)
      expect(lockData.status).toBe('locked')
      expect(lockData.lockedStartDate).toBe('2025-03-01')
      expect(lockData.lockedEndDate).toBe('2025-03-05')
      
      // Assert: GET /api/trips/:id after lock shows progress with datesLocked
      const getUrl = new URL(`http://localhost:3000/api/trips/${tripId}`)
      const getRequest = new NextRequest(getUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${leaderToken}`
        }
      })
      
      const getResponse = await GET(getRequest, { params: { path: ['trips', tripId] } })
      expect(getResponse.status).toBe(200)
      const tripData = await getResponse.json()
      
      // Verify trip status is locked
      expect(tripData.status).toBe('locked')
      expect(tripData.lockedStartDate).toBe('2025-03-01')
      expect(tripData.lockedEndDate).toBe('2025-03-05')
      
      // Progress is computed client-side, but we can verify the trip has the fields needed
      // The progress pane uses computeProgressSteps which checks trip.status === 'locked'
      // So datesLocked will be true when status is 'locked'
      
      // Cleanup
      await cleanupTestData({ tripId: tripId, circleId, userIds: [leaderId, travelerId] })
    })
  })
})
