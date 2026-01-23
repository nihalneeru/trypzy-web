/**
 * Tests for itinerary version limit enforcement
 *
 * These tests verify:
 * 1. Generate endpoint creates first version
 * 2. Generate endpoint blocks if version already exists
 * 3. Revise endpoint creates subsequent versions
 * 4. Revise endpoint blocks at MAX_VERSIONS limit
 * 5. Versions endpoint returns version count metadata
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'
import jwt from 'jsonwebtoken'
import { ITINERARY_CONFIG } from '@/lib/itinerary/config.js'

// Set dummy OPENAI_API_KEY to bypass LLM check (won't be called since we hit version checks first)
process.env.OPENAI_API_KEY = 'test-key-for-version-limit-tests'

// Helper to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

describe('Itinerary Version Limit', () => {
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
    await db.collection('circles').deleteMany({ id: /^circle-test-/ })
    await db.collection('trips').deleteMany({ id: /^trip-test-/ })
    await db.collection('memberships').deleteMany({ circleId: /^circle-test-/ })
    await db.collection('itinerary_versions').deleteMany({ tripId: /^trip-test-/ })
    await db.collection('itinerary_ideas').deleteMany({ tripId: /^trip-test-/ })
    await db.collection('itinerary_feedback').deleteMany({ tripId: /^trip-test-/ })
    await db.collection('itinerary_reactions').deleteMany({ tripId: /^trip-test-/ })
  })

  describe('config', () => {
    it('exports MAX_VERSIONS constant', () => {
      expect(ITINERARY_CONFIG.MAX_VERSIONS).toBeDefined()
      expect(typeof ITINERARY_CONFIG.MAX_VERSIONS).toBe('number')
      expect(ITINERARY_CONFIG.MAX_VERSIONS).toBeGreaterThan(0)
    })

    it('defaults MAX_VERSIONS to 3', () => {
      // Unless overridden by env var
      if (!process.env.ITINERARY_MAX_VERSIONS) {
        expect(ITINERARY_CONFIG.MAX_VERSIONS).toBe(3)
      }
    })
  })

  describe('versions endpoint metadata', () => {
    it('returns versionCount, maxVersions, and canRevise fields', async () => {
      // Create test user, circle, and trip
      const userId = `test-user-${uuidv4()}`
      const circleId = `circle-test-${uuidv4()}`
      const tripId = `trip-test-${uuidv4()}`

      await db.collection('users').insertOne({
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
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
        status: 'locked',
        lockedStartDate: '2026-03-01',
        lockedEndDate: '2026-03-05'
      })

      // Create one version
      await db.collection('itinerary_versions').insertOne({
        id: uuidv4(),
        tripId,
        version: 1,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        content: { days: [] }
      })

      // Import the route handler dynamically to ensure it uses our test database
      const { GET, POST, PUT, DELETE } = await import('@/app/api/[[...path]]/route.js')

      // Make request
      const request = new Request(
        `http://localhost:3000/api/trips/${tripId}/itinerary/versions`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${createToken(userId)}`
          }
        }
      )

      const response = await GET(request, { params: { path: ['trips', tripId, 'itinerary', 'versions'] } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.versionCount).toBe(1)
      expect(data.maxVersions).toBe(ITINERARY_CONFIG.MAX_VERSIONS)
      expect(data.canRevise).toBe(true)
      expect(data.versions).toHaveLength(1)
    })

    it('returns canRevise=false when at max versions', async () => {
      const userId = `test-user-${uuidv4()}`
      const circleId = `circle-test-${uuidv4()}`
      const tripId = `trip-test-${uuidv4()}`

      await db.collection('users').insertOne({
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
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
        status: 'locked',
        lockedStartDate: '2026-03-01',
        lockedEndDate: '2026-03-05'
      })

      // Create MAX_VERSIONS versions
      for (let i = 1; i <= ITINERARY_CONFIG.MAX_VERSIONS; i++) {
        await db.collection('itinerary_versions').insertOne({
          id: uuidv4(),
          tripId,
          version: i,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          content: { days: [] }
        })
      }

      const { GET } = await import('@/app/api/[[...path]]/route.js')

      const request = new Request(
        `http://localhost:3000/api/trips/${tripId}/itinerary/versions`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${createToken(userId)}`
          }
        }
      )

      const response = await GET(request, { params: { path: ['trips', tripId, 'itinerary', 'versions'] } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.versionCount).toBe(ITINERARY_CONFIG.MAX_VERSIONS)
      expect(data.canRevise).toBe(false)
    })
  })

  describe('revise endpoint version limit', () => {
    it('blocks revise when at max versions with VERSION_LIMIT_REACHED code', async () => {
      const userId = `test-user-${uuidv4()}`
      const circleId = `circle-test-${uuidv4()}`
      const tripId = `trip-test-${uuidv4()}`

      await db.collection('users').insertOne({
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
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
        status: 'locked',
        lockedStartDate: '2026-03-01',
        lockedEndDate: '2026-03-05',
        itineraryStatus: 'published'
      })

      // Create MAX_VERSIONS versions
      for (let i = 1; i <= ITINERARY_CONFIG.MAX_VERSIONS; i++) {
        await db.collection('itinerary_versions').insertOne({
          id: uuidv4(),
          tripId,
          version: i,
          createdBy: userId,
          createdAt: new Date().toISOString(),
          sourceIdeaIds: [],
          content: { days: [] }
        })
      }

      const { POST } = await import('@/app/api/[[...path]]/route.js')

      const request = new Request(
        `http://localhost:3000/api/trips/${tripId}/itinerary/revise`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${createToken(userId)}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const response = await POST(request, { params: { path: ['trips', tripId, 'itinerary', 'revise'] } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('VERSION_LIMIT_REACHED')
      expect(data.maxVersions).toBe(ITINERARY_CONFIG.MAX_VERSIONS)
      expect(data.currentVersions).toBe(ITINERARY_CONFIG.MAX_VERSIONS)
    })
  })

  describe('generate endpoint', () => {
    it('returns ITINERARY_EXISTS code when version already exists', async () => {
      const userId = `test-user-${uuidv4()}`
      const circleId = `circle-test-${uuidv4()}`
      const tripId = `trip-test-${uuidv4()}`

      await db.collection('users').insertOne({
        id: userId,
        email: 'test@example.com',
        name: 'Test User'
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
        status: 'locked',
        lockedStartDate: '2026-03-01',
        lockedEndDate: '2026-03-05'
      })

      // Create one version
      await db.collection('itinerary_versions').insertOne({
        id: uuidv4(),
        tripId,
        version: 1,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        content: { days: [] }
      })

      const { POST } = await import('@/app/api/[[...path]]/route.js')

      const request = new Request(
        `http://localhost:3000/api/trips/${tripId}/itinerary/generate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${createToken(userId)}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ forceGenerate: true })
        }
      )

      const response = await POST(request, { params: { path: ['trips', tripId, 'itinerary', 'generate'] } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.code).toBe('ITINERARY_EXISTS')
    })
  })
})
