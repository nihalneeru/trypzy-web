import { buildTripDateList } from '@/lib/itinerary/buildTripDateList.js'
import { normalizeItineraryDates, validateItineraryDates } from '@/lib/itinerary/normalizeItineraryDates.js'

describe('buildTripDateList', () => {
  it('should generate correct date list for a 3-day trip', () => {
    const dates = buildTripDateList('2026-05-08', '2026-05-10')
    expect(dates).toEqual(['2026-05-08', '2026-05-09', '2026-05-10'])
    expect(dates.length).toBe(3)
  })

  it('should generate correct date list for a single day trip', () => {
    const dates = buildTripDateList('2026-05-08', '2026-05-08')
    expect(dates).toEqual(['2026-05-08'])
    expect(dates.length).toBe(1)
  })

  it('should generate correct date list for a week-long trip', () => {
    const dates = buildTripDateList('2026-05-08', '2026-05-14')
    expect(dates).toEqual([
      '2026-05-08',
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14'
    ])
    expect(dates.length).toBe(7)
  })

  it('should handle month boundaries correctly', () => {
    const dates = buildTripDateList('2026-05-30', '2026-06-02')
    expect(dates).toEqual(['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02'])
    expect(dates.length).toBe(4)
  })

  it('should throw error for missing dates', () => {
    expect(() => buildTripDateList(null, '2026-05-10')).toThrow('startDate and endDate are required')
    expect(() => buildTripDateList('2026-05-08', null)).toThrow('startDate and endDate are required')
  })

  it('should throw error for invalid date format', () => {
    expect(() => buildTripDateList('invalid', '2026-05-10')).toThrow('Invalid date format')
    expect(() => buildTripDateList('2026-05-08', 'invalid')).toThrow('Invalid date format')
  })

  it('should throw error if startDate > endDate', () => {
    expect(() => buildTripDateList('2026-05-10', '2026-05-08')).toThrow('startDate must be <= endDate')
  })
})

describe('validateItineraryDates', () => {
  const dateList = ['2026-05-08', '2026-05-09', '2026-05-10']

  it('should validate correct itinerary', () => {
    const itinerary = {
      overview: { pace: 'balanced', budget: 'mid' },
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-09', title: 'Day 2', blocks: [] },
        { date: '2026-05-10', title: 'Day 3', blocks: [] }
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should detect wrong number of days', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-09', title: 'Day 2', blocks: [] }
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Expected 3 days, got 2')
  })

  it('should detect wrong dates', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-09', title: 'Day 2', blocks: [] },
        { date: '2026-05-11', title: 'Day 3', blocks: [] } // Wrong date
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('2026-05-11'))).toBe(true)
  })

  it('should detect missing dates', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { title: 'Day 2', blocks: [] }, // Missing date
        { date: '2026-05-10', title: 'Day 3', blocks: [] }
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('missing date'))).toBe(true)
  })

  it('should detect duplicate dates', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-08', title: 'Day 2', blocks: [] }, // Duplicate
        { date: '2026-05-10', title: 'Day 3', blocks: [] }
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Duplicate date'))).toBe(true)
  })

  it('should detect out-of-range dates', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-09', title: 'Day 2', blocks: [] },
        { date: '2026-05-15', title: 'Day 3', blocks: [] } // Out of range
      ]
    }
    const result = validateItineraryDates(itinerary, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('out-of-range'))).toBe(true)
  })
})

describe('normalizeItineraryDates', () => {
  const dateList = ['2026-05-08', '2026-05-09', '2026-05-10']

  it('should normalize itinerary with wrong dates', () => {
    const itinerary = {
      overview: { pace: 'balanced' },
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [{ title: 'Activity 1' }] },
        { date: '2026-05-11', title: 'Day 2', blocks: [{ title: 'Activity 2' }] }, // Wrong date
        { date: '2026-05-10', title: 'Day 3', blocks: [{ title: 'Activity 3' }] }
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    
    expect(normalized.days.length).toBe(3)
    expect(normalized.days[0].date).toBe('2026-05-08')
    expect(normalized.days[1].date).toBe('2026-05-09') // Fixed
    expect(normalized.days[2].date).toBe('2026-05-10')
    // Blocks should be preserved
    expect(normalized.days[1].blocks[0].title).toBe('Activity 2')
  })

  it('should normalize itinerary with missing days', () => {
    const itinerary = {
      overview: { pace: 'balanced' },
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-10', title: 'Day 3', blocks: [] } // Missing day 2
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    
    expect(normalized.days.length).toBe(3)
    expect(normalized.days[0].date).toBe('2026-05-08')
    expect(normalized.days[1].date).toBe('2026-05-09') // Created empty day
    expect(normalized.days[1].blocks).toEqual([])
    expect(normalized.days[2].date).toBe('2026-05-10')
  })

  it('should normalize itinerary with extra days', () => {
    const itinerary = {
      overview: { pace: 'balanced' },
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-09', title: 'Day 2', blocks: [] },
        { date: '2026-05-10', title: 'Day 3', blocks: [] },
        { date: '2026-05-11', title: 'Day 4', blocks: [] }, // Extra day
        { date: '2026-05-12', title: 'Day 5', blocks: [] }  // Extra day
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    
    expect(normalized.days.length).toBe(3) // Truncated
    expect(normalized.days[0].date).toBe('2026-05-08')
    expect(normalized.days[1].date).toBe('2026-05-09')
    expect(normalized.days[2].date).toBe('2026-05-10')
  })

  it('should normalize itinerary with missing dates', () => {
    const itinerary = {
      overview: { pace: 'balanced' },
      days: [
        { title: 'Day 1', blocks: [] }, // Missing date
        { date: '2026-05-09', title: 'Day 2', blocks: [] },
        { title: 'Day 3', blocks: [] } // Missing date
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    
    expect(normalized.days.length).toBe(3)
    expect(normalized.days[0].date).toBe('2026-05-08') // Fixed
    expect(normalized.days[1].date).toBe('2026-05-09')
    expect(normalized.days[2].date).toBe('2026-05-10') // Fixed
  })

  it('should preserve blocks when normalizing', () => {
    const itinerary = {
      overview: { pace: 'balanced' },
      days: [
        { 
          date: '2026-05-08', 
          title: 'Day 1', 
          blocks: [
            { timeRange: '09:00-11:00', title: 'Breakfast', tags: ['food'] }
          ]
        },
        { date: '2026-05-11', title: 'Day 2', blocks: [] }, // Wrong date
        { date: '2026-05-10', title: 'Day 3', blocks: [] }
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    
    expect(normalized.days[0].blocks.length).toBe(1)
    expect(normalized.days[0].blocks[0].title).toBe('Breakfast')
    expect(normalized.days[0].blocks[0].tags).toEqual(['food'])
  })

  it('should ensure normalized itinerary passes validation', () => {
    const itinerary = {
      days: [
        { date: '2026-05-08', title: 'Day 1', blocks: [] },
        { date: '2026-05-11', title: 'Day 2', blocks: [] }, // Wrong
        // Missing day 3
      ]
    }
    
    const normalized = normalizeItineraryDates(itinerary, dateList)
    const validation = validateItineraryDates(normalized, dateList)
    
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })
})
