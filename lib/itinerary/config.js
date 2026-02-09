/**
 * Itinerary configuration constants
 * Centralized for easy adjustment post-MVP
 */

/**
 * Maximum number of itinerary versions allowed per trip.
 * Can be overridden via ITINERARY_MAX_VERSIONS environment variable.
 */
const MAX_VERSIONS = parseInt(process.env.ITINERARY_MAX_VERSIONS || '3', 10)

/**
 * Maximum ideas per user per trip
 */
const MAX_IDEAS_PER_USER = 2

/**
 * Maximum idea length in characters
 */
const MAX_IDEA_LENGTH = 120

const ITINERARY_CONFIG = {
  MAX_VERSIONS,
  MAX_IDEAS_PER_USER,
  MAX_IDEA_LENGTH,
}

/**
 * Maximum LLM-powered scheduling insight generations per trip.
 * Cache hits (same inputHash) don't count — only new LLM calls.
 * Can be overridden via SCHEDULING_INSIGHTS_MAX_GENERATIONS environment variable.
 */
const MAX_SCHEDULING_INSIGHT_GENERATIONS = parseInt(
  process.env.SCHEDULING_INSIGHTS_MAX_GENERATIONS || '3', 10
)

const SCHEDULING_CONFIG = {
  MAX_SCHEDULING_INSIGHT_GENERATIONS,
}

module.exports = { ITINERARY_CONFIG, SCHEDULING_CONFIG }
