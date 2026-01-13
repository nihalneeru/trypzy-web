/**
 * Get the primary href and label for a trip based on pending actions
 * @param {Object} trip
 * @param {Array} pendingActions - Already derived pending actions for this trip
 * @param {string} [circleId] - Optional circle ID for returnTo parameter
 * @returns {{href: string, label: string}}
 */
export function getTripPrimaryHref(trip, pendingActions = [], circleId = null) {
  // Build returnTo parameter for breadcrumb navigation
  const returnParams = new URLSearchParams()
  returnParams.set('returnTo', '/dashboard')
  if (circleId) {
    returnParams.set('circleId', circleId)
  }
  const returnQuery = returnParams.toString()
  
  // If pending actions exist, use the highest priority one (they're already sorted)
  if (pendingActions.length > 0) {
    const baseHref = pendingActions[0].href
    // Add returnTo if not already present
    const separator = baseHref.includes('?') ? '&' : '?'
    return {
      href: `${baseHref}${separator}${returnQuery}`,
      label: pendingActions[0].label
    }
  }
  
  // Default to trip detail page with returnTo parameter
  return {
    href: `/trips/${trip.id}?${returnQuery}`,
    label: 'View Trip'
  }
}
