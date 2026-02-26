import { describe, it, expect } from 'vitest'

/**
 * Unit test for ConfidenceMeter label logic.
 *
 * Since ConfidenceMeter is a JSX component, we test the pure logic
 * (ratio → label mapping) extracted inline.
 */

function getConfidenceLabel(current, target) {
  const ratio = Math.min(current / Math.max(target, 1), 1)
  if (ratio >= 1) return 'Ready when you are'
  if (ratio >= 0.8) return 'Almost ready'
  if (ratio >= 0.5) return 'Moving forward'
  return 'Gathering input'
}

describe('ConfidenceMeter label logic', () => {
  it('returns "Gathering input" at 0%', () => {
    expect(getConfidenceLabel(0, 5)).toBe('Gathering input')
  })

  it('returns "Gathering input" at 49%', () => {
    // 2 of 5 = 0.4 → below 0.5
    expect(getConfidenceLabel(2, 5)).toBe('Gathering input')
  })

  it('returns "Moving forward" at 50%', () => {
    // 5 of 10 = 0.5
    expect(getConfidenceLabel(5, 10)).toBe('Moving forward')
  })

  it('returns "Moving forward" at 79%', () => {
    // 79 of 100 = 0.79
    expect(getConfidenceLabel(79, 100)).toBe('Moving forward')
  })

  it('returns "Almost ready" at 80%', () => {
    // 4 of 5 = 0.8
    expect(getConfidenceLabel(4, 5)).toBe('Almost ready')
  })

  it('returns "Almost ready" at 99%', () => {
    // 99 of 100 = 0.99
    expect(getConfidenceLabel(99, 100)).toBe('Almost ready')
  })

  it('returns "Ready when you are" at 100%', () => {
    expect(getConfidenceLabel(5, 5)).toBe('Ready when you are')
  })

  it('caps at 100% when current > target', () => {
    expect(getConfidenceLabel(8, 5)).toBe('Ready when you are')
  })

  it('handles target of 0 gracefully', () => {
    // Math.max(0, 1) = 1, ratio = 0/1 = 0
    expect(getConfidenceLabel(0, 0)).toBe('Gathering input')
  })

  it('handles target of 1 with 1 support', () => {
    expect(getConfidenceLabel(1, 1)).toBe('Ready when you are')
  })
})
