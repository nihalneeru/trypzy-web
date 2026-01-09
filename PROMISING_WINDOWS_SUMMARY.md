# Promising Windows Implementation Summary

## Where Windows Are Stored/Computed

**Computed on fetch** (not stored in database):
- **Location:** `app/api/[[...path]]/route.js`
- **Function:** `generatePromisingWindows()` (line ~200)
- **Endpoint:** `GET /api/trips/:id`
- **When:** Every time trip data is fetched
- **Why:** Deterministic, always reflects current availability, no storage overhead

**Storage:** No database storage - computed dynamically from availability data

## Exact Shape Returned to Frontend

**Field name:** `promisingWindows`

**Type:** `Array<PromisingWindow>`

**Shape:**
```typescript
{
  optionKey: string;        // "YYYY-MM-DD_YYYY-MM-DD" format
  startDate: string;        // "YYYY-MM-DD" ISO date
  endDate: string;          // "YYYY-MM-DD" ISO date  
  score: number;            // 0-1 normalized score (higher = better)
  totalScore: number;       // Raw score before normalization
  coverage: number;         // 0-1 fraction of days with data
}
```

**Example:**
```json
{
  "promisingWindows": [
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
}
```

**Count:** 2-3 windows (prefers 3, minimum 2 if available)

## How to Test Quickly

### 1. Setup (30 seconds)
```bash
# Create a collaborative trip via API or UI
# Date range: 2024-06-01 to 2024-06-30
# Duration: 3 days
```

### 2. Submit Availability (30 seconds)
```bash
# User A: Broad availability
POST /api/trips/{tripId}/availability
{
  "broadStatus": "available"
}

# User B: Broad availability  
POST /api/trips/{tripId}/availability
{
  "broadStatus": "maybe"
}
```

### 3. Fetch and Verify (10 seconds)
```bash
GET /api/trips/{tripId}

# Check response for:
{
  "promisingWindows": [
    { "optionKey": "...", "startDate": "...", "endDate": "...", "score": 0.75, ... },
    { ... },
    { ... }
  ]
}
```

### 4. Verify Determinism (10 seconds)
```bash
# Call GET 5 times, verify same windows returned each time
```

**Total time: ~2 minutes**

## Quick Verification Checklist

- [ ] `promisingWindows` field exists in GET response
- [ ] Contains 2-3 windows
- [ ] Each window has: `optionKey`, `startDate`, `endDate`, `score`, `totalScore`, `coverage`
- [ ] Windows sorted by score (highest first)
- [ ] Same windows returned on multiple requests (deterministic)
- [ ] `consensusOptions` also present (backward compatibility)

## Key Features

✅ Uses existing consensus algorithm (no rewrite)  
✅ Works with broad/weekly/per-day availability  
✅ Deterministic and stable  
✅ Computed on fetch (no storage)  
✅ 2-3 windows returned  
✅ Backward compatible (`consensusOptions` still present)


