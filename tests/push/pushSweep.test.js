import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock pushRouter
vi.mock('@/lib/push/pushRouter', () => ({
  pushRouter: vi.fn().mockResolvedValue({ sent: 1, suppressed: 0, failed: 0 }),
}))

vi.mock('@/lib/server/db', () => ({
  connectToMongo: vi.fn().mockResolvedValue({
    collection: vi.fn().mockReturnValue({
      find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      createIndex: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}))

import { pushRouter } from '@/lib/push/pushRouter'
import { connectToMongo } from '@/lib/server/db'
import { POST, GET } from '@/app/api/jobs/push-sweep/route'

function makeRequest(secret) {
  return {
    headers: new Map([['authorization', `Bearer ${secret}`]]),
  }
}

describe('push-sweep cron', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...ORIGINAL_ENV, CRON_SECRET: 'test-secret' }
  })

  it('rejects requests without valid CRON_SECRET', async () => {
    const res = await POST(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makeRequest('anything'))
    expect(res.status).toBe(401)
  })

  it('runs successfully with no matching trips', async () => {
    const res = await POST(makeRequest('test-secret'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.trips_scanned).toBe(0)
    expect(body.prep_reminder_7d.sent).toBe(0)
    expect(body.trip_started.sent).toBe(0)
  })

  it('sends prep_reminder_7d for trips starting in 5-7 days', async () => {
    const futureDate = new Date()
    futureDate.setUTCDate(futureDate.getUTCDate() + 6)
    const dateStr = futureDate.toISOString().slice(0, 10)

    const mockTrip = { _id: 'trip-prep', name: 'Mountain Trip', status: 'locked', startDate: dateStr, createdBy: 'leader' }

    const mockDb = {
      collection: vi.fn().mockImplementation((name) => {
        if (name === 'trips') {
          return {
            find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([mockTrip]) }),
          }
        }
        return { createIndex: vi.fn().mockResolvedValue(undefined) }
      }),
    }
    connectToMongo.mockResolvedValue(mockDb)
    pushRouter.mockResolvedValue({ sent: 3, suppressed: 0, failed: 0 })

    const res = await POST(makeRequest('test-secret'))
    const body = await res.json()

    expect(body.success).toBe(true)
    // pushRouter called for the prep trip (trips starting today query returns [])
    expect(pushRouter).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      type: 'prep_reminder_7d',
      tripId: 'trip-prep',
    }))
  })

  it('sends trip_started for trips starting today', async () => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const mockTrip = { _id: 'trip-today', name: 'Beach Trip', status: 'locked', startDate: todayStr, createdBy: 'leader' }

    // First find() call is prep (returns []), second is trip_started (returns [mockTrip])
    let callCount = 0
    const mockDb = {
      collection: vi.fn().mockImplementation((name) => {
        if (name === 'trips') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockImplementation(() => {
                callCount++
                return callCount === 1 ? [] : [mockTrip]
              }),
            }),
          }
        }
        return { createIndex: vi.fn().mockResolvedValue(undefined) }
      }),
    }
    connectToMongo.mockResolvedValue(mockDb)
    pushRouter.mockResolvedValue({ sent: 2, suppressed: 0, failed: 0 })

    const res = await POST(makeRequest('test-secret'))
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(pushRouter).toHaveBeenCalledWith(mockDb, expect.objectContaining({
      type: 'trip_started',
      tripId: 'trip-today',
    }))
  })

  it('GET returns endpoint info', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.endpoint).toBe('/api/jobs/push-sweep')
    expect(body.method).toBe('POST')
  })
})
