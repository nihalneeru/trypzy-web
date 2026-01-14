/**
 * Build canonical list of dates for a trip date range (inclusive)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Array<string>} Array of YYYY-MM-DD date strings, inclusive
 */
export function buildTripDateList(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required')
  }
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD')
  }
  
  if (start > end) {
    throw new Error('startDate must be <= endDate')
  }
  
  const dates = []
  const current = new Date(start)
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }
  
  return dates
}
