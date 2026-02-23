import Link from 'next/link'
import Image from 'next/image'
import { connectToMongo } from '@/lib/server/db.js'
import { sanitizeTripForPublic } from '@/lib/trips/sanitizeForPublic.js'

/**
 * Format a date range nicely, e.g. "Mar 7-9, 2026" or "Mar 28 - Apr 2, 2026"
 */
function formatDateRange(startStr, endStr) {
  if (!startStr) return null
  try {
    const start = new Date(startStr + 'T12:00:00')
    const end = endStr ? new Date(endStr + 'T12:00:00') : null

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
    const startDay = start.getDate()
    const startYear = start.getFullYear()

    if (!end) {
      return `${startMonth} ${startDay}, ${startYear}`
    }

    const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
    const endDay = end.getDate()
    const endYear = end.getFullYear()

    if (startYear === endYear && startMonth === endMonth) {
      return `${startMonth} ${startDay}\u2013${endDay}, ${startYear}`
    }
    if (startYear === endYear) {
      return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${startYear}`
    }
    return `${startMonth} ${startDay}, ${startYear} \u2013 ${endMonth} ${endDay}, ${endYear}`
  } catch {
    return startStr
  }
}

export default async function PublicTripPreviewPage({ params }) {
  const { shareId } = params
  const data = await fetchTripData(shareId)

  if (!data) {
    return <NotFoundView />
  }

  const { trip, itinerary, circle, cta } = data
  const dateRange = formatDateRange(trip.lockedStartDate, trip.lockedEndDate)

  return (
    <main className="min-h-screen bg-white font-inter">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
        {/* Header — Tripti logo */}
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/brand/tripti-logo.svg"
              alt="Tripti.ai"
              width={120}
              height={34}
              className="h-7 w-auto sm:h-8"
              unoptimized
            />
          </Link>
        </header>

        {/* Trip hero */}
        <section className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-brand-carbon mb-3">
            {trip.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            {trip.destinationHint && (
              <span>{trip.destinationHint}</span>
            )}
            {trip.destinationHint && dateRange && (
              <span className="text-gray-300">&middot;</span>
            )}
            {dateRange && (
              <span>{dateRange}</span>
            )}
            {(trip.destinationHint || dateRange) && (
              <span className="text-gray-300">&middot;</span>
            )}
            <span>
              {trip.travelerCount} traveler{trip.travelerCount !== 1 ? 's' : ''}
            </span>
          </div>
        </section>

        {/* Itinerary */}
        {itinerary?.content && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-brand-carbon mb-4">
              Itinerary
            </h2>
            <ItineraryPreview content={itinerary.content} />
          </section>
        )}

        {/* Idea count (if no itinerary but has ideas) */}
        {!itinerary?.content && itinerary?.ideaCount > 0 && (
          <section className="mb-10">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              {itinerary.ideaCount} itinerary idea{itinerary.ideaCount !== 1 ? 's' : ''} contributed so far
            </div>
          </section>
        )}

        {/* CTAs */}
        <section className="space-y-3 mb-10">
          <Link
            href={cta.remixUrl}
            className="block w-full text-center py-3 px-4 rounded-lg bg-brand-red text-white font-semibold text-base hover:bg-brand-red/90 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Plan a trip like this
          </Link>

          {cta.joinUrl && (
            <Link
              href={cta.joinUrl}
              className="block w-full text-center py-3 px-4 rounded-lg border-2 border-brand-blue text-brand-blue font-semibold text-base hover:bg-brand-blue/5 transition-colors"
              style={{ minHeight: '44px' }}
            >
              Join this group
            </Link>
          )}
        </section>

        {/* Footer branding */}
        <footer className="text-center pt-6 pb-8 border-t border-gray-100">
          <p className="text-sm text-gray-500 mb-1">
            Planned on{' '}
            <Link href="/" className="text-brand-blue hover:underline font-medium">
              Tripti.ai
            </Link>
          </p>
          <p className="text-xs text-gray-400 italic">
            Nifty plans. Happy circles.
          </p>
        </footer>
      </div>
    </main>
  )
}

function ItineraryPreview({ content }) {
  // Handle plain string content
  if (typeof content === 'string') {
    return (
      <div className="prose prose-sm max-w-none text-gray-700">
        {content.split('\n').map((line, i) => (
          <p key={i} className={line.trim() === '' ? 'h-3' : 'mb-1.5'}>
            {line}
          </p>
        ))}
      </div>
    )
  }

  // Handle structured content: { overview, days: [{ date, title, blocks }] }
  return (
    <div className="space-y-4">
      {content.overview && (
        <div className="p-3 bg-brand-sand/50 rounded-lg text-sm text-gray-700">
          {content.overview.pace && <span>Pace: {content.overview.pace}</span>}
          {content.overview.pace && content.overview.budget && <span> · </span>}
          {content.overview.budget && <span>Budget: {content.overview.budget}</span>}
          {content.overview.notes && (
            <p className="mt-1 text-gray-600">{content.overview.notes}</p>
          )}
        </div>
      )}

      {content.days?.map((day, dayIdx) => {
        const dayDate = day.date ? (() => {
          try {
            return new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric'
            })
          } catch { return null }
        })() : null

        return (
          <div key={dayIdx} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-medium text-brand-carbon">
                {dayDate || `Day ${dayIdx + 1}`}
              </span>
              {day.title && (
                <span className="text-sm text-gray-500 ml-2">— {day.title}</span>
              )}
              {day.areaFocus && (
                <span className="text-xs text-brand-blue ml-2">{day.areaFocus}</span>
              )}
            </div>
            {day.blocks?.length > 0 && (
              <div className="divide-y divide-gray-100">
                {day.blocks.map((block, blockIdx) => (
                  <div key={blockIdx} className="px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      {block.timeRange && (
                        <span className="text-xs font-medium text-brand-red shrink-0">
                          {block.timeRange}
                        </span>
                      )}
                      <span className="text-sm text-gray-700">
                        {block.activity || block.title || block.label || ''}
                      </span>
                    </div>
                    {block.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 ml-0">{block.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function NotFoundView() {
  return (
    <main className="min-h-screen bg-white font-inter flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 text-center">
        <header className="mb-8">
          <Link href="/" className="inline-block">
            <Image
              src="/brand/tripti-logo.svg"
              alt="Tripti.ai"
              width={120}
              height={34}
              className="h-7 w-auto sm:h-8"
              unoptimized
            />
          </Link>
        </header>
        <h1 className="text-xl font-semibold text-brand-carbon mb-3">
          Trip not found
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          This trip may no longer be shared, or the link may be incorrect.
        </p>
        <Link
          href="/"
          className="inline-block py-3 px-6 rounded-lg bg-brand-blue text-white font-semibold text-sm hover:bg-brand-blue/90 transition-colors"
          style={{ minHeight: '44px' }}
        >
          Go to Tripti.ai
        </Link>
      </div>
    </main>
  )
}

async function fetchTripData(shareId) {
  if (!shareId) return null

  try {
    const db = await connectToMongo()

    const trip = await db.collection('trips').findOne({
      shareId,
      shareVisibility: 'link_only'
    })

    if (!trip) return null

    // Privacy gate: if ANY active traveler has tripsVisibility=private, block
    const participants = await db.collection('trip_participants')
      .find({ tripId: trip.id, status: 'active' })
      .toArray()

    const participantUserIds = participants.map(p => p.userId)

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

      if (usersWithPrivateTrips.length > 0) return null
    }

    const itinerary = await db.collection('itinerary_versions')
      .findOne({ tripId: trip.id }, { sort: { version: -1 } })

    const ideas = await db.collection('itinerary_ideas')
      .find({ tripId: trip.id })
      .toArray()

    const circle = trip.circleId
      ? await db.collection('circles').findOne({ id: trip.circleId })
      : null

    const travelerCount = participantUserIds.length

    return sanitizeTripForPublic(trip, itinerary, ideas, circle, travelerCount)
  } catch (error) {
    console.error('Error fetching public trip data:', error)
    return null
  }
}
