import { describe, it, expect } from 'vitest'
import { filterDashboardTrips, countAllTrips } from '@/lib/dashboard/filterTrips'

const circles = [
  {
    id: 'c1',
    name: 'College Friends',
    trips: [
      { id: 't1', name: 'Bali Beach Trip' },
      { id: 't2', name: 'Tokyo Adventure' },
    ],
    cancelledTrips: [
      { id: 't3', name: 'Canceled Paris Trip' },
    ],
  },
  {
    id: 'c2',
    name: 'Work Crew',
    trips: [
      { id: 't4', name: 'Tahoe Ski Weekend' },
    ],
    cancelledTrips: [],
  },
]

describe('filterDashboardTrips', () => {
  it('returns all circles unchanged when query is empty', () => {
    const result = filterDashboardTrips(circles, '')
    expect(result.circles).toBe(circles)
    expect(result.totalMatches).toBe(-1)
  })

  it('returns all circles unchanged when query is whitespace', () => {
    const result = filterDashboardTrips(circles, '   ')
    expect(result.circles).toBe(circles)
    expect(result.totalMatches).toBe(-1)
  })

  it('filters by trip name (case-insensitive)', () => {
    const result = filterDashboardTrips(circles, 'bali')
    expect(result.totalMatches).toBe(1)
    expect(result.circles).toHaveLength(1)
    expect(result.circles[0].trips[0].name).toBe('Bali Beach Trip')
  })

  it('matches circle name and includes all its trips', () => {
    const result = filterDashboardTrips(circles, 'college')
    expect(result.totalMatches).toBe(3) // 2 active + 1 cancelled
    expect(result.circles).toHaveLength(1)
    expect(result.circles[0].trips).toHaveLength(2)
    expect(result.circles[0].cancelledTrips).toHaveLength(1)
  })

  it('matches across multiple circles', () => {
    const result = filterDashboardTrips(circles, 't') // matches Tokyo, Tahoe
    expect(result.totalMatches).toBeGreaterThanOrEqual(2)
  })

  it('returns empty when nothing matches', () => {
    const result = filterDashboardTrips(circles, 'zzzzz')
    expect(result.totalMatches).toBe(0)
    expect(result.circles).toHaveLength(0)
  })

  it('includes cancelled trips in matches', () => {
    const result = filterDashboardTrips(circles, 'paris')
    expect(result.totalMatches).toBe(1)
    expect(result.circles[0].cancelledTrips[0].name).toBe('Canceled Paris Trip')
  })
})

describe('countAllTrips', () => {
  it('counts active and cancelled trips across circles', () => {
    expect(countAllTrips(circles)).toBe(4)
  })

  it('returns 0 for null/empty', () => {
    expect(countAllTrips(null)).toBe(0)
    expect(countAllTrips([])).toBe(0)
  })
})
