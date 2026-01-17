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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoClient } from 'mongodb'
import { validateStageAction } from '@/lib/trips/validateStageAction.js'

// Use test database
const TEST_DB_NAME = 'trypzy_test'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'

describe('Trip Stage Enforcement Integration', () => {
  let client
  let db
  
  beforeAll(async () => {
    client = new MongoClient(MONGO_URI)
    await client.connect()
    db = client.db(TEST_DB_NAME)
  })
  
  afterAll(async () => {
    await client.close()
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

  async function cleanupTestData({ tripId, circleId, userIds = [] }) {
    await db.collection('trips').deleteMany({ id: tripId })
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('users').deleteMany({ id: { $in: userIds } })
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
})
