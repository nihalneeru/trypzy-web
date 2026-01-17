/**
 * Computes voting status for a trip in the voting stage.
 * 
 * @param {Object} trip - Trip object with votes array and date options
 * @param {Array} travelers - Active travelers for this trip [{id, name}, ...]
 * @param {string} currentUserId - The viewing user's ID
 * @returns {Object} Voting status
 */
export function getVotingStatus(trip, travelers, currentUserId) {
  const result = {
    stage: trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling'),
    isVotingStage: false,
    totalTravelers: travelers?.length || 0,
    votedCount: 0,
    remainingCount: 0,
    hasCurrentUserVoted: false,
    leadingOption: null,
    leadingVotes: 0,
    isTie: false,
    readyToLock: false,
    readyToLockReason: null,
    options: []
  }
  
  // Only compute for voting stage
  const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
  if (tripStatus !== 'voting') {
    return result
  }
  
  result.isVotingStage = true
  
  // Get votes and unique voters
  const votes = trip.votes || []
  const votedUserIds = new Set(votes.map(v => v.userId).filter(Boolean))
  result.votedCount = votedUserIds.size
  result.remainingCount = result.totalTravelers - result.votedCount
  result.hasCurrentUserVoted = votedUserIds.has(currentUserId)
  
  // Get voting options from promisingWindows or consensusOptions
  // These are the date windows users vote on
  const votingOptions = trip.promisingWindows || trip.consensusOptions || []
  
  if (votingOptions.length === 0) {
    return result // No options to vote on
  }
  
  // Build option map keyed by optionKey (format: "YYYY-MM-DD_YYYY-MM-DD")
  const optionMap = new Map()
  
  votingOptions.forEach((opt, idx) => {
    const startDate = opt.startDate || opt.startDateISO
    const endDate = opt.endDate || opt.endDateISO
    if (!startDate || !endDate) return
    
    // Create optionKey from dates
    const optionKey = `${startDate}_${endDate}`
    
    // Format label for display
    const formatDate = (dateStr) => {
      try {
        const date = new Date(dateStr + 'T12:00:00')
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      } catch {
        return dateStr
      }
    }
    
    const label = opt.name || opt.label || `${formatDate(startDate)}–${formatDate(endDate)}`
    
    optionMap.set(optionKey, {
      id: optionKey,
      optionKey,
      name: label,
      label,
      startDate,
      endDate,
      votes: 0,
      voterNames: [],
      index: idx
    })
  })
  
  // Tally votes per option
  votes.forEach(vote => {
    const optionKey = vote.optionKey
    if (optionMap.has(optionKey)) {
      const opt = optionMap.get(optionKey)
      opt.votes++
      
      // Add voter name (first name only)
      if (vote.voterName) {
        const firstName = vote.voterName.split(' ')[0]
        if (!opt.voterNames.includes(firstName)) {
          opt.voterNames.push(firstName)
        }
      } else if (vote.userName) {
        const firstName = vote.userName.split(' ')[0]
        if (!opt.voterNames.includes(firstName)) {
          opt.voterNames.push(firstName)
        }
      }
    }
  })
  
  // Convert to sorted array (highest votes first)
  result.options = Array.from(optionMap.values())
    .sort((a, b) => {
      // Sort by votes (desc), then by original index (asc) for stable tie-breaking
      if (b.votes !== a.votes) {
        return b.votes - a.votes
      }
      return a.index - b.index
    })
  
  // Determine leading option
  if (result.options.length > 0 && result.options[0].votes > 0) {
    result.leadingOption = result.options[0]
    result.leadingVotes = result.options[0].votes
    
    // Check for tie (multiple options with same vote count)
    if (result.options.length > 1 && result.options[1].votes === result.leadingVotes) {
      result.isTie = true
    }
  }
  
  // Determine if ready to lock
  // Ready if: >50% voted AND there's a clear leader (no tie)
  const majorityVoted = result.votedCount > result.totalTravelers / 2
  const hasLeader = result.leadingOption && result.leadingVotes > 0
  
  if (majorityVoted && hasLeader && !result.isTie) {
    result.readyToLock = true
    result.readyToLockReason = `${result.votedCount}/${result.totalTravelers} voted, clear leader`
  } else if (result.votedCount === result.totalTravelers && hasLeader && !result.isTie) {
    result.readyToLock = true
    result.readyToLockReason = 'All votes in'
  } else if (result.votedCount === result.totalTravelers && result.isTie) {
    result.readyToLock = true // Leader can break tie
    result.readyToLockReason = 'All votes in (tie - leader decides)'
  }
  
  return result
}

/**
 * Formats the leading option for display
 */
export function formatLeadingOption(votingStatus) {
  if (!votingStatus.leadingOption) return null
  
  const { leadingOption, leadingVotes, isTie } = votingStatus
  
  if (isTie) {
    return `Tied: ${leadingOption.name || leadingOption.label} (${leadingVotes} votes)`
  }
  return `Leading: ${leadingOption.name || leadingOption.label} (${leadingVotes} ${leadingVotes === 1 ? 'vote' : 'votes'})`
}
