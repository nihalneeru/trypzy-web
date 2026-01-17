/**
 * Determine if the current user has a required action for a trip
 * This is used to show "Waiting on you" badges
 * 
 * @param {Object} trip - Trip document
 * @param {string} userId - Current user ID
 * @param {Array|null} userDatePicks - User's date picks (for top3_heatmap mode)
 * @param {Object|null} userVote - User's vote record
 * @param {Array} availabilities - All availabilities for the trip
 * @param {number} [userIdeaCount] - Optional count of user's submitted ideas (for Dates Locked stage)
 * @returns {boolean} True if user has a required action
 */
export function getUserActionRequired(trip, userId, userDatePicks, userVote, availabilities = [], userIdeaCount = null) {
  // Dates Locked stage - action required if user has < 3 itinerary ideas
  if (trip.status === 'locked') {
    // Only check if userIdeaCount is provided (computed elsewhere to avoid DB dependency)
    if (userIdeaCount !== null && userIdeaCount < 3) {
      return true
    }
  }
  
  // If trip is completed, no action required
  if (trip.status === 'completed') {
    return false
  }
  
  // For collaborative trips
  if (trip.type === 'collaborative') {
    // Dates Picking stage (proposed or scheduling) - action required if user hasn't responded
    if (trip.status === 'proposed' || trip.status === 'scheduling') {
      if (trip.schedulingMode === 'top3_heatmap') {
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
  
  // All other cases: no action required
  return false
}
