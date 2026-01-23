# Codex Context (Trypzy)

This file is a compact, high-signal context snapshot for future sessions.

## Product Intent (MVP)
- Reduce coordination friction; avoid nagging or pressure.
- Chat-first: Trip Chat is the only interactive conversation surface.
- Read-only digests are acceptable (Circle Updates).
- Availability ≠ commitment; only date locking is commitment.

## Core Entities
- **Circles**: private friend groups.
- **Trips**: collaborative or hosted; each trip has a single leader (`createdBy`).
- **Memberships**: grant access to circle content.
- **Trip participants**: explicit for hosted, implicit for collaborative (unless left/removed).

## Default Trip Experience
- **Command Center V2** is the default trip view: `components/trip/command-center-v2/`.
- Chat feed is primary; actions open overlays (scheduling/itinerary/accommodation/prep/etc.).

## Critical Guardrails
- Privacy settings only affect **profile views**, never dashboard/circle/trip views.
- Do not add additional interactive feeds; Trip Chat is primary.
- Always validate stage transitions server-side (`validateStageAction`).

## Key Files
- `app/api/[[...path]]/route.js` — centralized API (pattern matching).
- `components/trip/command-center-v2/CommandCenterV2.tsx` — default trip view.
- `components/trip/TripTabs/tabs/ChatTab.tsx` — shared chat UI.
- `lib/trips/stage.js` — stage computation.
- `lib/trips/progressSnapshot.ts` — unified progress flags.
- `lib/trips/nextAction.ts` — CTA priority logic.
- `lib/trips/getUserActionRequired.js` — “Waiting on you” logic.
- `lib/trips/buildTripCardData.js` — trip card data builder.

## Common Workflows (Entry Points)
- Circle join: `POST /api/circles/join` (backfills collaborative trips).
- Trip creation: `POST /api/trips`.
- Date picks: `POST /api/trips/:id/date-picks` (top3_heatmap).
- Voting: `POST /api/trips/:id/votes`.
- Lock dates: `POST /api/trips/:id/lock`.
- Chat messages: `GET/POST /api/trips/:id/messages`.
- Circle Updates: `GET /api/circles/:id/updates`.

## Testing
- Unit: `npm run test`
- E2E: `npm run test:e2e`
- All: `npm run test:all`

## Known Risks
- Large SPA file (`app/HomeClient.jsx`) and centralized API file.
- Privacy filtering is context-sensitive; easy to regress.
- Limited E2E coverage.
