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
  
  // Parse dates as local dates to avoid timezone issues
  // YYYY-MM-DD format is parsed as UTC by default, which can cause off-by-one errors
  const parseLocalDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD')
  }
  
  if (start > end) {
    throw new Error('startDate must be <= endDate')
  }
  
  const dates = []
  const current = new Date(start)
  
  // Format date as YYYY-MM-DD in local timezone
  const formatDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  while (current <= end) {
    dates.push(formatDate(current))
    current.setDate(current.getDate() + 1)
  }
  
  return dates
}
