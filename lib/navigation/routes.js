/**
 * Shared navigation route helpers
 * 
 * These functions provide canonical URLs for navigation throughout the app,
 * ensuring consistency and preventing string concatenation errors.
 */

/**
 * Get the canonical circle page URL
 * @param {string} circleId - The circle ID
 * @returns {string} Circle page URL
 */
export function circlePageHref(circleId) {
  if (!circleId) return '/dashboard'
  return `/circles/${encodeURIComponent(circleId)}`
}

/**
 * Get the canonical trip detail page URL
 * @param {string} tripId - The trip ID
 * @returns {string} Trip detail page URL
 */
export function tripHref(tripId) {
  if (!tripId) return '/dashboard'
  return `/trips/${encodeURIComponent(tripId)}`
}
