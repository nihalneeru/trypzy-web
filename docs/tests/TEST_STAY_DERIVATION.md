# Stay Requirements Derivation Test Steps

## Overview
This document outlines manual test steps for verifying the itinerary → accommodation needs derivation feature.

### Prerequisites
- User logged in with trip leader permissions
- At least one trip with locked dates
- Ability to generate/select itineraries

---

## Test 1: Generate Itinerary → Stay Requirements Created
**Goal**: Verify that generating an itinerary automatically creates stay requirements

**Steps**:
1. Navigate to a locked trip
2. Go to Itinerary tab
3. Add some itinerary ideas (optional)
4. Click "Generate Itinerary"
5. Wait for generation to complete
6. Navigate to Accommodation tab

**Expected**:
- Stay segments appear in the left panel
- Each segment shows:
  - Location name (derived from itinerary day blocks)
  - Date range (from itinerary day dates or trip locked dates)
  - Number of nights
  - Status badge (Pending/Covered/Outdated)
- Chat shows system event: "🏨 Accommodation needed: [Location] (X nights), ..."
- Stay segments are sorted by start date

---

## Test 2: Add Accommodation Option
**Goal**: Verify that members can add accommodation options for stay segments

**Steps**:
1. Navigate to Accommodation tab
2. Select a stay segment from the left panel
3. Click "Add Option"
4. Fill in form:
   - Source: Airbnb
   - Title: "Cozy apartment in Florence"
   - URL: "https://airbnb.com/..."
   - Price Range: "$100-150/night" (optional)
   - Sleep Capacity: 4 (optional)
   - Notes: "Great location" (optional)
5. Click "Add Option"
6. Check Trip Chat

**Expected**:
- Option appears in the options list for that stay segment
- Shows source badge, title, added by info
- Chat shows system event: "[User] added an accommodation option: [Title]"
- Option is visible to all trip members

---

## Test 3: Select Accommodation (Leader Only)
**Goal**: Verify that trip leader can select an accommodation option

**Steps**:
1. As trip leader, navigate to Accommodation tab
2. Select a stay segment that has options
3. Click "Select" button on an accommodation option
4. Check stay segment status
5. Check Trip Chat

**Expected**:
- Selected option shows "Selected" badge (green)
- Stay segment shows "Covered" badge
- Other options for same stay segment are unselected
- Chat shows system event: "✅ [Title] selected as accommodation for this stay segment"
- Only one option can be selected per stay segment at a time

---

## Test 4: Search on Airbnb Button
**Goal**: Verify that "Search on Airbnb" opens correct search URL

**Steps**:
1. Navigate to Accommodation tab
2. Select a stay segment with dates
3. Click "Search on Airbnb" button
4. Verify new tab opens

**Expected**:
- New tab opens with Airbnb search
- URL includes:
  - Location name as query
  - Check-in date (startDate)
  - Check-out date (endDate)
- Search results are relevant to the location and dates

---

## Test 5: Revise Itinerary → Stay Requirements Updated
**Goal**: Verify that revising an itinerary updates stay requirements without duplicates

**Steps**:
1. Generate an itinerary (creates initial stays)
2. Note the stay segments created
3. Add an accommodation option to one stay segment
4. Revise the itinerary (change some locations/dates)
5. Navigate to Accommodation tab
6. Check stay segments

**Expected**:
- Stay segments are updated to match new itinerary
- Stay segment with accommodation option is marked "Outdated" (not deleted)
- New stay segments are created for new locations
- No duplicate stay segments
- Chat shows updated stay requirements summary

---

## Test 6: Finalize Itinerary → Stay Requirements Synced
**Goal**: Verify that selecting/finalizing an itinerary syncs stay requirements

**Steps**:
1. Generate an itinerary (or have one published)
2. Select an itinerary as final (if using itinerary selection flow)
3. Navigate to Accommodation tab
4. Check stay segments

**Expected**:
- Stay segments are created/updated based on selected itinerary
- Chat shows stay requirements summary
- Accommodation tab becomes the default landing tab (stage-aware navigation)

---

## Test 7: Empty State (No Itinerary)
**Goal**: Verify empty state when no itinerary exists

**Steps**:
1. Navigate to a locked trip with no itinerary generated
2. Go to Accommodation tab

**Expected**:
- Shows empty state message
- Message: "No stay segments yet. Generate an itinerary to automatically create accommodation needs"
- No stay segments displayed

---

## Test 8: Manual Accommodation Entry
**Goal**: Verify that manual accommodation entries work without URL

**Steps**:
1. Navigate to Accommodation tab
2. Select a stay segment
3. Click "Add Option"
4. Select Source: "Manual Entry"
5. Fill in Title and Notes (no URL required)
6. Click "Add Option"

**Expected**:
- Option is created successfully
- No URL field required for Manual source
- Option appears in list without "View listing" link

---

## Test 9: Multiple Stay Segments
**Goal**: Verify handling of trips with multiple location changes

**Steps**:
1. Generate an itinerary with multiple locations (e.g., Florence → Rome → Venice)
2. Navigate to Accommodation tab

**Expected**:
- Multiple stay segments appear (one per location)
- Each segment shows correct dates and nights
- Segments are sorted chronologically
- Can select different segments to see their options

---

## Test 10: Stay Segment Status Updates
**Goal**: Verify that stay segment status updates correctly

**Steps**:
1. Create a stay segment (via itinerary generation)
2. Verify status is "Pending"
3. Add an accommodation option
4. Select that option (as leader)
5. Check stay segment status

**Expected**:
- Initially: "Pending" badge
- After selection: "Covered" badge with checkmark
- Stay requirement status field updated to "covered"

---

## Edge Cases

### Edge Case 1: Itinerary Days Without Locations
**Steps**:
1. Generate itinerary where some days have no location in blocks
2. Check stay requirements

**Expected**:
- Days without locations use fallback destination or "TBD"
- Stay requirement still created for those days

### Edge Case 2: Single Day Trip
**Steps**:
1. Create trip with 1 day duration
2. Generate itinerary
3. Check stay requirements

**Expected**:
- Stay requirement created with at least 1 night
- Dates calculated correctly

### Edge Case 3: Itinerary Changes After Accommodation Selected
**Steps**:
1. Generate itinerary → creates stays
2. Select accommodation for a stay
3. Revise itinerary (change that stay's location)
4. Check accommodation and stay

**Expected**:
- Original stay marked "Outdated"
- New stay created for new location
- Selected accommodation remains linked to old stay (not deleted)
- Leader can see both old and new stays

---

## Validation Checklist

- [ ] Stay requirements created on itinerary generation
- [ ] Stay requirements updated on itinerary revision
- [ ] Stay requirements synced on itinerary finalization
- [ ] Chat events logged for all actions
- [ ] Accommodation options can be added by any member
- [ ] Only leader can select accommodations
- [ ] Airbnb search URL works correctly
- [ ] Stay segments show correct status badges
- [ ] No duplicate stay segments created
- [ ] Outdated stays preserved when they have accommodations
- [ ] Build passes: `npm run build`
- [ ] No console errors in browser

---

## Example Stay Requirements Output

For an itinerary with:
- Day 1-3: Florence
- Day 4-5: Rome

Expected stay segments:
1. Florence — May 10-13 (3 nights) — Pending
2. Rome — May 13-15 (2 nights) — Pending

After selecting accommodation for Florence:
1. Florence — May 10-13 (3 nights) — Covered ✅
2. Rome — May 13-15 (2 nights) — Pending
