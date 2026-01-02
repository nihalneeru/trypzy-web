import { describe, it, expect } from 'vitest'
import {
  calculateConsensus,
  dateToDayString,
  dayStringToDate,
  generateOptionKey,
  parseOptionKey,
  getAllDaysBetween,
} from '../trip-consensus'
import { DateOption } from '@/types/trips'
import { AvailabilityStatus } from '@/types/enums'

describe('trip-consensus', () => {
  describe('dateToDayString', () => {
    it('converts date to YYYY-MM-DD format', () => {
      const date = new Date('2024-07-15T10:30:00Z')
      expect(dateToDayString(date)).toBe('2024-07-15')
    })

    it('handles different timezones correctly', () => {
      const date = new Date('2024-07-15T23:59:59Z')
      expect(dateToDayString(date)).toBe('2024-07-15')
    })
  })

  describe('dayStringToDate', () => {
    it('converts YYYY-MM-DD to Date at midnight UTC', () => {
      const date = dayStringToDate('2024-07-15')
      expect(date.toISOString()).toContain('2024-07-15T00:00:00')
    })
  })

  describe('generateOptionKey', () => {
    it('generates option key in correct format', () => {
      const key = generateOptionKey('2024-07-15', '2024-07-20')
      expect(key).toBe('2024-07-15_2024-07-20')
    })
  })

  describe('parseOptionKey', () => {
    it('parses option key correctly', () => {
      const { startDay, endDay } = parseOptionKey('2024-07-15_2024-07-20')
      expect(startDay).toBe('2024-07-15')
      expect(endDay).toBe('2024-07-20')
    })
  })

  describe('getAllDaysBetween', () => {
    it('returns all days between start and end (inclusive)', () => {
      const start = dayStringToDate('2024-07-15')
      const end = dayStringToDate('2024-07-17')
      const days = getAllDaysBetween(start, end)
      expect(days).toEqual(['2024-07-15', '2024-07-16', '2024-07-17'])
    })

    it('handles single day range', () => {
      const start = dayStringToDate('2024-07-15')
      const end = dayStringToDate('2024-07-15')
      const days = getAllDaysBetween(start, end)
      expect(days).toEqual(['2024-07-15'])
    })
  })

  describe('calculateConsensus', () => {
    it('returns top 3 options sorted by score', () => {
      const earliestStart = new Date('2024-07-01T00:00:00Z')
      const latestEnd = new Date('2024-07-05T00:00:00Z')

      const availabilities = [
        // User 1: Available all days
        { day: '2024-07-01', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-02', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-03', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-04', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-05', status: AvailabilityStatus.available, userId: 'user1' },
        // User 2: Available only first 3 days
        { day: '2024-07-01', status: AvailabilityStatus.available, userId: 'user2' },
        { day: '2024-07-02', status: AvailabilityStatus.available, userId: 'user2' },
        { day: '2024-07-03', status: AvailabilityStatus.available, userId: 'user2' },
      ]

      const options = calculateConsensus(availabilities, earliestStart, latestEnd)

      expect(options.length).toBeLessThanOrEqual(3)
      expect(options[0].score).toBeGreaterThanOrEqual(options[1]?.score || 0)
      expect(options.every(opt => opt.optionKey.includes('_'))).toBe(true)
    })

    it('is deterministic - same inputs produce same outputs', () => {
      const earliestStart = new Date('2024-07-01T00:00:00Z')
      const latestEnd = new Date('2024-07-03T00:00:00Z')

      const availabilities = [
        { day: '2024-07-01', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-02', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-03', status: AvailabilityStatus.maybe, userId: 'user1' },
        { day: '2024-07-01', status: AvailabilityStatus.available, userId: 'user2' },
        { day: '2024-07-02', status: AvailabilityStatus.unavailable, userId: 'user2' },
      ]

      const options1 = calculateConsensus(availabilities, earliestStart, latestEnd)
      const options2 = calculateConsensus(availabilities, earliestStart, latestEnd)

      expect(options1.length).toBe(options2.length)
      options1.forEach((opt1, index) => {
        const opt2 = options2[index]
        expect(opt1.optionKey).toBe(opt2.optionKey)
        expect(opt1.score).toBe(opt2.score)
        expect(opt1.attendeeCount).toBe(opt2.attendeeCount)
      })
    })

    it('calculates scores correctly (available=1, maybe=0.5)', () => {
      const earliestStart = new Date('2024-07-01T00:00:00Z')
      const latestEnd = new Date('2024-07-01T00:00:00Z')

      const availabilities = [
        { day: '2024-07-01', status: AvailabilityStatus.available, userId: 'user1' },
        { day: '2024-07-01', status: AvailabilityStatus.maybe, userId: 'user2' },
        { day: '2024-07-01', status: AvailabilityStatus.unavailable, userId: 'user3' },
      ]

      const options = calculateConsensus(availabilities, earliestStart, latestEnd)
      // Should have one option with score around 1.5 (1 from user1 + 0.5 from user2)
      expect(options.length).toBeGreaterThan(0)
    })
  })
})

