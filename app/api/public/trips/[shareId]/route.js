import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/server/db.js'
import { sanitizeTripForPublic } from '@/lib/trips/sanitizeForPublic.js'

export async function GET(request, { params }) {
  try {
    const { shareId } = params
    if (!shareId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const db = await connectToMongo()

    // Look up trip by shareId — only if sharing is currently enabled
    const trip = await db.collection('trips').findOne({
      shareId,
      shareVisibility: 'link_only'
    })

    // Return 404 (not 403) to avoid revealing existence
    if (!trip) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Privacy gate: if ANY active traveler has tripsVisibility=private, block
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id, status: 'active' })
      .toArray()

    const participantUserIds = participants.map(p => p.userId)

    // For collaborative trips, also include circle members without explicit records
    if (trip.type === 'collaborative' && trip.circleId) {
      const memberships = await db.collection('memberships')
        .find({ circleId: trip.circleId, status: { $ne: 'left' } })
        .toArray()
      for (const m of memberships) {
        if (!participantUserIds.includes(m.userId)) {
          participantUserIds.push(m.userId)
        }
      }
    }

    if (participantUserIds.length > 0) {
      const usersWithPrivateTrips = await db.collection('users')
        .find({
          id: { $in: participantUserIds },
          'privacy.tripsVisibility': 'private'
        })
        .limit(1)
        .toArray()

      if (usersWithPrivateTrips.length > 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
    }

    // Fetch related data for the preview
    const itinerary = await db.collection('itinerary_versions')
      .findOne({ tripId: trip.id }, { sort: { version: -1 } })

    const ideas = await db.collection('itinerary_ideas')
      .find({ tripId: trip.id })
      .toArray()

    const circle = trip.circleId
      ? await db.collection('circles').findOne({ id: trip.circleId })
      : null

    // Count active travelers
    const travelerCount = participantUserIds.length

    const sanitized = sanitizeTripForPublic(trip, itinerary, ideas, circle, travelerCount)

    return NextResponse.json(sanitized)
  } catch (error) {
    console.error('Error in GET /api/public/trips/:shareId:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
