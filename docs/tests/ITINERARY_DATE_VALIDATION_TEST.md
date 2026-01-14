# Itinerary Date Validation Integration Test

## Overview
This document describes manual integration test steps to verify that itinerary generation and revision always produce dates that exactly match the locked trip date range.

## Prerequisites
- Trip must be in `locked` status
- Trip must have `lockedStartDate` and `lockedEndDate` set (or `startDate` and `endDate` as fallback)

## Test Case 1: Generate Itinerary with Exact Date Match

### Steps
1. Create a trip and lock dates (e.g., 2026-05-08 to 2026-05-10)
2. Add some trip ideas
3. Call `POST /api/trips/{tripId}/itinerary/generate`
4. Verify response

### Expected Results
- Itinerary is generated successfully
- `itinerary.days` array has exactly 3 day objects
- First day has `date: "2026-05-08"`
- Last day has `date: "2026-05-10"`
- All dates are in YYYY-MM-DD format
- No dates outside the range
- No missing dates

### Verification
```bash
# Check itinerary structure
GET /api/trips/{tripId}/itinerary

# Verify:
# - days.length === 3
# - days[0].date === "2026-05-08"
# - days[1].date === "2026-05-09"
# - days[2].date === "2026-05-10"
```

## Test Case 2: Generate Itinerary with Missing Locked Dates

### Steps
1. Create a trip in `locked` status but without `lockedStartDate`/`lockedEndDate`
2. Attempt to generate itinerary
3. Verify error response

### Expected Results
- Request fails with 400 status
- Error message: "Trip must have locked start and end dates to generate itinerary"

## Test Case 3: Revise Itinerary Preserves Date Range

### Steps
1. Generate an itinerary for trip dates 2026-05-08 to 2026-05-10
2. Add feedback requesting changes
3. Call `POST /api/trips/{tripId}/itinerary/revise`
4. Verify revised itinerary

### Expected Results
- Revision succeeds
- Revised itinerary has same date range (2026-05-08 to 2026-05-10)
- Same number of days (3)
- Dates match exactly
- Content changes are applied but dates remain unchanged

## Test Case 4: LLM Returns Wrong Dates (Normalization Test)

### Steps
1. Mock LLM to return wrong dates or wrong number of days
2. Generate itinerary
3. Verify normalization fixes the dates

### Expected Results
- Itinerary is normalized server-side
- Final saved itinerary has correct dates
- Dev-only warning logged (if NODE_ENV !== 'production')

### Note
This test requires mocking the LLM response. In production, the normalization ensures that even if the LLM makes mistakes, the final itinerary is correct.

## Test Case 5: Single Day Trip

### Steps
1. Lock trip dates to same day (e.g., 2026-05-08 to 2026-05-08)
2. Generate itinerary
3. Verify single day is created

### Expected Results
- Itinerary has exactly 1 day
- Day date is "2026-05-08"

## Test Case 6: Week-Long Trip

### Steps
1. Lock trip dates for 7 days (e.g., 2026-05-08 to 2026-05-14)
2. Generate itinerary
3. Verify all 7 days are created

### Expected Results
- Itinerary has exactly 7 days
- Dates are consecutive: 2026-05-08, 2026-05-09, ..., 2026-05-14
- No gaps or duplicates

## Test Case 7: Month Boundary Crossing

### Steps
1. Lock trip dates crossing month boundary (e.g., 2026-05-30 to 2026-06-02)
2. Generate itinerary
3. Verify dates handle month transition correctly

### Expected Results
- Itinerary has 4 days
- Dates: 2026-05-30, 2026-05-31, 2026-06-01, 2026-06-02
- Month transition handled correctly

## Automated Unit Tests

Unit tests are available in `tests/itinerary/dateList.test.js`:

- `buildTripDateList()` - Tests date list generation
- `validateItineraryDates()` - Tests date validation
- `normalizeItineraryDates()` - Tests date normalization

Run tests:
```bash
npm run test -- tests/itinerary/dateList.test.js
```

## Implementation Details

### Date List Generation
- `lib/itinerary/buildTripDateList.js` - Generates canonical date array
- Inclusive range: includes both start and end dates
- Returns array of YYYY-MM-DD strings

### Date Normalization
- `lib/itinerary/normalizeItineraryDates.js` - Normalizes itinerary dates
- Fixes wrong dates, missing days, extra days
- Preserves blocks content while fixing dates

### LLM Integration
- `lib/server/llm.js` - Updated to accept `dateList` parameter
- Prompts explicitly list required dates
- Validation and normalization after LLM response

### API Endpoints
- `POST /api/trips/:tripId/itinerary/generate` - Validates locked dates, builds dateList
- `POST /api/trips/:tripId/itinerary/revise` - Preserves date range in revisions
