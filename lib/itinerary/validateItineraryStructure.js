/**
 * Deterministic validator + auto-repair for generated itinerary structure.
 * Runs after normalizeItineraryDates, before storing to DB.
 * No LLM calls — purely structural checks and safe defaults.
 *
 * @param {Object} itinerary - Parsed itinerary object (post-normalization)
 * @param {Array<string>} dateList - Canonical date list (YYYY-MM-DD)
 * @param {Object} [options] - Optional config
 * @param {number} [options.maxBlocksPerDay=8] - Warn if a day exceeds this many blocks
 * @returns {{ valid: boolean, errors: string[], warnings: string[], repaired: boolean, itinerary: Object }}
 */
export function validateItineraryStructure(itinerary, dateList, options = {}) {
  const { maxBlocksPerDay = 8 } = options
  const errors = []
  const warnings = []
  let repaired = false

  if (!itinerary || typeof itinerary !== 'object') {
    return { valid: false, errors: ['Itinerary is null or not an object'], warnings: [], repaired: false, itinerary }
  }

  // --- overview ---
  if (!itinerary.overview) {
    itinerary.overview = { pace: 'balanced', budget: 'mid', notes: '' }
    repaired = true
    warnings.push('Missing overview — added default')
  }

  // --- planningNotes ---
  if (!itinerary.planningNotes || typeof itinerary.planningNotes !== 'object') {
    itinerary.planningNotes = { assumptions: [], areaStrategy: [] }
    repaired = true
  } else {
    if (!Array.isArray(itinerary.planningNotes.assumptions)) {
      itinerary.planningNotes.assumptions = []
      repaired = true
    }
    if (!Array.isArray(itinerary.planningNotes.areaStrategy)) {
      itinerary.planningNotes.areaStrategy = []
      repaired = true
    }
  }

  // --- days ---
  if (!itinerary.days || !Array.isArray(itinerary.days)) {
    errors.push('Missing days array')
    return { valid: false, errors, warnings, repaired, itinerary }
  }

  const timeRangeRegex = /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/
  const genericLocationRegex = /^(a |the |some |local )/i

  for (let i = 0; i < itinerary.days.length; i++) {
    const day = itinerary.days[i]
    const dayLabel = `Day ${i + 1} (${day.date || 'unknown'})`

    // areaFocus default
    if (typeof day.areaFocus !== 'string') {
      day.areaFocus = ''
      repaired = true
    }

    // groupFit default
    if (typeof day.groupFit !== 'string') {
      day.groupFit = ''
      repaired = true
    }

    // blocks
    if (!Array.isArray(day.blocks)) {
      day.blocks = []
      repaired = true
      warnings.push(`${dayLabel}: Missing blocks array — set to empty`)
      continue
    }

    // Block count warning
    if (day.blocks.length > maxBlocksPerDay) {
      warnings.push(`${dayLabel}: ${day.blocks.length} blocks (max recommended: ${maxBlocksPerDay})`)
    }

    // First day timing check
    if (i === 0 && day.blocks.length > 0) {
      const firstBlock = day.blocks[0]
      if (firstBlock.timeRange) {
        const startHour = parseStartHour(firstBlock.timeRange)
        if (startHour !== null && startHour < 12) {
          warnings.push(`${dayLabel}: First day starts at ${firstBlock.timeRange} — consider afternoon start (arrival day)`)
        }
      }
    }

    // Last day timing check
    if (i === itinerary.days.length - 1 && day.blocks.length > 0) {
      const lastBlock = day.blocks[day.blocks.length - 1]
      if (lastBlock.timeRange) {
        const endHour = parseEndHour(lastBlock.timeRange)
        if (endHour !== null && endHour > 15) {
          warnings.push(`${dayLabel}: Last day ends at ${lastBlock.timeRange} — consider earlier end (departure day)`)
        }
      }
    }

    for (let j = 0; j < day.blocks.length; j++) {
      const block = day.blocks[j]
      const blockLabel = `${dayLabel} block ${j + 1}`

      // reservation default
      if (!block.reservation || typeof block.reservation !== 'object') {
        block.reservation = { needed: false, notes: '' }
        repaired = true
      } else {
        if (typeof block.reservation.needed !== 'boolean') {
          block.reservation.needed = false
          repaired = true
        }
        if (typeof block.reservation.notes !== 'string') {
          block.reservation.notes = ''
          repaired = true
        }
      }

      // location check
      if (!block.location || typeof block.location !== 'string' || block.location.trim() === '') {
        warnings.push(`${blockLabel}: Empty location`)
      } else if (genericLocationRegex.test(block.location.trim())) {
        warnings.push(`${blockLabel}: Generic location "${block.location}" — should be specific`)
      }

      // timeRange format check
      if (block.timeRange && !timeRangeRegex.test(block.timeRange.trim())) {
        warnings.push(`${blockLabel}: timeRange "${block.timeRange}" — expected HH:MM-HH:MM format`)
      }

      // estCost check
      if (!block.estCost || typeof block.estCost !== 'string' || block.estCost.trim() === '') {
        warnings.push(`${blockLabel}: Missing estCost`)
      } else {
        const cost = block.estCost.trim().toLowerCase()
        if (!cost.includes('$') && cost !== 'free') {
          warnings.push(`${blockLabel}: estCost "${block.estCost}" — should contain "$" or be "Free"`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repaired,
    itinerary
  }
}

/**
 * Parse start hour from a timeRange string like "09:00-11:00"
 * @returns {number|null}
 */
function parseStartHour(timeRange) {
  const match = timeRange.match(/^(\d{1,2}):\d{2}/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Parse end hour from a timeRange string like "09:00-11:00"
 * @returns {number|null}
 */
function parseEndHour(timeRange) {
  const match = timeRange.match(/-\s*(\d{1,2}):\d{2}$/)
  return match ? parseInt(match[1], 10) : null
}
