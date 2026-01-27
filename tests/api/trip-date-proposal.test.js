/**
 * Integration tests for Claude scheduling funnel (date proposal flow)
 *
 * Endpoints tested:
 * - POST /api/trips (creation: collaborative without dates, hosted with dates)
 * - POST /api/trips/:id/dates/propose (leader proposes dates)
 * - POST /api/trips/:id/dates/react (member reacts to proposal)
 * - POST /api/trips/:id/lock (locks dates with approval threshold)
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'

let POST

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

describe('Trip Date Proposal Flow', () => {
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

  it('allows collaborative trip creation without dates', async () => {
    const ownerId = 'user-owner-collab'
    const circleId = 'circle-collab'
    await createUser({ id: ownerId, name: 'Owner', email: 'owner@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })

    const token = createToken(ownerId)
    const request = new NextRequest('http://localhost:3000/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        circleId,
        name: 'Collab Trip',
        type: 'collaborative'
      })
    })

    const response = await POST(request, { params: { path: ['trips'] } })
    const body = await response.json()

    expect(response.status).toBe(200)
    // Current implementation uses dateProposal object (null for new trips)
    expect(body.dateProposal ?? null).toBeNull()
    expect(body.datesLocked).toBe(false)
    expect(body.schedulingMode).toBe('date_windows')

    await cleanup({ tripId: body.id, circleId, userIds: [ownerId] })
  })

  it('rejects hosted trip creation without dates', async () => {
    const ownerId = 'user-owner-hosted'
    const circleId = 'circle-hosted'
    await createUser({ id: ownerId, name: 'Owner', email: 'owner2@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })

    const token = createToken(ownerId)
    const request = new NextRequest('http://localhost:3000/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        circleId,
        name: 'Hosted Trip',
        type: 'hosted'
      })
    })

    const response = await POST(request, { params: { path: ['trips'] } })
    expect(response.status).toBe(400)

    await cleanup({ circleId, userIds: [ownerId] })
  })

  it('locks hosted trip dates at creation when dates are provided', async () => {
    const ownerId = 'user-owner-hosted-dates'
    const circleId = 'circle-hosted-dates'
    await createUser({ id: ownerId, name: 'Owner', email: 'owner3@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })

    const token = createToken(ownerId)
    const request = new NextRequest('http://localhost:3000/api/trips', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        circleId,
        name: 'Hosted Trip',
        type: 'hosted',
        startDate: '2025-06-10',
        endDate: '2025-06-12'
      })
    })

    const response = await POST(request, { params: { path: ['trips'] } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.datesLocked).toBe(true)
    // Current implementation uses lockedStartDate/lockedEndDate
    expect(body.lockedStartDate).toBe('2025-06-10')
    expect(body.lockedEndDate).toBe('2025-06-12')
    // dateProposal remains null for hosted trips (they skip the funnel)
    expect(body.dateProposal ?? null).toBeNull()

    await cleanup({ tripId: body.id, circleId, userIds: [ownerId] })
  })

  it('clears reactions when leader proposes new dates', async () => {
    const ownerId = 'user-owner-proposal'
    const memberId = 'user-member-proposal'
    const circleId = 'circle-proposal'
    const tripId = 'trip-proposal'

    // Clean up any leftover data from previous runs
    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })

    await createUser({ id: ownerId, name: 'Owner', email: 'owner4@example.com' })
    await createUser({ id: memberId, name: 'Member', email: 'member@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })

    // Insert trip with existing dateProposal and reactions (current schema)
    await db.collection('trips').insertOne({
      id: tripId,
      circleId,
      name: 'Trip',
      type: 'collaborative',
      status: 'voting',
      schedulingMode: 'funnel',
      createdBy: ownerId,
      datesLocked: false,
      dateProposal: {
        startDate: '2025-05-01',
        endDate: '2025-05-03',
        proposedBy: ownerId,
        proposedAt: new Date().toISOString()
      },
      dateReactions: [
        {
          userId: memberId,
          reactionType: 'WORKS',
          note: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString()
    })

    const ownerToken = createToken(ownerId)
    // Current endpoint: /dates/propose with { startDate, endDate }
    const request = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        startDate: '2025-06-01',
        endDate: '2025-06-05'
      })
    })

    const response = await POST(request, { params: { path: ['trips', tripId, 'dates', 'propose'] } })
    expect(response.status).toBe(200)

    const updatedTrip = await db.collection('trips').findOne({ id: tripId })
    // Current schema: dateProposal is an object
    expect(updatedTrip.dateProposal.startDate).toBe('2025-06-01')
    expect(updatedTrip.dateProposal.endDate).toBe('2025-06-05')
    // Reactions should be cleared when new dates are proposed
    expect(updatedTrip.dateReactions).toHaveLength(0)

    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })
  })

  it('upserts date reactions and blocks when locked', async () => {
    const ownerId = 'user-owner-reaction'
    const memberId = 'user-member-reaction'
    const circleId = 'circle-reaction'
    const tripId = 'trip-reaction'

    // Clean up any leftover data from previous runs
    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })

    await createUser({ id: ownerId, name: 'Owner', email: 'owner5@example.com' })
    await createUser({ id: memberId, name: 'Member', email: 'member2@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })

    // Insert trip with current schema (dateProposal object, dateReactions array)
    await db.collection('trips').insertOne({
      id: tripId,
      circleId,
      name: 'Trip',
      type: 'collaborative',
      status: 'voting',
      schedulingMode: 'funnel',
      createdBy: ownerId,
      datesLocked: false,
      dateProposal: {
        startDate: '2025-07-01',
        endDate: '2025-07-03',
        proposedBy: ownerId,
        proposedAt: new Date().toISOString()
      },
      dateReactions: [],
      createdAt: new Date().toISOString()
    })

    const memberToken = createToken(memberId)
    // Current endpoint: /dates/react
    const firstRequest = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`
      },
      body: JSON.stringify({ reactionType: 'WORKS' })
    })

    const firstResponse = await POST(firstRequest, { params: { path: ['trips', tripId, 'dates', 'react'] } })
    expect(firstResponse.status).toBe(200)

    let updatedTrip = await db.collection('trips').findOne({ id: tripId })
    expect(updatedTrip.dateReactions).toHaveLength(1)
    expect(updatedTrip.dateReactions[0].reactionType).toBe('WORKS')

    // Update reaction (upsert behavior)
    const secondRequest = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`
      },
      body: JSON.stringify({ reactionType: 'CANT' })
    })

    const secondResponse = await POST(secondRequest, { params: { path: ['trips', tripId, 'dates', 'react'] } })
    expect(secondResponse.status).toBe(200)

    updatedTrip = await db.collection('trips').findOne({ id: tripId })
    expect(updatedTrip.dateReactions).toHaveLength(1)
    expect(updatedTrip.dateReactions[0].reactionType).toBe('CANT')

    // Lock the trip manually to test blocking
    await db.collection('trips').updateOne(
      { id: tripId },
      { $set: { datesLocked: true, status: 'locked', lockedStartDate: '2025-07-01', lockedEndDate: '2025-07-03' } }
    )

    const lockedRequest = new NextRequest(`http://localhost:3000/api/trips/${tripId}/dates/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`
      },
      body: JSON.stringify({ reactionType: 'WORKS' })
    })

    const lockedResponse = await POST(lockedRequest, { params: { path: ['trips', tripId, 'dates', 'react'] } })
    expect(lockedResponse.status).toBe(400)

    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })
  })

  it('locks dates only when approval threshold is met', async () => {
    const ownerId = 'user-owner-lock'
    const memberId = 'user-member-lock'
    const circleId = 'circle-lock'
    const tripId = 'trip-lock'

    // Clean up any leftover data from previous runs
    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })

    await createUser({ id: ownerId, name: 'Owner', email: 'owner6@example.com' })
    await createUser({ id: memberId, name: 'Member', email: 'member3@example.com' })
    await createCircle({ id: circleId, ownerId })
    await addMembership({ userId: ownerId, circleId, role: 'owner' })
    await addMembership({ userId: memberId, circleId, role: 'member' })

    // Insert trip with current schema - funnel mode, dateProposal set, no reactions yet
    await db.collection('trips').insertOne({
      id: tripId,
      circleId,
      name: 'Trip',
      type: 'collaborative',
      status: 'voting',
      schedulingMode: 'funnel',
      createdBy: ownerId,
      datesLocked: false,
      dateProposal: {
        startDate: '2025-08-01',
        endDate: '2025-08-03',
        proposedBy: ownerId,
        proposedAt: new Date().toISOString()
      },
      dateReactions: [],
      createdAt: new Date().toISOString()
    })

    const ownerToken = createToken(ownerId)

    // Try to lock without approvals - should fail (2 members, need 1 approval)
    const lockRequest = new NextRequest(`http://localhost:3000/api/trips/${tripId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({})
    })
    const lockResponse = await POST(lockRequest, { params: { path: ['trips', tripId, 'lock'] } })
    expect(lockResponse.status).toBe(400)

    // Add approval reaction (1 WORKS from owner - meets threshold of ceil(2/2)=1)
    await db.collection('trips').updateOne(
      { id: tripId },
      {
        $set: {
          dateReactions: [
            {
              userId: ownerId,
              userName: 'Owner',
              reactionType: 'WORKS',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]
        }
      }
    )

    // Now try to lock with sufficient approvals
    const lockRequestReady = new NextRequest(`http://localhost:3000/api/trips/${tripId}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`
      },
      body: JSON.stringify({})
    })
    const lockResponseReady = await POST(lockRequestReady, { params: { path: ['trips', tripId, 'lock'] } })
    expect(lockResponseReady.status).toBe(200)

    const updatedTrip = await db.collection('trips').findOne({ id: tripId })
    expect(updatedTrip.datesLocked).toBe(true)
    expect(updatedTrip.status).toBe('locked')
    // Current schema uses lockedStartDate/lockedEndDate
    expect(updatedTrip.lockedStartDate).toBe('2025-08-01')
    expect(updatedTrip.lockedEndDate).toBe('2025-08-03')

    await cleanup({ tripId, circleId, userIds: [ownerId, memberId] })
  })
})
