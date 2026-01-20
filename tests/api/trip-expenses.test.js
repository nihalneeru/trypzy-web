/**
 * Tests for trip expenses API
 * 
 * These tests verify:
 * 1. Travelers can add expenses
 * 2. Travelers can view expenses
 * 3. Travelers can delete expenses
 * 4. Non-travelers cannot access expenses
 * 5. Validation works correctly
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// Helper to add a traveler to a trip
async function addTraveler({ db, tripId, userId }) {
  await db.collection('trip_participants').insertOne({
    tripId,
    userId,
    role: 'traveler',
    status: 'active',
    joinedAt: new Date().toISOString()
  })
}

// Import route handlers
let GET, POST, DELETE

beforeAll(async () => {
  // Setup test database (sets env vars and resets connection)
  const { db: _db, client: _client } = await setupTestDatabase()
  
  // Import route handlers after env vars are set
  const module = await import('@/app/api/trips/[tripId]/expenses/route.js')
  GET = module.GET
  POST = module.POST
  DELETE = module.DELETE
})

describe('Trip Expenses API', () => {
  let client
  let db
  
  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client
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
  })

  describe('GET /api/trips/:id/expenses', () => {
    it('should return expenses for a traveler', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
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
      
      const expense1 = {
        _id: new ObjectId(),
        title: 'Dinner',
        amountCents: 5000,
        currency: 'USD',
        paidByUserId: userId,
        splitBetweenUserIds: [userId],
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked',
        expenses: [expense1]
      })
      
      await addTraveler({ db, tripId, userId })
      
      const token = createToken(userId)
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const response = await GET(request, { params: { tripId } })

      // Assert
      if (response.status !== 200) {
        const errorData = await response.json().catch(() => ({}))
        console.log(`[DEBUG] GET failed: status=${response.status}, error=`, errorData)
      }
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(1)
      expect(data[0].title).toBe('Dinner')
      expect(data[0].amountCents).toBe(5000)
    })
    
    it('should return empty array if no expenses', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
      })
      
      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId
      })
      
      // Ensure BOTH membership + traveler record exist for userId
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
        status: 'locked',
        expenses: []
      })
      
      await addTraveler({ db, tripId, userId })
      
      const token = createToken(userId)
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`
        }
      })
      
      const response = await GET(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBe(0)
    })
    
    it('should return 403 for non-traveler', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup - ensure both users exist in the users collection
      await db.collection('users').insertOne({
        id: userId1,
        name: 'User 1',
        email: 'user1@test.com'
      })
      await db.collection('users').insertOne({
        id: userId2,
        name: 'User 2',
        email: 'user2@test.com'
      })
      
      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })
      
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
      
      // userId2 is authenticated (exists in users collection) but NOT a traveler
      // (no trip_participants record, not a circle member)
      const token = createToken(userId2)
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`
        }
      })
      
      const response = await GET(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not a traveler')
    })
  })

  describe('POST /api/trips/:id/expenses', () => {
    it('should add expense successfully', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
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
        status: 'locked',
        expenses: []
      })
      
      await addTraveler({ db, tripId, userId })
      
      const token = createToken(userId)
      
      // Execute - ensure amountCents is a number (not string)
      // Use authenticated user as payer and ensure splitBetweenUserIds contains only travelers
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const requestBody = {
        title: 'Lunch',
        amountCents: 3000, // Ensure it's a number
        currency: 'USD',
        paidByUserId: userId, // Authenticated user is the payer
        splitBetweenUserIds: [userId] // Contains only traveler IDs
      }
      
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const response = await POST(request, { params: { tripId } })
      
      // Assert
      if (response.status !== 200) {
        const errorData = await response.json().catch(() => ({}))
        console.log(`[DEBUG] POST failed: status=${response.status}, error=`, errorData)
      }
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.title).toBe('Lunch')
      expect(data.amountCents).toBe(3000)
      expect(data._id).toBeDefined()
      
      // Verify expense was added to trip
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.expenses.length).toBe(1)
      expect(trip.expenses[0].title).toBe('Lunch')
    })
    
    it('should validate required fields', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
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
      
      await addTraveler({ db, tripId, userId })
      
      const token = createToken(userId)
      
      // Execute - missing title
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amountCents: 3000,
          paidByUserId: userId,
          splitBetweenUserIds: [userId]
        })
      })
      
      const response = await POST(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Title is required')
    })
    
    it('should return 403 for non-traveler', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertMany([
        { id: userId1, name: 'User 1', email: 'user1@test.com' },
        { id: userId2, name: 'User 2', email: 'user2@test.com' }
      ])
      
      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })
      
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
      
      const token = createToken(userId2) // User 2 is not a member
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Lunch',
          amountCents: 3000,
          paidByUserId: userId2,
          splitBetweenUserIds: [userId2]
        })
      })
      
      const response = await POST(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not a traveler')
    })
    
    it('should allow circle member without trip_participants record to add expense (collaborative trip)', async () => {
      // Test case: collaborative trip where payer is a circle member but has NO trip_participants record
      // This should be allowed because isActiveTraveler returns true for circle members without left/removed status
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
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
        status: 'locked',
        expenses: []
      })
      
      // NOTE: Do NOT call addTraveler() - user has no trip_participants record
      // But they ARE a circle member, so they should be allowed to add expenses
      
      const token = createToken(userId)
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const requestBody = {
        title: 'Lunch',
        amountCents: 3000,
        currency: 'USD',
        paidByUserId: userId,
        splitBetweenUserIds: [userId]
      }
      
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const response = await POST(request, { params: { tripId } })
      
      // Assert - should succeed because circle member without trip_participants is valid
      if (response.status !== 200) {
        const errorData = await response.json().catch(() => ({}))
        console.log(`[DEBUG] POST failed: status=${response.status}, error=`, errorData)
      }
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.title).toBe('Lunch')
      expect(data.amountCents).toBe(3000)
      
      // Verify expense was added to trip
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.expenses.length).toBe(1)
      expect(trip.expenses[0].title).toBe('Lunch')
    })
    
    it('should reject left/removed participant even if still a circle member (collaborative trip)', async () => {
      // Test case: payer is a circle member but has trip_participants status='left' or 'removed'
      // This should be rejected even though they're still in the circle
      // Use a different user as the requester (who is a valid traveler) to test payer validation
      const userId1 = 'test-user-1' // Requester (valid traveler)
      const userId2 = 'test-user-2' // Payer (has 'left' status)
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      
      // Setup
      await db.collection('users').insertMany([
        { id: userId1, name: 'User 1', email: 'user1@test.com' },
        { id: userId2, name: 'User 2', email: 'user2@test.com' }
      ])
      
      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })
      
      await db.collection('memberships').insertMany([
        { userId: userId1, circleId, role: 'owner' },
        { userId: userId2, circleId, role: 'member' } // User 2 is still a circle member
      ])
      
      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId1,
        type: 'collaborative',
        status: 'locked',
        expenses: []
      })
      
      // User 1 is an active traveler (no trip_participants record = valid for collaborative)
      // User 2 has 'left' status - should be rejected as payer
      await db.collection('trip_participants').insertOne({
        tripId,
        userId: userId2,
        role: 'traveler',
        status: 'left', // User 2 has left the trip
        joinedAt: new Date().toISOString()
      })
      
      const token = createToken(userId1) // User 1 is the requester (valid traveler)
      
      // Execute - try to add expense with User 2 as payer (who has 'left' status)
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses`)
      const requestBody = {
        title: 'Lunch',
        amountCents: 3000,
        currency: 'USD',
        paidByUserId: userId2, // User 2 has 'left' status - should be rejected
        splitBetweenUserIds: [userId2]
      }
      
      const request = new NextRequest(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })
      
      const response = await POST(request, { params: { tripId } })
      
      // Assert - should fail because payer (userId2) has 'left' status
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Payer must be a traveler')
    })
  })

  describe('DELETE /api/trips/:id/expenses', () => {
    it('should delete expense successfully', async () => {
      const userId = 'test-user-1'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const expenseId = new ObjectId()
      
      // Setup
      await db.collection('users').insertOne({
        id: userId,
        name: 'User 1',
        email: 'user1@test.com'
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
      
      const expense = {
        _id: expenseId,
        title: 'Dinner',
        amountCents: 5000,
        currency: 'USD',
        paidByUserId: userId,
        splitBetweenUserIds: [userId],
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId,
        type: 'collaborative',
        status: 'locked',
        expenses: [expense]
      })
      
      await addTraveler({ db, tripId, userId })
      
      const token = createToken(userId)
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses?expenseId=${expenseId.toString()}`)
      const request = new NextRequest(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const response = await DELETE(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(200)
      
      // Verify expense was removed from trip
      const trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.expenses.length).toBe(0)
    })
    
    it('should return 403 for non-traveler', async () => {
      const userId1 = 'test-user-1'
      const userId2 = 'test-user-2'
      const circleId = 'circle-test-1'
      const tripId = 'trip-test-1'
      const expenseId = new ObjectId()
      
      // Setup
      await db.collection('users').insertMany([
        { id: userId1, name: 'User 1', email: 'user1@test.com' },
        { id: userId2, name: 'User 2', email: 'user2@test.com' }
      ])
      
      await db.collection('circles').insertOne({
        id: circleId,
        name: 'Test Circle',
        ownerId: userId1
      })
      
      await db.collection('memberships').insertOne({
        userId: userId1,
        circleId,
        role: 'owner'
      })
      
      const expense = {
        _id: expenseId,
        title: 'Dinner',
        amountCents: 5000,
        currency: 'USD',
        paidByUserId: userId1,
        splitBetweenUserIds: [userId1],
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne({
        id: tripId,
        name: 'Test Trip',
        circleId,
        createdBy: userId1,
        type: 'collaborative',
        status: 'locked',
        expenses: [expense]
      })
      
      const token = createToken(userId2) // User 2 is not a member
      
      // Execute
      const url = new URL(`http://localhost:3000/api/trips/${tripId}/expenses?expenseId=${expenseId.toString()}`)
      const request = new NextRequest(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const response = await DELETE(request, { params: { tripId } })
      
      // Assert
      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toContain('not a traveler')
    })
  })
})
