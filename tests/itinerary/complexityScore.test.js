import { computeComplexityScore } from '@/lib/server/llm.js'

describe('computeComplexityScore', () => {
  it('returns low score for simple trip', () => {
    const result = computeComplexityScore({
      numberOfDays: 2,
      ideaCount: 3,
      constraintCount: 0
    })
    expect(result.score).toBeLessThan(60)
    expect(result.model).toContain('mini') // Default model
  })

  it('returns higher score for complex trip', () => {
    const result = computeComplexityScore({
      numberOfDays: 8,
      ideaCount: 10,
      constraintCount: 5,
      hasAccommodation: true,
      hasChatBrief: true
    })
    expect(result.score).toBeGreaterThan(50)
    expect(typeof result.factors).toBe('object')
    expect(result.factors.days).toBeGreaterThan(0)
    expect(result.factors.ideas).toBeGreaterThan(0)
  })

  it('uses default model when ITINERARY_MODEL_UPGRADE is off', () => {
    // env var is not set by default in test
    const result = computeComplexityScore({
      numberOfDays: 10,
      ideaCount: 10,
      constraintCount: 5,
      hasAccommodation: true,
      hasChatBrief: true
    })
    // Even with high score, should not upgrade without flag
    expect(result.model).not.toBe('gpt-4o')
  })

  it('returns all factor categories', () => {
    const result = computeComplexityScore({
      numberOfDays: 5,
      ideaCount: 5,
      constraintCount: 2,
      hasAccommodation: true,
      hasChatBrief: true
    })
    expect(result.factors).toHaveProperty('days')
    expect(result.factors).toHaveProperty('ideas')
    expect(result.factors).toHaveProperty('constraints')
    expect(result.factors).toHaveProperty('accommodation')
    expect(result.factors).toHaveProperty('chatBrief')
  })

  it('caps individual factor scores', () => {
    const result = computeComplexityScore({
      numberOfDays: 30,
      ideaCount: 20,
      constraintCount: 10
    })
    expect(result.factors.days).toBeLessThanOrEqual(30)
    expect(result.factors.ideas).toBeLessThanOrEqual(20)
    expect(result.factors.constraints).toBeLessThanOrEqual(20)
  })
})
