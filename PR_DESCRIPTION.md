## Summary

Minimal hardening PR that addresses UX dead-ends and adds server-side guardrails identified during the MVP readiness audit. Changes are surgical — no refactors or new abstractions.

### A) UX Polish

- **"Ready" state CTA**: The "Ready to go!" blocker state had `overlayType: null`, making the CTA button a dead click. Changed to open the itinerary overlay with label "View Itinerary".
- **Canceled trip dead-end**: The canceled trip banner showed no navigation option. Added a "Back to dashboard" link so users aren't stranded.
- **Non-leader waiting state**: After a non-leader submits availability (and dates aren't locked), the CTA bar showed nothing. Added a "Dates in progress" informational CTA that opens the scheduling overlay.
- **Discover button on mobile**: The Circles + Discover nav buttons in the dashboard header were hidden on mobile (`hidden md:flex`). Changed to `flex` so they're visible on all screen sizes.

### B) Server Guardrails

- **Block left/removed users from posting messages**: Added a `trip_participants` status check to `POST /trips/:id/messages`. Returns 403 for users with `left` or `removed` status.
- **Canceled trip guards on scheduling endpoints**: Added early-exit guards to 5 scheduling mutation endpoints that were missing canceled-trip checks:
  - `POST /trips/:id/dates/propose`
  - `POST /trips/:id/dates/react`
  - `POST /trips/:id/dates/suggest-adjustments`
  - `POST /trips/:id/proposed-window/react`
  - `POST /trips/:id/lock-proposed`
- **Null date bounds guard**: Added `hasDateBounds` check before calling `getAllNormalizedAvailabilities()`, `calculateConsensus()`, `generatePromisingWindows()`, and `normalizeAvailabilityToPerDay()` in the trip detail GET endpoint. Prevents runtime errors when a trip has no start/end dates yet.

### Tests

- Added `tests/api/guardrails-hardening.test.js` with 5 integration tests:
  - Left user cannot post messages (403)
  - Removed user cannot post messages (403)
  - Canceled trip blocks date proposals (400)
  - Canceled trip blocks date reactions (400)
  - Canceled trip blocks lock-proposed (400)

### C) Codex Follow-up Fixes

Three missed guards and two edge risks identified by Codex review:

- **Canceled-trip guard on `POST /trips/:id/windows/compress`**: Added same early-return pattern used on other scheduling endpoints.
- **Canceled-trip guard on `DELETE /trips/:id/date-windows/:windowId`**: Added same early-return pattern.
- **Null bounds crash in top3_heatmap candidate generation**: Wrapped candidate loop (`new Date(startBound)` / `toISOString()`) in `if (startBound && endBound)` so Trip GET never 500s when a trip has no date bounds.
- **Availability bound comparisons (edge risk #5)**: Guarded per-day and weekly-block range validation (`a.day < trip.startDate`) with `if (trip.startDate && trip.endDate)` so validation is skipped when bounds are missing rather than comparing against `null`.

#### Known remaining risk (documented, not fixed)

- **Message posting guard robustness (edge risk #4)**: The left/removed user block relies on a `trip_participants` record existing. In legacy data, a collaborative trip member who was removed outside the app may lack a `trip_participants` record entirely, bypassing the guard (they'd still pass the circle `memberships` check). Mitigation: run a backfill script to create `trip_participants` records for all circle members in collaborative trips. This was not changed because flipping the logic to require an active record would break legitimate collaborative trip users who don't have explicit participant records.

## Test plan

- [x] `npm run build` — compiled successfully
- [x] `npx vitest run` — 701 passed, 17 skipped, 4 failed (pre-existing, unchanged)
- [x] New guardrail tests all pass (5/5)
- [ ] Manual: verify canceled trip shows "Back to dashboard" link
- [ ] Manual: verify non-leader sees "Dates in progress" CTA after submitting availability
- [ ] Manual: verify Discover button visible on mobile dashboard

### Pre-existing test failures (unchanged by this PR)

1. `tests/api/date-windows.test.js` > should lock dates from proposed window
2. `tests/api/trip-date-proposal.test.js` > allows collaborative trip creation without dates
3. `tests/trips/getBlockingUsers.test.js` > should return leader lock message when everyone responded and user is leader
4. `tests/trips/getBlockingUsers.test.js` > should handle missing pickProgress gracefully
