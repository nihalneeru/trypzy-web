import { ImageResponse } from '@vercel/og'
import { connectToMongo } from '@/lib/server/db'

/**
 * Trip Receipt — shareable "boarding pass" style image.
 *
 * Public endpoint gated by trip state: only trips with locked dates
 * produce a receipt. No PII is exposed (just trip name, destination,
 * dates, and traveler count).
 *
 * Query params:
 *   ?format=story  → 1080 x 1920 (9:16, for IG Stories / phone share)
 *   (default)      → 1080 x 1080 (1:1, square)
 */
export async function GET(request, { params }) {
  const { tripId } = params
  const url = new URL(request.url)
  const format = url.searchParams.get('format') || 'square'

  const db = await connectToMongo()
  const trip = await db.collection('trips').findOne({ id: tripId })

  // Only generate receipts for trips with locked dates
  if (!trip || !trip.lockedStartDate) {
    return new Response('Not found', { status: 404 })
  }

  // Traveler count
  let memberCount = 0
  if (trip.circleId) {
    memberCount = await db
      .collection('memberships')
      .countDocuments({ circleId: trip.circleId, status: { $ne: 'left' } })
  } else {
    memberCount = await db
      .collection('trip_participants')
      .countDocuments({ tripId: trip.id, status: 'active' })
  }

  // Format dates
  let dateString = ''
  const startDate = trip.lockedStartDate
  const endDate = trip.lockedEndDate
  if (startDate) {
    const start = new Date(startDate + 'T12:00:00')
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const startDay = start.getDate()
    const startYear = start.getFullYear()
    if (endDate) {
      const end = new Date(endDate + 'T12:00:00')
      const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
      const endDay = end.getDate()
      if (startMonth === endMonth) {
        dateString = `${startMonth} ${startDay}\u2013${endDay}, ${startYear}`
      } else {
        dateString = `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${startYear}`
      }
    } else {
      dateString = `${startMonth} ${startDay}, ${startYear}`
    }
  }

  const isStory = format === 'story'
  const width = 1080
  const height = isStory ? 1920 : 1080

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: isStory ? '120px 60px' : '80px 80px',
          backgroundColor: '#F2EDDA',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        {/* Top: TRIPTI.ai branding */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: isStory ? 80 : 48 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: '#FA3823',
              marginRight: 10,
            }}
          />
          <span style={{ fontSize: 24, fontWeight: 700, color: '#2E303B', letterSpacing: 1 }}>
            TRIPTI.ai
          </span>
        </div>

        {/* Dashed "tear" line */}
        <div
          style={{
            borderTop: '3px dashed #2E303B40',
            marginBottom: isStory ? 80 : 48,
            width: '100%',
          }}
        />

        {/* Trip name */}
        <div
          style={{
            fontSize: isStory ? 64 : 56,
            fontWeight: 800,
            color: '#2E303B',
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          {trip.name}
        </div>

        {/* Destination */}
        {trip.destinationHint && (
          <div
            style={{
              fontSize: isStory ? 36 : 32,
              color: '#FA3823',
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {trip.destinationHint}
          </div>
        )}

        {/* Date + travelers row */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 24,
            color: '#2E303B',
            opacity: 0.7,
            marginBottom: isStory ? 60 : 40,
          }}
        >
          {dateString && <span>{dateString}</span>}
          {dateString && <span style={{ opacity: 0.5 }}>&middot;</span>}
          <span>
            {memberCount} traveler{memberCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom dashed line */}
        <div
          style={{
            borderTop: '3px dashed #2E303B40',
            marginBottom: isStory ? 60 : 40,
            width: '100%',
          }}
        />

        {/* Bottom branding */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div
            style={{
              fontSize: 18,
              color: '#2E303B',
              opacity: 0.5,
              fontStyle: 'italic',
            }}
          >
            Nifty plans. Happy circles.
          </div>
          <div
            style={{
              fontSize: 16,
              color: '#2E303B',
              opacity: 0.4,
              fontWeight: 600,
            }}
          >
            Planned with Tripti
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    }
  )
}
