/**
 * Unit tests for lib/navigation/routes.js
 *
 * These helpers are used by 15+ files for generating canonical URLs.
 */

import { circlePageHref, tripHref } from '@/lib/navigation/routes.js'

describe('circlePageHref', () => {
  it('should return /circles/{id} for a normal id', () => {
    expect(circlePageHref('circle-123')).toBe('/circles/circle-123')
  })

  it('should encode special characters in circleId', () => {
    expect(circlePageHref('circle/with spaces')).toBe('/circles/circle%2Fwith%20spaces')
  })

  it('should return /dashboard when circleId is null', () => {
    expect(circlePageHref(null)).toBe('/dashboard')
  })

  it('should return /dashboard when circleId is undefined', () => {
    expect(circlePageHref(undefined)).toBe('/dashboard')
  })

  it('should return /dashboard when circleId is empty string', () => {
    expect(circlePageHref('')).toBe('/dashboard')
  })
})

describe('tripHref', () => {
  it('should return /trips/{id} for a normal id', () => {
    expect(tripHref('trip-456')).toBe('/trips/trip-456')
  })

  it('should encode special characters in tripId', () => {
    expect(tripHref('trip/with spaces')).toBe('/trips/trip%2Fwith%20spaces')
  })

  it('should return /dashboard when tripId is null', () => {
    expect(tripHref(null)).toBe('/dashboard')
  })

  it('should return /dashboard when tripId is undefined', () => {
    expect(tripHref(undefined)).toBe('/dashboard')
  })

  it('should return /dashboard when tripId is empty string', () => {
    expect(tripHref('')).toBe('/dashboard')
  })
})
