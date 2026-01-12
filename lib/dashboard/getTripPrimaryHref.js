/**
 * Get the primary href and label for a trip based on pending actions
 * @param {Object} trip
 * @param {Array} pendingActions - Already derived pending actions for this trip
 * @returns {{href: string, label: string}}
 */
export function getTripPrimaryHref(trip, pendingActions = []) {
  // If pending actions exist, use the highest priority one (they're already sorted)
  if (pendingActions.length > 0) {
    return {
      href: pendingActions[0].href,
      label: pendingActions[0].label
    }
  }
  
  // Default to trip detail page (Trip Chat would be at /trips/[tripId]/chat if it exists)
  return {
    href: `/trips/${trip.id}`,
    label: 'View Trip'
  }
}
