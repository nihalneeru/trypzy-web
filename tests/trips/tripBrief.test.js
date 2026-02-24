/**
 * Unit tests for Trip Brief aggregation logic
 *
 * Tests brief data assembly across different trip states:
 * - Full trip with all data present
 * - Trip with missing itinerary
 * - Trip with missing accommodation
 * - Trip with no expenses
 * - Empty/minimal trip (proposed, no data yet)
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────
// Extract brief assembly logic (mirrors API handler)
// ─────────────────────────────────────────────────

function assembleBrief({
  trip,
  travelerCount,
  accommodationOptions = [],
  accommodationVotes = [],
  latestItineraryVersion = null,
  prepItems = [],
  stage = 'PROPOSED'
}) {
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
    lockedStartDate: trip.lockedStartDate || null,
    lockedEndDate: trip.lockedEndDate || null,
    duration,
    travelerCount,
    status: trip.status || 'proposed',
    stage
  }

  // Accommodation
  let accommodation = null
  if (accommodationOptions.length > 0 || accommodationVotes.length > 0) {
    const chosen = accommodationOptions.find(o => o.status === 'selected') || null
    accommodation = {
      chosen: chosen ? { name: chosen.title, location: chosen.source || null, priceRange: chosen.priceRange || null, url: chosen.url || null } : null,
      optionCount: accommodationOptions.length,
      voteCount: accommodationVotes.length
    }
  }

  // Day-by-day
  let dayByDay = null
  if (latestItineraryVersion) {
    const latest = latestItineraryVersion
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

  // Decisions
  const decisions = { open: [], closed: [] }
  if (datesLocked && trip.lockedStartDate && trip.lockedEndDate) {
    const s = new Date(trip.lockedStartDate + 'T12:00:00')
    const e = new Date(trip.lockedEndDate + 'T12:00:00')
    const summary = `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    decisions.closed.push({
      type: 'dates_locked',
      summary,
      decidedAt: trip.datesLockedAt || trip.updatedAt || null
    })
  }

  // Packing
  const packingReminders = prepItems.map(item => ({
    name: item.name || item.text || 'Unnamed item',
    scope: 'group',
    assignedTo: item.assignedTo || null
  }))

  // Expenses
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

  return { overview, accommodation, dayByDay, decisions, packingReminders, expensesSummary }
}

// ─────────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────────

function makeTrip(overrides = {}) {
  return {
    id: 'trip-1',
    name: 'Beach Getaway',
    status: 'locked',
    lockedStartDate: '2026-03-07',
    lockedEndDate: '2026-03-09',
    destinationHint: 'Cancun, Mexico',
    datesLockedAt: '2026-02-20T10:00:00Z',
    expenses: [],
    ...overrides
  }
}

function makeItineraryVersion(overrides = {}) {
  return {
    id: 'iv-1',
    version: 1,
    content: {
      days: [
        {
          date: '2026-03-07',
          title: 'Arrival Day',
          blocks: [
            { timeRange: '14:00-16:00', title: 'Check in', description: 'Hotel check-in' },
            { timeRange: '18:00-20:00', title: 'Welcome dinner', description: null }
          ]
        },
        {
          date: '2026-03-08',
          title: 'Beach Day',
          blocks: [
            { timeRange: '09:00-12:00', title: 'Snorkeling', description: 'Reef tour' }
          ]
        }
      ]
    },
    ...overrides
  }
}

function makeAccommodationOption(overrides = {}) {
  return {
    id: 'acc-1',
    title: 'Beachside Villa',
    source: 'Cancun beachfront',
    priceRange: '$200-300/night',
    url: 'https://example.com/villa',
    status: 'selected',
    ...overrides
  }
}

// ─────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────

describe('assembleBrief', () => {
  it('assembles full brief with all data present', () => {
    const trip = makeTrip({
      expenses: [
        { amountCents: 15000, currency: 'USD' },
        { amountCents: 8000, currency: 'USD' }
      ]
    })

    const result = assembleBrief({
      trip,
      travelerCount: 5,
      accommodationOptions: [makeAccommodationOption()],
      accommodationVotes: [{ userId: 'u1', optionId: 'acc-1' }],
      latestItineraryVersion: makeItineraryVersion(),
      prepItems: [
        { name: 'Sunscreen', scope: 'group', assignedTo: 'Alex' },
        { name: 'First aid kit', scope: 'group', assignedTo: null }
      ],
      stage: 'STAY'
    })

    // Overview
    expect(result.overview.name).toBe('Beach Getaway')
    expect(result.overview.destinationHint).toBe('Cancun, Mexico')
    expect(result.overview.lockedStartDate).toBe('2026-03-07')
    expect(result.overview.lockedEndDate).toBe('2026-03-09')
    expect(result.overview.duration).toBe(2)
    expect(result.overview.travelerCount).toBe(5)
    expect(result.overview.status).toBe('locked')
    expect(result.overview.stage).toBe('STAY')

    // Accommodation
    expect(result.accommodation).not.toBeNull()
    expect(result.accommodation.chosen.name).toBe('Beachside Villa')
    expect(result.accommodation.chosen.location).toBe('Cancun beachfront')
    expect(result.accommodation.optionCount).toBe(1)
    expect(result.accommodation.voteCount).toBe(1)

    // Day-by-day
    expect(result.dayByDay).toHaveLength(2)
    expect(result.dayByDay[0].date).toBe('2026-03-07')
    expect(result.dayByDay[0].title).toBe('Arrival Day')
    expect(result.dayByDay[0].blocks).toHaveLength(2)
    expect(result.dayByDay[0].blocks[0].activity).toBe('Check in')
    expect(result.dayByDay[0].blocks[0].timeRange).toBe('14:00-16:00')
    expect(result.dayByDay[0].blocks[0].notes).toBe('Hotel check-in')
    expect(result.dayByDay[1].blocks[0].activity).toBe('Snorkeling')

    // Decisions
    expect(result.decisions.closed).toHaveLength(1)
    expect(result.decisions.closed[0].type).toBe('dates_locked')
    expect(result.decisions.closed[0].summary).toContain('Mar')
    expect(result.decisions.closed[0].decidedAt).toBe('2026-02-20T10:00:00Z')

    // Packing
    expect(result.packingReminders).toHaveLength(2)
    expect(result.packingReminders[0].name).toBe('Sunscreen')
    expect(result.packingReminders[0].assignedTo).toBe('Alex')
    expect(result.packingReminders[1].assignedTo).toBeNull()

    // Expenses
    expect(result.expensesSummary).not.toBeNull()
    expect(result.expensesSummary.totalAmount).toBe(230)
    expect(result.expensesSummary.currency).toBe('USD')
    expect(result.expensesSummary.itemCount).toBe(2)
  })

  it('handles trip with missing itinerary', () => {
    const result = assembleBrief({
      trip: makeTrip(),
      travelerCount: 3,
      accommodationOptions: [makeAccommodationOption()],
      latestItineraryVersion: null,
      stage: 'DATES_LOCKED'
    })

    expect(result.dayByDay).toBeNull()
    expect(result.overview.name).toBe('Beach Getaway')
    expect(result.accommodation).not.toBeNull()
    expect(result.accommodation.chosen.name).toBe('Beachside Villa')
  })

  it('handles trip with missing accommodation', () => {
    const result = assembleBrief({
      trip: makeTrip(),
      travelerCount: 4,
      accommodationOptions: [],
      accommodationVotes: [],
      latestItineraryVersion: makeItineraryVersion(),
      stage: 'ITINERARY'
    })

    expect(result.accommodation).toBeNull()
    expect(result.dayByDay).not.toBeNull()
    expect(result.dayByDay).toHaveLength(2)
  })

  it('handles trip with no expenses', () => {
    const result = assembleBrief({
      trip: makeTrip({ expenses: [] }),
      travelerCount: 4,
      stage: 'DATES_LOCKED'
    })

    expect(result.expensesSummary).toBeNull()
  })

  it('handles empty/minimal trip (proposed, no data)', () => {
    const result = assembleBrief({
      trip: {
        id: 'trip-minimal',
        name: 'Weekend Plans',
        status: 'proposed',
        expenses: []
      },
      travelerCount: 2,
      stage: 'PROPOSED'
    })

    // Overview
    expect(result.overview.name).toBe('Weekend Plans')
    expect(result.overview.destinationHint).toBeNull()
    expect(result.overview.lockedStartDate).toBeNull()
    expect(result.overview.lockedEndDate).toBeNull()
    expect(result.overview.duration).toBeNull()
    expect(result.overview.travelerCount).toBe(2)
    expect(result.overview.status).toBe('proposed')

    // Everything else is empty/null
    expect(result.accommodation).toBeNull()
    expect(result.dayByDay).toBeNull()
    expect(result.decisions.open).toHaveLength(0)
    expect(result.decisions.closed).toHaveLength(0)
    expect(result.packingReminders).toHaveLength(0)
    expect(result.expensesSummary).toBeNull()
  })

  it('handles accommodation with options but none selected', () => {
    const result = assembleBrief({
      trip: makeTrip(),
      travelerCount: 3,
      accommodationOptions: [
        makeAccommodationOption({ status: 'shortlisted', title: 'Option A' }),
        makeAccommodationOption({ status: 'proposed', title: 'Option B', id: 'acc-2' })
      ],
      accommodationVotes: [
        { userId: 'u1', optionId: 'acc-1' },
        { userId: 'u2', optionId: 'acc-2' }
      ],
      stage: 'ITINERARY'
    })

    expect(result.accommodation).not.toBeNull()
    expect(result.accommodation.chosen).toBeNull()
    expect(result.accommodation.optionCount).toBe(2)
    expect(result.accommodation.voteCount).toBe(2)
  })

  it('computes duration correctly for multi-day trips', () => {
    const result = assembleBrief({
      trip: makeTrip({
        lockedStartDate: '2026-06-01',
        lockedEndDate: '2026-06-08'
      }),
      travelerCount: 6,
      stage: 'DATES_LOCKED'
    })

    expect(result.overview.duration).toBe(7)
  })

  it('uses text field as fallback for prep item name', () => {
    const result = assembleBrief({
      trip: makeTrip(),
      travelerCount: 3,
      prepItems: [
        { text: 'Beach towels', scope: 'group', assignedTo: null }
      ],
      stage: 'PREP'
    })

    expect(result.packingReminders).toHaveLength(1)
    expect(result.packingReminders[0].name).toBe('Beach towels')
  })

  it('handles itinerary with empty blocks', () => {
    const result = assembleBrief({
      trip: makeTrip(),
      travelerCount: 3,
      latestItineraryVersion: makeItineraryVersion({
        content: {
          days: [
            { date: '2026-03-07', title: 'Free day', blocks: [] }
          ]
        }
      }),
      stage: 'ITINERARY'
    })

    expect(result.dayByDay).toHaveLength(1)
    expect(result.dayByDay[0].blocks).toHaveLength(0)
  })
})
