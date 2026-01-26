# Surface Nudge Engine to Users

## Summary

The nudge engine (`lib/nudges/`) was fully built but never surfaced — no client code called the `GET /api/trips/:tripId/nudges` endpoint. This PR wires the existing backend to the UI so nudges appear as styled system messages in trip chat.

### What changed

- **CommandCenterV2**: Fires a single `GET /api/trips/:id/nudges` fetch on mount and when `trip.status` changes. Fire-and-forget — the backend persists chat_card nudges as system messages in `trip_messages`, which appear via existing 5-second chat polling.
- **ChatTab**: Nudge system messages (`subtype: 'nudge'`) render with `bg-brand-sand/60` styling, visually distinct from regular gray system messages.
- **Discovery doc**: `docs/NUDGE_ENGINE_SURFACING.md` documents the engine architecture, all 8 nudge types, and root cause.
- **Tests**: 7 integration tests covering nudge production, dedupe, and chat card creation.

### Nudge types surfaced

| Type | Channel | Audience | Trigger |
|------|---------|----------|---------|
| `first_availability_submitted` | chat_card | ALL | First person submits availability |
| `availability_half_submitted` | chat_card | ALL | 50%+ travelers submitted |
| `strong_overlap_detected` | chat_card | ALL | Best overlap >= 60% coverage |
| `dates_locked` | chat_card | ALL | Dates are locked |
| `leader_ready_to_propose` | cta_highlight | LEADER | Good overlap, no proposal yet |
| `leader_can_lock_dates` | cta_highlight | LEADER | Proposed dates have support |

### Dedupe strategy

- Backend checks `nudge_events` collection for cooldown (hours-based per nudge type)
- `createChatCardMessage()` checks `metadata.eventKey` before inserting to prevent duplicate chat messages
- Client uses a ref (`nudgesFetchedRef`) keyed on `tripId:status` to avoid redundant API calls within a session

### Rollback plan

Set `NEXT_PUBLIC_NUDGES_ENABLED=false` in environment variables. The fetch is skipped entirely and no nudges are produced. Existing chat messages remain but no new ones are created.

## Test results

```
Tests:     708 passed, 4 failed (pre-existing), 17 skipped
Nudge tests: 53/53 passed (4 files)
Build:     Passes cleanly
```

Pre-existing failures (not introduced by this PR):
- `date-windows.test.js` — lock-proposed status assertion
- `trip-date-proposal.test.js` — schedulingMode default changed
- `getBlockingUsers.test.js` — 2 copy mismatches from prior PRs

## Test plan

- [ ] Load a trip in `proposed` status — no nudges fired (no availability yet)
- [ ] Submit first availability on a trip — `FIRST_AVAILABILITY_SUBMITTED` chat card appears
- [ ] Submit 50%+ availability — `AVAILABILITY_HALF_SUBMITTED` chat card appears
- [ ] Lock dates — `DATES_LOCKED` chat card appears after refresh
- [ ] Reload page — no duplicate nudge messages in chat
- [ ] Set `NEXT_PUBLIC_NUDGES_ENABLED=false` — no nudge fetch occurs
- [ ] Nudge messages render with sand background, distinct from gray system messages
