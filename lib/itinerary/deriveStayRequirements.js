import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'

/**
 * Derive stay requirements from itinerary
 * Rule-based algorithm that groups consecutive days by location
 * 
 * @param {Object} params
 * @param {string} params.tripId - Trip ID
 * @param {Object} params.itinerary - Itinerary object with days array
 * @param {string} [params.fallbackStartDate] - Fallback if days missing dates
 * @param {string} [params.fallbackEndDate] - Fallback if days missing dates
 * @param {string} [params.fallbackDestination] - Fallback if days missing locations
 * @returns {Array} Array of stay segments
 */
export function deriveStayRequirements({
  tripId,
  itinerary,
  fallbackStartDate = null,
  fallbackEndDate = null,
  fallbackDestination = null
}) {
  if (!itinerary || !itinerary.days || !Array.isArray(itinerary.days) || itinerary.days.length === 0) {
    return []
  }

  // Normalize days: extract date and locationName
  const normalizedDays = itinerary.days.map((day, index) => {
    let date = day.date
    let locationName = null

    // Extract date
    if (!date && fallbackStartDate) {
      // Calculate date from fallback start + index
      const start = new Date(fallbackStartDate)
      start.setDate(start.getDate() + index)
      date = start.toISOString().split('T')[0]
    }

    // Extract location from day blocks
    if (day.blocks && Array.isArray(day.blocks) && day.blocks.length > 0) {
      // Find most common location or first non-empty location
      const locations = day.blocks
        .map(block => block.location?.trim())
        .filter(loc => loc && loc.length > 0)
      
      if (locations.length > 0) {
        // Use most frequent location, or first if tie
        const locationCounts = {}
        locations.forEach(loc => {
          const normalized = loc.toLowerCase().trim()
          locationCounts[normalized] = (locationCounts[normalized] || 0) + 1
        })
        const mostCommon = Object.entries(locationCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0]
        locationName = mostCommon || locations[0]
      }
    }

    // Fallback location
    if (!locationName || locationName.trim() === '') {
      locationName = fallbackDestination || 'TBD'
    }

    return {
      date: date || null,
      locationName: locationName.trim(),
      dayIndex: index
    }
  })

  // Sort by date (or dayIndex if no dates)
  normalizedDays.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.localeCompare(b.date)
    }
    return a.dayIndex - b.dayIndex
  })

  // Group consecutive days with same location
  const segments = []
  let currentSegment = null

  normalizedDays.forEach((day, index) => {
    const normalizedLocation = day.locationName.toLowerCase().trim()
    
    if (!currentSegment || currentSegment.locationName.toLowerCase().trim() !== normalizedLocation) {
      // Start new segment
      if (currentSegment) {
        segments.push(currentSegment)
      }
      currentSegment = {
        locationName: day.locationName,
        startDate: day.date,
        startDayIndex: day.dayIndex,
        endDate: day.date,
        endDayIndex: day.dayIndex,
        dayIndices: [day.dayIndex]
      }
    } else {
      // Extend current segment
      currentSegment.endDate = day.date || currentSegment.endDate
      currentSegment.endDayIndex = day.dayIndex
      currentSegment.dayIndices.push(day.dayIndex)
    }
  })

  if (currentSegment) {
    segments.push(currentSegment)
  }

  // Calculate nights and finalize segments
  const staySegments = segments.map(segment => {
    let startDate = segment.startDate
    let endDate = segment.endDate
    let nights = segment.dayIndices.length

    // If we have dates, calculate checkout date (day after last day)
    if (startDate && endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      const checkoutDate = end.toISOString().split('T')[0]
      
      // Calculate nights from dates
      const start = new Date(startDate)
      const checkout = new Date(checkoutDate)
      const diffTime = checkout - start
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      nights = Math.max(1, diffDays - 1) // At least 1 night if spanning multiple days
    } else if (fallbackStartDate && fallbackEndDate) {
      // Use fallback dates if day dates missing
      startDate = fallbackStartDate
      const end = new Date(fallbackEndDate)
      end.setDate(end.getDate() + 1)
      endDate = end.toISOString().split('T')[0]
      
      const start = new Date(startDate)
      const checkout = new Date(endDate)
      const diffTime = checkout - start
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      nights = Math.max(1, diffDays - 1)
    } else {
      // No dates available - use day count as approximation
      nights = Math.max(1, segment.dayIndices.length - 1)
      if (!startDate && fallbackStartDate) {
        startDate = fallbackStartDate
      }
      if (!endDate && fallbackEndDate) {
        endDate = fallbackEndDate
      }
    }

    // Generate stable segmentKey
    const segmentKey = `${tripId}:${segment.locationName.toLowerCase().trim()}:${startDate || 'nodate'}:${endDate || 'nodate'}`

    return {
      segmentKey,
      locationName: segment.locationName,
      startDate: startDate || null,
      endDate: endDate || null,
      nights: Math.max(1, nights)
    }
  })

  return staySegments
}

/**
 * Compute source itinerary version hash for idempotency
 * @param {Object} itinerary - Itinerary object
 * @returns {string} Hash string
 */
export function computeItineraryVersionHash(itinerary) {
  if (!itinerary || !itinerary.days) {
    return 'empty'
  }

  // Create hash from dates + locations
  const hashInput = itinerary.days
    .map(day => {
      const date = day.date || ''
      const location = day.blocks?.[0]?.location || ''
      return `${date}:${location}`
    })
    .join('|')

  return createHash('md5').update(hashInput).digest('hex').substring(0, 16)
}

/**
 * Sync stay requirements for a trip
 * Idempotent: updates existing or creates new, marks removed as inactive
 * 
 * @param {Object} params
 * @param {string} params.tripId - Trip ID
 * @param {Object} params.itinerary - Itinerary object
 * @param {Object} params.db - MongoDB database instance
 * @param {string} [params.fallbackStartDate] - Fallback start date
 * @param {string} [params.fallbackEndDate] - Fallback end date
 * @param {string} [params.fallbackDestination] - Fallback destination
 * @returns {Promise<{created: number, updated: number, unchanged: number, inactive: number}>}
 */
export async function syncStayRequirements({
  tripId,
  itinerary,
  db,
  fallbackStartDate = null,
  fallbackEndDate = null,
  fallbackDestination = null
}) {
  // Derive new segments
  const newSegments = deriveStayRequirements({
    tripId,
    itinerary,
    fallbackStartDate,
    fallbackEndDate,
    fallbackDestination
  })

  // Compute version hash
  const sourceItineraryVersion = computeItineraryVersionHash(itinerary)

  // Fetch existing stays
  const existingStays = await db.collection('stay_requirements')
    .find({ tripId })
    .toArray()

  const existingByKey = new Map(existingStays.map(s => [s.segmentKey, s]))

  let created = 0
  let updated = 0
  let unchanged = 0
  let inactive = 0

  const now = new Date().toISOString()

  // Upsert new segments
  for (const segment of newSegments) {
    const existing = existingByKey.get(segment.segmentKey)

    if (existing) {
      // Check if needs update (version changed or dates/location changed)
      const needsUpdate = 
        existing.sourceItineraryVersion !== sourceItineraryVersion ||
        existing.locationName !== segment.locationName ||
        existing.startDate !== segment.startDate ||
        existing.endDate !== segment.endDate ||
        existing.nights !== segment.nights ||
        existing.status === 'inactive'

      if (needsUpdate) {
        await db.collection('stay_requirements').updateOne(
          { id: existing.id },
          {
            $set: {
              locationName: segment.locationName,
              startDate: segment.startDate,
              endDate: segment.endDate,
              nights: segment.nights,
              sourceItineraryVersion,
              status: existing.status === 'inactive' ? 'pending' : existing.status,
              updatedAt: now
            }
          }
        )
        updated++
      } else {
        unchanged++
      }
    } else {
      // Create new
      const stayRequirement = {
        id: uuidv4(),
        tripId,
        segmentKey: segment.segmentKey,
        locationName: segment.locationName,
        startDate: segment.startDate,
        endDate: segment.endDate,
        nights: segment.nights,
        derivedFrom: 'itinerary',
        sourceItineraryVersion,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      }

      await db.collection('stay_requirements').insertOne(stayRequirement)
      created++
    }
  }

  // Mark segments not in new list as inactive (only if no accommodations attached)
  for (const existing of existingStays) {
    if (!newSegments.find(s => s.segmentKey === existing.segmentKey)) {
      // Check if has accommodations
      const accommodationCount = await db.collection('accommodation_options')
        .countDocuments({ stayRequirementId: existing.id })

      if (accommodationCount === 0) {
        // Safe to mark inactive or delete
        await db.collection('stay_requirements').updateOne(
          { id: existing.id },
          { $set: { status: 'inactive', updatedAt: now } }
        )
        inactive++
      } else {
        // Has accommodations - mark as outdated but keep
        await db.collection('stay_requirements').updateOne(
          { id: existing.id },
          { $set: { status: 'outdated', updatedAt: now } }
        )
        inactive++
      }
    }
  }

  return { created, updated, unchanged, inactive }
}
