# Trip Navigation Test Steps

## Stage-Aware Trip Navigation Testing

This document outlines manual test steps for verifying stage-aware trip navigation functionality.

### Prerequisites
- User logged in with access to at least one circle
- At least one trip in different stages (proposed, dates locked, ongoing, completed)

---

## Test 1: Proposed Trip Landing
**Goal**: Verify that clicking a proposed trip lands on the planning/date picking view

**Steps**:
1. Navigate to `/dashboard`
2. Find a trip with status "proposed" or "scheduling" (dates not locked)
3. Click the trip card
4. **Expected**: 
   - Lands on trip detail page
   - "Planning" tab is active (highlighted)
   - Planning tab shows date picking interface (heatmap or availability)
   - Primary tab indicator (blue dot) shows on Planning tab if user navigates away

---

## Test 2: Dates Locked Trip Landing
**Goal**: Verify that clicking a trip with locked dates lands on itinerary view

**Steps**:
1. Navigate to `/dashboard`
2. Find a trip with status "locked" (dates finalized)
3. Click the trip card
4. **Expected**:
   - Lands on trip detail page
   - "Itinerary" tab is active (highlighted)
   - Itinerary tab shows itinerary planning interface
   - Primary tab indicator shows on Itinerary tab if user navigates away

---

## Test 3: Ongoing Trip Landing
**Goal**: Verify that clicking an ongoing trip lands on chat view

**Steps**:
1. Navigate to `/dashboard`
2. Find a trip where today's date is within the trip date range (lockedStartDate <= today <= lockedEndDate)
3. Click the trip card
4. **Expected**:
   - Lands on trip detail page
   - "Chat" tab is active (highlighted)
   - Chat tab shows trip chat interface
   - Primary tab indicator shows on Chat tab if user navigates away

---

## Test 4: Completed Trip Landing
**Goal**: Verify that clicking a completed trip lands on memories view

**Steps**:
1. Navigate to `/dashboard`
2. Find a trip where end date has passed
3. Click the trip card
4. **Expected**:
   - Lands on trip detail page
   - "Memories" tab is active (highlighted)
   - Memories tab shows trip memories interface
   - Primary tab indicator shows on Memories tab if user navigates away

---

## Test 5: Soft Redirect from Planning Tab (After Dates Locked)
**Goal**: Verify that manually navigating to planning tab after dates are locked redirects or shows completed state

**Steps**:
1. Navigate to a trip with locked dates (should land on itinerary tab)
2. Manually click the "Planning" tab
3. **Expected**:
   - Either redirects to itinerary tab, OR
   - Shows completed summary with "Dates Locked" message and "Continue to Itinerary" button

---

## Test 6: Mini Nav Primary Tab Indicator
**Goal**: Verify that primary tab indicator (blue dot) appears correctly

**Steps**:
1. Navigate to a trip (any stage)
2. Note which tab is the primary tab for the current stage
3. Click a different tab
4. **Expected**:
   - Primary tab shows a small blue dot indicator
   - Active tab shows normal active styling (no dot)
   - Dot disappears when primary tab becomes active

---

## Test 8: Chat Context Hints
**Goal**: Verify that chat shows stage-appropriate context hints

**Steps**:
1. Navigate to a trip in PROPOSED stage
2. Click "Chat" tab
3. **Expected**: Hint shows "Discuss dates and availability"

**Steps**:
1. Navigate to a trip with DATES_LOCKED stage
2. Click "Chat" tab
3. **Expected**: Hint shows "Discuss itinerary ideas"

**Steps**:
1. Navigate to an ONGOING trip
2. Click "Chat" tab
3. **Expected**: Hint shows "Coordinate live plans"

---

## Test 9: Deep Links Still Work
**Goal**: Verify that direct links to `/trips/[tripId]` still work

**Steps**:
1. Copy a trip ID from the dashboard
2. Navigate directly to `/trips/[tripId]`
3. **Expected**:
   - Redirects to `/?tripId=[tripId]`
   - Loads trip detail page
   - Lands on appropriate tab based on stage

---

## Test 10: Breadcrumb Navigation
**Goal**: Verify breadcrumb links return to dashboard correctly

**Steps**:
1. Navigate to a trip from dashboard
2. Check breadcrumb shows "Dashboard > [Circle Name] > [Trip Name]"
3. Click "Dashboard" in breadcrumb
4. **Expected**: Returns to `/dashboard`

**Steps**:
1. Navigate to a trip from dashboard
2. Click circle name in breadcrumb
3. **Expected**: Returns to `/dashboard#circle-[circleId]` (scrolls to circle section)

---

## Test 11: Entrypoint Links Consistency
**Goal**: Verify all trip entrypoints use stage-aware routing

**Steps**:
1. Check trip card links on dashboard
2. Check trip links in notifications
3. Check trip links in circle detail page
4. **Expected**: All links point to `/trips/[tripId]` (not hardcoded planning page)

---

## Test 12: Progress Pane Stage Consistency
**Goal**: Verify progress pane and mini nav never disagree

**Steps**:
1. Navigate to a trip
2. Check which step is marked "Next" in progress pane
3. Check which tab has the primary indicator
4. **Expected**:
   - Progress pane "Next" step corresponds to the primary tab
   - No inconsistencies between progress pane and tab highlighting

---

## Known Limitations / Notes

- Stay and Prep stages may not have dedicated routes yet - they map to itinerary route
- Progress flags for accommodation and prep require progress API data
- Chat hints are optional and can be dismissed
- Planning tab shows completed summary when dates are locked (doesn't redirect immediately to avoid jarring UX)
