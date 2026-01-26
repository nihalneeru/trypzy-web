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

module.exports = { ITINERARY_CONFIG }
