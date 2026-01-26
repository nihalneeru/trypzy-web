/**
 * Window Normalization Module
 *
 * Converts free-form date text into structured date ranges.
 * All parsing is deterministic - no LLM calls.
 *
 * @module lib/trips/normalizeWindow
 */

// Configuration
export const WINDOW_CONFIG = {
  MAX_WINDOW_DAYS: 14,
  MAX_WINDOWS_PER_USER: 2
}

// Month name mapping
const MONTH_NAMES = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
}

/**
 * Parse a month name to month index (0-11)
 */
function parseMonth(str) {
  const normalized = str.toLowerCase().trim()
  return MONTH_NAMES[normalized] ?? null
}

/**
 * Get the last day of a month
 */
function getLastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Get the first Saturday of a month
 */
function getFirstSaturdayOfMonth(year, month) {
  const firstDay = new Date(year, month, 1)
  const dayOfWeek = firstDay.getDay()
  // Saturday is day 6
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7
  return daysUntilSaturday === 0 ? 1 : 1 + daysUntilSaturday
}

/**
 * Format a date as ISO string (YYYY-MM-DD)
 */
function toISO(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Calculate days between two ISO date strings
 */
function daysBetween(startISO, endISO) {
  const start = new Date(startISO + 'T12:00:00')
  const end = new Date(endISO + 'T12:00:00')
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Determine the target year for a date
 * Uses trip context if available, otherwise current year
 */
function getTargetYear(month, context = {}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // If trip has a target year hint, use it
  if (context.tripYear) {
    return context.tripYear
  }

  // If trip has start/end bounds, infer year from them
  if (context.startBound) {
    const boundYear = parseInt(context.startBound.substring(0, 4), 10)
    if (!isNaN(boundYear)) {
      return boundYear
    }
  }

  // Default logic: if month is in the past, assume next year
  if (month < currentMonth) {
    return currentYear + 1
  }

  return currentYear
}

/**
 * Check if input contains multi-range indicators
 */
function containsMultiRange(text) {
  const multiRangePatterns = [
    /\bor\b/i,
    /\beither\b/i,
    /\banytime\b/i,
    /\bflexible\b/i,
    /\bwhenever\b/i,
    /,\s*(and|&|also)/i,
    /\d+\s*[-–]\s*\d+\s*(or|,)\s*\d+/i // "1-3 or 5-7"
  ]

  return multiRangePatterns.some(pattern => pattern.test(text))
}

/**
 * Try to parse explicit date formats
 * Handles: "Feb 7-9", "February 7 - 9", "2026-02-07 to 2026-02-09", "Feb 7 to Feb 9"
 */
function parseExplicitDates(text, context) {
  const normalized = text.trim()

  // Pattern 1: ISO format "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD - YYYY-MM-DD"
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})\s*(?:to|–|-|through)\s*(\d{4})-(\d{2})-(\d{2})$/i
  const isoMatch = normalized.match(isoPattern)
  if (isoMatch) {
    const [, y1, m1, d1, y2, m2, d2] = isoMatch
    return {
      startISO: `${y1}-${m1}-${d1}`,
      endISO: `${y2}-${m2}-${d2}`,
      precision: 'exact'
    }
  }

  // Pattern 2: "Month Day-Day" (e.g., "Feb 7-9", "February 7 - 9")
  const sameMonthPattern = /^([a-z]+)\s+(\d{1,2})\s*(?:–|-|to|through)\s*(\d{1,2})(?:\s*,?\s*(\d{4}))?$/i
  const sameMonthMatch = normalized.match(sameMonthPattern)
  if (sameMonthMatch) {
    const [, monthStr, day1Str, day2Str, yearStr] = sameMonthMatch
    const month = parseMonth(monthStr)
    if (month === null) return null

    const day1 = parseInt(day1Str, 10)
    const day2 = parseInt(day2Str, 10)
    const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)

    // Validate days
    const lastDay = getLastDayOfMonth(year, month)
    if (day1 < 1 || day1 > lastDay || day2 < 1 || day2 > lastDay) return null
    if (day1 > day2) return null

    return {
      startISO: toISO(year, month, day1),
      endISO: toISO(year, month, day2),
      precision: 'exact'
    }
  }

  // Pattern 3: "Month Day to Month Day" (e.g., "Feb 7 to Feb 9", "Feb 28 to Mar 2")
  const crossMonthPattern = /^([a-z]+)\s+(\d{1,2})\s*(?:–|-|to|through)\s*([a-z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/i
  const crossMonthMatch = normalized.match(crossMonthPattern)
  if (crossMonthMatch) {
    const [, month1Str, day1Str, month2Str, day2Str, yearStr] = crossMonthMatch
    const month1 = parseMonth(month1Str)
    const month2 = parseMonth(month2Str)
    if (month1 === null || month2 === null) return null

    const day1 = parseInt(day1Str, 10)
    const day2 = parseInt(day2Str, 10)

    let year1 = yearStr ? parseInt(yearStr, 10) : getTargetYear(month1, context)
    let year2 = year1

    // Handle year rollover (Dec to Jan)
    if (month2 < month1) {
      year2 = year1 + 1
    }

    // Validate days
    const lastDay1 = getLastDayOfMonth(year1, month1)
    const lastDay2 = getLastDayOfMonth(year2, month2)
    if (day1 < 1 || day1 > lastDay1 || day2 < 1 || day2 > lastDay2) return null

    return {
      startISO: toISO(year1, month1, day1),
      endISO: toISO(year2, month2, day2),
      precision: 'exact'
    }
  }

  // Pattern 4: Single date "Feb 7" or "February 7, 2026"
  const singleDatePattern = /^([a-z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/i
  const singleDateMatch = normalized.match(singleDatePattern)
  if (singleDateMatch) {
    const [, monthStr, dayStr, yearStr] = singleDateMatch
    const month = parseMonth(monthStr)
    if (month === null) return null

    const day = parseInt(dayStr, 10)
    const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)

    const lastDay = getLastDayOfMonth(year, month)
    if (day < 1 || day > lastDay) return null

    return {
      startISO: toISO(year, month, day),
      endISO: toISO(year, month, day),
      precision: 'exact'
    }
  }

  return null
}

/**
 * Parse relative month patterns
 * Handles: "early Feb", "mid March", "late April"
 */
function parseRelativeMonth(text, context) {
  const normalized = text.trim().toLowerCase()

  // Pattern: "early/mid/late Month"
  const relativePattern = /^(early|mid|late)\s+([a-z]+)(?:\s*,?\s*(\d{4}))?$/i
  const match = normalized.match(relativePattern)
  if (!match) return null

  const [, position, monthStr, yearStr] = match
  const month = parseMonth(monthStr)
  if (month === null) return null

  const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)
  const lastDay = getLastDayOfMonth(year, month)

  let startDay, endDay
  switch (position.toLowerCase()) {
    case 'early':
      startDay = 1
      endDay = 7
      break
    case 'mid':
      startDay = 10
      endDay = 20
      break
    case 'late':
      startDay = 21
      endDay = lastDay
      break
    default:
      return null
  }

  return {
    startISO: toISO(year, month, startDay),
    endISO: toISO(year, month, endDay),
    precision: 'approx'
  }
}

/**
 * Parse weekend patterns
 * Handles: "first weekend of Feb", "1st weekend of March",
 *          "last weekend of March", "second weekend of April"
 */
function parseWeekendPattern(text, context) {
  const normalized = text.trim().toLowerCase()

  // Pattern: "first/1st/last/second/2nd weekend of Month"
  const weekendPattern = /^(?:the\s+)?(first|1st|last|second|2nd)\s+weekend\s+(?:of\s+)?([a-z]+)(?:\s*,?\s*(\d{4}))?$/i
  const match = normalized.match(weekendPattern)
  if (!match) return null

  const [, ordinal, monthStr, yearStr] = match
  const month = parseMonth(monthStr)
  if (month === null) return null

  const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)
  const lastDay = getLastDayOfMonth(year, month)

  let saturdayDay

  if (ordinal === 'last') {
    // Find the last Saturday of the month
    const lastDate = new Date(year, month, lastDay)
    const dayOfWeek = lastDate.getDay()
    // How many days back to the last Saturday
    const daysBack = (dayOfWeek + 1) % 7 // Sunday=0 → 1, Mon=1 → 2, ..., Sat=6 → 0
    saturdayDay = lastDay - daysBack
  } else if (ordinal === 'second' || ordinal === '2nd') {
    // Second Saturday = first Saturday + 7
    saturdayDay = getFirstSaturdayOfMonth(year, month) + 7
    if (saturdayDay > lastDay) return null
  } else {
    // First Saturday
    saturdayDay = getFirstSaturdayOfMonth(year, month)
  }

  const sundayDay = saturdayDay + 1

  // Handle month rollover for Sunday
  let endMonth = month
  let endYear = year
  let endDay = sundayDay

  if (sundayDay > lastDay) {
    endDay = 1
    endMonth = month + 1
    if (endMonth > 11) {
      endMonth = 0
      endYear = year + 1
    }
  }

  return {
    startISO: toISO(year, month, saturdayDay),
    endISO: toISO(endYear, endMonth, endDay),
    precision: 'approx'
  }
}

/**
 * Parse "last week of Month" patterns
 * Handles: "last week of March", "last week of june"
 */
function parseLastWeekPattern(text, context) {
  const normalized = text.trim().toLowerCase()

  const pattern = /^(?:the\s+)?last\s+week\s+(?:of\s+)?([a-z]+)(?:\s*,?\s*(\d{4}))?$/i
  const match = normalized.match(pattern)
  if (!match) return null

  const [, monthStr, yearStr] = match
  const month = parseMonth(monthStr)
  if (month === null) return null

  const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)
  const lastDay = getLastDayOfMonth(year, month)

  // Last 7 days of the month
  const startDay = lastDay - 6

  return {
    startISO: toISO(year, month, startDay),
    endISO: toISO(year, month, lastDay),
    precision: 'approx'
  }
}

/**
 * Parse bare month name
 * Handles: "june", "March", "december 2026"
 * Returns the full month as an approx range
 */
function parseBareMonth(text, context) {
  const normalized = text.trim().toLowerCase()

  const pattern = /^([a-z]+)(?:\s*,?\s*(\d{4}))?$/i
  const match = normalized.match(pattern)
  if (!match) return null

  const [, monthStr, yearStr] = match
  const month = parseMonth(monthStr)
  if (month === null) return null

  const year = yearStr ? parseInt(yearStr, 10) : getTargetYear(month, context)
  const lastDay = getLastDayOfMonth(year, month)

  return {
    startISO: toISO(year, month, 1),
    endISO: toISO(year, month, lastDay),
    precision: 'approx',
    isBareMonth: true
  }
}

/**
 * Main normalization function
 *
 * @param {string} inputText - Free-form date text from user
 * @param {Object} context - Trip context for year inference
 * @param {string} context.startBound - Trip start bound (YYYY-MM-DD)
 * @param {string} context.endBound - Trip end bound (YYYY-MM-DD)
 * @param {number} context.tripYear - Target year hint
 * @returns {{ startISO: string, endISO: string, precision: 'exact'|'approx' } | { error: string }}
 */
export function normalizeWindow(inputText, context = {}) {
  if (!inputText || typeof inputText !== 'string') {
    return {
      error: 'Please enter a date range. Examples: "Feb 7-9", "early March", "last week of June", "April"'
    }
  }

  const trimmed = inputText.trim()
  if (trimmed.length === 0) {
    return {
      error: 'Please enter a date range. Examples: "Feb 7-9", "early March", "last week of June", "April"'
    }
  }

  // Check for multi-range or ambiguous input
  if (containsMultiRange(trimmed)) {
    return {
      error: 'Please suggest one date range at a time. You can add another option separately.'
    }
  }

  // Try parsing in order of specificity
  let result = parseExplicitDates(trimmed, context)
  if (!result) {
    result = parseRelativeMonth(trimmed, context)
  }
  if (!result) {
    result = parseLastWeekPattern(trimmed, context)
  }
  if (!result) {
    result = parseWeekendPattern(trimmed, context)
  }
  if (!result) {
    result = parseBareMonth(trimmed, context)
  }

  if (!result) {
    return {
      error: 'Could not understand the date format. Try: "Feb 7-9", "early March", "last week of June", or "first weekend of April"'
    }
  }

  // Validate window length (skip for bare month inputs which are intentionally broad)
  const windowDays = daysBetween(result.startISO, result.endISO)
  if (!result.isBareMonth && windowDays > WINDOW_CONFIG.MAX_WINDOW_DAYS) {
    return {
      error: `That's ${windowDays} days, which is longer than the ${WINDOW_CONFIG.MAX_WINDOW_DAYS}-day limit. Try a shorter range.`
    }
  }

  if (windowDays < 1) {
    return {
      error: 'End date must be on or after start date.'
    }
  }

  return result
}

/**
 * Check if a date window is within trip bounds
 *
 * @param {string} startISO - Window start date
 * @param {string} endISO - Window end date
 * @param {string} tripStartBound - Trip start bound
 * @param {string} tripEndBound - Trip end bound
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateWindowBounds(startISO, endISO, tripStartBound, tripEndBound) {
  if (!tripStartBound || !tripEndBound) {
    return { valid: true }
  }

  if (startISO < tripStartBound) {
    return {
      valid: false,
      error: `Start date ${startISO} is before the trip's earliest date ${tripStartBound}`
    }
  }

  if (endISO > tripEndBound) {
    return {
      valid: false,
      error: `End date ${endISO} is after the trip's latest date ${tripEndBound}`
    }
  }

  return { valid: true }
}
