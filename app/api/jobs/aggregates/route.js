/**
 * Daily Aggregation Job API Route
 *
 * POST /api/jobs/aggregates - Run the daily aggregation job
 *
 * This endpoint is intended to be called by:
 * - A cron job (e.g., Vercel Cron, external scheduler)
 * - Manual trigger for testing/backfill
 *
 * Security: In production, protect with a secret token or IP allowlist.
 */

import { NextResponse } from 'next/server'
import { runDailyAggregation } from '@/lib/events/aggregates'

export async function POST(request) {
  try {
    // Optional: Verify cron secret in production
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const result = await runDailyAggregation()

    return NextResponse.json({
      success: true,
      ...result,
      completedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[aggregates] Job failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// GET endpoint for health check / manual trigger info
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/jobs/aggregates',
    method: 'POST',
    description: 'Run daily aggregation job for trip snapshots and circle profiles',
    authentication: process.env.CRON_SECRET ? 'Bearer token required' : 'No authentication configured',
  })
}
