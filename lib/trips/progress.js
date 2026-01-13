/**
 * Shared trip progress milestone definitions
 * These match exactly what's shown in TripDetailView's TripProgress component
 */

import { 
  Flag, Lock, ListTodo, Home, Luggage, Calendar as CalendarIcon, Camera, DollarSign 
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
    label: 'Trip Proposed',
    shortLabel: 'Proposed',
    tooltip: 'The trip has been created and shared with the circle.',
    manual: false,
    icon: Flag
  },
  {
    key: 'datesLocked',
    label: 'Dates Locked',
    shortLabel: 'Dates',
    tooltip: 'Trip dates have been finalized and locked.',
    manual: false,
    icon: Lock
  },
  {
    key: 'itineraryFinalized',
    label: 'Itinerary Finalized',
    shortLabel: 'Itinerary',
    tooltip: 'The final itinerary has been selected and approved.',
    manual: false,
    icon: ListTodo
  },
  {
    key: 'accommodationChosen',
    label: 'Accommodation Chosen',
    shortLabel: 'Stay',
    tooltip: 'Accommodation has been selected for the trip.',
    manual: true,
    icon: Home
  },
  {
    key: 'prepStarted',
    label: 'Prep Started',
    shortLabel: 'Prep',
    tooltip: 'Trip preparation has begun (bookings, reservations, etc.).',
    manual: true,
    icon: Luggage
  },
  {
    key: 'tripOngoing',
    label: 'Trip Ongoing',
    shortLabel: 'Ongoing',
    tooltip: 'The trip is currently happening (dates are active).',
    manual: false,
    icon: CalendarIcon
  },
  {
    key: 'memoriesShared',
    label: 'Memories Shared',
    shortLabel: 'Memories',
    tooltip: 'Trip memories and photos have been shared.',
    manual: true,
    icon: Camera
  },
  {
    key: 'expensesSettled',
    label: 'Expenses Settled',
    shortLabel: 'Expenses',
    tooltip: 'All trip expenses have been settled and paid.',
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
  
  return {
    tripProposed: true, // Always complete
    datesLocked: trip.status === 'locked',
    itineraryFinalized: trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published',
    accommodationChosen: false, // Requires progress API - unknown from trip data alone
    prepStarted: false, // Requires progress API - unknown from trip data alone
    tripOngoing: isTripOngoing,
    memoriesShared: false, // Requires progress API - unknown from trip data alone
    expensesSettled: false // Requires progress API - unknown from trip data alone
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
