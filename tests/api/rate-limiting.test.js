import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Shared mock state — the limit function reference is captured by closure
let mockLimitFn = vi.fn()

vi.mock('@upstash/redis', () => {
  // Must use function (not arrow) so it's callable with `new`
  function MockRedis() {
    return { _mock: true }
  }
  return { Redis: MockRedis }
})

vi.mock('@upstash/ratelimit', () => {
  function MockRatelimit() {
    return {
      limit: (...args) => mockLimitFn(...args),
    }
  }
  MockRatelimit.slidingWindow = vi.fn().mockReturnValue('sliding-window-config')
  return { Ratelimit: MockRatelimit }
})

describe('Rate Limiting - getTierForRoute', () => {
  it('should map auth routes to auth tier', async () => {
    const { getTierForRoute } = await import('@/lib/server/rateLimit.js')

    expect(getTierForRoute('/auth/validate-beta-secret', 'POST')).toBe('auth')
    expect(getTierForRoute('/signup', 'POST')).toBe('auth')
    expect(getTierForRoute('/login', 'POST')).toBe('auth')
  })

  it('should map message POST routes to chat tier', async () => {
    const { getTierForRoute } = await import('@/lib/server/rateLimit.js')

    expect(getTierForRoute('/trips/trip-123/messages', 'POST')).toBe('chat')
    expect(getTierForRoute('/circles/circle-456/messages', 'POST')).toBe('chat')
  })

  it('should map write methods to write tier', async () => {
    const { getTierForRoute } = await import('@/lib/server/rateLimit.js')

    expect(getTierForRoute('/trips/trip-123/itinerary/generate', 'POST')).toBe('write')
    expect(getTierForRoute('/trips/trip-123', 'PATCH')).toBe('write')
    expect(getTierForRoute('/trips/trip-123', 'DELETE')).toBe('write')
    expect(getTierForRoute('/trips/trip-123', 'PUT')).toBe('write')
  })

  it('should map GET methods to read tier', async () => {
    const { getTierForRoute } = await import('@/lib/server/rateLimit.js')

    expect(getTierForRoute('/trips/trip-123', 'GET')).toBe('read')
    expect(getTierForRoute('/auth/me', 'GET')).toBe('read')
    expect(getTierForRoute('/circles/circle-456', 'GET')).toBe('read')
  })

  it('should return global tier for unknown methods', async () => {
    const { getTierForRoute } = await import('@/lib/server/rateLimit.js')

    expect(getTierForRoute('/something', 'OPTIONS')).toBe('global')
  })
})

describe('Rate Limiting - checkRateLimit', () => {
  const savedUrl = process.env.UPSTASH_REDIS_REST_URL
  const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-redis.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token'
    mockLimitFn = vi.fn().mockResolvedValue({
      success: true,
      remaining: 99,
      reset: Date.now() + 60000,
    })
  })

  afterEach(() => {
    if (savedUrl) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    else delete process.env.UPSTASH_REDIS_REST_URL
    if (savedToken) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    else delete process.env.UPSTASH_REDIS_REST_TOKEN
  })

  it('should allow requests when under the limit', async () => {
    const { checkRateLimit } = await import('@/lib/server/rateLimit.js')

    const result = await checkRateLimit('user:test-user-1', 'read')

    expect(result.success).toBe(true)
    expect(result.remaining).toBe(99)
    expect(typeof result.reset).toBe('number')
  })

  it('should reject requests when limit is exceeded', async () => {
    mockLimitFn = vi.fn().mockResolvedValue({
      success: false,
      remaining: 0,
      reset: Date.now() + 30000,
    })

    const { checkRateLimit } = await import('@/lib/server/rateLimit.js')

    const result = await checkRateLimit('user:test-user-2', 'write')

    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should gracefully degrade when Redis throws an error', async () => {
    mockLimitFn = vi.fn().mockRejectedValue(new Error('Redis connection refused'))

    const { checkRateLimit } = await import('@/lib/server/rateLimit.js')

    const result = await checkRateLimit('ip:1.2.3.4', 'global')

    expect(result.success).toBe(true)
    expect(result.remaining).toBe(-1)
  })

  it('should gracefully allow requests when Redis env vars are not set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    vi.resetModules()

    const { checkRateLimit } = await import('@/lib/server/rateLimit.js')

    const result = await checkRateLimit('ip:1.2.3.4', 'auth')

    expect(result.success).toBe(true)
    expect(result.remaining).toBe(-1)
  })
})
