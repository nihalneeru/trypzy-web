import { describe, it, expect } from 'vitest'
import { generateICS, escapeICS, formatICSDate, parseTimeRange, formatICSDateTime } from '../../lib/trips/generateICS.js'

describe('escapeICS', () => {
  it('escapes backslashes', () => {
    expect(escapeICS('path\\to')).toBe('path\\\\to')
  })

  it('escapes semicolons', () => {
    expect(escapeICS('a;b')).toBe('a\\;b')
  })

  it('escapes commas', () => {
    expect(escapeICS('hello, world')).toBe('hello\\, world')
  })

  it('escapes newlines', () => {
    expect(escapeICS('line1\nline2')).toBe('line1\\nline2')
  })

  it('returns empty string for null/undefined', () => {
    expect(escapeICS(null)).toBe('')
    expect(escapeICS(undefined)).toBe('')
  })

  it('handles multiple special characters', () => {
    expect(escapeICS('a;b,c\nd')).toBe('a\\;b\\,c\\nd')
  })
})

describe('formatICSDate', () => {
  it('converts ISO date to ICS format', () => {
    expect(formatICSDate('2026-03-07')).toBe('20260307')
  })

  it('handles single-digit months and days', () => {
    expect(formatICSDate('2026-01-05')).toBe('20260105')
  })
})

describe('parseTimeRange', () => {
  it('parses AM-PM time range', () => {
    const result = parseTimeRange('9:00 AM - 12:00 PM')
    expect(result).toEqual({
      start: { hours: 9, minutes: 0 },
      end: { hours: 12, minutes: 0 }
    })
  })

  it('parses PM-PM time range', () => {
    const result = parseTimeRange('2:30 PM - 5:00 PM')
    expect(result).toEqual({
      start: { hours: 14, minutes: 30 },
      end: { hours: 17, minutes: 0 }
    })
  })

  it('handles 12:00 AM (midnight)', () => {
    const result = parseTimeRange('12:00 AM - 1:00 AM')
    expect(result).toEqual({
      start: { hours: 0, minutes: 0 },
      end: { hours: 1, minutes: 0 }
    })
  })

  it('handles 12:00 PM (noon)', () => {
    const result = parseTimeRange('12:00 PM - 1:00 PM')
    expect(result).toEqual({
      start: { hours: 12, minutes: 0 },
      end: { hours: 13, minutes: 0 }
    })
  })

  it('returns null for invalid input', () => {
    expect(parseTimeRange(null)).toBeNull()
    expect(parseTimeRange('')).toBeNull()
    expect(parseTimeRange('morning')).toBeNull()
  })

  it('handles en-dash separator', () => {
    const result = parseTimeRange('9:00 AM – 12:00 PM')
    expect(result).toEqual({
      start: { hours: 9, minutes: 0 },
      end: { hours: 12, minutes: 0 }
    })
  })
})

describe('formatICSDateTime', () => {
  it('formats date and time correctly', () => {
    expect(formatICSDateTime('2026-03-07', { hours: 9, minutes: 0 })).toBe('20260307T090000')
  })

  it('pads hours and minutes', () => {
    expect(formatICSDateTime('2026-03-07', { hours: 2, minutes: 5 })).toBe('20260307T020500')
  })
})

describe('generateICS', () => {
  const baseTripNoItinerary = {
    id: 'trip-1',
    name: 'Beach Getaway',
    lockedStartDate: '2026-03-07',
    lockedEndDate: '2026-03-10',
    destinationHint: 'Cancun, Mexico',
  }

  it('generates valid ICS structure', () => {
    const ics = generateICS(baseTripNoItinerary, null)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//Tripti.ai//Trip Export//EN')
    expect(ics).toContain('CALSCALE:GREGORIAN')
    expect(ics).toContain('METHOD:PUBLISH')
  })

  it('uses CRLF line endings', () => {
    const ics = generateICS(baseTripNoItinerary, null)
    expect(ics).toContain('\r\n')
    // Every line should be separated by CRLF
    const lines = ics.split('\r\n')
    expect(lines.length).toBeGreaterThan(2)
  })

  it('sets calendar name from trip name', () => {
    const ics = generateICS(baseTripNoItinerary, null)
    expect(ics).toContain('X-WR-CALNAME:Beach Getaway')
  })

  describe('trip-span event (no itinerary)', () => {
    it('creates a single span event when no itinerary', () => {
      const ics = generateICS(baseTripNoItinerary, null)
      expect(ics).toContain('BEGIN:VEVENT')
      expect(ics).toContain('END:VEVENT')
      expect(ics).toContain('SUMMARY:Beach Getaway')
      expect(ics).toContain('DTSTART;VALUE=DATE:20260307')
      // End date should be exclusive (day after lockedEndDate)
      expect(ics).toContain('DTEND;VALUE=DATE:20260311')
      expect(ics).toContain('LOCATION:Cancun\\, Mexico')
    })

    it('includes Tripti link in description', () => {
      const ics = generateICS(baseTripNoItinerary, null)
      expect(ics).toContain('View on Tripti: https://tripti.ai/trips/trip-1')
    })

    it('handles no locked dates gracefully', () => {
      const trip = { id: 'trip-2', name: 'Undated Trip' }
      const ics = generateICS(trip, null)
      expect(ics).toContain('BEGIN:VCALENDAR')
      expect(ics).toContain('END:VCALENDAR')
      expect(ics).not.toContain('BEGIN:VEVENT')
    })
  })

  describe('itinerary with blocks', () => {
    const itinerary = {
      content: {
        days: [
          {
            date: '2026-03-07',
            title: 'Day 1 - Arrival',
            blocks: [
              {
                timeRange: '9:00 AM - 12:00 PM',
                title: 'Airport Pickup',
                description: 'Meet at terminal 2',
                location: 'Cancun Airport',
                estCost: '$30',
              },
              {
                timeRange: '2:00 PM - 5:00 PM',
                title: 'Beach Time',
                location: 'Hotel Beach',
              },
            ],
          },
          {
            date: '2026-03-08',
            title: 'Day 2 - Explore',
            blocks: [
              {
                timeRange: '10:00 AM - 1:00 PM',
                title: 'Snorkeling Tour',
                description: 'Reef tour with guide',
                transitNotes: 'Boat leaves from pier 3',
              },
            ],
          },
        ],
      },
    }

    it('creates events from itinerary blocks', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      // Should have 3 events (2 blocks in day 1, 1 block in day 2)
      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
      expect(eventCount).toBe(3)
    })

    it('sets correct times for blocks', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('DTSTART:20260307T090000')
      expect(ics).toContain('DTEND:20260307T120000')
      expect(ics).toContain('DTSTART:20260307T140000')
      expect(ics).toContain('DTEND:20260307T170000')
    })

    it('uses block location when available', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('LOCATION:Cancun Airport')
    })

    it('falls back to destination hint for location', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      // Snorkeling Tour block has no location — should use trip destinationHint
      expect(ics).toContain('LOCATION:Cancun\\, Mexico')
    })

    it('includes description with cost and transit notes', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('Meet at terminal 2')
      expect(ics).toContain('Est. cost: $30')
      expect(ics).toContain('Transit: Boat leaves from pier 3')
    })
  })

  describe('itinerary with days but no blocks', () => {
    const itinerary = {
      content: {
        days: [
          {
            date: '2026-03-07',
            title: 'Free Day',
            areaFocus: 'Downtown area',
          },
          {
            date: '2026-03-08',
            title: 'Relaxation Day',
          },
        ],
      },
    }

    it('creates all-day events for days without blocks', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length
      expect(eventCount).toBe(2)
      expect(ics).toContain('DTSTART;VALUE=DATE:20260307')
      expect(ics).toContain('DTSTART;VALUE=DATE:20260308')
    })

    it('uses day title as summary', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('SUMMARY:Free Day')
      expect(ics).toContain('SUMMARY:Relaxation Day')
    })

    it('includes area focus in description', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('DESCRIPTION:Downtown area')
    })
  })

  describe('blocks without parseable time range', () => {
    const itinerary = {
      content: {
        days: [
          {
            date: '2026-03-07',
            title: 'Day 1',
            blocks: [
              {
                timeRange: 'Morning',
                title: 'Free Exploration',
              },
            ],
          },
        ],
      },
    }

    it('creates all-day event for unparseable time range', () => {
      const ics = generateICS(baseTripNoItinerary, itinerary)
      expect(ics).toContain('DTSTART;VALUE=DATE:20260307')
      expect(ics).toContain('SUMMARY:Free Exploration')
    })
  })

  describe('special characters', () => {
    it('escapes trip name with special characters', () => {
      const trip = {
        ...baseTripNoItinerary,
        name: 'Tom & Jerry, Inc; Adventure\nTrip',
      }
      const ics = generateICS(trip, null)
      expect(ics).toContain('X-WR-CALNAME:Tom & Jerry\\, Inc\\; Adventure\\nTrip')
    })
  })
})
