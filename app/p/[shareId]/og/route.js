import { ImageResponse } from '@vercel/og'

export const runtime = 'edge'

export async function GET(request, { params }) {
  const { shareId } = params

  // Fetch trip data from the public API
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/public/trips/${shareId}`)

  if (!res.ok) {
    // Return a generic Tripti OG image for invalid/private trips
    return new ImageResponse(
      (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#F2EDDA',
        }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#2E303B' }}>
            TRIPTI.ai
          </div>
          <div style={{ fontSize: 24, color: '#2E303B', marginTop: 16 }}>
            Nifty plans. Happy circles.
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
      }
    )
  }

  const data = await res.json()
  const { trip } = data

  // Format dates
  let dateString = ''
  if (trip.lockedStartDate && trip.lockedEndDate) {
    const start = new Date(trip.lockedStartDate)
    const end = new Date(trip.lockedEndDate)
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const startDay = start.getDate()
    const endDay = end.getDate()
    const year = start.getFullYear()

    if (startMonth === endMonth) {
      dateString = `${startMonth} ${startDay}\u2013${endDay}, ${year}`
    } else {
      dateString = `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${year}`
    }
  }

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '60px 80px',
        backgroundColor: '#F2EDDA',
        fontFamily: 'Inter, sans-serif',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            backgroundColor: '#FA3823', marginRight: 12,
          }} />
          <span style={{ fontSize: 28, fontWeight: 700, color: '#2E303B' }}>
            TRIPTI.ai
          </span>
        </div>

        {/* Trip name */}
        <div style={{
          fontSize: 56, fontWeight: 800, color: '#2E303B',
          lineHeight: 1.1, marginBottom: 16,
          maxWidth: '90%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {trip.name}
        </div>

        {/* Destination */}
        {trip.destinationHint && (
          <div style={{
            fontSize: 32, color: '#FA3823', fontWeight: 600,
            marginBottom: 12,
          }}>
            {trip.destinationHint}
          </div>
        )}

        {/* Date + travelers */}
        <div style={{
          fontSize: 24, color: '#2E303B', opacity: 0.7,
          display: 'flex', gap: 16,
        }}>
          {dateString && <span>{dateString}</span>}
          {dateString && trip.travelerCount && <span>·</span>}
          {trip.travelerCount && (
            <span>{trip.travelerCount} traveler{trip.travelerCount !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Tagline */}
        <div style={{
          fontSize: 20, color: '#2E303B', opacity: 0.5,
          fontStyle: 'italic',
        }}>
          Nifty plans. Happy circles.
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    }
  )
}
