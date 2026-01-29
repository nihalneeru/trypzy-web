/**
 * Admin Events Endpoint Tests
 *
 * Tests for /api/admin/events and /api/admin/events/trips/:tripId/health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Valid ObjectId-format strings for testing
const TRIP_ID = new ObjectId().toString()
const CIRCLE_ID = new ObjectId().toString()
const USER_ID = new ObjectId().toString()

// Mock MongoDB
const mockFindOne = vi.fn()
const mockFind = vi.fn()
const mockCountDocuments = vi.fn()
const mockSort = vi.fn()
const mockLimit = vi.fn()
const mockToArray = vi.fn()

const mockDb = {
  collection: vi.fn(() => ({
    findOne: mockFindOne,
    find: mockFind,
    countDocuments: mockCountDocuments,
  })),
}

// Chain mock for find().sort().limit().toArray()
mockFind.mockReturnValue({ sort: mockSort })
mockSort.mockReturnValue({ limit: mockLimit })
mockLimit.mockReturnValue({ toArray: mockToArray })

vi.mock('@/lib/server/db', () => ({
  connectToMongo: vi.fn(() => Promise.resolve(mockDb)),
}))

// Store original env
const originalEnv = process.env.ADMIN_DEBUG_TOKEN

describe('Admin Events Endpoint - Auth Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_DEBUG_TOKEN = 'test-secret-token'
  })

  afterEach(() => {
    process.env.ADMIN_DEBUG_TOKEN = originalEnv
  })

  it('should return 404 when header is missing', async () => {
    const { GET } = await import('@/app/api/admin/events/route')

    const request = new Request(
      `http://localhost:3000/api/admin/events?tripId=${TRIP_ID}`,
      { method: 'GET' }
    )

    const response = await GET(request)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Not found')
  })

  it('should return 404 when token is wrong', async () => {
    const { GET } = await import('@/app/api/admin/events/route')

    const request = new Request(
      `http://localhost:3000/api/admin/events?tripId=${TRIP_ID}`,
      {
        method: 'GET',
        headers: { 'x-admin-debug-token': 'wrong-token' },
      }
    )

    const response = await GET(request)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Not found')
  })

  it('should return 200 with correct token', async () => {
    const { GET } = await import('@/app/api/admin/events/route')

    mockToArray.mockResolvedValue([])

    const request = new Request(
      `http://localhost:3000/api/admin/events?tripId=${TRIP_ID}`,
      {
        method: 'GET',
        headers: { 'x-admin-debug-token': 'test-secret-token' },
      }
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.events).toEqual([])
    expect(body.count).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  it('should return 400 when neither tripId nor circleId provided', async () => {
    const { GET } = await import('@/app/api/admin/events/route')

    const request = new Request('http://localhost:3000/api/admin/events', {
      method: 'GET',
      headers: { 'x-admin-debug-token': 'test-secret-token' },
    })

    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('tripId or circleId')
  })
})

describe('Admin Events Health Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_DEBUG_TOKEN = 'test-secret-token'
  })

  afterEach(() => {
    process.env.ADMIN_DEBUG_TOKEN = originalEnv
  })

  it('should return 404 when header is missing', async () => {
    const { GET } = await import(
      '@/app/api/admin/events/trips/[tripId]/health/route'
    )

    const request = new Request(
      `http://localhost:3000/api/admin/events/trips/${TRIP_ID}/health`,
      { method: 'GET' }
    )

    const response = await GET(request, { params: { tripId: TRIP_ID } })

    expect(response.status).toBe(404)
  })

  it('should emit warning for locked trip without dates.locked event', async () => {
    const { GET } = await import(
      '@/app/api/admin/events/trips/[tripId]/health/route'
    )

    // Mock trip as locked
    mockFindOne.mockImplementation((query) => {
      // Trip document query (has $or)
      if (query.$or) {
        return Promise.resolve({
          id: TRIP_ID,
          status: 'locked',
          lockedStartDate: '2026-02-01',
        })
      }
      // Event queries - return null for dates.locked
      if (query.eventType === 'scheduling.dates.locked') {
        return Promise.resolve(null)
      }
      // Return something for other event queries
      if (query.eventType === 'trip.lifecycle.created') {
        return Promise.resolve({ eventType: 'trip.lifecycle.created' })
      }
      return Promise.resolve(null)
    })

    mockCountDocuments.mockResolvedValue(5)

    const request = new Request(
      `http://localhost:3000/api/admin/events/trips/${TRIP_ID}/health`,
      {
        method: 'GET',
        headers: { 'x-admin-debug-token': 'test-secret-token' },
      }
    )

    const response = await GET(request, { params: { tripId: TRIP_ID } })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.isTripLocked).toBe(true)
    expect(body.hasDatesLockedEvent).toBe(false)
    expect(body.warnings).toContain(
      'Trip locked but no scheduling.dates.locked event'
    )
  })

  it('should report healthy trip with all events present', async () => {
    const { GET } = await import(
      '@/app/api/admin/events/trips/[tripId]/health/route'
    )

    // Mock trip as locked with all events present
    mockFindOne.mockImplementation((query) => {
      // Trip document query
      if (query.$or) {
        return Promise.resolve({
          id: TRIP_ID,
          status: 'locked',
          lockedStartDate: '2026-02-01',
        })
      }
      // All event queries return events
      return Promise.resolve({
        eventType: query.eventType || 'some.event',
        timestamp: new Date(),
      })
    })

    mockCountDocuments.mockResolvedValue(10)

    const request = new Request(
      `http://localhost:3000/api/admin/events/trips/${TRIP_ID}/health`,
      {
        method: 'GET',
        headers: { 'x-admin-debug-token': 'test-secret-token' },
      }
    )

    const response = await GET(request, { params: { tripId: TRIP_ID } })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.totalEvents).toBe(10)
    expect(body.hasTripCreated).toBe(true)
    expect(body.hasDatesLockedEvent).toBe(true)
    expect(body.warnings).toEqual([])
  })
})
