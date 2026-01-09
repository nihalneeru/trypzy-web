# Manual Test Steps for Broad/Coarse Availability

## Prerequisites

1. Have a collaborative trip created with a date range
2. Be authenticated as a circle member
3. Trip status should be `"proposed"` or `"scheduling"` (not `"voting"` or `"locked"`)

## Test Cases

### Test 1: Broad Range Availability (Single Status)

**Purpose:** Test submitting a single status for the entire trip date range.

**Steps:**
1. Create a trip with date range: `2024-06-01` to `2024-07-31` (61 days - triggers broad mode)
2. Submit availability using broad format:
   ```bash
   POST /api/trips/{tripId}/availability
   {
     "broadStatus": "available"
   }
   ```
3. Verify response: `{ "message": "Availability saved", "saved": { "broad": true, "weekly": 0, "perDay": 0 } }`
4. GET the trip and verify `userAvailability` contains normalized per-day records for all dates
5. Verify consensus calculation includes all days with "available" status

**Expected Result:**
- All days from `2024-06-01` to `2024-07-31` should have status "available" in normalized view
- Consensus should score all date ranges highly

### Test 2: Weekly Block Availability

**Purpose:** Test submitting availability by weekly blocks.

**Steps:**
1. Create a trip with date range: `2024-06-01` to `2024-09-30` (122 days - triggers weekly mode)
2. Submit availability using weekly blocks:
   ```bash
   POST /api/trips/{tripId}/availability
   {
     "weeklyBlocks": [
       { "startDate": "2024-06-01", "endDate": "2024-06-07", "status": "available" },
       { "startDate": "2024-06-08", "endDate": "2024-06-14", "status": "maybe" },
       { "startDate": "2024-06-15", "endDate": "2024-06-21", "status": "unavailable" }
     ]
   }
   ```
3. Verify response shows correct counts
4. GET the trip and verify normalized `userAvailability`:
   - Days `2024-06-01` to `2024-06-07`: "available"
   - Days `2024-06-08` to `2024-06-14`: "maybe"
   - Days `2024-06-15` to `2024-06-21`: "unavailable"
   - Days outside blocks: no records (treated as unavailable in consensus)

**Expected Result:**
- Weekly blocks are correctly normalized to per-day records
- Consensus reflects the weekly pattern

### Test 3: Combined Availability (Precedence Test)

**Purpose:** Test that per-day overrides weekly, which overrides broad.

**Steps:**
1. Create a trip: `2024-06-01` to `2024-07-31`
2. Submit combined availability:
   ```bash
   POST /api/trips/{tripId}/availability
   {
     "broadStatus": "unavailable",
     "weeklyBlocks": [
       { "startDate": "2024-06-01", "endDate": "2024-06-14", "status": "available" }
     ],
     "availabilities": [
       { "day": "2024-06-05", "status": "maybe" }
     ]
   }
   ```
3. GET the trip and verify normalized `userAvailability`:
   - Day `2024-06-05`: "maybe" (per-day override)
   - Days `2024-06-01` to `2024-06-04`, `2024-06-06` to `2024-06-14`: "available" (weekly override)
   - Days `2024-06-15` to `2024-07-31`: "unavailable" (broad default)

**Expected Result:**
- Precedence is correctly applied: per-day > weekly > broad
- Consensus reflects the correct status for each day

### Test 4: Backward Compatibility (Per-Day Only)

**Purpose:** Verify existing per-day submissions still work.

**Steps:**
1. Create a trip: `2024-06-01` to `2024-06-10` (10 days - per-day mode)
2. Submit using existing format:
   ```bash
   POST /api/trips/{tripId}/availability
   {
     "availabilities": [
       { "day": "2024-06-01", "status": "available" },
       { "day": "2024-06-02", "status": "maybe" },
       { "day": "2024-06-03", "status": "unavailable" }
     ]
   }
   ```
3. Verify response and normalized data match exactly

**Expected Result:**
- Existing per-day format works unchanged
- No breaking changes to current functionality

### Test 5: Validation Errors

**Purpose:** Test validation and error handling.

**Test 5a: Missing Payload**
```bash
POST /api/trips/{tripId}/availability
{}
```
**Expected:** 400 error: "Must provide availabilities, broadStatus, or weeklyBlocks"

**Test 5b: Invalid Status**
```bash
POST /api/trips/{tripId}/availability
{
  "broadStatus": "invalid"
}
```
**Expected:** 400 error about invalid status

**Test 5c: Date Outside Range**
```bash
POST /api/trips/{tripId}/availability
{
  "availabilities": [
    { "day": "2025-01-01", "status": "available" }
  ]
}
```
**Expected:** 400 error: "Day 2025-01-01 is outside trip date range"

**Test 5d: Invalid Weekly Block**
```bash
POST /api/trips/{tripId}/availability
{
  "weeklyBlocks": [
    { "startDate": "2024-06-10", "endDate": "2024-06-05", "status": "available" }
  ]
}
```
**Expected:** 400 error: "startDate must be <= endDate"

**Test 5e: Voting/Locked State**
1. Move trip to `"voting"` or `"locked"` status
2. Attempt to submit availability
**Expected:** 400 error: "Availability cannot be changed after voting has started"

### Test 6: Multiple Users with Different Formats

**Purpose:** Test that different users can use different submission formats.

**Steps:**
1. Create a trip: `2024-06-01` to `2024-08-31` (92 days)
2. User A submits broad: `{ "broadStatus": "available" }`
3. User B submits weekly: `{ "weeklyBlocks": [...] }`
4. User C submits per-day: `{ "availabilities": [...] }`
5. Verify consensus calculation includes all three users correctly
6. Each user's normalized view should show their own availability correctly

**Expected Result:**
- All three formats work simultaneously
- Consensus correctly combines all users' availability
- Each user sees their own normalized availability

### Test 7: Update Availability (Replace Previous)

**Purpose:** Test that new submission replaces previous availability.

**Steps:**
1. Submit broad: `{ "broadStatus": "available" }`
2. Verify all days are "available"
3. Submit weekly: `{ "weeklyBlocks": [{ "startDate": "2024-06-01", "endDate": "2024-06-07", "status": "maybe" }] }`
4. Verify:
   - Previous broad availability is deleted
   - Only the weekly block is present
   - Days outside weekly block have no records

**Expected Result:**
- Previous submission is completely replaced
- No duplicate or conflicting records

### Test 8: Frontend Integration

**Purpose:** Verify frontend can read and display normalized availability.

**Steps:**
1. Submit availability using any format (broad, weekly, or per-day)
2. Open trip detail view in frontend
3. Verify:
   - `userAvailability` array is populated with per-day records
   - UI correctly displays availability status
   - Consensus options are calculated correctly
   - No frontend errors

**Expected Result:**
- Frontend receives normalized per-day records
- UI displays correctly regardless of submission format
- No breaking changes to frontend code

## Edge Cases

### Edge Case 1: Empty Weekly Blocks Array
```json
{
  "weeklyBlocks": []
}
```
**Expected:** 400 error (at least one format must have data)

### Edge Case 2: Overlapping Weekly Blocks
```json
{
  "weeklyBlocks": [
    { "startDate": "2024-06-01", "endDate": "2024-06-14", "status": "available" },
    { "startDate": "2024-06-10", "endDate": "2024-06-21", "status": "maybe" }
  ]
}
```
**Expected:** Both blocks stored, later block's status applies to overlapping days (order-dependent)

### Edge Case 3: Single Day Weekly Block
```json
{
  "weeklyBlocks": [
    { "startDate": "2024-06-01", "endDate": "2024-06-01", "status": "available" }
  ]
}
```
**Expected:** Valid (startDate == endDate is allowed)

## Verification Checklist

After running tests, verify:

- [ ] Broad status applies to entire date range
- [ ] Weekly blocks normalize correctly to per-day
- [ ] Per-day records override weekly/broad
- [ ] Weekly blocks override broad
- [ ] Existing per-day format still works
- [ ] Validation errors are clear and helpful
- [ ] Voting/locked state prevents updates
- [ ] Multiple users with different formats work together
- [ ] New submission replaces previous completely
- [ ] Frontend receives normalized data correctly
- [ ] Consensus calculation uses normalized data
- [ ] No database schema changes break existing queries


