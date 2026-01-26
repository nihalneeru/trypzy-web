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

## Test plan

- [x] `npm run build` passes
- [x] `npx vitest run` — no new test failures (4 pre-existing failures unrelated to this PR)
- [x] New guardrail tests all pass
- [ ] Manual: verify canceled trip shows "Back to dashboard" link
- [ ] Manual: verify non-leader sees "Dates in progress" CTA after submitting availability
- [ ] Manual: verify Discover button visible on mobile dashboard
