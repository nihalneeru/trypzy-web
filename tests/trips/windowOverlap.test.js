import { describe, it, expect } from 'vitest'
import {
  computeOverlapScore,
  findSimilarWindows,
  getMostSimilarWindow,
  isNearDuplicate,
  DEFAULT_SIMILARITY_THRESHOLD
} from '@/lib/trips/windowOverlap.js'

// Helper to create window objects
const createWindow = (id, start, end) => ({
  id,
  startISO: start,
  endISO: end,
  normalizedStart: start,
  normalizedEnd: end
})

describe('computeOverlapScore', () => {
  describe('no overlap cases', () => {
    it('should return 0 for completely disjoint windows', () => {
      const windowA = createWindow('a', '2025-03-01', '2025-03-05')
      const windowB = createWindow('b', '2025-03-10', '2025-03-15')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(0)
    })

    it('should return 0 for adjacent windows (no overlap)', () => {
      const windowA = createWindow('a', '2025-03-01', '2025-03-05')
      const windowB = createWindow('b', '2025-03-06', '2025-03-10')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(0)
    })
  })

  describe('partial overlap cases', () => {
    it('should calculate overlap correctly for partial overlap', () => {
      // Window A: Mar 1-5 (5 days)
      // Window B: Mar 4-8 (5 days)
      // Overlap: Mar 4-5 (2 days)
      // Score: 2 / min(5,5) = 0.4
      const windowA = createWindow('a', '2025-03-01', '2025-03-05')
      const windowB = createWindow('b', '2025-03-04', '2025-03-08')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(0.4)
    })

    it('should handle different sized windows', () => {
      // Window A: Mar 1-10 (10 days)
      // Window B: Mar 5-7 (3 days)
      // Overlap: Mar 5-7 (3 days)
      // Score: 3 / min(10,3) = 1.0 (fully contained)
      const windowA = createWindow('a', '2025-03-01', '2025-03-10')
      const windowB = createWindow('b', '2025-03-05', '2025-03-07')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(1)
    })
  })

  describe('full overlap cases', () => {
    it('should return 1 for identical windows', () => {
      const windowA = createWindow('a', '2025-03-01', '2025-03-05')
      const windowB = createWindow('b', '2025-03-01', '2025-03-05')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(1)
    })

    it('should return 1 when smaller window is fully contained', () => {
      // Window A: Mar 1-10 (10 days)
      // Window B: Mar 3-5 (3 days) - fully inside A
      const windowA = createWindow('a', '2025-03-01', '2025-03-10')
      const windowB = createWindow('b', '2025-03-03', '2025-03-05')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should return 0 for missing date fields', () => {
      const windowA = { id: 'a' }
      const windowB = createWindow('b', '2025-03-01', '2025-03-05')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(0)
    })

    it('should handle single-day windows', () => {
      const windowA = createWindow('a', '2025-03-05', '2025-03-05')
      const windowB = createWindow('b', '2025-03-05', '2025-03-05')

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(1)
    })

    it('should support legacy field names (startDate/endDate)', () => {
      const windowA = { id: 'a', startDate: '2025-03-01', endDate: '2025-03-05' }
      const windowB = { id: 'b', startDate: '2025-03-01', endDate: '2025-03-05' }

      const score = computeOverlapScore(windowA, windowB)

      expect(score).toBe(1)
    })
  })
})

describe('findSimilarWindows', () => {
  const existingWindows = [
    createWindow('w1', '2025-03-01', '2025-03-05'),
    createWindow('w2', '2025-03-10', '2025-03-15'),
    createWindow('w3', '2025-03-03', '2025-03-07')
  ]

  it('should return empty array when no windows are similar', () => {
    const newWindow = createWindow('new', '2025-04-01', '2025-04-05')

    const result = findSimilarWindows(newWindow, existingWindows)

    expect(result).toHaveLength(0)
  })

  it('should find similar windows above threshold', () => {
    // New window overlaps significantly with w1 and w3
    const newWindow = createWindow('new', '2025-03-02', '2025-03-06')

    const result = findSimilarWindows(newWindow, existingWindows, 0.5)

    expect(result.length).toBeGreaterThan(0)
    expect(result.every((r) => r.score >= 0.5)).toBe(true)
  })

  it('should sort results by score descending', () => {
    const newWindow = createWindow('new', '2025-03-02', '2025-03-06')

    const result = findSimilarWindows(newWindow, existingWindows, 0.3)

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score)
    }
  })

  it('should return empty array for empty existing windows', () => {
    const newWindow = createWindow('new', '2025-03-01', '2025-03-05')

    const result = findSimilarWindows(newWindow, [])

    expect(result).toHaveLength(0)
  })

  it('should round scores to 2 decimal places', () => {
    const newWindow = createWindow('new', '2025-03-02', '2025-03-06')

    const result = findSimilarWindows(newWindow, existingWindows, 0.01)

    result.forEach((r) => {
      const decimalPlaces = (r.score.toString().split('.')[1] || '').length
      expect(decimalPlaces).toBeLessThanOrEqual(2)
    })
  })
})

describe('getMostSimilarWindow', () => {
  const existingWindows = [
    createWindow('w1', '2025-03-01', '2025-03-05'),
    createWindow('w2', '2025-03-10', '2025-03-15'),
    createWindow('w3', '2025-03-02', '2025-03-04') // Most similar to w1
  ]

  it('should return null when no similar windows', () => {
    const newWindow = createWindow('new', '2025-04-01', '2025-04-05')

    const result = getMostSimilarWindow(newWindow, existingWindows)

    expect(result).toBeNull()
  })

  it('should return the most similar window', () => {
    // New window is identical to w3 (Mar 2-4)
    // Both w1 and w3 have score 1.0 with new window, but w3 is exact match
    // Since they tie on score, the first one in sorted order wins
    const newWindow = createWindow('new', '2025-03-02', '2025-03-04')

    const result = getMostSimilarWindow(newWindow, existingWindows)

    expect(result).not.toBeNull()
    // Both w1 (Mar 1-5) and w3 (Mar 2-4) score 1.0 with new window (Mar 2-4)
    // w1: 3 overlap / min(5,3) = 1.0
    // w3: 3 overlap / min(3,3) = 1.0
    // Either could be returned (depends on sort stability)
    expect(['w1', 'w3']).toContain(result.windowId)
    expect(result.score).toBe(1)
  })

  it('should respect custom threshold', () => {
    const newWindow = createWindow('new', '2025-03-04', '2025-03-06')

    // With high threshold, may not find any
    const result = getMostSimilarWindow(newWindow, existingWindows, 0.95)

    // If it finds something, it must be above threshold
    if (result) {
      expect(result.score).toBeGreaterThanOrEqual(0.95)
    }
  })
})

describe('isNearDuplicate', () => {
  const existingWindows = [
    createWindow('w1', '2025-03-01', '2025-03-05'),
    createWindow('w2', '2025-03-10', '2025-03-15')
  ]

  it('should return true for near-duplicate windows', () => {
    const newWindow = createWindow('new', '2025-03-01', '2025-03-05')

    const result = isNearDuplicate(newWindow, existingWindows)

    expect(result).toBe(true)
  })

  it('should return false for unique windows', () => {
    const newWindow = createWindow('new', '2025-04-01', '2025-04-05')

    const result = isNearDuplicate(newWindow, existingWindows)

    expect(result).toBe(false)
  })
})

describe('DEFAULT_SIMILARITY_THRESHOLD', () => {
  it('should be 0.6', () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.6)
  })
})

describe('performance', () => {
  it('should handle O(n) complexity for overlap check', () => {
    // Create many windows
    const manyWindows = Array.from({ length: 1000 }, (_, i) =>
      createWindow(`w${i}`, `2025-03-${String((i % 28) + 1).padStart(2, '0')}`, `2025-03-${String((i % 28) + 3).padStart(2, '0')}`)
    )

    const newWindow = createWindow('new', '2025-03-15', '2025-03-18')

    const startTime = performance.now()
    findSimilarWindows(newWindow, manyWindows)
    const endTime = performance.now()

    // Should complete in reasonable time (< 100ms for 1000 windows)
    expect(endTime - startTime).toBeLessThan(100)
  })
})
