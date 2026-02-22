/**
 * Check if a trip is completed (end date has passed).
 * Shared helper used by CommandCenterV3 and overlays.
 */
export function isTripCompleted(trip) {
  if (!trip) return false
  if (trip.status === 'completed' || trip.tripStatus === 'COMPLETED') return true
  const end = trip.lockedEndDate || trip.endDate
  if (!end) return false
  const endDate = new Date(end)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  endDate.setHours(23, 59, 59, 999)
  return endDate < today
}
