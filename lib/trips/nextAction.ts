/**
 * Next Action Resolution
 * 
 * Determines the next actionable item for a trip based on trip state and user context.
 * Returns a NextAction object that can be used to guide users to the appropriate tab or action.
 */

import { deriveTripPrimaryStage, TripPrimaryStage, TripTabKey } from './stage.js'
import { computeTripProgressSnapshot } from './progressSnapshot'

/**
 * NextAction represents a suggested action for the user based on trip state
 */
export type NextAction = {
  id: string
  title: string
  description: string
  ctaLabel: string
  kind: 'deeplink' | 'inline'
  deeplinkTab?: string
  priority: number
  payload?: Record<string, any>
}

/**
 * Get the next action for a trip based on trip state
 * Matches the existing "pending action tab" logic from getPrimaryTabForStage
 * 
 * @param {Object} params
 * @param {Object} params.trip - Trip object
 * @param {Object} params.user - User object
 * @param {Object} [params.options] - Additional context
 * @param {Array} [params.options.joinRequests] - Pending join requests (for leaders)
 * @param {Object} [params.options.pickProgress] - Pick progress data (respondedCount, totalCount)
 * @returns {NextAction|null} Next action or null if no action needed
 */
export function getNextAction({ 
  trip, 
  user,
  options = {}
}: { 
  trip: any
  user: any
  options?: {
    joinRequests?: Array<any>
    pickProgress?: { respondedCount: number; totalCount: number }
  }
}): NextAction | null {
  if (!trip || !user) {
    return null
  }

  // Compute progress snapshot for unified state
  const snapshot = computeTripProgressSnapshot(trip, user, options)

  // Handle availability/scheduling state first
  // P1-5: Use inviting language, avoid "waiting on you" pressure
  if (trip.type === 'collaborative' && !snapshot.datesLocked) {
    // Check if user is invited (should show invite CTA, not availability CTA)
    const userParticipantStatus = trip.viewer?.participantStatus
    if (userParticipantStatus === 'invited') {
      // User is invited - no action needed here (handled by ChatTab invite CTA)
      // Return null so ChatTab can show its own invite card
      return null
    }

    if (!snapshot.everyoneResponded) {
      // Still waiting for responses - show availability CTA only while pending
      // everyoneResponded now accounts for INVITED participants (no INVITED remaining)
      return {
        id: 'availability-pending',
        title: 'Share your dates',
        description: 'Help coordinate by sharing when you\'re available',
        ctaLabel: 'Go to Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 1
      }
    } else if (snapshot.leaderNeedsToLock) {
      // Everyone responded (no INVITED remaining) AND all active participants have responded
      // Leader needs to lock
      return {
        id: 'lock-dates',
        title: 'Ready to lock dates',
        description: 'Everyone has responded. You can now lock in the trip dates.',
        ctaLabel: 'Lock Dates',
        kind: 'inline',
        priority: 1
      }
    } else if (!snapshot.isTripLeader) {
      // Non-leader waiting for lock - use neutral language
      return {
        id: 'waiting-for-lock',
        title: 'Dates coming soon',
        description: 'The trip leader will lock in the dates shortly',
        ctaLabel: 'View Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 2
      }
    }
  }

  // Derive the trip stage from snapshot
  const stage = snapshot.stage

  // Map stage to next action based on existing primary tab logic
  // This matches the behavior of getPrimaryTabForStage
  switch (stage) {
    // P1-5: Use inviting language throughout - "Add your ideas" not "Submit ideas"
    case TripPrimaryStage.PROPOSED:
      return {
        id: 'planning-required',
        title: 'Start planning',
        description: 'Set dates and coordinate with your group',
        ctaLabel: 'Go to Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 1
      }

    case TripPrimaryStage.DATES_LOCKED:
      return {
        id: 'itinerary-required',
        title: 'Suggest an idea',
        description: 'Share activities and build the itinerary together',
        ctaLabel: 'Suggest Ideas',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.ITINERARY,
        priority: 2
      }

    case TripPrimaryStage.ITINERARY:
      return {
        id: 'accommodation-required',
        title: 'Pick where to stay',
        description: 'Browse and choose accommodation together',
        ctaLabel: 'Go to Accommodation',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.ACCOMMODATION,
        priority: 3
      }

    case TripPrimaryStage.STAY:
      // Accommodation is chosen, but prep hasn't started
      return {
        id: 'prep-required',
        title: 'Get ready',
        description: 'Prepare for your upcoming trip',
        ctaLabel: 'Go to Prep',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PREP,
        priority: 4
      }

    case TripPrimaryStage.PREP:
      // Prep is in progress - example inline action: quick note
      return {
        id: 'quick-note',
        title: 'Add a quick note',
        description: 'Jot down a reminder or note about your trip prep',
        ctaLabel: 'Add Note',
        kind: 'inline',
        priority: 4
      }

    case TripPrimaryStage.ONGOING:
      // Trip is ongoing, no specific action needed
      return null

    case TripPrimaryStage.COMPLETED:
      // Trip is completed, suggest memories
      return {
        id: 'memories-suggested',
        title: 'Share memories',
        description: 'Upload photos and share your trip memories',
        ctaLabel: 'Go to Memories',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.MEMORIES,
        priority: 5
      }

    default:
      return null
  }
}
