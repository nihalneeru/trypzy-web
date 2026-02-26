import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getTripCountdownBadge } from '../../lib/trips/getTripCountdownLabel'

describe('getTripCountdownBadge', () => {
  beforeEach(() => {
    // Fix "today" to 2026-03-01 noon
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for non-locked trips', () => {
    expect(getTripCountdownBadge({ status: 'proposed' })).toBeNull()
    expect(getTripCountdownBadge({ status: 'scheduling' })).toBeNull()
  })

  it('returns "Today" when trip starts today', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-03-01', lockedEndDate: '2026-03-05' }
    expect(getTripCountdownBadge(trip)).toBe('Today')
  })

  it('returns "Tmrw" when trip starts tomorrow', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-03-02', lockedEndDate: '2026-03-05' }
    expect(getTripCountdownBadge(trip)).toBe('Tmrw')
  })

  it('returns "20d" for 20 days away', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-03-21', lockedEndDate: '2026-03-25' }
    expect(getTripCountdownBadge(trip)).toBe('20d')
  })

  it('returns "99d" for 99 days away', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-06-08', lockedEndDate: '2026-06-12' }
    expect(getTripCountdownBadge(trip)).toBe('99d')
  })

  it('returns month+day for 100+ days away', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-06-09', lockedEndDate: '2026-06-15' }
    expect(getTripCountdownBadge(trip)).toBe('Jun 9')
  })

  it('returns null when start date is in the past', () => {
    const trip = { status: 'locked', lockedStartDate: '2026-02-20', lockedEndDate: '2026-02-25' }
    expect(getTripCountdownBadge(trip)).toBeNull()
  })

  it('falls back to startDate when no lockedStartDate', () => {
    const trip = { status: 'locked', startDate: '2026-03-05', lockedEndDate: '2026-03-10' }
    expect(getTripCountdownBadge(trip)).toBe('4d')
  })

  it('returns null when no date is available', () => {
    const trip = { status: 'locked', lockedEndDate: '2026-03-10' }
    expect(getTripCountdownBadge(trip)).toBeNull()
  })
})
