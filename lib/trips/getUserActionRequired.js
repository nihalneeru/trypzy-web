/**
 * Determine if the current user has a required action for a trip
 * This is used to show "Your turn" badges
 *
 * MVP: Only show for Dates Picking stage (availability/vote submission)
 *
 * @param {Object} trip - Trip document
 * @param {string} userId - Current user ID
 * @param {Array|null} userDatePicks - User's date picks (for top3_heatmap mode)
 * @param {Object|null} userVote - User's vote record
 * @param {Array} availabilities - All availabilities for the trip
 * @param {number} [userIdeaCount] - Optional count (deprecated - no longer used)
 * @param {boolean} [isCurrentUserTraveler] - Whether user is an active traveler (default true for backward compat)
 * @returns {boolean} True if user has a required action
 */
export function getUserActionRequired(trip, userId, userDatePicks, userVote, availabilities = [], userIdeaCount = null, isCurrentUserTraveler = true, { dateWindows = [], windowSupports = [] } = {}) {
  // Non-travelers have no required actions
  if (!isCurrentUserTraveler) return false
  // If trip is completed or locked, no action required (MVP: no action required for locked stages)
  if (trip.status === 'completed' || trip.status === 'locked') {
    return false
  }

  // For collaborative trips - only check Dates Picking stages
  if (trip.type === 'collaborative') {
    // Dates Picking stage (proposed or scheduling) - action required if user hasn't responded
    if (trip.status === 'proposed' || trip.status === 'scheduling') {
      if (trip.schedulingMode === 'date_windows') {
        // date_windows mode: user participated if they suggested a window or supported one
        const userSuggested = dateWindows.some(w => w.suggestedBy === userId)
        const userSupported = windowSupports.some(s => s.userId === userId)
        if (!userSuggested && !userSupported) {
          return true
        }
      } else if (trip.schedulingMode === 'top3_heatmap') {
        // Check if user has submitted date picks
        if (!userDatePicks || userDatePicks.length === 0) {
          return true
        }
      } else {
        // Legacy availability system - check if user has submitted availability
        const userAvail = availabilities.filter(a => a.userId === userId)
        if (userAvail.length === 0) {
          return true
        }
      }
    }
    
    // Voting stage - action required if user hasn't voted
    if (trip.status === 'voting') {
      if (!userVote) {
        return true
      }
    }
  }
  
  // For hosted trips, no action required for MVP (join is optional)
  
  // All other cases: no action required (Dates Locked, Itinerary, Stay, Prep, etc.)
  return false
}
