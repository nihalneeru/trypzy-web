import { describe, it, expect } from 'vitest'
import {
  computeDayCoverage,
  findBestOverlapRange,
  computeRangeCoverage,
} from '@/lib/nudges/metrics'

// Helper to create window objects
const createWindow = (id, proposedBy, start, end) => ({
  id,
  proposedBy,
  startDate: start,
  endDate: end,
})

describe('computeDayCoverage', () => {
  it('should return empty map for no windows', () => {
    const coverage = computeDayCoverage([])
    expect(coverage.size).toBe(0)
  })

  it('should compute coverage for a single window', () => {
    const windows = [createWindow('w1', 'user1', '2025-03-01', '2025-03-03')]

    const coverage = computeDayCoverage(windows)

    expect(coverage.size).toBe(3)
    expect(coverage.get('2025-03-01')?.has('user1')).toBe(true)
    expect(coverage.get('2025-03-02')?.has('user1')).toBe(true)
    expect(coverage.get('2025-03-03')?.has('user1')).toBe(true)
  })

  it('should compute coverage for overlapping windows', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-03'),
      createWindow('w2', 'user2', '2025-03-02', '2025-03-04'),
    ]

    const coverage = computeDayCoverage(windows)

    // March 1: only user1
    expect(coverage.get('2025-03-01')?.size).toBe(1)
    expect(coverage.get('2025-03-01')?.has('user1')).toBe(true)

    // March 2-3: both users
    expect(coverage.get('2025-03-02')?.size).toBe(2)
    expect(coverage.get('2025-03-03')?.size).toBe(2)

    // March 4: only user2
    expect(coverage.get('2025-03-04')?.size).toBe(1)
    expect(coverage.get('2025-03-04')?.has('user2')).toBe(true)
  })

  it('should skip unstructured windows', () => {
    const windows = [
      {
        ...createWindow('w1', 'user1', '2025-03-01', '2025-03-03'),
        precision: 'unstructured',
      },
    ]

    const coverage = computeDayCoverage(windows)

    expect(coverage.size).toBe(0)
  })

  it('should handle same user with multiple windows', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-02'),
      createWindow('w2', 'user1', '2025-03-05', '2025-03-06'),
    ]

    const coverage = computeDayCoverage(windows)

    // User should only be counted once per day
    expect(coverage.get('2025-03-01')?.size).toBe(1)
    expect(coverage.get('2025-03-05')?.size).toBe(1)
  })
})

describe('findBestOverlapRange', () => {
  it('should return null for no windows', () => {
    const result = findBestOverlapRange([])
    expect(result).toBeNull()
  })

  it('should find perfect overlap for identical windows', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-05', '2025-03-07'),
      createWindow('w2', 'user2', '2025-03-05', '2025-03-07'),
      createWindow('w3', 'user3', '2025-03-05', '2025-03-07'),
    ]

    const result = findBestOverlapRange(windows)

    expect(result).not.toBeNull()
    expect(result.coverageCount).toBe(3)
    expect(result.start).toBe('2025-03-05')
    expect(result.end).toBe('2025-03-07')
  })

  it('should find best overlap with partial coverage', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-05'),
      createWindow('w2', 'user2', '2025-03-03', '2025-03-07'),
      createWindow('w3', 'user3', '2025-03-04', '2025-03-08'),
    ]

    const result = findBestOverlapRange(windows)

    expect(result).not.toBeNull()
    // Mar 4-5 should have all 3 users
    expect(result.coverageCount).toBe(3)
    expect(result.start).toBe('2025-03-04')
    expect(result.end).toBe('2025-03-05')
  })

  it('should prefer higher coverage over longer duration', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-10'),
      createWindow('w2', 'user2', '2025-03-05', '2025-03-07'),
    ]

    const result = findBestOverlapRange(windows)

    expect(result).not.toBeNull()
    // Should pick the 3-day range with 2 people, not a longer range with 1
    expect(result.coverageCount).toBe(2)
    expect(result.start).toBe('2025-03-05')
    expect(result.end).toBe('2025-03-07')
  })

  it('should respect minDays constraint', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-05', '2025-03-05'),
      createWindow('w2', 'user2', '2025-03-05', '2025-03-05'),
    ]

    // Default minDays is 2, so single-day overlap shouldn't be returned
    const result = findBestOverlapRange(windows, 2)

    // Single day doesn't meet minDays=2
    expect(result).toBeNull()
  })

  it('should handle non-contiguous dates', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-02'),
      createWindow('w2', 'user1', '2025-03-10', '2025-03-11'),
    ]

    const result = findBestOverlapRange(windows)

    expect(result).not.toBeNull()
    // Should return one of the contiguous ranges
    expect(result.coverageCount).toBe(1)
  })
})

describe('computeRangeCoverage', () => {
  it('should return 0 for range with no coverage', () => {
    const windows = [createWindow('w1', 'user1', '2025-03-01', '2025-03-03')]

    const result = computeRangeCoverage(windows, '2025-03-10', '2025-03-12')

    expect(result.count).toBe(0)
    expect(result.userIds).toHaveLength(0)
  })

  it('should count users available for entire range', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-05'),
      createWindow('w2', 'user2', '2025-03-02', '2025-03-04'),
    ]

    const result = computeRangeCoverage(windows, '2025-03-02', '2025-03-04')

    expect(result.count).toBe(2)
    expect(result.userIds).toContain('user1')
    expect(result.userIds).toContain('user2')
  })

  it('should not count users unavailable for any day in range', () => {
    const windows = [
      createWindow('w1', 'user1', '2025-03-01', '2025-03-05'),
      createWindow('w2', 'user2', '2025-03-01', '2025-03-03'), // Doesn't cover Mar 4-5
    ]

    const result = computeRangeCoverage(windows, '2025-03-02', '2025-03-05')

    expect(result.count).toBe(1)
    expect(result.userIds).toContain('user1')
    expect(result.userIds).not.toContain('user2')
  })
})
