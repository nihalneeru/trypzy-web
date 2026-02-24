import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/server/db.js'

export async function GET(request, { params }) {
  try {
    const { briefToken } = params
    if (!briefToken) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const db = await connectToMongo()

    // Look up trip by briefToken — token must be non-null
    const trip = await db.collection('trips').findOne({
      briefToken,
      briefToken: { $ne: null }
    })

    if (!trip || !trip.briefToken) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Parallel queries for all brief data (same as private brief endpoint)
    const [
      participantDocs,
      membershipDocs,
      accommodationOptions,
      itineraryVersions,
      prepItems
    ] = await Promise.all([
      db.collection('trip_participants').find({ tripId: trip.id }).toArray(),
      trip.type === 'collaborative' && trip.circleId
        ? db.collection('memberships').find({ circleId: trip.circleId, status: { $ne: 'left' } }).toArray()
        : Promise.resolve([]),
      db.collection('accommodation_options').find({ tripId: trip.id }).toArray(),
      db.collection('itinerary_versions').find({ tripId: trip.id }).sort({ version: -1 }).limit(1).toArray(),
      db.collection('prep_items').find({ tripId: trip.id, category: 'packing', scope: 'group' }).toArray()
    ])

    // Compute traveler count
    let travelerCount = 0
    if (trip.type === 'collaborative') {
      const leftUserIds = new Set(
        participantDocs
          .filter(p => p.status === 'left' || p.status === 'removed')
          .map(p => p.userId)
      )
      travelerCount = membershipDocs.filter(m => !leftUserIds.has(m.userId)).length
    } else {
      travelerCount = participantDocs.filter(p => (p.status || 'active') === 'active').length
    }

    // Overview — no userIds exposed
    const datesLocked = trip.status === 'locked' || !!(trip.lockedStartDate && trip.lockedEndDate)
    const startDate = trip.lockedStartDate || trip.startDate
    const endDate = trip.lockedEndDate || trip.endDate
    let duration = null
    if (startDate && endDate) {
      const s = new Date(startDate + 'T12:00:00')
      const e = new Date(endDate + 'T12:00:00')
      duration = Math.round((e - s) / (1000 * 60 * 60 * 24))
    }

    const overview = {
      name: trip.name || 'Untitled Trip',
      destinationHint: trip.destinationHint || null,
      // Address redacted unless briefShowAddress is set
      address: trip.briefShowAddress ? (trip.address || null) : null,
      lockedStartDate: trip.lockedStartDate || null,
      lockedEndDate: trip.lockedEndDate || null,
      duration,
      travelerCount,
      status: trip.status || 'proposed'
    }

    // Accommodation — strip internal IDs and user references
    let accommodation = null
    if (accommodationOptions.length > 0) {
      const chosen = accommodationOptions.find(o => o.status === 'selected') || null
      accommodation = {
        chosen: chosen ? {
          name: chosen.title,
          location: chosen.source || null,
          priceRange: chosen.priceRange || null,
          url: chosen.url || null
        } : null,
        optionCount: accommodationOptions.length
      }
    }

    // Day-by-day itinerary
    let dayByDay = null
    if (itineraryVersions.length > 0) {
      const latest = itineraryVersions[0]
      if (latest.content?.days && Array.isArray(latest.content.days)) {
        dayByDay = latest.content.days.map(day => ({
          date: day.date,
          title: day.title || null,
          blocks: (day.blocks || []).map(block => ({
            timeRange: block.timeRange,
            activity: block.title,
            notes: block.description || null
          }))
        }))
      }
    }

    // Packing reminders — group scope only, no user IDs
    const packingReminders = prepItems.map(item => ({
      name: item.name || item.text || 'Unnamed item',
      scope: 'group'
    }))

    // Expenses — summary only, no individual details or user IDs
    let expensesSummary = null
    const expenses = trip.expenses || []
    if (expenses.length > 0) {
      const totalCents = expenses.reduce((sum, e) => sum + (e.amountCents || 0), 0)
      const currency = expenses[0]?.currency || trip.currency || 'USD'
      expensesSummary = {
        totalAmount: totalCents / 100,
        currency,
        itemCount: expenses.length
      }
    }

    // Decisions
    const decisions = {
      closed: []
    }
    if (datesLocked && trip.lockedStartDate && trip.lockedEndDate) {
      const s = new Date(trip.lockedStartDate + 'T12:00:00')
      const e = new Date(trip.lockedEndDate + 'T12:00:00')
      const summary = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      decisions.closed.push({
        type: 'dates_locked',
        summary
      })
    }

    const response = NextResponse.json({
      overview,
      accommodation,
      dayByDay,
      decisions,
      packingReminders,
      expensesSummary
    })

    // No caching, no indexing
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('X-Robots-Tag', 'noindex')
    return response
  } catch (error) {
    console.error('Error in GET /api/public/brief/:briefToken:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
