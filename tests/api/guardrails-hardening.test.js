/**
 * Guardrail tests for MVP hardening PR
 *
 * Tests:
 * - Left/removed users cannot post trip messages
 * - Canceled trips block scheduling mutations
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

let POST

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

describe('MVP Guardrails', () => {
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

  describe('Left user cannot post messages', () => {
    it('blocks messages from users with left status', async () => {
      const leaderId = 'user-guard-leader-1'
      const leftUserId = 'user-guard-left-1'
      const circleId = 'circle-guard-1'
      const tripId = 'trip-guard-msg-1'

      await cleanup({ tripId, circleId, userIds: [leaderId, leftUserId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'guard-leader1@example.com' })
      await createUser({ id: leftUserId, name: 'Left User', email: 'guard-left1@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: leftUserId, circleId, role: 'member' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      // Mark user as left
      await db.collection('trip_participants').insertOne({
        tripId,
        userId: leftUserId,
        status: 'left',
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })

      const token = createToken(leftUserId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: 'Should be blocked' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'messages'] } })
      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body.error).toMatch(/not an active traveler/i)

      await cleanup({ tripId, circleId, userIds: [leaderId, leftUserId] })
    })

    it('blocks messages from users with removed status', async () => {
      const leaderId = 'user-guard-leader-2'
      const removedUserId = 'user-guard-removed-1'
      const circleId = 'circle-guard-2'
      const tripId = 'trip-guard-msg-2'

      await cleanup({ tripId, circleId, userIds: [leaderId, removedUserId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'guard-leader2@example.com' })
      await createUser({ id: removedUserId, name: 'Removed User', email: 'guard-removed1@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await addMembership({ userId: removedUserId, circleId, role: 'member' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId })

      // Mark user as removed
      await db.collection('trip_participants').insertOne({
        tripId,
        userId: removedUserId,
        status: 'removed',
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      })

      const token = createToken(removedUserId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: 'Should be blocked' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'messages'] } })
      expect(response.status).toBe(403)

      const body = await response.json()
      expect(body.error).toMatch(/not an active traveler/i)

      await cleanup({ tripId, circleId, userIds: [leaderId, removedUserId] })
    })
  })

  describe('Canceled trip blocks scheduling mutations', () => {
    it('blocks date proposals on canceled trips', async () => {
      const leaderId = 'user-guard-leader-3'
      const circleId = 'circle-guard-3'
      const tripId = 'trip-guard-cancel-1'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'guard-leader3@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'CANCELLED', status: 'canceled' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ startDate: '2026-03-01', endDate: '2026-03-05' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'dates', 'propose'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('canceled')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('blocks date reactions on canceled trips', async () => {
      const leaderId = 'user-guard-leader-4'
      const circleId = 'circle-guard-4'
      const tripId = 'trip-guard-cancel-2'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'guard-leader4@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'CANCELLED', status: 'canceled' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ windowId: 'w1', reactionType: 'WORKS' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'dates', 'react'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('canceled')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })

    it('blocks lock-proposed on canceled trips', async () => {
      const leaderId = 'user-guard-leader-5'
      const circleId = 'circle-guard-5'
      const tripId = 'trip-guard-cancel-3'

      await cleanup({ tripId, circleId, userIds: [leaderId] })

      await createUser({ id: leaderId, name: 'Leader', email: 'guard-leader5@example.com' })
      await createCircle({ id: circleId, ownerId: leaderId })
      await addMembership({ userId: leaderId, circleId, role: 'owner' })
      await createTrip({ id: tripId, circleId, createdBy: leaderId, tripStatus: 'CANCELLED', status: 'canceled' })

      const token = createToken(leaderId)
      const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/lock-proposed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ windowId: 'w1' })
      })

      const response = await POST(request, { params: { path: ['trips', tripId, 'lock-proposed'] } })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toContain('canceled')

      await cleanup({ tripId, circleId, userIds: [leaderId] })
    })
  })
})
