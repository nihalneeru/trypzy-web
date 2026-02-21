import { validateItineraryStructure } from '@/lib/itinerary/validateItineraryStructure.js'

const dateList = ['2026-05-08', '2026-05-09', '2026-05-10']

function makeValidItinerary() {
  return {
    overview: { pace: 'balanced', budget: 'mid', notes: '' },
    planningNotes: { assumptions: ['Good weather'], areaStrategy: ['Downtown day 1'] },
    days: [
      {
        date: '2026-05-08',
        title: 'Arrival Day',
        areaFocus: 'Downtown',
        groupFit: 'Easy start for arrivals.',
        blocks: [
          {
            timeRange: '14:00-16:00',
            title: 'Walk around',
            description: 'Explore the area',
            location: 'Pike Place Market, Seattle',
            tags: ['sights'],
            estCost: '$10-15 per person',
            transitNotes: '10 min walk',
            sourceIdeaIds: [],
            reservation: { needed: false, notes: '' }
          }
        ]
      },
      {
        date: '2026-05-09',
        title: 'Full Day',
        areaFocus: 'Waterfront',
        groupFit: 'Main exploring day.',
        blocks: [
          {
            timeRange: '09:00-12:00',
            title: 'Museum',
            description: 'Visit museum',
            location: 'Seattle Art Museum',
            tags: ['culture'],
            estCost: '$20 per person',
            transitNotes: '',
            sourceIdeaIds: [],
            reservation: { needed: true, notes: 'Book online' }
          }
        ]
      },
      {
        date: '2026-05-10',
        title: 'Departure',
        areaFocus: 'Near hotel',
        groupFit: 'Light final morning.',
        blocks: [
          {
            timeRange: '09:00-11:00',
            title: 'Brunch',
            description: 'Final meal',
            location: 'Local Cafe, Capitol Hill',
            tags: ['food'],
            estCost: 'Free',
            transitNotes: '5 min walk',
            sourceIdeaIds: [],
            reservation: { needed: false, notes: '' }
          }
        ]
      }
    ]
  }
}

describe('validateItineraryStructure', () => {
  it('returns valid for a well-formed itinerary', () => {
    const result = validateItineraryStructure(makeValidItinerary(), dateList)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.repaired).toBe(false)
  })

  it('auto-repairs missing overview', () => {
    const itin = makeValidItinerary()
    delete itin.overview
    const result = validateItineraryStructure(itin, dateList)
    expect(result.valid).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.itinerary.overview).toEqual({ pace: 'balanced', budget: 'mid', notes: '' })
  })

  it('auto-repairs missing planningNotes', () => {
    const itin = makeValidItinerary()
    delete itin.planningNotes
    const result = validateItineraryStructure(itin, dateList)
    expect(result.valid).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.itinerary.planningNotes).toEqual({ assumptions: [], areaStrategy: [] })
  })

  it('auto-repairs missing areaFocus and groupFit on days', () => {
    const itin = makeValidItinerary()
    delete itin.days[0].areaFocus
    delete itin.days[0].groupFit
    const result = validateItineraryStructure(itin, dateList)
    expect(result.valid).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.itinerary.days[0].areaFocus).toBe('')
    expect(result.itinerary.days[0].groupFit).toBe('')
  })

  it('auto-repairs missing reservation on blocks', () => {
    const itin = makeValidItinerary()
    delete itin.days[0].blocks[0].reservation
    const result = validateItineraryStructure(itin, dateList)
    expect(result.valid).toBe(true)
    expect(result.repaired).toBe(true)
    expect(result.itinerary.days[0].blocks[0].reservation).toEqual({ needed: false, notes: '' })
  })

  it('warns about empty location', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].location = ''
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('Empty location'))).toBe(true)
  })

  it('warns about generic location', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].location = 'a nice restaurant'
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('Generic location'))).toBe(true)
  })

  it('warns about malformed timeRange', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].timeRange = 'afternoon'
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('HH:MM-HH:MM'))).toBe(true)
  })

  it('warns about missing estCost', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].estCost = ''
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('Missing estCost'))).toBe(true)
  })

  it('warns about estCost without $ or Free', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].estCost = '15 euros'
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('should contain'))).toBe(true)
  })

  it('warns about first day early start', () => {
    const itin = makeValidItinerary()
    itin.days[0].blocks[0].timeRange = '08:00-10:00'
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('First day') && w.includes('afternoon'))).toBe(true)
  })

  it('warns about last day late end', () => {
    const itin = makeValidItinerary()
    itin.days[2].blocks[0].timeRange = '14:00-18:00'
    const result = validateItineraryStructure(itin, dateList)
    expect(result.warnings.some(w => w.includes('Last day') && w.includes('earlier end'))).toBe(true)
  })

  it('warns about too many blocks per day', () => {
    const itin = makeValidItinerary()
    // Add 10 blocks to day 1
    const block = { ...itin.days[1].blocks[0] }
    itin.days[1].blocks = Array(10).fill(null).map(() => ({ ...block }))
    const result = validateItineraryStructure(itin, dateList, { maxBlocksPerDay: 8 })
    expect(result.warnings.some(w => w.includes('blocks'))).toBe(true)
  })

  it('returns error for null itinerary', () => {
    const result = validateItineraryStructure(null, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns error for missing days array', () => {
    const result = validateItineraryStructure({ overview: {} }, dateList)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Missing days'))).toBe(true)
  })
})
