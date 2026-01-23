/**
 * Tests for active traveler privacy filters
 *
 * These tests verify:
 * 1. canViewerSeeTrip - determines if a viewer can see a trip based on:
 *    - Viewer is the trip creator
 *    - Viewer is an active traveler (circle member for collaborative, participant for hosted)
 *    - Trip creator's tripsVisibility setting ('public', 'friends', 'private')
 *    - Viewer is a friend of the creator
 *
 * 2. filterTripsByActiveTravelerPrivacy - filters trips list based on privacy
 *
 * The "most restrictive traveler wins" rule:
 * - If ANY active traveler has privacy='private', non-travelers cannot see the trip
 * - Trip creators can always see their trips
 * - Active travelers can always see trips they are on
 */

import { setupTestDatabase, teardownTestDatabase } from '../testUtils/dbTestHarness.js'
import { canViewerSeeTrip, filterTripsByActiveTravelerPrivacy } from '../../lib/trips/canViewerSeeTrip.js'

describe('Active Traveler Privacy Filters', () => {
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
    await db.collection('users').deleteMany({ id: /^test-privacy-/ })
    await db.collection('trips').deleteMany({ id: /^trip-privacy-/ })
    await db.collection('circles').deleteMany({ id: /^circle-privacy-/ })
    await db.collection('memberships').deleteMany({ userId: /^test-privacy-/ })
    await db.collection('trip_participants').deleteMany({ tripId: /^trip-privacy-/ })
    await db.collection('friendships').deleteMany({ userId: /^test-privacy-/ })
  })

  // ============================================================================
  // Helper functions for creating test data
  // ============================================================================

  async function createTestUser({ id, name, email, privacy = {} }) {
    const user = {
      id,
      name,
      email,
      privacy: {
        tripsVisibility: privacy.tripsVisibility || 'circle',
        ...privacy
      },
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
      inviteCode: `CODE-${id}`,
      createdAt: new Date().toISOString()
    }
    await db.collection('circles').insertOne(circle)
    return circle
  }

  async function createTestTrip({ id, name, circleId, createdBy, type = 'collaborative', status = 'proposed' }) {
    const trip = {
      id,
      name,
      circleId,
      createdBy,
      type,
      status,
      startDate: '2025-06-01',
      endDate: '2025-06-07',
      createdAt: new Date().toISOString()
    }
    await db.collection('trips').insertOne(trip)
    return trip
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
      id: `participant-${tripId}-${userId}`,
      tripId,
      userId,
      status,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    })
  }

  async function addFriendship({ userId, friendId }) {
    // Bidirectional friendship
    const now = new Date().toISOString()
    await db.collection('friendships').insertMany([
      { userId, friendId, status: 'accepted', createdAt: now },
      { userId: friendId, friendId: userId, status: 'accepted', createdAt: now }
    ])
  }

  // ============================================================================
  // canViewerSeeTrip Tests
  // ============================================================================

  describe('canViewerSeeTrip', () => {

    describe('Trip Creator Access', () => {

      it('should allow trip creator to always see their own trip', async () => {
        // Setup: Creator with private privacy creates a trip
        const creatorId = 'test-privacy-creator-1'
        const circleId = 'circle-privacy-1'
        const tripId = 'trip-privacy-1'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Private Trip',
          circleId,
          createdBy: creatorId
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: creatorId,
          trip,
          db
        })

        // Assert
        expect(canSee).toBe(true)
      })

      it('should allow trip creator to see trip regardless of other travelers privacy settings', async () => {
        // Setup: Creator creates trip, another traveler has private privacy
        const creatorId = 'test-privacy-creator-2'
        const travelerId = 'test-privacy-traveler-2'
        const circleId = 'circle-privacy-2'
        const tripId = 'trip-privacy-2'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'public' }
        })
        await createTestUser({
          id: travelerId,
          name: 'Private Traveler',
          email: 'private@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Multi-traveler Trip',
          circleId,
          createdBy: creatorId
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: travelerId, circleId, role: 'member' })
        await addParticipant({ tripId, userId: creatorId })
        await addParticipant({ tripId, userId: travelerId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: creatorId,
          trip,
          db
        })

        // Assert
        expect(canSee).toBe(true)
      })
    })

    describe('Active Traveler Access - Collaborative Trips', () => {

      it('should allow active circle member to see collaborative trip', async () => {
        // Setup: Creator creates collaborative trip, viewer is circle member
        const creatorId = 'test-privacy-creator-3'
        const viewerId = 'test-privacy-viewer-3'
        const circleId = 'circle-privacy-3'
        const tripId = 'trip-privacy-3'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'circle' }
        })
        await createTestUser({
          id: viewerId,
          name: 'Circle Member',
          email: 'member@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: viewerId, circleId, role: 'member' })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          db
        })

        // Assert
        expect(canSee).toBe(true)
      })

      it('should allow circle member to see trip even if another traveler has private privacy', async () => {
        // Setup: Collaborative trip with a private traveler, viewer is also circle member
        const creatorId = 'test-privacy-creator-4'
        const privateTravelerId = 'test-privacy-private-4'
        const viewerId = 'test-privacy-viewer-4'
        const circleId = 'circle-privacy-4'
        const tripId = 'trip-privacy-4'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com'
        })
        await createTestUser({
          id: privateTravelerId,
          name: 'Private Traveler',
          email: 'private@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: viewerId,
          name: 'Viewer',
          email: 'viewer@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: privateTravelerId, circleId, role: 'member' })
        await addMembership({ userId: viewerId, circleId, role: 'member' })

        // Execute: Viewer is circle member (active traveler), so they can see
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          db
        })

        // Assert: Active traveler can always see trips they are on
        expect(canSee).toBe(true)
      })

      it('should NOT allow non-member to see collaborative trip with private traveler', async () => {
        // Setup: Collaborative trip with private traveler, viewer is NOT circle member
        const creatorId = 'test-privacy-creator-5'
        const travelerId = 'test-privacy-traveler-5'
        const outsiderId = 'test-privacy-outsider-5'
        const circleId = 'circle-privacy-5'
        const tripId = 'trip-privacy-5'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com'
        })
        await createTestUser({
          id: travelerId,
          name: 'Private Traveler',
          email: 'private@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: outsiderId,
          name: 'Outsider',
          email: 'outsider@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: travelerId, circleId, role: 'member' })
        // outsiderId is NOT a member

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: outsiderId,
          trip,
          db
        })

        // Assert: Non-member cannot see trip with private traveler
        expect(canSee).toBe(false)
      })

      it('should allow non-member to see collaborative trip with public visibility', async () => {
        // Setup: Collaborative trip with all public travelers
        const creatorId = 'test-privacy-creator-6'
        const travelerId = 'test-privacy-traveler-6'
        const outsiderId = 'test-privacy-outsider-6'
        const circleId = 'circle-privacy-6'
        const tripId = 'trip-privacy-6'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'public' }
        })
        await createTestUser({
          id: travelerId,
          name: 'Public Traveler',
          email: 'public@test.com',
          privacy: { tripsVisibility: 'public' }
        })
        await createTestUser({
          id: outsiderId,
          name: 'Outsider',
          email: 'outsider@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Public Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: travelerId, circleId, role: 'member' })
        // outsiderId is NOT a member

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: outsiderId,
          trip,
          db
        })

        // Assert: No private travelers, so non-member can see
        expect(canSee).toBe(true)
      })

      it('should NOT allow left member to see collaborative trip with private traveler', async () => {
        // Setup: User was circle member but has left status
        const creatorId = 'test-privacy-creator-7'
        const leftMemberId = 'test-privacy-left-7'
        const circleId = 'circle-privacy-7'
        const tripId = 'trip-privacy-7'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: leftMemberId,
          name: 'Left Member',
          email: 'left@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: leftMemberId, circleId, role: 'member' })
        // Mark user as left in trip_participants
        await addParticipant({ tripId, userId: leftMemberId, status: 'left' })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: leftMemberId,
          trip,
          db
        })

        // Assert: Left user is not an active traveler, and creator is private
        expect(canSee).toBe(false)
      })

      it('should NOT allow removed member to see collaborative trip with private traveler', async () => {
        // Setup: User was removed from trip
        const creatorId = 'test-privacy-creator-8'
        const removedMemberId = 'test-privacy-removed-8'
        const circleId = 'circle-privacy-8'
        const tripId = 'trip-privacy-8'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: removedMemberId,
          name: 'Removed Member',
          email: 'removed@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Collaborative Trip',
          circleId,
          createdBy: creatorId,
          type: 'collaborative'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: removedMemberId, circleId, role: 'member' })
        // Mark user as removed in trip_participants
        await addParticipant({ tripId, userId: removedMemberId, status: 'removed' })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: removedMemberId,
          trip,
          db
        })

        // Assert: Removed user is not an active traveler
        expect(canSee).toBe(false)
      })
    })

    describe('Active Traveler Access - Hosted Trips', () => {

      it('should allow hosted trip participant to see the trip', async () => {
        // Setup: Hosted trip with explicit participant
        const creatorId = 'test-privacy-creator-9'
        const participantId = 'test-privacy-participant-9'
        const circleId = 'circle-privacy-9'
        const tripId = 'trip-privacy-9'

        await createTestUser({
          id: creatorId,
          name: 'Host',
          email: 'host@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: participantId,
          name: 'Participant',
          email: 'participant@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Hosted Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })
        await addParticipant({ tripId, userId: participantId, status: 'active' })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: participantId,
          trip,
          db
        })

        // Assert: Active participant can see hosted trip
        expect(canSee).toBe(true)
      })

      it('should NOT allow non-participant to see hosted trip with private visibility', async () => {
        // Setup: Hosted trip, viewer is circle member but NOT participant
        const creatorId = 'test-privacy-creator-10'
        const circleMemberId = 'test-privacy-member-10'
        const circleId = 'circle-privacy-10'
        const tripId = 'trip-privacy-10'

        await createTestUser({
          id: creatorId,
          name: 'Host',
          email: 'host@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: circleMemberId,
          name: 'Circle Member',
          email: 'member@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Private Hosted Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addMembership({ userId: circleMemberId, circleId, role: 'member' })
        // Only creator is participant
        await addParticipant({ tripId, userId: creatorId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: circleMemberId,
          trip,
          db
        })

        // Assert: Circle member is NOT a hosted trip participant, and host is private
        expect(canSee).toBe(false)
      })

      it('should NOT allow left participant to see hosted trip with private visibility', async () => {
        // Setup: User left the hosted trip
        const creatorId = 'test-privacy-creator-11'
        const leftParticipantId = 'test-privacy-left-11'
        const circleId = 'circle-privacy-11'
        const tripId = 'trip-privacy-11'

        await createTestUser({
          id: creatorId,
          name: 'Host',
          email: 'host@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: leftParticipantId,
          name: 'Left Participant',
          email: 'left@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Hosted Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })
        await addParticipant({ tripId, userId: leftParticipantId, status: 'left' })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: leftParticipantId,
          trip,
          db
        })

        // Assert: Left participant is not active, cannot see private trip
        expect(canSee).toBe(false)
      })

      it('should allow non-participant to see hosted trip when all travelers are public', async () => {
        // Setup: Hosted trip with public host
        const creatorId = 'test-privacy-creator-12'
        const outsiderId = 'test-privacy-outsider-12'
        const circleId = 'circle-privacy-12'
        const tripId = 'trip-privacy-12'

        await createTestUser({
          id: creatorId,
          name: 'Public Host',
          email: 'host@test.com',
          privacy: { tripsVisibility: 'public' }
        })
        await createTestUser({
          id: outsiderId,
          name: 'Outsider',
          email: 'outsider@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Public Hosted Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: outsiderId,
          trip,
          db
        })

        // Assert: No private travelers, so anyone can see
        expect(canSee).toBe(true)
      })
    })

    describe('Friends Visibility', () => {

      it('should allow friend of creator to see trip with friends visibility', async () => {
        // Note: Current implementation uses "most restrictive wins" rule
        // This test documents expected behavior for friends visibility expansion
        const creatorId = 'test-privacy-creator-13'
        const friendId = 'test-privacy-friend-13'
        const circleId = 'circle-privacy-13'
        const tripId = 'trip-privacy-13'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'friends' }
        })
        await createTestUser({
          id: friendId,
          name: 'Friend',
          email: 'friend@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Friends-only Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })
        await addFriendship({ userId: creatorId, friendId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: friendId,
          trip,
          db
        })

        // Assert: Current implementation - 'friends' is not 'private', so visible
        // (Friends-specific logic may be added later)
        expect(canSee).toBe(true)
      })

      it('should NOT allow non-friend to see trip with friends visibility (when private traveler exists)', async () => {
        // This documents behavior when a traveler has private visibility
        const creatorId = 'test-privacy-creator-14'
        const nonFriendId = 'test-privacy-nonfriend-14'
        const circleId = 'circle-privacy-14'
        const tripId = 'trip-privacy-14'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' } // Private, not friends
        })
        await createTestUser({
          id: nonFriendId,
          name: 'Non-Friend',
          email: 'nonfriend@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Private Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })
        // No friendship exists

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId: nonFriendId,
          trip,
          db
        })

        // Assert: Non-friend cannot see private trip
        expect(canSee).toBe(false)
      })
    })

    describe('Edge Cases', () => {

      it('should return false when viewerId is null', async () => {
        const trip = { id: 'trip-edge-1', createdBy: 'user-1' }

        const canSee = await canViewerSeeTrip({
          viewerId: null,
          trip,
          db
        })

        expect(canSee).toBe(false)
      })

      it('should return false when trip is null', async () => {
        const canSee = await canViewerSeeTrip({
          viewerId: 'user-1',
          trip: null,
          db
        })

        expect(canSee).toBe(false)
      })

      it('should return false when db is null', async () => {
        const trip = { id: 'trip-edge-3', createdBy: 'user-1' }

        const canSee = await canViewerSeeTrip({
          viewerId: 'user-1',
          trip,
          db: null
        })

        expect(canSee).toBe(false)
      })

      it('should allow viewing trip with no active travelers (empty trip)', async () => {
        // Edge case: trip exists but has no participants
        const creatorId = 'test-privacy-creator-15'
        const viewerId = 'test-privacy-viewer-15'
        const circleId = 'circle-privacy-15'
        const tripId = 'trip-privacy-15'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: viewerId,
          name: 'Viewer',
          email: 'viewer@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Empty Hosted Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        // No participants added

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          db
        })

        // Assert: Empty trip is visible (edge case safety fallback)
        expect(canSee).toBe(true)
      })

      it('should handle trip with missing privacy settings (default to circle)', async () => {
        const creatorId = 'test-privacy-creator-16'
        const viewerId = 'test-privacy-viewer-16'
        const circleId = 'circle-privacy-16'
        const tripId = 'trip-privacy-16'

        // User without privacy settings
        await db.collection('users').insertOne({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com'
          // No privacy object
        })
        await createTestUser({
          id: viewerId,
          name: 'Viewer',
          email: 'viewer@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addMembership({ userId: creatorId, circleId, role: 'owner' })
        await addParticipant({ tripId, userId: creatorId })

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          db
        })

        // Assert: Default is 'circle', not 'private', so visible
        expect(canSee).toBe(true)
      })

      it('should work with pre-computed activeTravelerIds', async () => {
        const creatorId = 'test-privacy-creator-17'
        const viewerId = 'test-privacy-viewer-17'
        const circleId = 'circle-privacy-17'
        const tripId = 'trip-privacy-17'

        await createTestUser({
          id: creatorId,
          name: 'Creator',
          email: 'creator@test.com',
          privacy: { tripsVisibility: 'private' }
        })
        await createTestUser({
          id: viewerId,
          name: 'Viewer',
          email: 'viewer@test.com'
        })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addParticipant({ tripId, userId: creatorId })

        // Pre-computed active traveler IDs including viewer
        const activeTravelerIds = new Set([creatorId, viewerId])

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          activeTravelerIds,
          db
        })

        // Assert: Viewer is in pre-computed active travelers, so can see
        expect(canSee).toBe(true)
      })

      it('should work with pre-computed travelerPrivacyMap', async () => {
        const creatorId = 'test-privacy-creator-18'
        const viewerId = 'test-privacy-viewer-18'
        const circleId = 'circle-privacy-18'
        const tripId = 'trip-privacy-18'

        await createTestUser({ id: creatorId, name: 'Creator', email: 'creator@test.com' })
        await createTestUser({ id: viewerId, name: 'Viewer', email: 'viewer@test.com' })
        await createTestCircle({ id: circleId, ownerId: creatorId })
        const trip = await createTestTrip({
          id: tripId,
          name: 'Trip',
          circleId,
          createdBy: creatorId,
          type: 'hosted'
        })
        await addParticipant({ tripId, userId: creatorId })

        // Pre-computed privacy map with private setting
        const travelerPrivacyMap = new Map([
          [creatorId, { tripsVisibility: 'private' }]
        ])

        // Execute
        const canSee = await canViewerSeeTrip({
          viewerId,
          trip,
          activeTravelerIds: new Set([creatorId]),
          travelerPrivacyMap,
          db
        })

        // Assert: Privacy map shows private, viewer is not active, cannot see
        expect(canSee).toBe(false)
      })
    })
  })

  // ============================================================================
  // filterTripsByActiveTravelerPrivacy Tests
  // ============================================================================

  describe('filterTripsByActiveTravelerPrivacy', () => {

    it('should return empty array when trips is empty', async () => {
      const viewerId = 'test-privacy-viewer-filter-1'

      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [],
        db
      })

      expect(filtered).toEqual([])
    })

    it('should return empty array when viewerId is null', async () => {
      const trips = [{ id: 'trip-1', createdBy: 'user-1' }]

      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId: null,
        trips,
        db
      })

      expect(filtered).toEqual([])
    })

    it('should filter out private trips from non-travelers', async () => {
      const creatorId = 'test-privacy-creator-f1'
      const viewerId = 'test-privacy-viewer-f1'
      const circleId = 'circle-privacy-f1'
      const tripId1 = 'trip-privacy-f1a'
      const tripId2 = 'trip-privacy-f1b'

      // Creator with private privacy
      await createTestUser({
        id: creatorId,
        name: 'Creator',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: viewerId,
        name: 'Viewer',
        email: 'viewer@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: creatorId })

      // Private trip (hosted, viewer not participant)
      const privateTrip = await createTestTrip({
        id: tripId1,
        name: 'Private Trip',
        circleId,
        createdBy: creatorId,
        type: 'hosted'
      })
      await addParticipant({ tripId: tripId1, userId: creatorId })

      // Public trip
      const publicCreatorId = 'test-privacy-public-f1'
      await createTestUser({
        id: publicCreatorId,
        name: 'Public Creator',
        email: 'public@test.com',
        privacy: { tripsVisibility: 'public' }
      })
      const publicTrip = await createTestTrip({
        id: tripId2,
        name: 'Public Trip',
        circleId,
        createdBy: publicCreatorId,
        type: 'hosted'
      })
      await addParticipant({ tripId: tripId2, userId: publicCreatorId })

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [privateTrip, publicTrip],
        db
      })

      // Assert: Only public trip is visible
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(tripId2)
    })

    it('should include all trips where viewer is active traveler', async () => {
      const creatorId = 'test-privacy-creator-f2'
      const viewerId = 'test-privacy-viewer-f2'
      const circleId = 'circle-privacy-f2'
      const tripId1 = 'trip-privacy-f2a'
      const tripId2 = 'trip-privacy-f2b'

      await createTestUser({
        id: creatorId,
        name: 'Creator',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: viewerId,
        name: 'Viewer',
        email: 'viewer@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: creatorId })
      await addMembership({ userId: creatorId, circleId, role: 'owner' })
      await addMembership({ userId: viewerId, circleId, role: 'member' })

      // Collaborative trip (viewer is circle member = active traveler)
      const collaborativeTrip = await createTestTrip({
        id: tripId1,
        name: 'Collaborative Trip',
        circleId,
        createdBy: creatorId,
        type: 'collaborative'
      })

      // Hosted trip (viewer is participant = active traveler)
      const hostedTrip = await createTestTrip({
        id: tripId2,
        name: 'Hosted Trip',
        circleId,
        createdBy: creatorId,
        type: 'hosted'
      })
      await addParticipant({ tripId: tripId2, userId: creatorId })
      await addParticipant({ tripId: tripId2, userId: viewerId })

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [collaborativeTrip, hostedTrip],
        db
      })

      // Assert: Both trips visible because viewer is active traveler on both
      expect(filtered).toHaveLength(2)
      expect(filtered.map(t => t.id).sort()).toEqual([tripId1, tripId2].sort())
    })

    it('should exclude trips where viewer has left status', async () => {
      const creatorId = 'test-privacy-creator-f3'
      const viewerId = 'test-privacy-viewer-f3'
      const circleId = 'circle-privacy-f3'
      const tripId1 = 'trip-privacy-f3a'
      const tripId2 = 'trip-privacy-f3b'

      await createTestUser({
        id: creatorId,
        name: 'Creator',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: viewerId,
        name: 'Viewer',
        email: 'viewer@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: creatorId })
      await addMembership({ userId: creatorId, circleId, role: 'owner' })
      await addMembership({ userId: viewerId, circleId, role: 'member' })

      // Collaborative trip where viewer has left
      const leftTrip = await createTestTrip({
        id: tripId1,
        name: 'Left Trip',
        circleId,
        createdBy: creatorId,
        type: 'collaborative'
      })
      await addParticipant({ tripId: tripId1, userId: viewerId, status: 'left' })

      // Collaborative trip where viewer is active
      const activeTrip = await createTestTrip({
        id: tripId2,
        name: 'Active Trip',
        circleId,
        createdBy: creatorId,
        type: 'collaborative'
      })
      // No participant record = active by default for collaborative

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [leftTrip, activeTrip],
        db
      })

      // Assert: Only active trip visible (left trip has private creator)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(tripId2)
    })

    it('should handle mixed trip types efficiently', async () => {
      const creatorId = 'test-privacy-creator-f4'
      const viewerId = 'test-privacy-viewer-f4'
      const circleId = 'circle-privacy-f4'

      await createTestUser({
        id: creatorId,
        name: 'Creator',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'circle' }
      })
      await createTestUser({
        id: viewerId,
        name: 'Viewer',
        email: 'viewer@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: creatorId })
      await addMembership({ userId: creatorId, circleId, role: 'owner' })
      await addMembership({ userId: viewerId, circleId, role: 'member' })

      // Create multiple trips of different types
      const trips = []
      for (let i = 0; i < 5; i++) {
        const tripId = `trip-privacy-f4-${i}`
        const type = i % 2 === 0 ? 'collaborative' : 'hosted'
        const trip = await createTestTrip({
          id: tripId,
          name: `Trip ${i}`,
          circleId,
          createdBy: creatorId,
          type
        })
        trips.push(trip)

        // For hosted trips, add participant
        if (type === 'hosted') {
          await addParticipant({ tripId, userId: creatorId })
          if (i === 1) {
            // Add viewer to one hosted trip
            await addParticipant({ tripId, userId: viewerId })
          }
        }
      }

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips,
        db
      })

      // Assert:
      // - All collaborative trips visible (viewer is circle member)
      // - Hosted trip 1 visible (viewer is participant)
      // - Hosted trip 3 visible (creator not private)
      expect(filtered.length).toBeGreaterThanOrEqual(3)
    })

    it('should include trips where viewer is the creator', async () => {
      const viewerId = 'test-privacy-creator-f5' // Viewer IS the creator
      const circleId = 'circle-privacy-f5'
      const tripId = 'trip-privacy-f5'

      await createTestUser({
        id: viewerId,
        name: 'Creator/Viewer',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestCircle({ id: circleId, ownerId: viewerId })

      const trip = await createTestTrip({
        id: tripId,
        name: 'My Private Trip',
        circleId,
        createdBy: viewerId,
        type: 'hosted'
      })
      await addParticipant({ tripId, userId: viewerId })

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [trip],
        db
      })

      // Assert: Creator can see their own trip
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(tripId)
    })

    it('should correctly apply most restrictive traveler wins rule', async () => {
      const publicCreatorId = 'test-privacy-public-f6'
      const privateTravelerId = 'test-privacy-private-f6'
      const viewerId = 'test-privacy-viewer-f6'
      const circleId = 'circle-privacy-f6'
      const tripId = 'trip-privacy-f6'

      // Public creator
      await createTestUser({
        id: publicCreatorId,
        name: 'Public Creator',
        email: 'public@test.com',
        privacy: { tripsVisibility: 'public' }
      })
      // Private traveler
      await createTestUser({
        id: privateTravelerId,
        name: 'Private Traveler',
        email: 'private@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: viewerId,
        name: 'Viewer',
        email: 'viewer@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: publicCreatorId })
      await addMembership({ userId: publicCreatorId, circleId, role: 'owner' })
      await addMembership({ userId: privateTravelerId, circleId, role: 'member' })
      // viewer is NOT a member

      // Collaborative trip with both public creator and private traveler
      const trip = await createTestTrip({
        id: tripId,
        name: 'Mixed Privacy Trip',
        circleId,
        createdBy: publicCreatorId,
        type: 'collaborative'
      })

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips: [trip],
        db
      })

      // Assert: Private traveler means non-members cannot see
      expect(filtered).toHaveLength(0)
    })
  })

  // ============================================================================
  // Integration / Real-world Scenario Tests
  // ============================================================================

  describe('Real-world Scenarios', () => {

    it('Scenario: Circle owner creates trip, invites friend, friend can see', async () => {
      const ownerId = 'test-privacy-owner-s1'
      const friendId = 'test-privacy-friend-s1'
      const circleId = 'circle-privacy-s1'
      const tripId = 'trip-privacy-s1'

      await createTestUser({
        id: ownerId,
        name: 'Circle Owner',
        email: 'owner@test.com',
        privacy: { tripsVisibility: 'circle' }
      })
      await createTestUser({
        id: friendId,
        name: 'Friend',
        email: 'friend@test.com'
      })
      await createTestCircle({ id: circleId, ownerId })
      await addMembership({ userId: ownerId, circleId, role: 'owner' })
      await addMembership({ userId: friendId, circleId, role: 'member' })

      const trip = await createTestTrip({
        id: tripId,
        name: 'Friend Group Trip',
        circleId,
        createdBy: ownerId,
        type: 'collaborative'
      })

      const canSee = await canViewerSeeTrip({
        viewerId: friendId,
        trip,
        db
      })

      expect(canSee).toBe(true)
    })

    it('Scenario: User leaves circle, cannot see collaborative trips anymore (when private traveler exists)', async () => {
      const creatorId = 'test-privacy-creator-s2'
      const leftUserId = 'test-privacy-left-s2'
      const circleId = 'circle-privacy-s2'
      const tripId = 'trip-privacy-s2'

      await createTestUser({
        id: creatorId,
        name: 'Creator',
        email: 'creator@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: leftUserId,
        name: 'Left User',
        email: 'left@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: creatorId })
      await addMembership({ userId: creatorId, circleId, role: 'owner' })
      // leftUserId was a member but left (membership removed or status changed)

      const trip = await createTestTrip({
        id: tripId,
        name: 'Private Trip',
        circleId,
        createdBy: creatorId,
        type: 'collaborative'
      })
      // Mark as left in trip_participants
      await addParticipant({ tripId, userId: leftUserId, status: 'left' })

      const canSee = await canViewerSeeTrip({
        viewerId: leftUserId,
        trip,
        db
      })

      // Left user cannot see trip with private creator
      expect(canSee).toBe(false)
    })

    it('Scenario: Hosted trip with mixed privacy travelers, non-participant blocked', async () => {
      const hostId = 'test-privacy-host-s3'
      const publicGuestId = 'test-privacy-public-s3'
      const privateGuestId = 'test-privacy-private-s3'
      const outsiderId = 'test-privacy-outsider-s3'
      const circleId = 'circle-privacy-s3'
      const tripId = 'trip-privacy-s3'

      await createTestUser({
        id: hostId,
        name: 'Host',
        email: 'host@test.com',
        privacy: { tripsVisibility: 'public' }
      })
      await createTestUser({
        id: publicGuestId,
        name: 'Public Guest',
        email: 'public@test.com',
        privacy: { tripsVisibility: 'public' }
      })
      await createTestUser({
        id: privateGuestId,
        name: 'Private Guest',
        email: 'private@test.com',
        privacy: { tripsVisibility: 'private' }
      })
      await createTestUser({
        id: outsiderId,
        name: 'Outsider',
        email: 'outsider@test.com'
      })
      await createTestCircle({ id: circleId, ownerId: hostId })

      const trip = await createTestTrip({
        id: tripId,
        name: 'Mixed Hosted Trip',
        circleId,
        createdBy: hostId,
        type: 'hosted'
      })
      await addParticipant({ tripId, userId: hostId })
      await addParticipant({ tripId, userId: publicGuestId })
      await addParticipant({ tripId, userId: privateGuestId })

      // Test: Public guest can see (is participant)
      const publicCanSee = await canViewerSeeTrip({
        viewerId: publicGuestId,
        trip,
        db
      })
      expect(publicCanSee).toBe(true)

      // Test: Private guest can see (is participant)
      const privateCanSee = await canViewerSeeTrip({
        viewerId: privateGuestId,
        trip,
        db
      })
      expect(privateCanSee).toBe(true)

      // Test: Outsider cannot see (one traveler is private)
      const outsiderCanSee = await canViewerSeeTrip({
        viewerId: outsiderId,
        trip,
        db
      })
      expect(outsiderCanSee).toBe(false)
    })

    it('Scenario: Dashboard filtering for user with multiple circles', async () => {
      const viewerId = 'test-privacy-viewer-s4'
      const circle1OwnerId = 'test-privacy-owner-s4-1'
      const circle2OwnerId = 'test-privacy-owner-s4-2'
      const circle1Id = 'circle-privacy-s4-1'
      const circle2Id = 'circle-privacy-s4-2'

      await createTestUser({ id: viewerId, name: 'Viewer', email: 'viewer@test.com' })
      await createTestUser({
        id: circle1OwnerId,
        name: 'Circle 1 Owner',
        email: 'owner1@test.com',
        privacy: { tripsVisibility: 'circle' }
      })
      await createTestUser({
        id: circle2OwnerId,
        name: 'Circle 2 Owner',
        email: 'owner2@test.com',
        privacy: { tripsVisibility: 'private' }
      })

      // Circle 1: viewer is member
      await createTestCircle({ id: circle1Id, ownerId: circle1OwnerId })
      await addMembership({ userId: circle1OwnerId, circleId: circle1Id, role: 'owner' })
      await addMembership({ userId: viewerId, circleId: circle1Id, role: 'member' })

      // Circle 2: viewer is NOT member
      await createTestCircle({ id: circle2Id, ownerId: circle2OwnerId })
      await addMembership({ userId: circle2OwnerId, circleId: circle2Id, role: 'owner' })

      const trips = []

      // Trip 1: Collaborative in circle 1 (viewer is member)
      const trip1 = await createTestTrip({
        id: 'trip-privacy-s4-1',
        name: 'Circle 1 Trip',
        circleId: circle1Id,
        createdBy: circle1OwnerId,
        type: 'collaborative'
      })
      trips.push(trip1)

      // Trip 2: Collaborative in circle 2 with private owner (viewer not member)
      const trip2 = await createTestTrip({
        id: 'trip-privacy-s4-2',
        name: 'Circle 2 Private Trip',
        circleId: circle2Id,
        createdBy: circle2OwnerId,
        type: 'collaborative'
      })
      trips.push(trip2)

      // Execute
      const filtered = await filterTripsByActiveTravelerPrivacy({
        viewerId,
        trips,
        db
      })

      // Assert: Only trip 1 visible (viewer is circle member)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe('trip-privacy-s4-1')
    })
  })
})
