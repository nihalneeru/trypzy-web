# Nudge Engine Surfacing — Discovery Notes

## Engine Location
- `lib/nudges/NudgeEngine.ts` — Pure function `computeNudges()`, evaluates 6 condition-based nudges (+ 2 on-demand inline hints)
- `lib/nudges/types.ts` — Type definitions (NudgeType, NudgeChannel, NudgeAudience, NudgePriority)
- `lib/nudges/copy.ts` — User-facing text templates, emoji helpers, `buildChatMessage()`
- `lib/nudges/metrics.ts` — `computeTripMetrics()` and `buildViewerContext()` from trip + windows + participants
- `lib/nudges/store.ts` — Dedupe/cooldown via `nudge_events` collection, `createChatCardMessage()` for chat persistence
- `lib/events/types.ts` — Event taxonomy including `NUDGE_SHOWN`, `NUDGE_CLICKED`, `NUDGE_DISMISSED`

## Nudge IDs and Triggers

| # | Type | Channel | Audience | Trigger |
|---|------|---------|----------|---------|
| 1 | `first_availability_submitted` | chat_card | ALL | Exactly 1 person has submitted availability |
| 2 | `availability_half_submitted` | chat_card | ALL | 50%+ travelers submitted |
| 3 | `strong_overlap_detected` | chat_card | ALL | Best overlap >= 60% coverage |
| 4 | `dates_locked` | chat_card | ALL | Dates are locked |
| 5 | `leader_ready_to_propose` | cta_highlight | LEADER | Good overlap exists, no proposal yet |
| 6 | `leader_can_lock_dates` | cta_highlight | LEADER | Proposed dates have support |
| 7 | `traveler_too_many_windows` | inline_hint | TRAVELER | User at max window limit (on-demand) |
| 8 | `leader_proposing_low_coverage` | confirm_dialog | LEADER | Proposing window with < 40% coverage (on-demand) |

## Existing Backend Wiring
- `GET /api/trips/:tripId/nudges` (route.js ~5120) — Fully implemented:
  - Fetches trip data, windows, participants
  - Calls `computeTripMetrics()` + `buildViewerContext()` + `computeNudges()`
  - Filters via `filterSuppressedNudges()` (cooldown-based dedupe)
  - Creates `chat_card` nudge messages in `trip_messages` via `createChatCardMessage()`
  - Records shown events via `recordNudgesShown()`
  - Returns `{ nudges, actionNudge, celebratorNudge }`
- `POST /api/trips/:tripId/nudges/:nudgeId/(click|dismiss)` (route.js ~5238) — Records interactions

## Why Nudges Were Not Surfacing
The backend endpoint exists and works correctly. The gap was entirely on the **client side**:
1. No component or hook ever calls `GET /api/trips/:tripId/nudges`
2. Therefore `chat_card` messages are never inserted into `trip_messages`
3. Therefore `cta_highlight` nudges are never displayed

## Integration Approach (Option A — Pull-on-load)
- Call the nudge endpoint once when `CommandCenterV2` mounts (and on trip refresh)
- Chat card nudges are automatically persisted as system messages by the backend
- They appear in the chat feed via existing polling (`useTripChat`)
- CTA highlight nudges are returned in the response and can drive action cards
- Nudge system messages get distinct styling in ChatTab (title + CTA button)
- Feature flag: `NEXT_PUBLIC_NUDGES_ENABLED` env var for easy rollback
