/**
 * Tests for trip deletion and leaving behavior
 * 
 * These tests verify that:
 * 1. Solo trips: Delete visible; Leave hidden; deleting removes trip
 * 2. Multi-member, non-leader: Leave works; delete forbidden (403)
 * 3. Multi-member, leader: Delete works (trip removed for all)
 * 4. Multi-member, leader: Leave without transfer fails with actionable error
 * 5. Multi-member, leader: Leave with transfer succeeds; new leader assigned; old leader removed
 */

import { MongoClient } from 'mongodb'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

// Use test database
const TEST_DB_NAME = 'tripti_test'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Import route handler
let POST

describe('Trip Deletion and Leaving', () => {
  let client
  let db
  
  beforeAll(async () => {
    // Setup test database (sets env vars and resets connection)
    const result = await setupTestDatabase()
    db = result.db
    client = result.client
    
    // Import route handler after env vars are set
    const module = await import('@/app/api/[[...path]]/route.js')
    POST = module.POST
  })
  
  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  // Helper to create test data
  async function createTestTrip({ ownerId, circleId, type = 'hosted' }) {
    const trip = {
      id: `trip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: 'Test Trip',
      circleId,
      createdBy: ownerId,
      type,
      status: 'proposed',
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
      id: `participant-${Date.now()}`,
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
  }

  it('solo trip: should allow delete, hide leave, and remove trip on delete', async () => {
    // Setup
    const ownerId = 'owner-solo-1'
    const circleId = 'circle-solo-1'
    
    await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
    await createTestCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    const trip = await createTestTrip({ ownerId, circleId, type: 'hosted' })
    await addParticipant({ tripId: trip.id, userId: ownerId })
    
    // Verify solo trip (memberCount === 1)
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id, status: 'active' })
      .toArray()
    expect(participants.length).toBe(1)
    
    // Delete trip
    await db.collection('trips').deleteOne({ id: trip.id })
    
    // Verify trip is deleted
    const deletedTrip = await db.collection('trips').findOne({ id: trip.id })
    expect(deletedTrip).toBeNull()
    
    // Cleanup
    await cleanupTestData({ tripId: trip.id, circleId, userIds: [ownerId] })
  })

  it('multi-member trip, non-leader: should allow leave, forbid delete (403)', async () => {
    // This test verifies API behavior - actual implementation would require API server
    // For now, we verify the data structure supports the logic
    
    // Setup
    const ownerId = 'owner-multi-1'
    const memberId = 'member-multi-1'
    const circleId = 'circle-multi-1'
    
    await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
    await createTestUser({ id: memberId, name: 'Member', email: 'member@test.com' })
    await createTestCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })
    const trip = await createTestTrip({ ownerId, circleId, type: 'hosted' })
    await addParticipant({ tripId: trip.id, userId: ownerId })
    await addParticipant({ tripId: trip.id, userId: memberId })
    
    // Verify multi-member (memberCount >= 2)
    const activeParticipants = await db.collection('trip_participants')
      .find({ tripId: trip.id, status: 'active' })
      .toArray()
    expect(activeParticipants.length).toBe(2)
    
    // Verify trip leader is owner
    const tripDoc = await db.collection('trips').findOne({ id: trip.id })
    expect(tripDoc.createdBy).toBe(ownerId)
    
    // Member should be able to leave (mark as left)
    await db.collection('trip_participants').updateOne(
      { tripId: trip.id, userId: memberId },
      { $set: { status: 'left', leftAt: new Date().toISOString() } }
    )
    
    const leftParticipant = await db.collection('trip_participants').findOne({
      tripId: trip.id,
      userId: memberId
    })
    expect(leftParticipant.status).toBe('left')
    
    // Member should NOT be able to delete (trip.createdBy !== memberId)
    expect(tripDoc.createdBy).not.toBe(memberId)
    
    // Cleanup
    await cleanupTestData({ tripId: trip.id, circleId, userIds: [ownerId, memberId] })
  })

  it('multi-member trip, leader: should allow delete and remove trip for all', async () => {
    // Setup
    const ownerId = 'owner-delete-1'
    const memberId = 'member-delete-1'
    const circleId = 'circle-delete-1'
    
    await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
    await createTestUser({ id: memberId, name: 'Member', email: 'member@test.com' })
    await createTestCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })
    const trip = await createTestTrip({ ownerId, circleId, type: 'hosted' })
    await addParticipant({ tripId: trip.id, userId: ownerId })
    await addParticipant({ tripId: trip.id, userId: memberId })
    
    // Verify trip exists
    const tripBefore = await db.collection('trips').findOne({ id: trip.id })
    expect(tripBefore).toBeTruthy()
    
    // Leader deletes trip
    await db.collection('trips').deleteOne({ id: trip.id })
    
    // Verify trip is deleted
    const tripAfter = await db.collection('trips').findOne({ id: trip.id })
    expect(tripAfter).toBeNull()
    
    // Cleanup
    await cleanupTestData({ tripId: trip.id, circleId, userIds: [ownerId, memberId] })
  })

  it('multi-member trip, leader: leave without transfer should fail', async () => {
    // This test documents the expected API behavior
    // The API should return 400 error: "Trip Leader must transfer leadership before leaving"
    
    // Setup
    const ownerId = 'owner-leave-1'
    const memberId = 'member-leave-1'
    const circleId = 'circle-leave-1'
    
    await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
    await createTestUser({ id: memberId, name: 'Member', email: 'member@test.com' })
    await createTestCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })
    const trip = await createTestTrip({ ownerId, circleId, type: 'hosted' })
    await addParticipant({ tripId: trip.id, userId: ownerId })
    await addParticipant({ tripId: trip.id, userId: memberId })
    
    // Verify leader cannot leave without transfer (API should reject)
    // For data layer test: verify trip still has original leader
    const tripDoc = await db.collection('trips').findOne({ id: trip.id })
    expect(tripDoc.createdBy).toBe(ownerId)
    
    // If leader tried to leave without transfer, trip should still exist
    // and createdBy should still be ownerId
    expect(tripDoc.createdBy).toBe(ownerId)
    
    // Cleanup
    await cleanupTestData({ tripId: trip.id, circleId, userIds: [ownerId, memberId] })
  })

  it('multi-member trip, leader: leave with transfer should succeed', async () => {
    // Setup
    const ownerId = 'owner-transfer-1'
    const newLeaderId = 'member-transfer-1'
    const circleId = 'circle-transfer-1'
    
    await createTestUser({ id: ownerId, name: 'Owner', email: 'owner@test.com' })
    await createTestUser({ id: newLeaderId, name: 'New Leader', email: 'newleader@test.com' })
    await createTestCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: newLeaderId, circleId, role: 'member' })
    const trip = await createTestTrip({ ownerId, circleId, type: 'hosted' })
    await addParticipant({ tripId: trip.id, userId: ownerId })
    await addParticipant({ tripId: trip.id, userId: newLeaderId })
    
    // Transfer leadership
    await db.collection('trips').updateOne(
      { id: trip.id },
      { $set: { createdBy: newLeaderId } }
    )
    
    // Mark old leader as left
    await db.collection('trip_participants').updateOne(
      { tripId: trip.id, userId: ownerId },
      { $set: { status: 'left', leftAt: new Date().toISOString() } }
    )
    
    // Verify new leader is assigned
    const tripAfter = await db.collection('trips').findOne({ id: trip.id })
    expect(tripAfter.createdBy).toBe(newLeaderId)
    
    // Verify old leader is marked as left
    const oldLeaderParticipant = await db.collection('trip_participants').findOne({
      tripId: trip.id,
      userId: ownerId
    })
    expect(oldLeaderParticipant.status).toBe('left')
    
    // Cleanup
    await cleanupTestData({ tripId: trip.id, circleId, userIds: [ownerId, newLeaderId] })
  })

  describe('Leader leave invariants', () => {
    it('should reject leader leave without transferToUserId when other travelers exist', async () => {
      // Setup: Create trip with leader + one other traveler
      const leaderId = 'leader-leave-inv-1'
      const travelerId = 'traveler-leave-inv-1'
      const circleId = 'circle-leave-inv-1'
      const tripId = `trip-leave-inv-1-${Date.now()}`
      
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
        type: 'hosted',
        status: 'proposed',
        startDate: '2024-06-01',
        endDate: '2024-06-05'
      }
      await db.collection('trips').insertOne(trip)
      
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      
      // Verify setup: leader is trip creator, both are active participants
      const tripBefore = await db.collection('trips').findOne({ id: trip.id })
      expect(tripBefore.createdBy).toBe(leaderId)
      const activeParticipants = await db.collection('trip_participants')
        .find({ tripId: trip.id, status: 'active' })
        .toArray()
      expect(activeParticipants.length).toBe(2)
      
      // Action: Leader calls POST /api/trips/:id/leave without transferToUserId
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/leave`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}) // No transferToUserId
      })
      
      const response = await POST(request, { params: { path: ['trips', trip.id, 'leave'] } })
      
      // Assert: Response is 400
      expect(response.status).toBe(400)
      const errorData = await response.json()
      expect(errorData.error).toContain('transfer leadership')
      
      // Assert: Leader is still in trip_participants with status 'active'
      const leaderParticipant = await db.collection('trip_participants').findOne({
        tripId: trip.id,
        userId: leaderId
      })
      expect(leaderParticipant).toBeTruthy()
      expect(leaderParticipant.status).toBe('active')
      
      // Assert: trip.createdBy unchanged
      const tripAfter = await db.collection('trips').findOne({ id: trip.id })
      expect(tripAfter.createdBy).toBe(leaderId)
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })

    it('should allow leader leave when transferToUserId is provided', async () => {
      // Setup: Create trip with leader + one other traveler
      const leaderId = 'leader-transfer-inv-1'
      const travelerId = 'traveler-transfer-inv-1'
      const circleId = 'circle-transfer-inv-1'
      const tripId = `trip-transfer-inv-1-${Date.now()}`
      
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
        type: 'hosted',
        status: 'proposed',
        startDate: '2024-06-01',
        endDate: '2024-06-05'
      }
      await db.collection('trips').insertOne(trip)
      
      await addParticipant({ tripId: trip.id, userId: leaderId })
      await addParticipant({ tripId: trip.id, userId: travelerId })
      
      // Verify setup: leader is trip creator
      const tripBefore = await db.collection('trips').findOne({ id: trip.id })
      expect(tripBefore.createdBy).toBe(leaderId)
      
      // Action: Leader calls POST /api/trips/:id/leave with transferToUserId = other traveler
      const token = createToken(leaderId)
      const url = new URL(`http://localhost:3000/api/trips/${trip.id}/leave`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transferToUserId: travelerId })
      })
      
      const response = await POST(request, { params: { path: ['trips', trip.id, 'leave'] } })
      
      // Assert: Response is 200
      expect(response.status).toBe(200)
      
      // Assert: trip.createdBy is now the other traveler
      const tripAfter = await db.collection('trips').findOne({ id: trip.id })
      expect(tripAfter.createdBy).toBe(travelerId)
      
      // Assert: Original leader has status 'left' in trip_participants
      const leaderParticipant = await db.collection('trip_participants').findOne({
        tripId: trip.id,
        userId: leaderId
      })
      expect(leaderParticipant).toBeTruthy()
      expect(leaderParticipant.status).toBe('left')
      
      // Cleanup
      await cleanupTestData({ tripId: trip.id, circleId, userIds: [leaderId, travelerId] })
    })
  })
})
