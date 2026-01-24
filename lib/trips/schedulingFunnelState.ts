/**
 * Scheduling Funnel State
 *
 * Determines the current state of the collaborative scheduling funnel.
 * Hosted trips bypass this funnel entirely (dates are locked at creation).
 */

/**
 * Scheduling funnel states - represents the progression through date selection
 */
export const SchedulingFunnelState = {
  HOSTED_LOCKED: 'HOSTED_LOCKED',       // Hosted trip - dates locked at creation
  NO_DATES: 'NO_DATES',                 // Collaborative trip with no windows proposed yet
  WINDOWS_OPEN: 'WINDOWS_OPEN',         // Window proposals active, no concrete date proposed
  DATE_PROPOSED: 'DATE_PROPOSED',       // Concrete date proposed, awaiting reactions
  READY_TO_LOCK: 'READY_TO_LOCK',       // Majority approved, leader can lock
  DATES_LOCKED: 'DATES_LOCKED'          // Dates finalized
} as const

export type SchedulingFunnelStateType = typeof SchedulingFunnelState[keyof typeof SchedulingFunnelState]

/**
 * Date reaction types
 */
export const DateReactionType = {
  WORKS: 'WORKS',     // User can attend these dates
  CAVEAT: 'CAVEAT',   // User can attend with some concerns
  CANT: 'CANT'        // User cannot attend these dates
} as const

export type DateReactionTypeValue = typeof DateReactionType[keyof typeof DateReactionType]

/**
 * Window preference types
 */
export const WindowPreferenceType = {
  WORKS: 'WORKS',
  MAYBE: 'MAYBE',
  NO: 'NO'
} as const

export type WindowPreferenceTypeValue = typeof WindowPreferenceType[keyof typeof WindowPreferenceType]

/**
 * Window proposal shape
 */
export interface WindowProposal {
  id: string
  userId: string
  userName?: string
  description: string               // Natural language: "early March", "last week of April"
  startHint?: string               // Optional: YYYY-MM-DD
  endHint?: string                 // Optional: YYYY-MM-DD
  archived?: boolean               // Set by leader compress action
  createdAt: string
}

/**
 * Window preference shape
 */
export interface WindowPreference {
  userId: string
  userName?: string
  windowId: string
  preference: WindowPreferenceTypeValue
  note?: string
  createdAt: string
  updatedAt: string
}

/**
 * Date proposal shape (single active proposal)
 */
export interface DateProposal {
  startDate: string                // YYYY-MM-DD
  endDate: string                  // YYYY-MM-DD
  proposedBy: string               // userId
  proposedAt: string               // ISO timestamp
  note?: string
}

/**
 * Date reaction shape
 */
export interface DateReaction {
  userId: string
  userName?: string
  reactionType: DateReactionTypeValue
  note?: string
  createdAt: string
  updatedAt: string
}

/**
 * Calculate required approvals for majority
 * @param totalMembers - Total number of active members
 * @returns Number of WORKS reactions needed for approval
 */
export function requiredApprovals(totalMembers: number): number {
  if (totalMembers <= 0) return 1
  return Math.ceil(totalMembers / 2)
}

/**
 * Count WORKS reactions from date reactions array
 * @param reactions - Array of date reactions
 * @returns Number of WORKS reactions
 */
export function countApprovals(reactions: DateReaction[] | undefined): number {
  if (!reactions || !Array.isArray(reactions)) return 0
  return reactions.filter(r => r.reactionType === DateReactionType.WORKS).length
}

/**
 * Check if windows are frozen (dateProposal exists)
 * @param trip - Trip object
 * @returns True if windows are frozen
 */
export function areWindowsFrozen(trip: any): boolean {
  return Boolean(trip.dateProposal?.startDate && trip.dateProposal?.endDate)
}

/**
 * Get active (non-archived) window proposals
 * @param proposals - Array of window proposals
 * @returns Active proposals
 */
export function getActiveWindowProposals(proposals: WindowProposal[] | undefined): WindowProposal[] {
  if (!proposals || !Array.isArray(proposals)) return []
  return proposals.filter(p => !p.archived)
}

/**
 * Aggregate preferences for a window proposal
 * @param windowId - Window proposal ID
 * @param preferences - All window preferences
 * @returns Counts of each preference type
 */
export function aggregateWindowPreferences(
  windowId: string,
  preferences: WindowPreference[] | undefined
): { works: number; maybe: number; no: number } {
  const result = { works: 0, maybe: 0, no: 0 }
  if (!preferences || !Array.isArray(preferences)) return result

  preferences
    .filter(p => p.windowId === windowId)
    .forEach(p => {
      if (p.preference === WindowPreferenceType.WORKS) result.works++
      else if (p.preference === WindowPreferenceType.MAYBE) result.maybe++
      else if (p.preference === WindowPreferenceType.NO) result.no++
    })

  return result
}

/**
 * Score window proposals for sorting/compression
 * Higher score = more preferred by group
 * @param proposals - Window proposals
 * @param preferences - Window preferences
 * @returns Proposals with scores, sorted by score descending
 */
export function scoreWindowProposals(
  proposals: WindowProposal[] | undefined,
  preferences: WindowPreference[] | undefined
): Array<WindowProposal & { score: number; prefs: { works: number; maybe: number; no: number } }> {
  const active = getActiveWindowProposals(proposals)

  return active.map(p => {
    const prefs = aggregateWindowPreferences(p.id, preferences)
    // Score: +3 per WORKS, +1 per MAYBE, -2 per NO
    const score = (prefs.works * 3) + (prefs.maybe * 1) + (prefs.no * -2)
    return { ...p, score, prefs }
  }).sort((a, b) => b.score - a.score)
}

/**
 * Determine the scheduling funnel state for a trip
 *
 * @param trip - Trip object from database
 * @param memberCount - Number of active members (for approval threshold)
 * @returns Current scheduling funnel state
 */
export function getSchedulingFunnelState(
  trip: any,
  memberCount: number = 1
): SchedulingFunnelStateType {
  if (!trip) return SchedulingFunnelState.NO_DATES

  // 1. Check if trip is hosted - always HOSTED_LOCKED if dates are set
  if (trip.type === 'hosted') {
    // Hosted trips should have dates locked at creation
    if (trip.lockedStartDate && trip.lockedEndDate) {
      return SchedulingFunnelState.HOSTED_LOCKED
    }
    // Fallback: hosted without dates (shouldn't happen, but defensive)
    return SchedulingFunnelState.HOSTED_LOCKED
  }

  // 2. Check if dates are already locked (collaborative)
  const datesLocked = trip.datesLocked === true ||
    (trip.status === 'locked' && trip.lockedStartDate && trip.lockedEndDate)

  if (datesLocked && trip.lockedStartDate && trip.lockedEndDate) {
    return SchedulingFunnelState.DATES_LOCKED
  }

  // 3. Check if there's an active date proposal
  const hasDateProposal = trip.dateProposal?.startDate && trip.dateProposal?.endDate

  if (hasDateProposal) {
    // Check if we have enough approvals to lock
    const approvals = countApprovals(trip.dateReactions)
    const required = requiredApprovals(memberCount)

    if (approvals >= required) {
      return SchedulingFunnelState.READY_TO_LOCK
    }

    return SchedulingFunnelState.DATE_PROPOSED
  }

  // 4. Check if there are any window proposals
  const activeWindows = getActiveWindowProposals(trip.windowProposals)

  if (activeWindows.length > 0) {
    return SchedulingFunnelState.WINDOWS_OPEN
  }

  // 5. No windows, no date proposal = NO_DATES
  return SchedulingFunnelState.NO_DATES
}

/**
 * Check if current user has reacted to the date proposal
 * @param trip - Trip object
 * @param userId - Current user's ID
 * @returns True if user has reacted
 */
export function hasUserReactedToDate(trip: any, userId: string): boolean {
  if (!trip.dateReactions || !Array.isArray(trip.dateReactions)) return false
  return trip.dateReactions.some((r: DateReaction) => r.userId === userId)
}

/**
 * Get user's reaction to the date proposal
 * @param trip - Trip object
 * @param userId - Current user's ID
 * @returns User's reaction or null
 */
export function getUserDateReaction(trip: any, userId: string): DateReaction | null {
  if (!trip.dateReactions || !Array.isArray(trip.dateReactions)) return null
  return trip.dateReactions.find((r: DateReaction) => r.userId === userId) || null
}

/**
 * Get user's preference for a window
 * @param trip - Trip object
 * @param userId - Current user's ID
 * @param windowId - Window proposal ID
 * @returns User's preference or null
 */
export function getUserWindowPreference(
  trip: any,
  userId: string,
  windowId: string
): WindowPreference | null {
  if (!trip.windowPreferences || !Array.isArray(trip.windowPreferences)) return null
  return trip.windowPreferences.find(
    (p: WindowPreference) => p.userId === userId && p.windowId === windowId
  ) || null
}

/**
 * Check if user can propose a window (windows not frozen, user is active participant)
 * @param trip - Trip object
 * @returns True if windows can be proposed
 */
export function canProposeWindow(trip: any): boolean {
  if (!trip || trip.type === 'hosted') return false
  if (areWindowsFrozen(trip)) return false
  if (trip.datesLocked === true) return false
  if (trip.status === 'locked') return false
  return true
}

/**
 * Generate deterministic date adjustment suggestions
 * Moves proposed dates by +/- 1 week
 * @param dateProposal - Current date proposal
 * @returns Array of up to 2 adjustment suggestions
 */
export function generateDateAdjustments(dateProposal: DateProposal | null): Array<{
  startDate: string
  endDate: string
  label: string
}> {
  if (!dateProposal?.startDate || !dateProposal?.endDate) return []

  const start = new Date(dateProposal.startDate + 'T12:00:00')
  const end = new Date(dateProposal.endDate + 'T12:00:00')
  const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  const adjustments: Array<{ startDate: string; endDate: string; label: string }> = []

  // Option 1: Move 1 week earlier
  const earlierStart = new Date(start)
  earlierStart.setDate(earlierStart.getDate() - 7)
  const earlierEnd = new Date(earlierStart)
  earlierEnd.setDate(earlierEnd.getDate() + duration)

  adjustments.push({
    startDate: earlierStart.toISOString().split('T')[0],
    endDate: earlierEnd.toISOString().split('T')[0],
    label: '1 week earlier'
  })

  // Option 2: Move 1 week later
  const laterStart = new Date(start)
  laterStart.setDate(laterStart.getDate() + 7)
  const laterEnd = new Date(laterStart)
  laterEnd.setDate(laterEnd.getDate() + duration)

  adjustments.push({
    startDate: laterStart.toISOString().split('T')[0],
    endDate: laterEnd.toISOString().split('T')[0],
    label: '1 week later'
  })

  return adjustments
}
