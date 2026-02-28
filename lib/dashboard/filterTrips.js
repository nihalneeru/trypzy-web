/**
 * Client-side trip filtering for the dashboard.
 *
 * Filters trips across all circles by keyword match on trip name
 * and circle name. Returns a new circles array with only matching trips.
 */

/**
 * @param {Array} circles - Dashboard circle data (each has .trips and .cancelledTrips)
 * @param {string} query - Search query (case-insensitive substring match)
 * @returns {{ circles: Array, totalMatches: number }}
 */
export function filterDashboardTrips(circles, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return { circles, totalMatches: -1 } // -1 = no filter active

  let totalMatches = 0

  const filtered = circles.map(circle => {
    const circleName = (circle.name || '').toLowerCase()
    const circleMatches = circleName.includes(q)

    // If the circle name matches the query, include all its trips
    const matchTrip = (trip) =>
      circleMatches || (trip.name || '').toLowerCase().includes(q)

    const trips = (circle.trips || []).filter(matchTrip)
    const cancelledTrips = (circle.cancelledTrips || []).filter(matchTrip)
    totalMatches += trips.length + cancelledTrips.length

    return { ...circle, trips, cancelledTrips }
  }).filter(c => c.trips.length > 0 || c.cancelledTrips.length > 0)

  return { circles: filtered, totalMatches }
}

/**
 * Count total trips across all circles (active + cancelled).
 * Used to decide whether to show the search bar.
 */
export function countAllTrips(circles) {
  if (!circles) return 0
  return circles.reduce(
    (sum, c) => sum + (c.trips?.length || 0) + (c.cancelledTrips?.length || 0),
    0
  )
}
