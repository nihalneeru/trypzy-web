/**
 * Shared trip progress milestone definitions
 * These match exactly what's shown in TripDetailView's TripProgress component
 */

import {
  Lightbulb, CalendarIcon, ListTodo, Home, Luggage, Rocket, Camera, DollarSign
} from 'lucide-react'

/**
 * Step configuration matching TripProgress component
 * Order: tripProposed, datesLocked, itineraryFinalized, accommodationChosen, prepStarted, tripOngoing, memoriesShared, expensesSettled
 * 
 * Canonical short labels: Proposed, Dates, Itinerary, Stay, Prep, Ongoing, Memories, Expenses
 */
export const TRIP_PROGRESS_STEPS = [
  {
    key: 'tripProposed',
    label: 'Trip created',
    shortLabel: 'Trip',
    tooltip: 'The trip has been created and shared with the group.',
    manual: false,
    icon: Lightbulb
  },
  {
    key: 'datesLocked',
    label: 'Dates confirmed',
    shortLabel: 'Dates',
    tooltip: 'Trip dates have been confirmed.',
    manual: false,
    icon: CalendarIcon
  },
  {
    key: 'itineraryFinalized',
    label: 'Itinerary ready',
    shortLabel: 'Itinerary',
    tooltip: 'The trip itinerary is set.',
    manual: false,
    icon: ListTodo
  },
  {
    key: 'accommodationChosen',
    label: 'Stay chosen',
    shortLabel: 'Stay',
    tooltip: 'A place to stay has been picked.',
    manual: true,
    icon: Home
  },
  {
    key: 'prepStarted',
    label: 'Prep started',
    shortLabel: 'Prep',
    tooltip: 'Trip prep is underway — transport, packing, etc.',
    manual: true,
    icon: Luggage
  },
  {
    key: 'tripOngoing',
    label: 'On the trip',
    shortLabel: 'On Trip',
    tooltip: 'The trip is happening right now.',
    manual: false,
    icon: Rocket
  },
  {
    key: 'memoriesShared',
    label: 'Memories shared',
    shortLabel: 'Memories',
    tooltip: 'Photos and moments from the trip.',
    manual: true,
    icon: Camera
  },
  {
    key: 'expensesSettled',
    label: 'Expenses settled',
    shortLabel: 'Expenses',
    tooltip: 'Shared costs have been settled.',
    manual: true,
    icon: DollarSign
  }
]

/**
 * Compute progress steps from trip data
 * This is a partial computation based on available trip fields (without calling progress API)
 * 
 * @param {Object} trip - Trip data from dashboard
 * @returns {Object} Steps object with boolean values
 */
export function computeProgressSteps(trip) {
  const today = new Date().toISOString().split('T')[0]
  const startDate = trip.lockedStartDate || trip.startDate
  const endDate = trip.lockedEndDate || trip.endDate

  // Compute tripOngoing: dates are locked and today is within range
  const isTripOngoing = startDate && endDate &&
    today >= startDate && today <= endDate

  // Use API-provided progress steps when available (from GET /api/trips/:id)
  const apiSteps = trip.progress?.steps

  return {
    tripProposed: true, // Always complete
    datesLocked: trip.status === 'locked' || !!(trip.lockedStartDate && trip.lockedEndDate),
    itineraryFinalized: trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published',
    accommodationChosen: apiSteps?.accommodationChosen || false,
    prepStarted: apiSteps?.prepStarted || false,
    tripOngoing: apiSteps?.tripOngoing || isTripOngoing,
    memoriesShared: apiSteps?.memoriesShared || false,
    expensesSettled: apiSteps?.expensesSettled || false
  }
}

/**
 * Find the first incomplete step
 * @param {Object} steps - Steps object with boolean values
 * @returns {string|null} Key of first incomplete step
 */
export function getFirstIncompleteStep(steps) {
  return TRIP_PROGRESS_STEPS.find(step => !steps[step.key])?.key || null
}
