/**
 * Build Airbnb search URL from stay requirements
 * @param {Object} params
 * @param {string} params.locationName - Location name
 * @param {string} params.startDate - Check-in date (YYYY-MM-DD)
 * @param {string} params.endDate - Check-out date (YYYY-MM-DD)
 * @returns {string} Airbnb search URL
 */
export function buildAirbnbSearchUrl({ locationName, startDate, endDate }) {
  if (!locationName) {
    return 'https://www.airbnb.com'
  }

  const baseUrl = 'https://www.airbnb.com/s'
  
  // Build query params
  const params = new URLSearchParams()
  
  // Location
  params.append('query', locationName)
  
  // Dates
  if (startDate) {
    params.append('checkin', startDate)
  }
  if (endDate) {
    params.append('checkout', endDate)
  }
  
  return `${baseUrl}/${encodeURIComponent(locationName)}?${params.toString()}`
}
