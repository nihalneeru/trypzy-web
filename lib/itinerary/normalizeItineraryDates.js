/**
 * Normalize itinerary dates to match exact trip date range
 * Ensures itinerary.days matches dateList exactly in order and count
 * @param {Object} itinerary - Itinerary object with days array
 * @param {Array<string>} dateList - Canonical list of dates (YYYY-MM-DD)
 * @returns {Object} Normalized itinerary with corrected dates
 */
export function normalizeItineraryDates(itinerary, dateList) {
  if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days)) {
    throw new Error('Invalid itinerary: missing days array')
  }
  
  if (!dateList || !Array.isArray(dateList) || dateList.length === 0) {
    throw new Error('Invalid dateList: must be non-empty array')
  }
  
  const normalized = {
    ...itinerary,
    days: []
  }
  
  // Ensure overview exists
  if (!normalized.overview) {
    normalized.overview = itinerary.overview || { pace: 'balanced', budget: 'mid', notes: '' }
  }
  
  // Build normalized days array
  for (let i = 0; i < dateList.length; i++) {
    const expectedDate = dateList[i]
    
    // Try to find a day that matches this date or use the day at this index
    let day = null
    
    // First, try to find exact date match
    const exactMatch = itinerary.days.find(d => d.date === expectedDate)
    if (exactMatch) {
      day = { ...exactMatch, date: expectedDate }
    } else if (i < itinerary.days.length) {
      // Use day at this index, but fix the date
      day = { ...itinerary.days[i], date: expectedDate }
    } else {
      // Create empty day shell for missing dates
      day = {
        date: expectedDate,
        title: '',
        blocks: []
      }
    }
    
    // Ensure blocks array exists
    if (!day.blocks || !Array.isArray(day.blocks)) {
      day.blocks = []
    }
    
    // Ensure block fields are properly formatted
    day.blocks = day.blocks.map(block => ({
      ...block,
      tags: Array.isArray(block.tags) ? block.tags : [],
      sourceIdeaIds: Array.isArray(block.sourceIdeaIds) ? block.sourceIdeaIds : [],
      transitNotes: block.transitNotes || '',
      estCost: block.estCost || ''
    }))
    
    normalized.days.push(day)
  }
  
  return normalized
}

/**
 * Validate itinerary dates match dateList exactly
 * @param {Object} itinerary - Itinerary object
 * @param {Array<string>} dateList - Canonical list of dates
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateItineraryDates(itinerary, dateList) {
  const errors = []
  
  if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days)) {
    errors.push('Itinerary missing days array')
    return { valid: false, errors }
  }
  
  if (itinerary.days.length !== dateList.length) {
    errors.push(`Expected ${dateList.length} days, got ${itinerary.days.length}`)
  }
  
  // Check each day matches expected date
  for (let i = 0; i < Math.min(itinerary.days.length, dateList.length); i++) {
    const day = itinerary.days[i]
    const expectedDate = dateList[i]
    
    if (!day.date) {
      errors.push(`Day ${i + 1} missing date field`)
    } else if (day.date !== expectedDate) {
      errors.push(`Day ${i + 1} has date ${day.date}, expected ${expectedDate}`)
    }
  }
  
  // Check for duplicate dates
  const seenDates = new Set()
  itinerary.days.forEach((day, idx) => {
    if (day.date) {
      if (seenDates.has(day.date)) {
        errors.push(`Duplicate date ${day.date} at index ${idx}`)
      }
      seenDates.add(day.date)
    }
  })
  
  // Check for out-of-range dates
  const dateSet = new Set(dateList)
  itinerary.days.forEach((day, idx) => {
    if (day.date && !dateSet.has(day.date)) {
      errors.push(`Day ${idx + 1} has out-of-range date ${day.date}`)
    }
  })
  
  return {
    valid: errors.length === 0,
    errors
  }
}
