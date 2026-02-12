import { NextResponse } from 'next/server'

// In-memory rate limiter
const rateLimitStore = new Map()
const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_ATTEMPTS = 5

function checkRateLimit(key) {
    const now = Date.now()
    const entry = rateLimitStore.get(key)

    // Periodic cleanup
    if (Math.random() < 0.01) {
        for (const [k, v] of rateLimitStore) {
            if (now - v.windowStart > WINDOW_MS) rateLimitStore.delete(k)
        }
    }

    if (!entry || now - entry.windowStart > WINDOW_MS) {
        rateLimitStore.set(key, { windowStart: now, count: 1 })
        return { allowed: true }
    }

    entry.count++
    if (entry.count > MAX_ATTEMPTS) {
        const retryAfter = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000)
        return { allowed: false, retryAfter }
    }

    return { allowed: true }
}

export async function POST(request) {
    try {
        // Rate limit by IP
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
        const rl = checkRateLimit(`beta-secret:${ip}`)
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again shortly.' },
                { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
            )
        }

        const body = await request.json()
        const { secret } = body
        const PRIVATE_BETA_SECRET = process.env.PRIVATE_BETA_SECRET || 'tripti-beta-2024'

        return NextResponse.json({
            valid: secret?.toLowerCase() === PRIVATE_BETA_SECRET?.toLowerCase()
        })
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
