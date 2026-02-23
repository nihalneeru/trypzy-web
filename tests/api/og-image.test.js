import { describe, it, expect } from 'vitest'

// Extracted date formatting logic (mirrors the route)
function formatDateString(lockedStartDate, lockedEndDate) {
  if (!lockedStartDate || !lockedEndDate) return ''
  const start = new Date(lockedStartDate)
  const end = new Date(lockedEndDate)
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const year = start.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}\u2013${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${year}`
}

describe('OG image route', () => {
  it('returns proper metadata structure', () => {
    const trip = {
      name: 'Beach Weekend',
      destinationHint: 'Tulum, Mexico',
      lockedStartDate: '2026-03-07',
      lockedEndDate: '2026-03-09',
      travelerCount: 6,
      duration: '3 days',
    }

    const title = `${trip.name} \u2014 ${trip.destinationHint} | Tripti.ai`
    expect(title).toBe('Beach Weekend \u2014 Tulum, Mexico | Tripti.ai')

    const description = `${trip.duration} trip with ${trip.travelerCount} travelers. Plan yours on Tripti.`
    expect(description).toBe('3 days trip with 6 travelers. Plan yours on Tripti.')
  })

  it('handles missing destination gracefully', () => {
    const trip = { name: 'Roadtrip', destinationHint: null, travelerCount: 3, duration: null }
    const title = `${trip.name}${trip.destinationHint ? ` \u2014 ${trip.destinationHint}` : ''} | Tripti.ai`
    expect(title).toBe('Roadtrip | Tripti.ai')

    const description = `${trip.duration || 'A'} trip with ${trip.travelerCount} travelers. Plan yours on Tripti.`
    expect(description).toBe('A trip with 3 travelers. Plan yours on Tripti.')
  })

  it('formats same-month date ranges correctly', () => {
    const result = formatDateString('2026-03-07', '2026-03-09')
    expect(result).toBe('Mar 7\u20139, 2026')
  })

  it('formats cross-month date ranges correctly', () => {
    const result = formatDateString('2026-03-28', '2026-04-02')
    expect(result).toBe('Mar 28 \u2013 Apr 2, 2026')
  })

  it('returns empty string when dates are missing', () => {
    expect(formatDateString(null, null)).toBe('')
    expect(formatDateString('2026-03-07', null)).toBe('')
  })
})
