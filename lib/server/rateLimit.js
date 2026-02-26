import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Initialize Redis client (lazy — only created when env vars are present)
let redis = null
function getRedis() {
  if (redis) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  redis = new Redis({ url, token })
  return redis
}

// Rate limit tiers using sliding window algorithm
const limiters = {}

function getLimiter(tier) {
  if (limiters[tier]) return limiters[tier]

  const redisClient = getRedis()
  if (!redisClient) return null

  const configs = {
    auth:   { requests: 5,   window: '1 m' },
    write:  { requests: 50,  window: '1 h' },
    chat:   { requests: 100, window: '1 h' },
    read:   { requests: 200, window: '1 h' },
    global: { requests: 500, window: '1 h' },
  }

  const cfg = configs[tier]
  if (!cfg) return null

  limiters[tier] = new Ratelimit({
    redis: redisClient,
    limiter: Ratelimit.slidingWindow(cfg.requests, cfg.window),
    prefix: `tripti:rl:${tier}`,
  })

  return limiters[tier]
}

/**
 * Check rate limit for a given identifier and tier.
 *
 * @param {string} identifier - User ID or IP address
 * @param {'auth'|'write'|'chat'|'read'|'global'} tier
 * @returns {Promise<{ success: boolean, remaining: number, reset: number }>}
 */
export async function checkRateLimit(identifier, tier) {
  try {
    const limiter = getLimiter(tier)
    if (!limiter) {
      // Redis not configured — allow requests through (rate limiting is deferred until launch)
      return { success: true, remaining: -1, reset: 0 }
    }

    const result = await limiter.limit(identifier)
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    }
  } catch (error) {
    console.error('[rateLimit] Redis error:', error.message)
    // Fail open — don't block users due to Redis issues
    return { success: true, remaining: -1, reset: 0 }
  }
}

/**
 * Determine the rate limit tier for a given route and HTTP method.
 *
 * @param {string} route - The API route path (e.g. '/signup')
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @returns {'auth'|'write'|'chat'|'read'|'global'}
 */
export function getTierForRoute(route, method) {
  // Auth endpoints — strictest
  if (route === '/signup' ||
      route === '/login') {
    return 'auth'
  }

  // Chat messages
  if (route.match(/^\/trips\/[^/]+\/messages$/) && method === 'POST') {
    return 'chat'
  }
  if (route.match(/^\/circles\/[^/]+\/messages$/) && method === 'POST') {
    return 'chat'
  }

  // Write operations
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    return 'write'
  }

  // Read operations
  if (method === 'GET') {
    return 'read'
  }

  return 'global'
}
