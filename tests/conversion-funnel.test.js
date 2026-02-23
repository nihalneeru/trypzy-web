import { describe, it, expect } from 'vitest'

describe('Conversion funnel', () => {
  it('remix URL format is correct', () => {
    const shareId = 'abc-123-def'
    const url = `/signup?remix=${shareId}&ref=share`
    expect(url).toBe('/signup?remix=abc-123-def&ref=share')
  })

  it('callback URL preserves remix params', () => {
    const params = new URLSearchParams()
    params.set('remix', 'abc-123')
    params.set('ref', 'share')
    const callbackUrl = '/signup?' + params.toString()
    expect(callbackUrl).toContain('remix=abc-123')
    expect(callbackUrl).toContain('ref=share')
  })
})
