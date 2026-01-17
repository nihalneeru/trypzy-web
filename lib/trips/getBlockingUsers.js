/**
 * Get blocking users for trip coordination clarity
 * 
 * Returns structured data about who is blocking progress in the current stage.
 * Used for "waiting on..." messages in Trip Chat.
 * 
 * @param {Object} trip - Trip object from API
 * @param {Object} user - Current user object
 * @returns {Object|null} Blocking info or null if no blockers
 * @property {Array} blockers - Array of { id, name, reason } objects
 * @property {string} reasonCode - Overall reason code ('picking_dates', 'voting', 'leader_lock')
 * @property {string} message - Human-readable message
 */
export function getBlockingUsers(trip, user) {
  if (!trip || !user) return null
  
  // Only for collaborative trips in active stages
  if (trip.type !== 'collaborative') return null
  
  const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
  const isTripLeader = trip.createdBy === user.id
  
  // Scheduling stage: waiting on users to pick dates
  if (tripStatus === 'proposed' || tripStatus === 'scheduling') {
    const pickProgress = trip.pickProgress
    if (!pickProgress || pickProgress.respondedCount >= pickProgress.totalCount) {
      // Everyone has responded - check if leader needs to lock
      if (isTripLeader) {
        return {
          blockers: [],
          reasonCode: 'leader_lock',
          message: 'Waiting on Trip Leader to lock dates'
        }
      }
      return null // Non-leader waiting for lock (no blockers to show)
    }
    
    // Get list of participants who haven't responded
    const respondedUserIds = new Set(pickProgress.respondedUserIds || [])
    const allParticipants = trip.participants || []
    const blockingParticipants = allParticipants.filter(p => 
      p.id !== user.id && !respondedUserIds.has(p.id)
    )
    
    if (blockingParticipants.length === 0) {
      // Current user is the only blocker
      return {
        blockers: [{ id: user.id, name: user.name || 'You', reason: 'picking_dates' }],
        reasonCode: 'picking_dates',
        message: 'Waiting on you to pick dates'
      }
    }
    
    return {
      blockers: blockingParticipants.map(p => ({
        id: p.id,
        name: p.name || 'Unknown',
        reason: 'picking_dates'
      })),
      reasonCode: 'picking_dates',
      message: `Waiting on: ${blockingParticipants.map(p => p.name || 'Unknown').join(', ')} to pick dates`
    }
  }
  
  // Voting stage: waiting on users to vote
  if (tripStatus === 'voting') {
    const votes = trip.votes || []
    const votedUserIds = new Set(votes.map(v => v.userId))
    const allParticipants = trip.participants || []
    const blockingParticipants = allParticipants.filter(p => 
      p.id !== user.id && !votedUserIds.has(p.id)
    )
    
    // Check if current user has voted
    if (!trip.userVote && !votedUserIds.has(user.id)) {
      return {
        blockers: [{ id: user.id, name: user.name || 'You', reason: 'voting' }],
        reasonCode: 'voting',
        message: 'Waiting on you to vote'
      }
    }
    
    if (blockingParticipants.length === 0) {
      // Everyone has voted - check if leader needs to lock
      if (isTripLeader) {
        return {
          blockers: [],
          reasonCode: 'leader_lock',
          message: 'Waiting on Trip Leader to lock dates'
        }
      }
      return null // Non-leader waiting for lock
    }
    
    return {
      blockers: blockingParticipants.map(p => ({
        id: p.id,
        name: p.name || 'Unknown',
        reason: 'voting'
      })),
      reasonCode: 'voting',
      message: `Waiting on: ${blockingParticipants.map(p => p.name || 'Unknown').join(', ')} to vote`
    }
  }
  
  // Locked/completed: no blockers
  return null
}
