export const TripDateState = {
  DATES_LOCKED: 'DATES_LOCKED',
  NO_DATES: 'NO_DATES',
  DATE_PROPOSED: 'DATE_PROPOSED',
  READY_TO_LOCK: 'READY_TO_LOCK'
}

function getSafeArray(value) {
  return Array.isArray(value) ? value : []
}

export function requiredApprovals(totalMembers) {
  const total = Number.isFinite(totalMembers) && totalMembers > 0 ? totalMembers : 1
  return Math.ceil(total / 2)
}

export function countApprovals(trip, members = null) {
  const reactions = getSafeArray(trip?.dateProposalReactions)
  const memberIds = Array.isArray(members) && members.length > 0
    ? new Set(members.map(member => (typeof member === 'string' ? member : member?.id)).filter(Boolean))
    : null
  const approvalsByUser = new Set()
  reactions.forEach(reaction => {
    if (reaction?.reactionType === 'WORKS' && reaction.userId) {
      if (!memberIds || memberIds.has(reaction.userId)) {
        approvalsByUser.add(reaction.userId)
      }
    }
  })
  return approvalsByUser.size
}

export function getNormalizedTripDates(trip) {
  const lockedStart = trip?.lockedStart || trip?.lockedStartDate || null
  const lockedEnd = trip?.lockedEnd || trip?.lockedEndDate || null
  const proposedStart = trip?.proposedStart || null
  const proposedEnd = trip?.proposedEnd || null
  const datesLocked = Boolean(
    trip?.datesLocked ||
      (lockedStart && lockedEnd) ||
      trip?.status === 'locked'
  )

  return {
    lockedStart,
    lockedEnd,
    proposedStart,
    proposedEnd,
    datesLocked
  }
}

export function getTripDateState(trip, members = []) {
  const { lockedStart, lockedEnd, proposedStart, proposedEnd, datesLocked } = getNormalizedTripDates(trip)
  const totalMembers = typeof members === 'number'
    ? members
    : Array.isArray(members)
    ? members.length
    : 0

  if (datesLocked && lockedStart && lockedEnd) {
    return TripDateState.DATES_LOCKED
  }

  if (proposedStart && proposedEnd) {
    const approvals = countApprovals(trip, Array.isArray(members) ? members : null)
    const required = requiredApprovals(totalMembers)
    return approvals >= required ? TripDateState.READY_TO_LOCK : TripDateState.DATE_PROPOSED
  }

  return TripDateState.NO_DATES
}

export function getTripDisplayDates(trip) {
  const { lockedStart, lockedEnd, proposedStart, proposedEnd, datesLocked } = getNormalizedTripDates(trip)
  const fallbackStart = trip?.startDate || null
  const fallbackEnd = trip?.endDate || null

  if (datesLocked) {
    const startDate = lockedStart || fallbackStart
    const endDate = lockedEnd || fallbackEnd
    if (startDate && endDate) {
      return { startDate, endDate, label: 'locked' }
    }
  }

  if (proposedStart && proposedEnd) {
    return { startDate: proposedStart, endDate: proposedEnd, label: 'proposed' }
  }

  if (fallbackStart && fallbackEnd) {
    return { startDate: fallbackStart, endDate: fallbackEnd, label: 'proposed' }
  }

  return { startDate: null, endDate: null, label: 'tbd' }
}
