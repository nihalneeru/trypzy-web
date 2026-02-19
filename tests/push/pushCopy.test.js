import { describe, it, expect } from 'vitest'
import { PUSH_COPY, formatDateRange } from '@/lib/push/pushCopy'

// Brand guardrail words that should never appear in push copy
const FORBIDDEN_WORDS = ['you must', 'required', 'incomplete', 'everyone needs']

// All registered push types
const ALL_TYPES = Object.keys(PUSH_COPY)

// Minimal context for each type
const CONTEXTS = {
  trip_created_notify: { tripName: 'Beach Trip', actorName: 'Alex' },
  trip_canceled: { tripName: 'Beach Trip', actorName: 'Alex' },
  first_dates_suggested: { tripName: 'Beach Trip' },
  dates_proposed_by_leader: { tripName: 'Beach Trip', actorName: 'Alex', dates: 'Feb 7\u2013Feb 9' },
  dates_locked: { tripName: 'Beach Trip', dates: 'Feb 7\u2013Feb 9' },
  itinerary_generated: { tripName: 'Beach Trip', version: 1 },
  join_request_received: { tripName: 'Beach Trip', actorName: 'Sam' },
  join_request_approved: { tripName: 'Beach Trip' },
  leader_ready_to_propose: { tripName: 'Beach Trip', dates: 'Feb 7\u2013Feb 9' },
  window_supported_author: { tripName: 'Beach Trip', actorName: 'Jordan' },
  expense_added: { tripName: 'Beach Trip', actorName: 'Alex' },
  accommodation_selected: { tripName: 'Beach Trip' },
  first_idea_contributed: { tripName: 'Beach Trip', actorName: 'Alex' },
  prep_reminder_7d: { tripName: 'Beach Trip' },
  trip_started: { tripName: 'Beach Trip' },
  leader_transferred: { tripName: 'Beach Trip' },
}

const TRIP = { id: 'trip-1', name: 'Beach Trip', createdBy: 'leader-1' }

describe('pushCopy', () => {
  describe('all types return non-empty { title, body }', () => {
    for (const type of ALL_TYPES) {
      it(`${type}`, () => {
        const ctx = CONTEXTS[type] || { tripName: 'Trip' }
        const result = PUSH_COPY[type](ctx, { userId: 'user-1', trip: TRIP })
        expect(result).toHaveProperty('title')
        expect(result).toHaveProperty('body')
        expect(result.title).toBeTruthy()
        expect(result.body).toBeTruthy()
        expect(typeof result.title).toBe('string')
        expect(typeof result.body).toBe('string')
      })
    }
  })

  describe('no forbidden language', () => {
    for (const type of ALL_TYPES) {
      it(`${type} copy respects brand guardrails`, () => {
        const ctx = CONTEXTS[type] || { tripName: 'Trip' }
        const result = PUSH_COPY[type](ctx, { userId: 'user-1', trip: TRIP })
        const combined = `${result.title} ${result.body}`.toLowerCase()
        for (const word of FORBIDDEN_WORDS) {
          expect(combined).not.toContain(word)
        }
      })
    }
  })

  describe('dates_locked is role-aware', () => {
    it('leader gets confirmation copy', () => {
      const ctx = { tripName: 'Beach Trip', dates: 'Feb 7\u2013Feb 9' }
      const result = PUSH_COPY.dates_locked(ctx, { userId: 'leader-1', trip: TRIP })
      expect(result.body).toContain('You confirmed')
    })

    it('travelers get announcement copy', () => {
      const ctx = { tripName: 'Beach Trip', dates: 'Feb 7\u2013Feb 9' }
      const result = PUSH_COPY.dates_locked(ctx, { userId: 'traveler-1', trip: TRIP })
      expect(result.body).toContain('Dates confirmed')
    })
  })

  describe('itinerary_generated is version-aware', () => {
    it('v1 says "ready"', () => {
      const result = PUSH_COPY.itinerary_generated(
        { tripName: 'Beach Trip', version: 1 },
        { userId: 'user-1', trip: TRIP }
      )
      expect(result.body).toContain('ready')
    })

    it('v2+ says "updated"', () => {
      const result = PUSH_COPY.itinerary_generated(
        { tripName: 'Beach Trip', version: 2 },
        { userId: 'user-1', trip: TRIP }
      )
      expect(result.body).toContain('updated')
    })
  })

  describe('formatDateRange', () => {
    it('formats dates as "Feb 7–Feb 9"', () => {
      const result = formatDateRange('2026-02-07', '2026-02-09')
      expect(result).toBe('Feb 7\u2013Feb 9')
    })

    it('handles cross-month ranges', () => {
      const result = formatDateRange('2026-01-30', '2026-02-02')
      expect(result).toBe('Jan 30\u2013Feb 2')
    })
  })
})
