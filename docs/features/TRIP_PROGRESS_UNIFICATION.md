# Trip Progress Unification

> **Status:** COMPLETED (shipped in MVP Hardening Round 1)
> **Last updated:** 2026-02-23
> **Key file:** `lib/trips/progressSnapshot.ts`

## Purpose

Unified pending actions (chat CTA, dashboard notifications, progress strip) around a single computed `TripProgressSnapshot` for immediate UI updates after picks/lock/join approvals.

## Architecture

`computeTripProgressSnapshot()` in `lib/trips/progressSnapshot.ts` is the single source of truth. Returns flags: `everyoneResponded`, `leaderNeedsToLock`, `datesLocked`, `itineraryPending`, etc.

## Key files

| File | Role |
|------|------|
| `lib/trips/progressSnapshot.ts` | Core computation (`computeTripProgressSnapshot()`) |
| `lib/trips/nextAction.ts` | CTA computation using progress snapshot |
| `lib/dashboard/getDashboardData.js` | Dashboard notifications (join requests, pending actions) |
| `components/trip/command-center-v2/ContextCTABar.tsx` | Consumes snapshot for CTA priority |
| `components/trip/TripTabs/tabs/ChatTab.tsx` | Consumes snapshot for inline CTAs |

## What was implemented

- Progress snapshot computation function
- Participant panel removed (info moved to Travelers overlay)
- Join request notifications on dashboard
- NextAction uses progress snapshot for availability lifecycle
- CTA lifecycle: "Pick dates" → "Lock dates" (leader) / "Waiting for lock" (traveler) → "Go to Itinerary"
- All UI components refetch trip data after mutations to keep state in sync
- Filter out `participantStatus === 'left'` from all participant lists
