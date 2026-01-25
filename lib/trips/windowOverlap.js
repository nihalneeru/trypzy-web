/**
 * Window Overlap Detection Module
 *
 * Computes overlap between date windows for similarity detection.
 * Used to nudge users toward supporting existing windows instead of duplicates.
 *
 * @module lib/trips/windowOverlap
 */

// Default similarity threshold
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6

/**
 * Parse ISO date string to Date object (noon to avoid timezone issues)
 */
function parseDate(isoStr) {
  return new Date(isoStr + 'T12:00:00')
}

/**
 * Calculate the number of days in a window (inclusive)
 */
function windowLength(startISO, endISO) {
  const start = parseDate(startISO)
  const end = parseDate(endISO)
  return Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
}

/**
 * Calculate the number of overlapping days between two windows
 *
 * @param {string} startA - Window A start (ISO)
 * @param {string} endA - Window A end (ISO)
 * @param {string} startB - Window B start (ISO)
 * @param {string} endB - Window B end (ISO)
 * @returns {number} Number of overlapping days (0 if no overlap)
 */
function overlapDays(startA, endA, startB, endB) {
  // Find intersection
  const intersectStart = startA > startB ? startA : startB
  const intersectEnd = endA < endB ? endA : endB

  // No overlap if intersection is invalid
  if (intersectStart > intersectEnd) {
    return 0
  }

  return windowLength(intersectStart, intersectEnd)
}

/**
 * Compute overlap score between two windows
 *
 * Score = overlapDays / min(lengthA, lengthB)
 * Range: 0.0 (no overlap) to 1.0 (one window fully contained in the other)
 *
 * @param {Object} windowA - Window object with startDate/startISO and endDate/endISO
 * @param {Object} windowB - Window object with startDate/startISO and endDate/endISO
 * @returns {number} Overlap score between 0 and 1
 */
export function computeOverlapScore(windowA, windowB) {
  // Support both old field names (startDate) and new normalized names (startISO/normalizedStart)
  const startA = windowA.normalizedStart || windowA.startISO || windowA.startDate
  const endA = windowA.normalizedEnd || windowA.endISO || windowA.endDate
  const startB = windowB.normalizedStart || windowB.startISO || windowB.startDate
  const endB = windowB.normalizedEnd || windowB.endISO || windowB.endDate

  if (!startA || !endA || !startB || !endB) {
    return 0
  }

  const lengthA = windowLength(startA, endA)
  const lengthB = windowLength(startB, endB)
  const overlap = overlapDays(startA, endA, startB, endB)

  if (overlap === 0) {
    return 0
  }

  const minLength = Math.min(lengthA, lengthB)
  return overlap / minLength
}

/**
 * Find windows similar to a new window
 *
 * O(n) complexity over existing windows.
 *
 * @param {Object} newWindow - New window with start/end dates
 * @param {Array} existingWindows - Array of existing window objects
 * @param {number} threshold - Similarity threshold (default 0.6)
 * @returns {Array} Array of { window, score } for windows above threshold, sorted by score desc
 */
export function findSimilarWindows(newWindow, existingWindows, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  if (!existingWindows || existingWindows.length === 0) {
    return []
  }

  const similar = []

  for (const existing of existingWindows) {
    const score = computeOverlapScore(newWindow, existing)
    if (score >= threshold) {
      similar.push({
        window: existing,
        score: Math.round(score * 100) / 100 // Round to 2 decimal places
      })
    }
  }

  // Sort by score descending
  similar.sort((a, b) => b.score - a.score)

  return similar
}

/**
 * Get the most similar window if any
 *
 * @param {Object} newWindow - New window with start/end dates
 * @param {Array} existingWindows - Array of existing window objects
 * @param {number} threshold - Similarity threshold (default 0.6)
 * @returns {{ windowId: string, score: number } | null}
 */
export function getMostSimilarWindow(newWindow, existingWindows, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  const similar = findSimilarWindows(newWindow, existingWindows, threshold)

  if (similar.length === 0) {
    return null
  }

  return {
    windowId: similar[0].window.id,
    score: similar[0].score
  }
}

/**
 * Check if a new window would be a near-duplicate of any existing window
 *
 * @param {Object} newWindow - New window with start/end dates
 * @param {Array} existingWindows - Array of existing window objects
 * @param {number} threshold - Similarity threshold (default 0.6)
 * @returns {boolean}
 */
export function isNearDuplicate(newWindow, existingWindows, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  return getMostSimilarWindow(newWindow, existingWindows, threshold) !== null
}
