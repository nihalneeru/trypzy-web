/**
 * Push Sweep Cron Job
 *
 * POST /api/jobs/push-sweep - Sends time-based push notifications
 *
 * Runs daily via Vercel Cron (9:00 AM UTC). Handles:
 * - prep_reminder_7d: Trips starting in 5-7 days
 * - trip_started: Trips starting today
 *
 * Security: Requires CRON_SECRET Bearer token.
 */

import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/server/db'
import { pushRouter } from '@/lib/push/pushRouter'

let pushIndexesEnsured = false

async function ensurePushIndexes(db) {
  if (pushIndexesEnsured) return
  pushIndexesEnsured = true
  await Promise.all([
    db.collection('push_events').createIndex({ userId: 1, dedupeKey: 1 }, { unique: true }),
    db.collection('push_events').createIndex({ userId: 1, sentAt: -1 }),
    db.collection('push_events').createIndex({ sentAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }),
  ]).catch(err => console.warn('[push-sweep] Index creation warning:', err.message))
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await connectToMongo()
    await ensurePushIndexes(db)
    const now = new Date()
    const stats = { prep_reminder_7d: { sent: 0, suppressed: 0, failed: 0 }, trip_started: { sent: 0, suppressed: 0, failed: 0 }, trips_scanned: 0 }

    // ── prep_reminder_7d: trips starting in 5–7 days ──
    const prepWindowStart = new Date(now)
    prepWindowStart.setUTCDate(prepWindowStart.getUTCDate() + 5)
    prepWindowStart.setUTCHours(0, 0, 0, 0)

    const prepWindowEnd = new Date(now)
    prepWindowEnd.setUTCDate(prepWindowEnd.getUTCDate() + 7)
    prepWindowEnd.setUTCHours(23, 59, 59, 999)

    const prepTrips = await db.collection('trips').find({
      startDate: { $gte: prepWindowStart.toISOString().slice(0, 10), $lte: prepWindowEnd.toISOString().slice(0, 10) },
      status: 'locked',
    }).toArray()

    for (const trip of prepTrips) {
      const tripId = trip._id?.toString() || trip.id
      const result = await pushRouter(db, {
        type: 'prep_reminder_7d',
        tripId,
        trip: { ...trip, id: tripId },
        context: { tripName: trip.name },
      })
      stats.prep_reminder_7d.sent += result.sent
      stats.prep_reminder_7d.suppressed += result.suppressed
      stats.prep_reminder_7d.failed += result.failed
    }

    // ── trip_started: trips starting today ──
    const todayStr = now.toISOString().slice(0, 10)

    const startingTrips = await db.collection('trips').find({
      startDate: todayStr,
      status: 'locked',
    }).toArray()

    for (const trip of startingTrips) {
      const tripId = trip._id?.toString() || trip.id
      const result = await pushRouter(db, {
        type: 'trip_started',
        tripId,
        trip: { ...trip, id: tripId },
        context: { tripName: trip.name },
      })
      stats.trip_started.sent += result.sent
      stats.trip_started.suppressed += result.suppressed
      stats.trip_started.failed += result.failed
    }

    stats.trips_scanned = prepTrips.length + startingTrips.length

    return NextResponse.json({
      success: true,
      ...stats,
      completedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[push-sweep] Job failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/jobs/push-sweep',
    method: 'POST',
    description: 'Daily push sweep for time-based notifications (prep_reminder_7d, trip_started)',
    authentication: process.env.CRON_SECRET ? 'Bearer token required' : 'No authentication configured',
  })
}
