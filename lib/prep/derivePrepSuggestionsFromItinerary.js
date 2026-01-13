/**
 * Derive prep suggestions from accepted itinerary
 * Rule-based: suggests transport legs when location changes across consecutive days
 * 
 * @param {Object} params
 * @param {Object} params.itinerary - Itinerary object with days array
 * @param {string} [params.fallbackStartDate] - Fallback if days missing dates
 * @returns {Array} Array of suggested transport items
 */
export function derivePrepSuggestionsFromItinerary({
  itinerary,
  fallbackStartDate = null
}) {
  if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days) || itinerary.days.length < 2) {
    return []
  }

  const suggestions = []
  
  // Process consecutive day pairs to detect location changes
  for (let i = 0; i < itinerary.days.length - 1; i++) {
    const currentDay = itinerary.days[i]
    const nextDay = itinerary.days[i + 1]
    
    // Extract locations from day blocks
    const getDayLocation = (day) => {
      if (day.blocks && Array.isArray(day.blocks) && day.blocks.length > 0) {
        const locations = day.blocks
          .map(block => block.location?.trim())
          .filter(loc => loc && loc.length > 0)
        
        if (locations.length > 0) {
          // Use most frequent location
          const locationCounts = {}
          locations.forEach(loc => {
            const normalized = loc.toLowerCase().trim()
            locationCounts[normalized] = (locationCounts[normalized] || 0) + 1
          })
          const mostCommon = Object.entries(locationCounts)
            .sort((a, b) => b[1] - a[1])[0]?.[0]
          return mostCommon || locations[0]
        }
      }
      return null
    }
    
    const currentLocation = getDayLocation(currentDay)
    const nextLocation = getDayLocation(nextDay)
    
    // If locations differ, suggest transport
    if (currentLocation && nextLocation && 
        currentLocation.toLowerCase().trim() !== nextLocation.toLowerCase().trim()) {
      
      // Get dates
      let departDate = currentDay.date
      if (!departDate && fallbackStartDate) {
        const start = new Date(fallbackStartDate)
        start.setDate(start.getDate() + i)
        departDate = start.toISOString().split('T')[0]
      }
      
      // Departure is end of current day, arrival is start of next day
      // For simplicity, use next day's date as departure date
      let arriveDate = nextDay.date
      if (!arriveDate && fallbackStartDate) {
        const start = new Date(fallbackStartDate)
        start.setDate(start.getDate() + i + 1)
        arriveDate = start.toISOString().split('T')[0]
      }
      
      // Generate dedupeKey
      const dedupeKey = `transport:${currentLocation.toLowerCase().trim()}:${nextLocation.toLowerCase().trim()}:${departDate || 'nodate'}`
      
      suggestions.push({
        dedupeKey,
        mode: 'other', // Default to 'other', user can change
        fromLocation: currentLocation,
        toLocation: nextLocation,
        departAt: departDate ? `${departDate}T12:00:00` : null, // Default to noon
        arriveAt: arriveDate ? `${arriveDate}T12:00:00` : null,
        status: 'planned',
        title: `Transport: ${currentLocation} → ${nextLocation}`
      })
    }
  }
  
  return suggestions
}
