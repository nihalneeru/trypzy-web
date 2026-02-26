/**
 * Get compact countdown badge text for a trip
 * Shows "Today", "Tmrw", "20d", or "Mar 15" format
 *
 * @param {Object} trip - Trip object with lockedStartDate or startDate
 * @returns {string|null} Compact badge text, or null if not applicable
 */
export function getTripCountdownBadge(trip) {
  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)
  if (!datesLocked) return null

  const startDateStr = trip.lockedStartDate || trip.startDate
  if (!startDateStr) return null

  const startDate = new Date(startDateStr + 'T12:00:00')
  const today = new Date()
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  if (startDay < todayDay) return null

  const diffMs = startDay - todayDay
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tmrw'
  if (diffDays <= 99) return `${diffDays}d`
  // For 100+ days, show month and day
  return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Get countdown label for a trip
 * Shows "Today", "Tomorrow", or "X days to [tripName]" format
 *
 * @param {Object} trip - Trip object with lockedStartDate or startDate
 * @param {string} [tripName] - Optional trip name for "X days to [name]" format
 * @returns {string|null} Countdown label, or null if countdown should not be shown
 */
export function getTripCountdownLabel(trip, tripName = null) {
  // Only show countdown when dates are locked (trip status is 'locked' or has lockedStartDate)
  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)
  if (!datesLocked) {
    return null
  }
  
  // Use lockedStartDate if available, otherwise startDate
  const startDateStr = trip.lockedStartDate || trip.startDate
  if (!startDateStr) {
    return null
  }
  
  // Parse start date (YYYY-MM-DD format)
  const startDate = new Date(startDateStr + 'T12:00:00') // Use noon to avoid timezone edge cases
  const today = new Date()
  
  // Reset time to midnight for date-only comparison
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  
  // If start date is in the past, hide countdown (MVP behavior)
  if (startDay < todayDay) {
    return null
  }
  
  // Calculate difference in days
  const diffMs = startDay - todayDay
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Tomorrow'
  } else {
    // Format: "X days to [tripName]" or "X days" if no trip name
    const tripDisplayName = tripName || trip.name || 'trip'
    return `${diffDays} days to ${tripDisplayName}`
  }
}
