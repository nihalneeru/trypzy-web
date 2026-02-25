import { describe, it, expect } from 'vitest'

/**
 * Unit test for ConfidenceMeter label logic.
 *
 * Since ConfidenceMeter is a JSX component, we test the pure logic
 * (ratio → label mapping) extracted inline.
 */

function getConfidenceLabel(current, target) {
  const ratio = Math.min(current / Math.max(target, 1), 1)
  if (ratio >= 1) return 'Ready to propose'
  if (ratio >= 0.8) return 'Almost there'
  if (ratio >= 0.5) return 'Getting close'
  return 'Building support'
}

describe('ConfidenceMeter label logic', () => {
  it('returns "Building support" at 0%', () => {
    expect(getConfidenceLabel(0, 5)).toBe('Building support')
  })

  it('returns "Building support" at 49%', () => {
    // 2 of 5 = 0.4 → below 0.5
    expect(getConfidenceLabel(2, 5)).toBe('Building support')
  })

  it('returns "Getting close" at 50%', () => {
    // 5 of 10 = 0.5
    expect(getConfidenceLabel(5, 10)).toBe('Getting close')
  })

  it('returns "Getting close" at 79%', () => {
    // 79 of 100 = 0.79
    expect(getConfidenceLabel(79, 100)).toBe('Getting close')
  })

  it('returns "Almost there" at 80%', () => {
    // 4 of 5 = 0.8
    expect(getConfidenceLabel(4, 5)).toBe('Almost there')
  })

  it('returns "Almost there" at 99%', () => {
    // 99 of 100 = 0.99
    expect(getConfidenceLabel(99, 100)).toBe('Almost there')
  })

  it('returns "Ready to propose" at 100%', () => {
    expect(getConfidenceLabel(5, 5)).toBe('Ready to propose')
  })

  it('caps at 100% when current > target', () => {
    expect(getConfidenceLabel(8, 5)).toBe('Ready to propose')
  })

  it('handles target of 0 gracefully', () => {
    // Math.max(0, 1) = 1, ratio = 0/1 = 0
    expect(getConfidenceLabel(0, 0)).toBe('Building support')
  })

  it('handles target of 1 with 1 support', () => {
    expect(getConfidenceLabel(1, 1)).toBe('Ready to propose')
  })
})
