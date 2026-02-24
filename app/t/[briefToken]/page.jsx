import Link from 'next/link'
import Image from 'next/image'
import { connectToMongo } from '@/lib/server/db.js'

/**
 * Format a date range, e.g. "Mar 7–9, 2026" or "Mar 28 – Apr 2, 2026"
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

function formatLocalDate(dateStr, opts) {
  if (!dateStr) return null
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', opts)
  } catch {
    return dateStr
  }
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// ============================================================================
// Card sections
// ============================================================================

function SectionCard({ children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {children}
    </div>
  )
}

function SectionHeader({ label }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-brand-blue mb-3">
      {label}
    </h2>
  )
}

function EmptyState({ text }) {
  return (
    <div className="rounded-lg bg-brand-sand/40 px-3 py-2">
      <p className="text-xs text-gray-500">{text}</p>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export default async function PublicBriefPage({ params }) {
  const { briefToken } = params
  const data = await fetchBriefData(briefToken)

  if (!data) {
    return <NotFoundView />
  }

  const { overview, accommodation, dayByDay, decisions, packingReminders, expensesSummary } = data
  const dateRange = formatDateRange(overview.lockedStartDate, overview.lockedEndDate)

  return (
    <main className="min-h-screen bg-gray-50 font-inter">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10">

        {/* Logo */}
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
        <section className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold text-brand-carbon mb-2">
            {overview.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            {overview.destinationHint && (
              <span>{overview.destinationHint}</span>
            )}
            {overview.destinationHint && dateRange && (
              <span className="text-gray-300">&middot;</span>
            )}
            {dateRange && (
              <span>{dateRange}</span>
            )}
            {(overview.destinationHint || dateRange) && (
              <span className="text-gray-300">&middot;</span>
            )}
            <span>
              {overview.travelerCount} traveler{overview.travelerCount !== 1 ? 's' : ''}
            </span>
          </div>
        </section>

        <div className="space-y-4">

          {/* Overview card */}
          <SectionCard>
            <SectionHeader label="Overview" />
            <div className="space-y-1.5 text-sm text-gray-700">
              {overview.destinationHint && (
                <p><span className="font-medium text-brand-carbon">Destination:</span> {overview.destinationHint}</p>
              )}
              {overview.address && (
                <p><span className="font-medium text-brand-carbon">Address:</span> {overview.address}</p>
              )}
              {dateRange ? (
                <p><span className="font-medium text-brand-carbon">Dates:</span> {dateRange}{overview.duration != null && ` (${overview.duration} day${overview.duration !== 1 ? 's' : ''})`}</p>
              ) : (
                <p className="text-gray-400 italic">Dates not yet locked</p>
              )}
              <p><span className="font-medium text-brand-carbon">Travelers:</span> {overview.travelerCount}</p>
            </div>
          </SectionCard>

          {/* Accommodation card */}
          <SectionCard>
            <SectionHeader label="Accommodation" />
            {accommodation ? (
              accommodation.chosen ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-brand-carbon">{accommodation.chosen.name}</p>
                  {accommodation.chosen.location && (
                    <p className="text-gray-600">{accommodation.chosen.location}</p>
                  )}
                  {accommodation.chosen.priceRange && (
                    <p className="text-gray-500 text-xs">{accommodation.chosen.priceRange}</p>
                  )}
                  {accommodation.chosen.url && (
                    <a
                      href={accommodation.chosen.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-blue hover:underline"
                    >
                      View listing
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {accommodation.optionCount} option{accommodation.optionCount !== 1 ? 's' : ''} proposed — not yet decided
                </p>
              )
            ) : (
              <EmptyState text="Not yet chosen" />
            )}
          </SectionCard>

          {/* Day-by-day card */}
          <SectionCard>
            <SectionHeader label="Day-by-Day" />
            {dayByDay && dayByDay.length > 0 ? (
              <div className="space-y-4">
                {dayByDay.map((day, dayIdx) => {
                  const dayLabel = day.date
                    ? formatLocalDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })
                    : `Day ${dayIdx + 1}`
                  return (
                    <div key={dayIdx}>
                      <p className="text-xs font-semibold text-brand-carbon mb-1.5">
                        {dayLabel}{day.title && ` — ${day.title}`}
                      </p>
                      {day.blocks && day.blocks.length > 0 ? (
                        <div className="space-y-1.5 pl-3 border-l-2 border-brand-sand">
                          {day.blocks.map((block, blockIdx) => (
                            <div key={blockIdx} className="text-xs">
                              {block.timeRange && (
                                <span className="font-medium text-brand-red mr-1.5">{block.timeRange}</span>
                              )}
                              <span className="text-gray-700">{block.activity}</span>
                              {block.notes && (
                                <p className="text-gray-500 mt-0.5">{block.notes}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic pl-3">No activities planned</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState text="Itinerary not yet decided" />
            )}
          </SectionCard>

          {/* Packing card */}
          <SectionCard>
            <SectionHeader label="Group Packing" />
            {packingReminders && packingReminders.length > 0 ? (
              <ul className="space-y-1.5">
                {packingReminders.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-blue mt-1.5 shrink-0" />
                    {item.name}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState text="No group packing items yet" />
            )}
          </SectionCard>

          {/* Expenses card */}
          <SectionCard>
            <SectionHeader label="Expenses" />
            {expensesSummary ? (
              <div>
                <p className="text-base font-semibold text-brand-carbon">
                  {formatCurrency(expensesSummary.totalAmount, expensesSummary.currency)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {expensesSummary.itemCount} expense{expensesSummary.itemCount !== 1 ? 's' : ''} tracked
                </p>
              </div>
            ) : (
              <EmptyState text="No expenses tracked yet" />
            )}
          </SectionCard>

        </div>

        {/* CTA */}
        <section className="mt-10 mb-6">
          <Link
            href="/signup?ref=brief"
            className="block w-full text-center py-3.5 px-4 rounded-xl bg-brand-red text-white font-semibold text-base hover:bg-brand-red/90 transition-colors"
            style={{ minHeight: '44px' }}
          >
            Plan your own trip
          </Link>
        </section>

        {/* Footer */}
        <footer className="text-center pt-6 pb-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-1">
            Planned with{' '}
            <Link href="/" className="text-brand-blue hover:underline font-medium">
              Tripti.ai
            </Link>
          </p>
          <p className="text-xs text-gray-400 italic">Nifty plans. Happy circles.</p>
        </footer>

      </div>
    </main>
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
          Trip brief not found
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          This brief may no longer be shared, or the link may be incorrect.
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

async function fetchBriefData(briefToken) {
  if (!briefToken) return null

  try {
    const db = await connectToMongo()

    const trip = await db.collection('trips').findOne({ briefToken })
    if (!trip || !trip.briefToken) return null

    // Parallel data fetch
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

    // Traveler count
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
      address: trip.briefShowAddress ? (trip.address || null) : null,
      lockedStartDate: trip.lockedStartDate || null,
      lockedEndDate: trip.lockedEndDate || null,
      duration,
      travelerCount,
      status: trip.status || 'proposed'
    }

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

    const packingReminders = prepItems.map(item => ({
      name: item.name || item.text || 'Unnamed item'
    }))

    let expensesSummary = null
    const expenses = trip.expenses || []
    if (expenses.length > 0) {
      const totalCents = expenses.reduce((sum, e) => sum + (e.amountCents || 0), 0)
      const currency = expenses[0]?.currency || trip.currency || 'USD'
      expensesSummary = { totalAmount: totalCents / 100, currency, itemCount: expenses.length }
    }

    const decisions = { closed: [] }
    if (trip.lockedStartDate && trip.lockedEndDate) {
      const s = new Date(trip.lockedStartDate + 'T12:00:00')
      const e = new Date(trip.lockedEndDate + 'T12:00:00')
      const summary = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      decisions.closed.push({ type: 'dates_locked', summary })
    }

    return { overview, accommodation, dayByDay, decisions, packingReminders, expensesSummary }
  } catch (error) {
    console.error('Error fetching public brief data:', error)
    return null
  }
}
