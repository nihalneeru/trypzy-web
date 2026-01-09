# Availability API Documentation

## POST /api/trips/:id/availability

Backend endpoint for submitting availability. Supports three payload formats for backward compatibility and broad/coarse availability submissions.

### Payload Formats

#### Format 1: Per-Day Availability (Existing)
Traditional per-day availability submission. Each day in the trip range can be marked individually.

```json
{
  "availabilities": [
    { "day": "2024-06-01", "status": "available" },
    { "day": "2024-06-02", "status": "maybe" },
    { "day": "2024-06-03", "status": "unavailable" }
  ]
}
```

**Fields:**
- `availabilities` (array, required): Array of day-level availability records
  - `day` (string, required): Date in `YYYY-MM-DD` format, must be within trip date range
  - `status` (string, required): One of `"available"`, `"maybe"`, `"unavailable"`

#### Format 2: Broad Range Availability (New)
Single status applying to the entire trip date window. Useful for large date ranges (>30 days).

```json
{
  "broadStatus": "available"
}
```

**Fields:**
- `broadStatus` (string, required): One of `"available"`, `"maybe"`, `"unavailable"`
  - Applies to all days from `trip.startDate` to `trip.endDate`

#### Format 3: Weekly Block Availability (New)
Array of weekly blocks with date ranges. Useful for very large date ranges (>90 days).

```json
{
  "weeklyBlocks": [
    {
      "startDate": "2024-06-01",
      "endDate": "2024-06-07",
      "status": "available"
    },
    {
      "startDate": "2024-06-08",
      "endDate": "2024-06-14",
      "status": "maybe"
    },
    {
      "startDate": "2024-06-15",
      "endDate": "2024-06-21",
      "status": "unavailable"
    }
  ]
}
```

**Fields:**
- `weeklyBlocks` (array, required): Array of weekly block records
  - `startDate` (string, required): Start date in `YYYY-MM-DD` format, must be within trip date range
  - `endDate` (string, required): End date in `YYYY-MM-DD` format, must be within trip date range
  - `status` (string, required): One of `"available"`, `"maybe"`, `"unavailable"`
  - `startDate` must be <= `endDate`

#### Format 4: Combined (New)
You can combine formats. Precedence: **per-day > weekly > broad**

```json
{
  "broadStatus": "unavailable",
  "weeklyBlocks": [
    {
      "startDate": "2024-06-01",
      "endDate": "2024-06-14",
      "status": "available"
    }
  ],
  "availabilities": [
    { "day": "2024-06-05", "status": "maybe" }
  ]
}
```

**Precedence Rules:**
1. Per-day records override weekly blocks for those specific days
2. Weekly blocks override broad status for those date ranges
3. Broad status applies to all days not covered by weekly or per-day records

### Response

**Success (200):**
```json
{
  "message": "Availability saved",
  "saved": {
    "broad": true,
    "weekly": 2,
    "perDay": 5
  }
}
```

**Error (400):**
```json
{
  "error": "Must provide availabilities, broadStatus, or weeklyBlocks"
}
```

### Validation Rules

1. At least one of `availabilities`, `broadStatus`, or `weeklyBlocks` must be provided
2. All dates must be within the trip's `startDate` to `endDate` range
3. All status values must be one of: `"available"`, `"maybe"`, `"unavailable"`
4. Weekly block `startDate` must be <= `endDate`
5. Availability cannot be changed if trip status is `"voting"` or `"locked"`

### Storage

All availability data is stored in the `availabilities` collection:

**Per-Day Records:**
```javascript
{
  id: uuid,
  tripId: string,
  userId: string,
  day: 'YYYY-MM-DD',
  status: 'available'|'maybe'|'unavailable',
  createdAt: ISO timestamp
}
```

**Broad Records:**
```javascript
{
  id: uuid,
  tripId: string,
  userId: string,
  day: null,
  isBroad: true,
  status: 'available'|'maybe'|'unavailable',
  createdAt: ISO timestamp
}
```

**Weekly Records:**
```javascript
{
  id: uuid,
  tripId: string,
  userId: string,
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD',
  isWeekly: true,
  status: 'available'|'maybe'|'unavailable',
  createdAt: ISO timestamp
}
```

### Normalization

The backend provides a normalization helper that converts broad/weekly availability to an effective per-day view for consensus calculation. This happens automatically when reading trip data.

**Normalization Precedence:**
1. Per-day records (highest priority)
2. Weekly blocks (medium priority)
3. Broad status (lowest priority)

## GET /api/trips/:id

The GET endpoint automatically normalizes availability data. The `userAvailability` field in the response contains normalized per-day records, making it compatible with existing frontend code.

**Response includes:**
- `availabilities`: All raw availability records (for backend processing)
- `userAvailability`: Normalized per-day records for the current user (for frontend display)


