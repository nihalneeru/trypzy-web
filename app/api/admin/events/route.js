/**
 * Admin Events Query Endpoint
 *
 * GET /api/admin/events
 *
 * Flexible query for trip_events collection.
 * Protected by x-admin-debug-token header.
 */

import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToMongo } from '@/lib/server/db'

// Auth helper - returns true if authorized, false otherwise
function isAuthorized(request) {
  const token = request.headers.get('x-admin-debug-token')
  const expected = process.env.ADMIN_DEBUG_TOKEN
  if (!token || !expected || token !== expected) {
    return false
  }
  return true
}

export async function GET(request) {
  // Auth check - return 404 to avoid leaking endpoint existence
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)

  // Parse query params
  const tripId = searchParams.get('tripId')
  const circleId = searchParams.get('circleId')
  const actorId = searchParams.get('actorId')
  const eventType = searchParams.get('eventType')
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const limitParam = searchParams.get('limit')

  // Require at least tripId or circleId to prevent full collection scan
  if (!tripId && !circleId) {
    return NextResponse.json(
      { error: 'At least one of tripId or circleId is required' },
      { status: 400 }
    )
  }

  // Parse and validate limit
  let limit = 200
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 1000)
    }
  }

  try {
    const db = await connectToMongo()

    // Build query filter
    const filter = {}

    if (tripId) {
      // Handle both ObjectId and string tripId formats
      try {
        filter.tripId = new ObjectId(tripId)
      } catch {
        filter.tripId = tripId
      }
    }

    if (circleId) {
      try {
        filter.circleId = new ObjectId(circleId)
      } catch {
        filter.circleId = circleId
      }
    }

    if (actorId) {
      try {
        filter.actorId = new ObjectId(actorId)
      } catch {
        filter.actorId = actorId
      }
    }

    if (eventType) {
      filter.eventType = eventType
    }

    // Time range filters
    if (since || until) {
      filter.timestamp = {}
      if (since) {
        filter.timestamp.$gte = new Date(since)
      }
      if (until) {
        filter.timestamp.$lte = new Date(until)
      }
    }

    // Sort: ASC for tripId (timeline), DESC otherwise
    const sortDirection = tripId ? 1 : -1

    // Query with limit + 1 to detect hasMore
    const events = await db
      .collection('trip_events')
      .find(filter)
      .sort({ timestamp: sortDirection })
      .limit(limit + 1)
      .toArray()

    const hasMore = events.length > limit
    if (hasMore) {
      events.pop()
    }

    // Map to response shape (exclude sensitive fields)
    const mappedEvents = events.map((e) => ({
      id: e._id?.toString() || e.id,
      eventType: e.eventType,
      actorId: e.actorId?.toString() || null,
      actorRole: e.actorRole,
      timestamp: e.timestamp,
      tripAgeMs: e.tripAgeMs,
      payload: e.payload || {},
      context: e.context || {},
    }))

    return NextResponse.json({
      events: mappedEvents,
      count: mappedEvents.length,
      hasMore,
    })
  } catch (error) {
    console.error('[admin/events] Query failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
