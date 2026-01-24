import { getNormalizedTripDates } from './dateState.js'

/**
 * Trip Stage-Aware Navigation
 * 
 * Centralized logic for determining trip primary stage and routing behavior.
 * Ensures consistent navigation across dashboard, trip cards, and trip detail pages.
 */

/**
 * Primary stage enum - represents the main phase a trip is in
 */
export const TripPrimaryStage = {
  PROPOSED: 'PROPOSED',           // Trip created, dates not locked
  DATES_LOCKED: 'DATES_LOCKED',   // Dates finalized, itinerary not finalized
  ITINERARY: 'ITINERARY',         // Itinerary finalized, stay not chosen
  STAY: 'STAY',                   // Accommodation chosen, prep not started
  PREP: 'PREP',                   // Prep started, trip not ongoing
  ONGOING: 'ONGOING',             // Trip dates are active (today within range)
  COMPLETED: 'COMPLETED'          // Trip end date has passed
}

/**
 * Tab route keys used in trip detail navigation
 */
export const TripTabKey = {
  PLANNING: 'planning',
  ITINERARY: 'itinerary',
  ACCOMMODATION: 'accommodation',
  PREP: 'prep',
  MEMORIES: 'memories',
  CHAT: 'chat'
}

/**
 * Default route for each stage
 * These routes are relative to the trip base URL: /trips/[tripId]
 * The actual implementation redirects to /?tripId=X which loads TripDetailView
 * with the appropriate tab active based on stage.
 */
export const DEFAULT_ROUTE_BY_STAGE = {
  [TripPrimaryStage.PROPOSED]: '/trips/{tripId}', // Will redirect to planning view
  [TripPrimaryStage.DATES_LOCKED]: '/trips/{tripId}', // Will redirect to itinerary view
  [TripPrimaryStage.ITINERARY]: '/trips/{tripId}', // Will redirect to itinerary view
  [TripPrimaryStage.STAY]: '/trips/{tripId}', // Will redirect to accommodation view
  [TripPrimaryStage.PREP]: '/trips/{tripId}', // Will redirect to prep view
  [TripPrimaryStage.ONGOING]: '/trips/{tripId}', // Will redirect to chat view
  [TripPrimaryStage.COMPLETED]: '/trips/{tripId}' // Will redirect to memories view
}

/**
 * Get default route for a trip stage
 * @param {string} tripId - Trip ID
 * @param {string} stage - TripPrimaryStage value
 * @returns {string} Route path
 */
export function getDefaultRouteForStage(tripId, stage) {
  const routeTemplate = DEFAULT_ROUTE_BY_STAGE[stage] || DEFAULT_ROUTE_BY_STAGE[TripPrimaryStage.PROPOSED]
  return routeTemplate.replace('{tripId}', tripId)
}

/**
 * Get primary tab for a stage (used for highlighting in mini nav)
 * @param {string} stage - TripPrimaryStage value
 * @returns {string} Tab key
 */
export function getPrimaryTabForStage(stage) {
  switch (stage) {
    case TripPrimaryStage.PROPOSED:
      return TripTabKey.PLANNING
    case TripPrimaryStage.DATES_LOCKED:
      return TripTabKey.ITINERARY
    case TripPrimaryStage.ITINERARY:
      return TripTabKey.ACCOMMODATION
    case TripPrimaryStage.STAY:
      return TripTabKey.ACCOMMODATION
    case TripPrimaryStage.PREP:
      return TripTabKey.PREP
    case TripPrimaryStage.ONGOING:
      return TripTabKey.CHAT
    case TripPrimaryStage.COMPLETED:
      return TripTabKey.MEMORIES
    default:
      return TripTabKey.PLANNING
  }
}

/**
 * Check if a tab is allowed for a given stage
 * @param {string} tab - Tab key
 * @param {string} stage - TripPrimaryStage value
 * @returns {boolean} True if tab is allowed
 */
export function isTabAllowedForStage(tab, stage) {
  // All tabs are always accessible, but some may show completed state
  // Planning: allowed in PROPOSED, read-only summary in DATES_LOCKED+
  // Itinerary: allowed from DATES_LOCKED onward
  // Memories: always allowed
  // Chat: always allowed
  
  if (tab === TripTabKey.PLANNING) {
    // Planning is most useful in PROPOSED, but can be viewed later as read-only
    return true
  }
  
  if (tab === TripTabKey.ITINERARY) {
    // Itinerary is useful once dates are locked
    return stage !== TripPrimaryStage.PROPOSED
  }
  
  if (tab === TripTabKey.ACCOMMODATION) {
    // Accommodation is useful once itinerary is finalized
    return stage === TripPrimaryStage.ITINERARY || stage === TripPrimaryStage.STAY || stage === TripPrimaryStage.PREP
  }
  
  if (tab === TripTabKey.PREP) {
    // Prep is useful once accommodation is done
    return stage === TripPrimaryStage.STAY || stage === TripPrimaryStage.PREP
  }
  
  // Memories and Chat are always allowed
  return true
}

/**
 * Derive trip primary stage from trip data
 * @param {Object} trip - Trip object from API
 * @param {Date} [now] - Current date (for testing)
 * @returns {string} TripPrimaryStage value
 */
export function deriveTripPrimaryStage(trip, now = new Date()) {
  if (!trip) return TripPrimaryStage.PROPOSED
  
  const today = now.toISOString().split('T')[0]
  const { lockedStart, lockedEnd, datesLocked } = getNormalizedTripDates(trip)
  const startDate = lockedStart || trip.startDate
  const endDate = lockedEnd || trip.endDate
  
  // Check if trip is completed (end date has passed)
  if (endDate && endDate < today) {
    return TripPrimaryStage.COMPLETED
  }
  
  // Check if trip is ongoing (today is within date range)
  if (startDate && endDate && today >= startDate && today <= endDate) {
    return TripPrimaryStage.ONGOING
  }
  
  // Check if dates are locked
  const datesLockedResolved = datesLocked
  
  if (!datesLockedResolved) {
    return TripPrimaryStage.PROPOSED
  }
  
  // Dates are locked - check itinerary status
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  
  if (!itineraryFinalized) {
    return TripPrimaryStage.DATES_LOCKED
  }
  
  // Itinerary is finalized - check accommodation
  // Accommodation is done when all stay requirements have selected accommodations
  // This is computed server-side and passed via trip.progress?.steps?.accommodationChosen
  const accommodationChosen = trip.progress?.steps?.accommodationChosen || false
  
  if (!accommodationChosen) {
    return TripPrimaryStage.ITINERARY
  }
  
  // Accommodation chosen - check prep status
  // Prep is started when trip.prepStatus is 'in_progress' or 'complete', or progress.prepStartedAt exists
  const prepStatus = trip.prepStatus || 'not_started'
  const prepStarted = prepStatus === 'in_progress' || prepStatus === 'complete' || trip.progress?.steps?.prepStarted || false
  
  if (!prepStarted) {
    return TripPrimaryStage.STAY
  }
  
  return TripPrimaryStage.PREP
}

/**
 * Compute progress flags from trip data
 * @param {Object} trip - Trip object from API
 * @param {Date} [now] - Current date (for testing)
 * @returns {Object} Progress flags
 */
export function computeProgressFlags(trip, now = new Date()) {
  if (!trip) {
    return {
      isProposedDone: false,
      isDatesDone: false,
      isItineraryDone: false,
      isStayDone: false,
      isPrepDone: false,
      isOngoing: false
    }
  }
  
  const today = now.toISOString().split('T')[0]
  const startDate = trip.lockedStartDate || trip.startDate
  const endDate = trip.lockedEndDate || trip.endDate
  
  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  
  // Accommodation done: computed from stay requirements (passed via trip.progress)
  const isAccommodationDone = trip.progress?.steps?.accommodationChosen || false
  
  // Prep done: check trip.prepStatus or progress flag
  const prepStatus = trip.prepStatus || 'not_started'
  const isPrepDone = prepStatus === 'complete' || trip.progress?.steps?.prepStarted || false
  
  return {
    isProposedDone: true, // Trip exists
    isDatesDone: datesLocked,
    isItineraryDone: itineraryFinalized,
    isStayDone: isAccommodationDone,
    isPrepDone: isPrepDone,
    isOngoing: startDate && endDate && today >= startDate && today <= endDate
  }
}

// Note: getNextActionableRoute has been removed.
