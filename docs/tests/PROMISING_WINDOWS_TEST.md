# Quick Test Steps for Promising Windows

## Prerequisites

1. Create a collaborative trip with date range (e.g., `2024-06-01` to `2024-06-30`)
2. Have at least 2-3 users in the circle
3. Users should submit availability (broad, weekly, or per-day)

## Quick Test 1: Basic Promising Windows

**Goal:** Verify promising windows are generated and returned.

**Steps:**
1. Create trip: `2024-06-01` to `2024-06-30`, duration: 3 days
2. User A submits: `{ "broadStatus": "available" }`
3. User B submits: `{ "broadStatus": "maybe" }`
4. GET `/api/trips/{tripId}`
5. Check response for `promisingWindows` field

**Expected:**
```json
{
  "promisingWindows": [
    {
      "optionKey": "2024-06-01_2024-06-03",
      "startDate": "2024-06-01",
      "endDate": "2024-06-03",
      "score": 0.75,  // (1.0 + 0.5) / 2 users = 0.75
      "totalScore": 4.5,
      "coverage": 1.0
    },
    // ... 2 more windows
  ]
}
```

**Verify:**
- [ ] `promisingWindows` array exists
- [ ] Contains 2-3 windows
- [ ] Each window has `optionKey`, `startDate`, `endDate`, `score`, `totalScore`, `coverage`
- [ ] Windows are sorted by score (highest first)
- [ ] `consensusOptions` also present (backward compatibility)

## Quick Test 2: Broad Availability Handling

**Goal:** Verify broad availability correctly influences windows.

**Steps:**
1. Create trip: `2024-06-01` to `2024-06-30`
2. User A submits: `{ "broadStatus": "available" }`
3. User B submits: `{ "broadStatus": "available" }`
4. GET trip and check `promisingWindows`

**Expected:**
- All windows should have high scores (close to 1.0)
- Windows should cover the entire date range
- All days should be treated as "available"

## Quick Test 3: Weekly Blocks Handling

**Goal:** Verify weekly blocks correctly influence windows.

**Steps:**
1. Create trip: `2024-06-01` to `2024-07-31` (92 days - triggers weekly mode)
2. User A submits:
   ```json
   {
     "weeklyBlocks": [
       { "startDate": "2024-06-01", "endDate": "2024-06-14", "status": "available" },
       { "startDate": "2024-06-15", "endDate": "2024-06-21", "status": "maybe" }
     ]
   }
   ```
3. User B submits: `{ "broadStatus": "available" }`
4. GET trip and check `promisingWindows`

**Expected:**
- Windows in `2024-06-01` to `2024-06-14` range should have highest scores
- Windows in `2024-06-15` to `2024-06-21` range should have medium scores
- Windows outside these ranges should have lower scores (only User B's broad availability)

## Quick Test 4: Per-Day Override

**Goal:** Verify per-day availability overrides broad/weekly.

**Steps:**
1. Create trip: `2024-06-01` to `2024-06-30`
2. User A submits:
   ```json
   {
     "broadStatus": "unavailable",
     "availabilities": [
       { "day": "2024-06-15", "status": "available" },
       { "day": "2024-06-16", "status": "available" },
       { "day": "2024-06-17", "status": "available" }
     ]
   }
   ```
3. User B submits: `{ "broadStatus": "available" }`
4. GET trip and check `promisingWindows`

**Expected:**
- Window `2024-06-15` to `2024-06-17` should be top window (both users available)
- Other windows should have lower scores (User A mostly unavailable)

## Quick Test 5: Determinism & Stability

**Goal:** Verify windows are deterministic and stable.

**Steps:**
1. Set up trip with availability data
2. GET trip multiple times (5+ requests)
3. Compare `promisingWindows` across requests

**Expected:**
- [ ] Same windows returned every time
- [ ] Same order every time
- [ ] Same scores every time
- [ ] No random variation

## Quick Test 6: Edge Cases

### Test 6a: No Availability Data
1. Create trip
2. Don't submit any availability
3. GET trip

**Expected:** `promisingWindows: []`

### Test 6b: Only One User
1. Create trip with one user
2. Submit availability
3. GET trip

**Expected:** Windows generated, but scores reflect single user

### Test 6c: Locked Trip
1. Create trip and lock it
2. GET trip

**Expected:** `promisingWindows: []` (not generated for locked trips)

### Test 6d: Hosted Trip
1. Create hosted trip
2. GET trip

**Expected:** `promisingWindows: []` (only for collaborative trips)

## Quick Test 7: Window Count

**Goal:** Verify 2-3 windows are returned.

**Steps:**
1. Create trip with good availability coverage
2. Submit availability from multiple users
3. GET trip

**Expected:**
- [ ] At least 2 windows if enough data
- [ ] Up to 3 windows
- [ ] Windows are distinct (different date ranges)

## Verification Checklist

After running tests, verify:

- [ ] `promisingWindows` field exists in GET response
- [ ] Contains 2-3 windows (when data available)
- [ ] Each window has correct shape (optionKey, startDate, endDate, score, etc.)
- [ ] Windows sorted by score (highest first)
- [ ] Broad availability correctly applied to all days
- [ ] Weekly blocks correctly applied to date ranges
- [ ] Per-day availability overrides broad/weekly
- [ ] Deterministic across multiple requests
- [ ] Empty array for locked/hosted trips
- [ ] `consensusOptions` still present (backward compatibility)
- [ ] No errors in console/logs

## API Test Command

```bash
# Get trip with promising windows
curl -X GET "http://localhost:3000/api/trips/{tripId}" \
  -H "Authorization: Bearer {token}" \
  | jq '.promisingWindows'
```

## Expected Output Format

```json
[
  {
    "optionKey": "2024-06-15_2024-06-17",
    "startDate": "2024-06-15",
    "endDate": "2024-06-17",
    "score": 0.85,
    "totalScore": 7.65,
    "coverage": 1.0
  },
  {
    "optionKey": "2024-06-22_2024-06-24",
    "startDate": "2024-06-22",
    "endDate": "2024-06-24",
    "score": 0.72,
    "totalScore": 6.48,
    "coverage": 1.0
  }
]
```





