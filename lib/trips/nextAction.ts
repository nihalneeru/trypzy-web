/**
 * Next Action Resolution
 * 
 * Determines the next actionable item for a trip based on trip state and user context.
 * Returns a NextAction object that can be used to guide users to the appropriate tab or action.
 */

import { deriveTripPrimaryStage, TripPrimaryStage, TripTabKey } from './stage.js'
import { computeTripProgressSnapshot } from './progressSnapshot.js'

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
  if (trip.type === 'collaborative' && !snapshot.datesLocked) {
    if (!snapshot.everyoneResponded) {
      // Still waiting for responses - show availability CTA only while pending
      return {
        id: 'availability-pending',
        title: 'Discuss dates',
        description: 'Share your availability and coordinate dates',
        ctaLabel: 'Go to Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 1
      }
    } else if (snapshot.leaderNeedsToLock) {
      // Everyone responded, leader needs to lock
      return {
        id: 'lock-dates',
        title: 'Lock dates',
        description: 'Everyone has responded. Lock the trip dates.',
        ctaLabel: 'Lock Dates',
        kind: 'inline',
        priority: 1
      }
    } else if (!snapshot.isTripLeader) {
      // Non-leader waiting for lock
      return {
        id: 'waiting-for-lock',
        title: 'Waiting for leader',
        description: 'Waiting for trip leader to lock dates',
        ctaLabel: 'View Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 2
      }
    }
  }

  // Derive the trip stage
  const stage = snapshot.stage

  // Map stage to next action based on existing primary tab logic
  // This matches the behavior of getPrimaryTabForStage
  switch (stage) {
    case TripPrimaryStage.PROPOSED:
      return {
        id: 'planning-required',
        title: 'Plan your trip',
        description: 'Set dates and coordinate with your group',
        ctaLabel: 'Go to Planning',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.PLANNING,
        priority: 1
      }

    case TripPrimaryStage.DATES_LOCKED:
      return {
        id: 'itinerary-required',
        title: 'Create itinerary',
        description: 'Plan your activities and schedule',
        ctaLabel: 'Go to Itinerary',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.ITINERARY,
        priority: 2
      }

    case TripPrimaryStage.ITINERARY:
      return {
        id: 'accommodation-required',
        title: 'Choose accommodation',
        description: 'Select where you\'ll stay',
        ctaLabel: 'Go to Accommodation',
        kind: 'deeplink',
        deeplinkTab: TripTabKey.ACCOMMODATION,
        priority: 3
      }

    case TripPrimaryStage.STAY:
      // Accommodation is chosen, but prep hasn't started
      return {
        id: 'prep-required',
        title: 'Start trip prep',
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
