/**
 * Get the back destination for a trip based on navigation source context
 * @param {string|null} from - Navigation source: 'circle' or 'dashboard' or null
 * @param {string|null} circleId - Circle ID if from='circle'
 * @param {Object|null} trip - Trip object (fallback for circleId)
 * @returns {string} The destination URL
 */
export function getTripBackDestination(from, circleId, trip = null) {
  // If from=circle and circleId exists, go back to circle page
  if (from === 'circle' && circleId) {
    return `/circles/${circleId}`
  }
  
  // If we have a circleId from trip but no explicit 'from', use circle as fallback
  if (!from && (circleId || trip?.circleId)) {
    return `/circles/${circleId || trip.circleId}`
  }
  
  // Default to dashboard
  return '/dashboard'
}
