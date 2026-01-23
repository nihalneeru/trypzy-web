# AI Development Context Guide for Trypzy

> **IMPORTANT**: This document is for human developers and external LLM tools working on the Trypzy codebase. It is **not** used by Trypzy runtime AI features.

---

## A) Project Identity

### What Trypzy Is
Trypzy is a **private, trust-based trip planning platform** for friend groups. The core value proposition is progressive scheduling: friends propose trips, share availability, vote on promising date windows, and lock dates when ready—all without requiring unanimous participation.

### MVP Target
- **Primary users**: Friend groups organizing trips together
- **Core workflow**: Progressive scheduling (broad intent → availability → voting → locked dates)
- **Key principle**: Availability ≠ Commitment. Only locking dates represents commitment.

### Core Product Principles

1. **Chat-First**: Trip Chat is the only interactive conversation surface. All other surfaces (Circle Updates) are read-only digests.
2. **Circle-Based**: Private friend groups (Circles) organize trips. Circle membership grants access to circle content.
3. **Stage-Based Planning**: Trips progress through explicit stages (proposed → scheduling → voting → locked → planning)
4. **Privacy-First**: Context-aware privacy controls never prevent users from seeing their own trips.
5. **Progressive Narrowing**: Scheduling narrows intent until date locking, then everything flows from that commitment.

### Trip Command Center V2 (Default Trip Detail View)

The **Command Center V2** is the default trip experience. It is chat-centric with slide-in overlays for actions.

**Layout**:
```
┌─────────────────────────────────────────┬─────┐
│  Focus Banner (Trip Name + Dates)       │  ▼  │
├─────────────────────────────────────────┤  ▼  │
│                                         │  ▼  │
│           CHAT FEED                     │  ▼  │
│         (scrollable)                    │  ▼  │
│                                         │  ▼  │
│                                         │  ○  │
│                                         │  ○  │
│                                         │─────│
│                                         │  👥 │
├─────────────────────────────────────────┴─────┤
│  Traveler Strip                           │
├───────────────────────────────────────────────┤
│  Context CTA Bar (priority action)           │
└───────────────────────────────────────────────┘
```

**Key V2 files**:
- `components/trip/command-center-v2/CommandCenterV2.tsx`
- `components/trip/command-center-v2/FocusBannerV2.tsx`
- `components/trip/command-center-v2/ProgressChevrons.tsx`
- `components/trip/command-center-v2/ContextCTABar.tsx`
- `components/trip/command-center-v2/OverlayContainer.tsx`
- `components/trip/command-center-v2/overlays/*.tsx`

**Chat**:
- Trip Chat UI is shared via `components/trip/TripTabs/tabs/ChatTab.tsx`
- Polling is managed via `hooks/use-trip-chat.ts`

---

## B) Golden Rules (Non-Negotiables)

### Privacy Model Scoping

**CRITICAL**: Privacy settings have strict context boundaries. Violations cause user-visible bugs.

#### Rule 1: Upcoming Trips Visibility
- **ONLY applies to**: Other-user profile views (`PROFILE_VIEW` context)
- **NEVER applies to**: Dashboard, Circle trips page, Trip detail pages, Self profile views
- **Implementation**: Use `applyProfileTripPrivacy()` with correct context parameter
- **Files**: `lib/trips/applyProfileTripPrivacy.js`, `app/api/[[...path]]/route.js`

#### Rule 2: Trip Details Level
- **ONLY affects**: Profile views for non-travelers
- **NEVER affects**: Travelers, owners, or self views

#### Rule 3: Profile Visibility
- `profileVisibility === 'private'` blocks other-user profile views
- Owner always sees own profile

### Permissions Model

#### Circle Member vs Traveler vs Invite/Pending

**Circle Member**:
- `memberships` collection record
- Grants access to circle content (trips, posts, updates)

**Traveler (Active)**:
- **Collaborative trips**: All circle members by default unless `trip_participants.status === 'left'/'removed'`
- **Hosted trips**: Only explicit `trip_participants.status === 'active'`

**Invite/Pending**:
- `trip_join_requests` with `status === 'pending'` (hosted trips only)

**Backfill Rule**: When user joins circle, add them to `trip_participants` for existing collaborative trips.

---

## C) CTA Rules

### Single Primary CTA
- **One CTA per trip card**: red if action required, neutral otherwise
- **Source of truth**: `trip.actionRequired` from `getUserActionRequired()`
- **File**: `components/dashboard/TripCard.jsx`

### No Redundant CTAs
- Trip card already navigates; avoid extra “view” buttons

---

## D) Trip Stages & Status

**Status values** (`trips.status`):
1. `proposed`
2. `scheduling`
3. `voting`
4. `locked`
5. `completed`

**Stage transitions**:
- `proposed` → `scheduling`: auto on first picks
- `scheduling` → `voting`: leader opens voting
- `voting` → `locked`: leader locks
- `locked` → `completed`: auto when trip ends

**Files**: `lib/trips/stage.js`, `lib/trips/progress.js`

---

## E) Key Workflows

### Circle Join
- `POST /api/circles/join`
- Backfills `trip_participants` for collaborative trips

### Trip Creation
- `POST /api/trips`
- Collaborative trips start `proposed` and include all circle members

### Scheduling Flow
- Picks: `POST /api/trips/:id/date-picks`
- Voting: `POST /api/trips/:id/open-voting` + `POST /api/trips/:id/votes`
- Lock: `POST /api/trips/:id/lock`

### Trip Chat System Messages
- Emitted via `lib/chat/emitTripChatEvent.js`
- Stored in `trip_messages` with `isSystem: true`

---

## F) High-Risk Files (Touch with Caution)

- `app/HomeClient.jsx` (large SPA component)
- `app/api/[[...path]]/route.js` (central API handler)

---

## G) Reusable Helpers (Prefer These)

- `lib/trips/getUserActionRequired.js`
- `lib/trips/buildTripCardData.js`
- `lib/trips/progressSnapshot.ts`
- `lib/trips/nextAction.ts`
- `lib/navigation/routes.js`
- `lib/dashboard/getDashboardData.js`

---

## H) Testing Expectations

**Unit Tests**: `tests/api/` (Vitest)
**E2E Tests**: `e2e/` (Playwright)

Commands:
```bash
npm run test
npm run test:e2e
npm run test:all
```

---

## I) Quick Reference (Current Defaults)

- Command Center V2 is default trip view.
- Chat is the primary interactive surface.
- Circle Updates are read-only digests.
- Privacy never blocks collaboration.
- LLM features are assistive and leader-gated.

---

## Needs Confirmation

- MongoDB index definitions (not explicitly defined in code)
- Production deployment process
- Exact itinerary ideas character limit
