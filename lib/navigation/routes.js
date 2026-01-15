/**
 * Shared navigation route helpers
 * 
 * These functions provide canonical URLs for navigation throughout the app,
 * ensuring consistency and preventing string concatenation errors.
 */

/**
 * Get the dashboard URL with a circle selected
 * @param {string} circleId - The circle ID to select
 * @param {Object} options - Optional parameters
 * @param {string} options.returnTo - Optional returnTo URL to append as query param
 * @returns {string} Dashboard URL with circleId query param (and returnTo if provided)
 */
export function dashboardCircleHref(circleId, options = {}) {
  if (!circleId) return '/dashboard'
  const { returnTo } = options
  let url = `/?circleId=${encodeURIComponent(circleId)}`
  if (returnTo) {
    url += `&returnTo=${encodeURIComponent(returnTo)}`
  }
  return url
}

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
