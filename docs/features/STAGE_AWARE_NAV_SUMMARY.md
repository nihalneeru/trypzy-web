# Stage-Aware Trip Navigation Implementation Summary

## Overview
Implemented stage-aware trip navigation that ensures users land on the most useful sub-page for a trip's current stage, with consistent navigation across dashboard, trip cards, and trip detail pages.

## Files Created

### 1. `lib/trips/stage.js`
**Purpose**: Centralized stage logic module

**Exports**:
- `TripPrimaryStage` enum: PROPOSED, DATES_LOCKED, ITINERARY, STAY, PREP, ONGOING, COMPLETED
- `TripTabKey` constants: planning, itinerary, memories, chat
- `deriveTripPrimaryStage(trip, now)`: Computes primary stage from trip data
- `computeProgressFlags(trip, now)`: Returns progress flags object
- `getPrimaryTabForStage(stage)`: Returns primary tab key for a stage
- `getDefaultRouteForStage(tripId, stage)`: Returns default route path
- `isTabAllowedForStage(tab, stage)`: Checks if tab is allowed for stage

**Stage Derivation Logic**:
- PROPOSED: Dates not locked (status !== 'locked' && no lockedStartDate/lockedEndDate)
- DATES_LOCKED: Dates locked but itinerary not finalized
- ITINERARY: Itinerary finalized but accommodation not chosen
- STAY: Accommodation chosen but prep not started
- PREP: Prep started but trip not ongoing
- ONGOING: Today is within trip date range
- COMPLETED: End date has passed

### 2. `lib/trips/getTripWithStage.js`
**Purpose**: Server-side function to fetch trip with computed stage

**Exports**:
- `getTripWithStage(tripId, userId)`: Fetches trip, computes stage, returns {trip, stage, progress}

**Note**: Currently not used in client-side routing system, but available for future server-side rendering.

### 3. `docs/tests/TRIP_NAV_TEST_STEPS.md`
**Purpose**: Manual test steps for QA verification

## Files Modified

### 1. `app/page.js`
**Changes**:
- **Imports**: Added stage-related imports from `lib/trips/stage.js`
- **openTrip function**: 
  - Computes stage and primary tab when loading trip
  - Stores `_computedStage`, `_primaryTab`, and `_progressFlags` on trip object
- **TripDetailView component**:
  - Computes stage and primary tab from trip data
  - Initializes `activeTab` based on primary tab for stage
  - Adds soft redirect: if user manually navigates to planning tab after dates locked, redirects to itinerary
  - Updates tab change handler to prevent redirect loops
- **Mini Nav Tabs**:
  - Added primary tab indicator (blue dot) when primaryTab !== activeTab
  - Shows indicator on Planning, Itinerary, Memories, and Chat tabs
- **Planning Tab Content**:
  - Shows completed summary with "Dates Locked" message when dates are locked
  - Includes "Continue to Itinerary" button
- **Chat Tab**:
  - Added stage-aware context hints:
    - PROPOSED: "Discuss dates and availability"
    - DATES_LOCKED/ITINERARY: "Discuss itinerary ideas"
    - STAY/PREP: "Coordinate trip preparation"
    - ONGOING: "Coordinate live plans"
    - COMPLETED: "Share trip memories"
-- **TripProgress component**:
  - Accepts `onSwitchTab` callback prop
  - Computes and displays stage progress
  - Highlights the next incomplete step visually (no navigation button)

### 2. `app/trips/[tripId]/page.js`
**Status**: No changes needed - already redirects to `/?tripId=${tripId}` which loads trip with stage-aware tab selection

### 3. `lib/dashboard/getTripPrimaryHref.js`
**Status**: Already uses `/trips/${tripId}` - no changes needed

### 4. `components/dashboard/TripCard.jsx`
**Status**: Already uses `getTripPrimaryHref` which returns `/trips/${tripId}` - no changes needed

## Stage Mapping

| Stage | Primary Tab | Default Route | Description |
|-------|-------------|---------------|-------------|
| PROPOSED | planning | `/trips/{tripId}` | Date picking/availability |
| DATES_LOCKED | itinerary | `/trips/{tripId}` | Itinerary planning |
| ITINERARY | itinerary | `/trips/{tripId}` | Itinerary finalized, accommodation next |
| STAY | itinerary | `/trips/{tripId}` | Accommodation chosen (maps to itinerary until stay route exists) |
| PREP | itinerary | `/trips/{tripId}` | Prep started (maps to itinerary until prep route exists) |
| ONGOING | chat | `/trips/{tripId}` | Trip is active, coordinate live |
| COMPLETED | memories | `/trips/{tripId}` | Trip ended, share memories |

## Key Features

1. **Deterministic Landing**: Clicking a trip card always lands on the appropriate tab for the trip's stage
2. **Primary Tab Highlighting**: Mini nav shows a blue dot indicator on the primary tab when user is on a different tab
3. **Soft Redirects**: Planning tab shows completed summary when dates are locked (doesn't force redirect to avoid jarring UX)
4. **Stage-Aware Chat Hints**: Chat shows contextual hints based on trip stage
5. **Consistent Navigation**: All entrypoint links use `/trips/{tripId}` which redirects stage-aware

## Testing

See `docs/tests/TRIP_NAV_TEST_STEPS.md` for comprehensive manual test steps.

## Notes

- Stay and Prep stages currently map to itinerary route (no dedicated routes yet)
- Progress flags for accommodation and prep require progress API data
- Chat hints are optional and can be dismissed
- Planning tab shows completed summary when dates are locked (user-friendly alternative to hard redirect)
- All trip links already use `/trips/{tripId}` - no changes needed to entrypoint links
