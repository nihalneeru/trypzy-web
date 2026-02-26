import { describe, it, expect } from 'vitest'
import { normalizeWindow } from '@/lib/trips/normalizeWindow.js'

// --------------------------------------------------------------------------
// Replicated from DateWindowsFunnel.tsx (not exported)
// --------------------------------------------------------------------------
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

function generateSmartChips(currentMonth) {
  const chips = []
  const m1Name = MONTH_NAMES[(currentMonth + 1) % 12]
  const m2Name = MONTH_NAMES[(currentMonth + 2) % 12]

  chips.push({ label: `Weekend in ${m1Name}`, action: 'dates' })
  chips.push({ label: `Late ${m1Name}`, action: 'dates' })
  chips.push({ label: `Early ${m2Name}`, action: 'dates' })

  // Seasonal chips based on current month
  if (currentMonth >= 1 && currentMonth <= 2) {
    chips.push({ label: 'Spring break', action: 'dates' })
  } else if (currentMonth >= 3 && currentMonth <= 5) {
    chips.push({ label: 'Memorial Day weekend', action: 'dates' })
  } else if (currentMonth >= 4 && currentMonth <= 6) {
    chips.push({ label: '4th of July weekend', action: 'dates' })
  } else if (currentMonth >= 7 && currentMonth <= 9) {
    chips.push({ label: 'Thanksgiving week', action: 'dates' })
  }

  chips.push({ label: "I'm flexible", action: 'flexible' })
  return chips.slice(0, 5)
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('generateSmartChips', () => {
  describe('structure and count', () => {
    it('returns 4-5 chips for every month, never more than 5', () => {
      for (let month = 0; month < 12; month++) {
        const chips = generateSmartChips(month)
        expect(chips.length).toBeGreaterThanOrEqual(4)
        expect(chips.length).toBeLessThanOrEqual(5)
      }
    })

    it('last chip is always "I\'m flexible" with action flexible', () => {
      for (let month = 0; month < 12; month++) {
        const chips = generateSmartChips(month)
        const last = chips[chips.length - 1]
        expect(last.label).toBe("I'm flexible")
        expect(last.action).toBe('flexible')
      }
    })

    it('all non-flexible chips have action "dates"', () => {
      for (let month = 0; month < 12; month++) {
        const chips = generateSmartChips(month)
        const dateChips = chips.filter(c => c.action === 'dates')
        // At least 3 date chips (the month-relative ones), possibly 4 with seasonal
        expect(dateChips.length).toBeGreaterThanOrEqual(3)
      }
    })
  })

  describe('seasonal chip presence', () => {
    it('months 1-2 (Feb-Mar) include "Spring break"', () => {
      for (const month of [1, 2]) {
        const chips = generateSmartChips(month)
        const labels = chips.map(c => c.label)
        expect(labels).toContain('Spring break')
      }
    })

    it('months 3-5 (Apr-Jun) include "Memorial Day weekend"', () => {
      for (const month of [3, 4, 5]) {
        const chips = generateSmartChips(month)
        const labels = chips.map(c => c.label)
        expect(labels).toContain('Memorial Day weekend')
      }
    })

    it('month 6 (Jul) includes "4th of July weekend"', () => {
      // Months 4-5 hit the Memorial Day else-if branch first, so only month 6 fires this branch
      const chips = generateSmartChips(6)
      const labels = chips.map(c => c.label)
      expect(labels).toContain('4th of July weekend')
    })

    it('months 7-9 (Aug-Oct) include "Thanksgiving week"', () => {
      for (const month of [7, 8, 9]) {
        const chips = generateSmartChips(month)
        const labels = chips.map(c => c.label)
        expect(labels).toContain('Thanksgiving week')
      }
    })

    it('months 0, 10, 11 have no seasonal chip', () => {
      for (const month of [0, 10, 11]) {
        const chips = generateSmartChips(month)
        const dateChips = chips.filter(c => c.action === 'dates')
        // Only the 3 month-relative chips, no seasonal
        expect(dateChips.length).toBe(3)
      }
    })

    it('month 4 and 5 can produce both Memorial Day and 4th of July but slice caps at 5', () => {
      // months 4 and 5 hit BOTH the Memorial Day (3-5) and 4th of July (4-6) branches
      // But the if/else-if chain means only Memorial Day fires (it comes first)
      for (const month of [4, 5]) {
        const chips = generateSmartChips(month)
        const labels = chips.map(c => c.label)
        // else-if means only Memorial Day matches (3-5 branch fires before 4-6)
        expect(labels).toContain('Memorial Day weekend')
        expect(labels).not.toContain('4th of July weekend')
      }
    })
  })

  describe('"Late Month" and "Early Month" chips parse via normalizeWindow', () => {
    it('parses "Late [Month]" chip for all 12 months', () => {
      for (let month = 0; month < 12; month++) {
        const m1Name = MONTH_NAMES[(month + 1) % 12]
        const label = `Late ${m1Name}`
        // Use a stable tripYear so year inference doesn't affect the test
        const result = normalizeWindow(label, { tripYear: 2026 })

        expect(result.error, `"${label}" should parse without error`).toBeUndefined()
        expect(result.startISO).toBeTruthy()
        expect(result.endISO).toBeTruthy()
        expect(result.precision).toBe('approx')
      }
    })

    it('parses "Early [Month]" chip for all 12 months', () => {
      for (let month = 0; month < 12; month++) {
        const m2Name = MONTH_NAMES[(month + 2) % 12]
        const label = `Early ${m2Name}`
        const result = normalizeWindow(label, { tripYear: 2026 })

        expect(result.error, `"${label}" should parse without error`).toBeUndefined()
        expect(result.startISO).toBeTruthy()
        expect(result.endISO).toBeTruthy()
        expect(result.precision).toBe('approx')
      }
    })
  })

  describe('"Weekend in Month" chip does NOT parse via normalizeWindow (known gap)', () => {
    // "Weekend in March" does not match any normalizeWindow pattern.
    // normalizeWindow supports "first weekend of March" but not "weekend in March".
    // This documents the current behavior — chips with this label are intended for
    // UI-level handling, not direct normalizeWindow parsing.
    it('"Weekend in [Month]" returns an error from normalizeWindow', () => {
      for (let month = 0; month < 12; month++) {
        const m1Name = MONTH_NAMES[(month + 1) % 12]
        const label = `Weekend in ${m1Name}`
        const result = normalizeWindow(label, { tripYear: 2026 })

        expect(result.error).toBeDefined()
      }
    })
  })

  describe('seasonal chip labels do NOT parse via normalizeWindow (known gap)', () => {
    // These holiday/season labels have no month name that normalizeWindow can extract.
    // They are handled at the UI level, not by the date parser.
    const seasonalLabels = [
      'Spring break',
      'Memorial Day weekend',
      '4th of July weekend',
      'Thanksgiving week',
    ]

    for (const label of seasonalLabels) {
      it(`"${label}" returns an error from normalizeWindow`, () => {
        const result = normalizeWindow(label, { tripYear: 2026 })
        expect(result.error).toBeDefined()
      })
    }
  })

  describe('"I\'m flexible" chip', () => {
    it('is identified as action "flexible", not "dates"', () => {
      for (let month = 0; month < 12; month++) {
        const chips = generateSmartChips(month)
        const flexChip = chips.find(c => c.label === "I'm flexible")
        expect(flexChip).toBeDefined()
        expect(flexChip.action).toBe('flexible')
      }
    })

    it('does NOT parse via normalizeWindow (expected — contains "flexible" multi-range keyword)', () => {
      const result = normalizeWindow("I'm flexible", { tripYear: 2026 })
      expect(result.error).toBeDefined()
    })
  })
})
