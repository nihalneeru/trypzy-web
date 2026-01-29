/**
 * Trip Instrumentation Health Endpoint
 *
 * GET /api/admin/events/trips/:tripId/health
 *
 * Returns integrity report for a trip's event instrumentation.
 * Protected by x-admin-debug-token header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { connectToMongo } from '@/lib/server/db'

// Auth helper - returns true if authorized, false otherwise
function isAuthorized(request: NextRequest): boolean {
  const token = request.headers.get('x-admin-debug-token')
  const expected = process.env.ADMIN_DEBUG_TOKEN
  if (!token || !expected || token !== expected) {
    return false
  }
  return true
}

interface HealthReport {
  tripId: string
  totalEvents: number
  lastEventAt: string | null
  hasTripCreated: boolean
  hasAnySchedulingActivity: boolean
  hasAnyFirstAction: boolean
  isTripLocked: boolean
  hasDatesLockedEvent: boolean
  warnings: string[]
}

export async function GET(
  request: NextRequest,
  { params }: { params: { tripId: string } }
) {
  // Auth check - return 404 to avoid leaking endpoint existence
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { tripId } = params

  if (!tripId) {
    return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
  }

  try {
    const db = await connectToMongo()

    // Build tripId filter (handle both ObjectId and string)
    let tripIdFilter: ObjectId | string
    try {
      tripIdFilter = new ObjectId(tripId)
    } catch {
      tripIdFilter = tripId
    }

    // Fetch trip document to check lock status
    const trip = await db.collection('trips').findOne({
      $or: [{ _id: tripIdFilter }, { id: tripId }],
    })

    const isTripLocked = trip
      ? trip.status === 'locked' ||
        trip.status === 'completed' ||
        !!trip.lockedStartDate
      : false

    // Count total events
    const totalEvents = await db.collection('trip_events').countDocuments({
      tripId: tripIdFilter,
    })

    // Get last event timestamp
    const lastEvent = await db
      .collection('trip_events')
      .findOne({ tripId: tripIdFilter }, { sort: { timestamp: -1 } })

    const lastEventAt = lastEvent?.timestamp
      ? new Date(lastEvent.timestamp).toISOString()
      : null

    // Check for trip.lifecycle.created event
    const tripCreatedEvent = await db.collection('trip_events').findOne({
      tripId: tripIdFilter,
      eventType: 'trip.lifecycle.created',
    })
    const hasTripCreated = !!tripCreatedEvent

    // Check for any scheduling activity
    const schedulingEvent = await db.collection('trip_events').findOne({
      tripId: tripIdFilter,
      eventType: { $regex: /^scheduling\./ },
    })
    const hasAnySchedulingActivity = !!schedulingEvent

    // Check for first action events
    const firstActionEvent = await db.collection('trip_events').findOne({
      tripId: tripIdFilter,
      eventType: 'traveler.participation.first_action',
    })
    const hasAnyFirstAction = !!firstActionEvent

    // Check for scheduling.dates.locked event
    const datesLockedEvent = await db.collection('trip_events').findOne({
      tripId: tripIdFilter,
      eventType: 'scheduling.dates.locked',
    })
    const hasDatesLockedEvent = !!datesLockedEvent

    // Check for date windows
    const hasDateWindows =
      (await db.collection('date_windows').countDocuments({ tripId })) > 0

    // Build warnings
    const warnings: string[] = []

    if (!hasTripCreated && totalEvents > 0) {
      warnings.push('No trip.lifecycle.created event found')
    }

    if (isTripLocked && !hasDatesLockedEvent) {
      warnings.push('Trip locked but no scheduling.dates.locked event')
    }

    if (hasDateWindows && !hasAnySchedulingActivity) {
      warnings.push(
        'Trip has date windows but no scheduling.window.suggested events'
      )
    }

    if (totalEvents === 0 && trip) {
      warnings.push('Trip exists but has no events recorded')
    }

    if (!trip) {
      warnings.push('Trip document not found in trips collection')
    }

    const report: HealthReport = {
      tripId,
      totalEvents,
      lastEventAt,
      hasTripCreated,
      hasAnySchedulingActivity,
      hasAnyFirstAction,
      isTripLocked,
      hasDatesLockedEvent,
      warnings,
    }

    return NextResponse.json(report)
  } catch (error) {
    console.error('[admin/events/health] Query failed:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
