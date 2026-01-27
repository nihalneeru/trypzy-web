import { describe, it, expect } from 'vitest'
import {
  normalizeWindow,
  validateWindowBounds,
  WINDOW_CONFIG
} from '@/lib/trips/normalizeWindow.js'

describe('normalizeWindow', () => {
  describe('explicit date ranges', () => {
    it('should parse "Feb 7-9" format', () => {
      const result = normalizeWindow('Feb 7-9', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-07')
      expect(result.endISO).toBe('2025-02-09')
      expect(result.precision).toBe('exact')
    })

    it('should parse "February 7 - 9" format with spaces', () => {
      const result = normalizeWindow('February 7 - 9', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-07')
      expect(result.endISO).toBe('2025-02-09')
      expect(result.precision).toBe('exact')
    })

    it('should parse "March 10 to 15" format', () => {
      const result = normalizeWindow('March 10 to 15', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-10')
      expect(result.endISO).toBe('2025-03-15')
    })

    it('should parse cross-month ranges like "Feb 28 to Mar 2"', () => {
      const result = normalizeWindow('Feb 28 to Mar 2', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-28')
      expect(result.endISO).toBe('2025-03-02')
    })

    it('should parse ISO format "2025-03-10 to 2025-03-15"', () => {
      const result = normalizeWindow('2025-03-10 to 2025-03-15')

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-10')
      expect(result.endISO).toBe('2025-03-15')
      expect(result.precision).toBe('exact')
    })

    it('should parse single date "Mar 15"', () => {
      const result = normalizeWindow('Mar 15', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-15')
      expect(result.endISO).toBe('2025-03-15')
    })

    it('should handle year in input "Feb 7-9 2026"', () => {
      const result = normalizeWindow('Feb 7-9 2026')

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2026-02-07')
      expect(result.endISO).toBe('2026-02-09')
    })

    it('should handle year rollover "Dec 30 to Jan 2"', () => {
      const result = normalizeWindow('Dec 30 to Jan 2', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-12-30')
      expect(result.endISO).toBe('2026-01-02')
    })
  })

  describe('relative month patterns', () => {
    it('should parse "early March"', () => {
      const result = normalizeWindow('early March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01')
      expect(result.endISO).toBe('2025-03-07')
      expect(result.precision).toBe('approx')
    })

    it('should parse "mid April"', () => {
      const result = normalizeWindow('mid April', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-04-10')
      expect(result.endISO).toBe('2025-04-20')
      expect(result.precision).toBe('approx')
    })

    it('should parse "late February"', () => {
      const result = normalizeWindow('late February', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-21')
      expect(result.endISO).toBe('2025-02-28') // non-leap year
      expect(result.precision).toBe('approx')
    })

    it('should handle leap year for late February', () => {
      const result = normalizeWindow('late February', { tripYear: 2024 })

      expect(result.error).toBeUndefined()
      expect(result.endISO).toBe('2024-02-29') // leap year
    })
  })

  describe('beginning/end synonyms', () => {
    it('should parse "beginning of March" as early March', () => {
      const result = normalizeWindow('beginning of March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01')
      expect(result.endISO).toBe('2025-03-07')
      expect(result.precision).toBe('approx')
    })

    it('should parse "end of March" as late March', () => {
      const result = normalizeWindow('end of March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-21')
      expect(result.endISO).toBe('2025-03-31')
      expect(result.precision).toBe('approx')
    })

    it('should parse "end of February" in non-leap year', () => {
      const result = normalizeWindow('end of February', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-21')
      expect(result.endISO).toBe('2025-02-28')
    })

    it('should parse "end of February" in leap year', () => {
      const result = normalizeWindow('end of February', { tripYear: 2024 })

      expect(result.error).toBeUndefined()
      expect(result.endISO).toBe('2024-02-29')
    })

    it('should parse "beginning of January"', () => {
      const result = normalizeWindow('beginning of January', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-01-01')
      expect(result.endISO).toBe('2025-01-07')
    })
  })

  describe('ordinal week patterns', () => {
    it('should parse "first week of February"', () => {
      const result = normalizeWindow('first week of February', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-01')
      expect(result.endISO).toBe('2025-02-07')
      expect(result.precision).toBe('approx')
    })

    it('should parse "1st week of March"', () => {
      const result = normalizeWindow('1st week of March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01')
      expect(result.endISO).toBe('2025-03-07')
    })

    it('should parse "second week of April"', () => {
      const result = normalizeWindow('second week of April', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-04-08')
      expect(result.endISO).toBe('2025-04-14')
      expect(result.precision).toBe('approx')
    })

    it('should parse "2nd week of June"', () => {
      const result = normalizeWindow('2nd week of June', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-06-08')
      expect(result.endISO).toBe('2025-06-14')
    })

    it('should parse "third week of July"', () => {
      const result = normalizeWindow('third week of July', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-07-15')
      expect(result.endISO).toBe('2025-07-21')
    })

    it('should parse "3rd week of October"', () => {
      const result = normalizeWindow('3rd week of October', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-10-15')
      expect(result.endISO).toBe('2025-10-21')
    })

    it('should parse "fourth week of May"', () => {
      const result = normalizeWindow('fourth week of May', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-05-22')
      expect(result.endISO).toBe('2025-05-28')
    })

    it('should parse "4th week of December"', () => {
      const result = normalizeWindow('4th week of December', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-12-22')
      expect(result.endISO).toBe('2025-12-28')
    })

    it('should handle optional "the" prefix', () => {
      const result = normalizeWindow('the first week of March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01')
      expect(result.endISO).toBe('2025-03-07')
    })

    it('should handle year inference from context', () => {
      const result = normalizeWindow('first week of March', { tripYear: 2026 })

      expect(result.startISO).toBe('2026-03-01')
      expect(result.endISO).toBe('2026-03-07')
    })

    it('should parse without "of" preposition', () => {
      const result = normalizeWindow('first week March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01')
      expect(result.endISO).toBe('2025-03-07')
    })

    it('should handle year in input', () => {
      const result = normalizeWindow('2nd week of April 2027')

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2027-04-08')
      expect(result.endISO).toBe('2027-04-14')
    })

    it('should cap fourth week at day 28 for February', () => {
      const result = normalizeWindow('fourth week of February', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-02-22')
      expect(result.endISO).toBe('2025-02-28')
    })
  })

  describe('weekend patterns', () => {
    it('should parse "first weekend of March" (March 2025)', () => {
      // March 2025: Saturday is March 1
      const result = normalizeWindow('first weekend of March', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-03-01') // Saturday
      expect(result.endISO).toBe('2025-03-02') // Sunday
      expect(result.precision).toBe('approx')
    })

    it('should parse "1st weekend of April"', () => {
      // April 2025: first Saturday is April 5
      const result = normalizeWindow('1st weekend of April', { tripYear: 2025 })

      expect(result.error).toBeUndefined()
      expect(result.startISO).toBe('2025-04-05')
      expect(result.endISO).toBe('2025-04-06')
    })
  })

  describe('rejection cases', () => {
    it('should reject empty input', () => {
      const result = normalizeWindow('')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Please enter')
    })

    it('should reject null input', () => {
      const result = normalizeWindow(null)

      expect(result.error).toBeDefined()
    })

    it('should reject multi-range input with "or"', () => {
      const result = normalizeWindow('Feb 7-9 or Feb 14-16')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('one date range at a time')
    })

    it('should reject "either" patterns', () => {
      const result = normalizeWindow('either March or April')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('one date range at a time')
    })

    it('should reject "anytime" patterns', () => {
      const result = normalizeWindow('anytime in March')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('one date range at a time')
    })

    it('should reject "flexible" patterns', () => {
      const result = normalizeWindow("I'm flexible")

      expect(result.error).toBeDefined()
      expect(result.error).toContain('one date range at a time')
    })

    it('should reject ranges exceeding MAX_WINDOW_DAYS (14)', () => {
      const result = normalizeWindow('Mar 1-20', { tripYear: 2025 })

      expect(result.error).toBeDefined()
      expect(result.error).toContain('20 days')
      expect(result.error).toContain('14-day limit')
    })

    it('should reject when end date is before start date', () => {
      const result = normalizeWindow('Mar 15-10', { tripYear: 2025 })

      expect(result.error).toBeDefined()
    })

    it('should reject unrecognized format', () => {
      const result = normalizeWindow('sometime next month')

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Could not understand')
    })

    it('should reject invalid month names', () => {
      const result = normalizeWindow('Janu 10-15')

      expect(result.error).toBeDefined()
    })

    it('should reject invalid day numbers', () => {
      const result = normalizeWindow('Feb 30-32', { tripYear: 2025 })

      expect(result.error).toBeDefined()
    })
  })

  describe('year inference', () => {
    it('should use tripYear from context when provided', () => {
      const result = normalizeWindow('Mar 10-15', { tripYear: 2027 })

      expect(result.startISO).toBe('2027-03-10')
    })

    it('should use startBound year from context when provided', () => {
      const result = normalizeWindow('Mar 10-15', { startBound: '2028-01-01' })

      expect(result.startISO).toBe('2028-03-10')
    })
  })

  describe('WINDOW_CONFIG', () => {
    it('should have MAX_WINDOW_DAYS = 14', () => {
      expect(WINDOW_CONFIG.MAX_WINDOW_DAYS).toBe(14)
    })

    it('should have MAX_WINDOWS_PER_USER = 2', () => {
      expect(WINDOW_CONFIG.MAX_WINDOWS_PER_USER).toBe(2)
    })
  })
})

describe('validateWindowBounds', () => {
  it('should pass when no bounds are set', () => {
    const result = validateWindowBounds('2025-03-10', '2025-03-15', null, null)

    expect(result.valid).toBe(true)
  })

  it('should pass when window is within bounds', () => {
    const result = validateWindowBounds(
      '2025-03-10',
      '2025-03-15',
      '2025-03-01',
      '2025-03-31'
    )

    expect(result.valid).toBe(true)
  })

  it('should fail when start is before trip start bound', () => {
    const result = validateWindowBounds(
      '2025-02-28',
      '2025-03-05',
      '2025-03-01',
      '2025-03-31'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('before')
  })

  it('should fail when end is after trip end bound', () => {
    const result = validateWindowBounds(
      '2025-03-28',
      '2025-04-02',
      '2025-03-01',
      '2025-03-31'
    )

    expect(result.valid).toBe(false)
    expect(result.error).toContain('after')
  })
})
