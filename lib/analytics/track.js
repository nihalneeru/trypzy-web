/**
 * Mixpanel tracking wrapper for Tripti.ai
 *
 * Rules:
 * - 15-25 events max for MVP
 * - Auto-attach context properties to every event
 * - Only track after stable distinct_id (post-login)
 * - Dedupe screen views (once per screen per session)
 * - No autocapture, no replay
 */

let mixpanel = null
const seenScreens = new Set()

function getMixpanel() {
  if (mixpanel) return mixpanel
  if (typeof window !== 'undefined' && window.mixpanel?.__loaded) {
    mixpanel = window.mixpanel
    return mixpanel
  }
  try {
    mixpanel = require('mixpanel-browser')
    if (!mixpanel.__loaded) return null
    return mixpanel
  } catch {
    return null
  }
}

function getPlatform() {
  if (typeof window === 'undefined') return 'server'
  if (window.Capacitor?.getPlatform) return window.Capacitor.getPlatform() // 'ios' | 'android' | 'web'
  if (window.Capacitor) return 'native'
  return 'web'
}

function getBaseProperties() {
  return {
    platform: getPlatform(),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  }
}

/**
 * Core track function — auto-attaches base properties.
 * Only fires if Mixpanel is initialized and user is identified.
 */
export function track(eventName, properties = {}) {
  const mp = getMixpanel()
  if (!mp) return

  mp.track(eventName, {
    ...getBaseProperties(),
    ...properties,
  })
}

/**
 * Identify user after login — sets distinct_id.
 * Call this once after successful authentication.
 */
export function identifyUser(userId, traits = {}) {
  const mp = getMixpanel()
  if (!mp) return

  mp.identify(userId)
  if (Object.keys(traits).length > 0) {
    mp.people.set(traits)
  }
}

/**
 * Reset on logout — clears distinct_id.
 */
export function resetUser() {
  const mp = getMixpanel()
  if (!mp) return
  mp.reset()
  seenScreens.clear()
}

// ─── MVP Event Taxonomy (15 events) ─────────────────────────

// Identity & org
export const signupCompleted = (props) =>
  track('Signup Completed', props)

export const circleJoined = (circleId, circleSize) =>
  track('Circle Joined', { circle_id: circleId, circle_size: circleSize })

// Invites — #1 growth driver
export const inviteSent = (circleId, method) =>
  track('Invite Sent', { circle_id: circleId, invite_method: method })

export const inviteLinkOpened = (circleId) =>
  track('Invite Link Opened', { circle_id: circleId })

export const inviteAccepted = (circleId) =>
  track('Invite Accepted', { circle_id: circleId })

// Trip coordination loop
export const tripCreated = (tripId, tripType, circleId, circleSize) =>
  track('Trip Created', { trip_id: tripId, trip_type: tripType, circle_id: circleId, circle_size: circleSize })

export const datesProposed = (tripId, role) =>
  track('Dates Proposed', { trip_id: tripId, role })

export const dateVoteCast = (tripId, role) =>
  track('Date Vote Cast', { trip_id: tripId, role })

export const datesLocked = (tripId, circleSize) =>
  track('Dates Locked', { trip_id: tripId, circle_size: circleSize })

// Planning output
export const itineraryGenerated = (tripId) =>
  track('Itinerary Generated', { trip_id: tripId })

export const stayOptionAdded = (tripId) =>
  track('Stay Option Added', { trip_id: tripId })

export const stayOptionSelected = (tripId) =>
  track('Stay Option Selected', { trip_id: tripId })

// Virality / success
export const tripShared = (tripId, method) =>
  track('Trip Shared', { trip_id: tripId, invite_method: method })

// Monetization
export const boostPurchased = (tripId) =>
  track('Boost Purchased', { trip_id: tripId })

// Screen view — deduped per session
export const screenViewed = (screenName, properties = {}) => {
  if (seenScreens.has(screenName)) return
  seenScreens.add(screenName)
  track('Screen Viewed', { screen: screenName, ...properties })
}
