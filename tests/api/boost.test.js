import { describe, it, expect } from 'vitest'
import { isFeatureGated, getGatedFeatureList, GATED_FEATURE_DESCRIPTIONS } from '../../lib/trips/isFeatureGated.js'

describe('isFeatureGated', () => {
  it('should return false when trip is boosted', () => {
    const trip = { boostStatus: 'boosted' }
    expect(isFeatureGated(trip, 'settle_up')).toBe(false)
    expect(isFeatureGated(trip, 'decision_deadline')).toBe(false)
    expect(isFeatureGated(trip, 'brief_export')).toBe(false)
  })

  it('should return true for gated features on free trips', () => {
    const trip = { boostStatus: 'free' }
    expect(isFeatureGated(trip, 'settle_up')).toBe(true)
    expect(isFeatureGated(trip, 'decision_deadline')).toBe(true)
    expect(isFeatureGated(trip, 'decision_auto_close')).toBe(true)
    expect(isFeatureGated(trip, 'decision_nudge_voters')).toBe(true)
    expect(isFeatureGated(trip, 'brief_export')).toBe(true)
    expect(isFeatureGated(trip, 'brief_show_address')).toBe(true)
    expect(isFeatureGated(trip, 'settle_reminder')).toBe(true)
    expect(isFeatureGated(trip, 'settle_mark')).toBe(true)
  })

  it('should return true for gated features when boostStatus is absent (default free)', () => {
    const trip = {}
    expect(isFeatureGated(trip, 'settle_up')).toBe(true)
    expect(isFeatureGated(trip, 'decision_deadline')).toBe(true)
  })

  it('should return false for non-gated features', () => {
    const trip = { boostStatus: 'free' }
    expect(isFeatureGated(trip, 'chat')).toBe(false)
    expect(isFeatureGated(trip, 'scheduling')).toBe(false)
    expect(isFeatureGated(trip, 'itinerary')).toBe(false)
    expect(isFeatureGated(trip, 'nonexistent_feature')).toBe(false)
  })

  it('should return false when trip is null/undefined', () => {
    expect(isFeatureGated(null, 'settle_up')).toBe(false)
    expect(isFeatureGated(undefined, 'settle_up')).toBe(false)
  })
})

describe('getGatedFeatureList', () => {
  it('should return an array of gated feature keys', () => {
    const features = getGatedFeatureList()
    expect(Array.isArray(features)).toBe(true)
    expect(features.length).toBe(8)
    expect(features).toContain('settle_up')
    expect(features).toContain('decision_deadline')
    expect(features).toContain('brief_export')
  })
})

describe('GATED_FEATURE_DESCRIPTIONS', () => {
  it('should have a description for every gated feature', () => {
    const features = getGatedFeatureList()
    for (const feature of features) {
      expect(GATED_FEATURE_DESCRIPTIONS[feature]).toBeDefined()
      expect(typeof GATED_FEATURE_DESCRIPTIONS[feature]).toBe('string')
      expect(GATED_FEATURE_DESCRIPTIONS[feature].length).toBeGreaterThan(0)
    }
  })
})
