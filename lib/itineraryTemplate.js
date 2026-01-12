/**
 * Itinerary Template Adapter
 * 
 * Converts between canonical ItineraryTemplate format and legacy/post-lock formats.
 * All itinerary reuse flows go through this canonical format.
 */

/**
 * Convert legacy itinerary (itineraries + itinerary_items) to canonical template
 * @param {Object} itinerary - Legacy itinerary document
 * @param {Array} items - Array of itinerary_items
 * @returns {Object} ItineraryTemplate
 */
export function fromLegacyItinerary(itinerary, items) {
  // Group items by day
  const dayMap = new Map()
  items.forEach(item => {
    if (!dayMap.has(item.day)) {
      dayMap.set(item.day, [])
    }
    dayMap.get(item.day).push(item)
  })

  // Sort days
  const sortedDays = Array.from(dayMap.keys()).sort()

  // Build days array
  const days = sortedDays.map(day => {
    const dayItems = dayMap.get(day).sort((a, b) => (a.order || 0) - (b.order || 0))
    
    return {
      date: day,
      dayIndex: null, // Legacy uses dates
      title: `Day ${sortedDays.indexOf(day) + 1}`,
      blocks: dayItems.map(item => ({
        timeType: 'block',
        timeBlock: item.timeBlock || 'morning',
        timeRange: null,
        title: item.title || '',
        description: item.notes || null,
        locationText: item.locationText || null,
        tags: [],
        estCost: null,
        transitNotes: null,
        source: {
          fromSystem: 'legacy',
          fromId: item.id
        }
      }))
    }
  })

  return {
    id: null, // Will be set when saved
    createdBy: itinerary.createdBy || null,
    createdAt: itinerary.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    title: itinerary.title || 'Imported itinerary',
    description: null,

    destination: null,
    pace: null,
    budget: null,

    dateMode: 'anchored',
    originalStartDate: itinerary.startDay || sortedDays[0] || null,

    days,

    discoverable: itinerary.discoverable || false,
    visibility: 'private',

    importedFrom: {
      type: 'itinerary',
      id: itinerary.id
    }
  }
}

/**
 * Convert post-lock itinerary version to canonical template
 * @param {Object} version - itinerary_versions document
 * @returns {Object} ItineraryTemplate
 */
export function fromPostLockVersion(version) {
  const content = version.content || {}
  const overview = content.overview || {}
  const daysData = content.days || []

  const days = daysData.map((dayData, index) => ({
    date: dayData.date || null,
    dayIndex: index,
    title: dayData.title || `Day ${index + 1}`,
    blocks: (dayData.blocks || []).map(block => ({
      timeType: 'range',
      timeBlock: null,
      timeRange: block.timeRange || null,
      title: block.title || '',
      description: block.description || null,
      locationText: block.location || null,
      tags: block.tags || [],
      estCost: block.estCost || null,
      transitNotes: block.transitNotes || null,
      source: {
        fromSystem: 'post_lock',
        fromId: version.id
      }
    }))
  }))

  return {
    id: null, // Will be set when saved
    createdBy: version.createdBy || null,
    createdAt: version.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    title: `Itinerary v${version.version}`,
    description: overview.notes || null,

    destination: null,
    pace: overview.pace || null,
    budget: overview.budget || null,

    dateMode: 'anchored',
    originalStartDate: daysData[0]?.date || null,

    days,

    discoverable: false,
    visibility: 'private',

    importedFrom: {
      type: 'itinerary_version',
      id: version.id
    }
  }
}

/**
 * Convert canonical template to legacy itinerary (itineraries + itinerary_items)
 * @param {Object} template - ItineraryTemplate
 * @param {string} newTripId - Target trip ID
 * @param {string} newStartDate - New start date (YYYY-MM-DD), required if template is relative
 * @returns {Object} { itinerary, items }
 */
export function toLegacyTripItinerary(template, newTripId, newStartDate = null) {
  // Handle date anchoring
  if (template.dateMode === 'relative' && !newStartDate) {
    throw new Error('newStartDate is required for relative date templates')
  }

  let adjustedDays = template.days
  if (newStartDate && template.originalStartDate) {
    // Calculate shift
    const originalStart = new Date(template.originalStartDate + 'T12:00:00')
    const newStart = new Date(newStartDate + 'T12:00:00')
    const deltaMs = newStart - originalStart
    const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24))

    // Shift dates
    adjustedDays = template.days.map(day => {
      if (day.date) {
        const dayDate = new Date(day.date + 'T12:00:00')
        dayDate.setDate(dayDate.getDate() + deltaDays)
        return {
          ...day,
          date: dayDate.toISOString().split('T')[0]
        }
      }
      return day
    })
  } else if (newStartDate && template.dateMode === 'relative') {
    // Relative mode: assign dates starting from newStartDate
    adjustedDays = template.days.map((day, index) => {
      const dayDate = new Date(newStartDate + 'T12:00:00')
      dayDate.setDate(dayDate.getDate() + (day.dayIndex || index))
      return {
        ...day,
        date: dayDate.toISOString().split('T')[0]
      }
    })
  }

  // Determine end date
  const endDate = adjustedDays.length > 0
    ? adjustedDays[adjustedDays.length - 1].date
    : newStartDate

  // Create itinerary document
  const itinerary = {
    id: null, // Will be set by caller
    tripId: newTripId,
    version: 1,
    title: template.title || 'Imported Itinerary',
    status: 'selected',
    startDay: adjustedDays[0]?.date || newStartDate,
    endDay: endDate,
    createdBy: template.createdBy || null,
    createdAt: new Date().toISOString(),
    discoverable: false
  }

  // Convert blocks to items
  const items = []
  adjustedDays.forEach(day => {
    day.blocks.forEach((block, blockIndex) => {
      // Map timeType to timeBlock
      let timeBlock = 'morning'
      if (block.timeType === 'block') {
        timeBlock = block.timeBlock || 'morning'
      } else if (block.timeType === 'range') {
        // Heuristic: map timeRange to timeBlock
        if (block.timeRange) {
          const timeStr = block.timeRange.split('-')[0] || ''
          const hour = parseInt(timeStr.split(':')[0]) || 12
          if (hour >= 5 && hour < 12) {
            timeBlock = 'morning'
          } else if (hour >= 12 && hour < 17) {
            timeBlock = 'afternoon'
          } else {
            timeBlock = 'evening'
          }
        }
      }

      items.push({
        id: null, // Will be set by caller
        itineraryId: itinerary.id, // Will be set after itinerary is created
        day: day.date,
        timeBlock,
        title: block.title || '',
        notes: block.description || null,
        locationText: block.locationText || null,
        order: blockIndex
      })
    })
  })

  return { itinerary, items }
}

/**
 * Convert canonical template to post-lock itinerary version
 * @param {Object} template - ItineraryTemplate
 * @param {string} newTripId - Target trip ID
 * @param {string} newStartDate - New start date (YYYY-MM-DD), required if template is relative
 * @returns {Object} itinerary_versions document structure
 */
export function toPostLockTripItinerary(template, newTripId, newStartDate = null) {
  // Handle date anchoring (same logic as toLegacyTripItinerary)
  if (template.dateMode === 'relative' && !newStartDate) {
    throw new Error('newStartDate is required for relative date templates')
  }

  let adjustedDays = template.days
  if (newStartDate && template.originalStartDate) {
    const originalStart = new Date(template.originalStartDate + 'T12:00:00')
    const newStart = new Date(newStartDate + 'T12:00:00')
    const deltaMs = newStart - originalStart
    const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24))

    adjustedDays = template.days.map(day => {
      if (day.date) {
        const dayDate = new Date(day.date + 'T12:00:00')
        dayDate.setDate(dayDate.getDate() + deltaDays)
        return {
          ...day,
          date: dayDate.toISOString().split('T')[0]
        }
      }
      return day
    })
  } else if (newStartDate && template.dateMode === 'relative') {
    adjustedDays = template.days.map((day, index) => {
      const dayDate = new Date(newStartDate + 'T12:00:00')
      dayDate.setDate(dayDate.getDate() + (day.dayIndex || index))
      return {
        ...day,
        date: dayDate.toISOString().split('T')[0]
      }
    })
  }

  // Convert to post-lock format
  const content = {
    overview: {
      pace: template.pace || 'balanced',
      budget: template.budget || 'mid',
      notes: template.description || ''
    },
    days: adjustedDays.map(day => ({
      date: day.date || newStartDate,
      title: day.title,
      blocks: day.blocks.map(block => {
        // Map timeType to timeRange
        let timeRange = block.timeRange
        if (!timeRange && block.timeType === 'block') {
          // Default ranges for timeBlocks
          const timeBlockRanges = {
            morning: '09:00-11:00',
            afternoon: '13:00-15:00',
            evening: '18:00-20:00'
          }
          timeRange = timeBlockRanges[block.timeBlock] || '09:00-11:00'
        }

        return {
          timeRange: timeRange || '09:00-11:00',
          title: block.title || '',
          description: block.description || '',
          location: block.locationText || '',
          tags: block.tags || [],
          estCost: block.estCost || null,
          transitNotes: block.transitNotes || null,
          sourceIdeaIds: []
        }
      })
    }))
  }

  return {
    id: null, // Will be set by caller
    tripId: newTripId,
    version: 1,
    createdBy: template.createdBy || null,
    createdAt: new Date().toISOString(),
    sourceIdeaIds: [],
    content,
    changeLog: `Imported from template: ${template.title}`
  }
}
