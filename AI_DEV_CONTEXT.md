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

### Trip Command Center V3 (Default Trip Detail View)

The **Command Center V3** is the default trip experience. It is chat-centric with slide-in overlays for actions.

**Layout**:
```
┌───────────────────────────────────────────────┐
│  ProgressStrip: Trip Name + Dates             │
│  [▶Proposed][▶Dates][▶Itinerary][▶Stay][▶Prep]│
├───────────────────────────────────────────────┤
│                                               │
│              CHAT FEED                        │
│            (scrollable)                       │
│                                               │
├───────────────────────────────────────────────┤
│  [  Type a message...              ] [➤]      │
├───────────────────────────────────────────────┤
│  Context CTA Bar (priority action)            │
└───────────────────────────────────────────────┘
```

**Key V3 files**:
- `components/trip/command-center-v2/CommandCenterV3.tsx`
- `components/trip/command-center-v2/ProgressStrip.tsx`
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

## F) Route Architecture

All authenticated pages are standalone Next.js App Router routes. There is no SPA monolith.

| Route | Page | Description |
|-------|------|-------------|
| `/` | `WelcomePageWrapper` | Auth gate + legacy URL redirect |
| `/dashboard` | `app/dashboard/page.js` | Primary landing page |
| `/trips/[tripId]` | `app/trips/[tripId]/page.js` | Trip detail (Command Center V2) |
| `/circles/[circleId]` | `app/circles/[circleId]/page.js` | Circle detail (Members, Trips, Updates tabs) |
| `/discover` | `app/discover/page.js` | Discover feed |
| `/members/[userId]` | `app/members/[userId]/page.js` | Member profile |

**Navigation helpers** (`lib/navigation/routes.js`): Use `tripHref(tripId)` and `circlePageHref(circleId)` for all navigation URLs.

**Legacy URLs**: `WelcomePageWrapper` redirects `/?tripId=X` → `/trips/X`, `/?circleId=X` → `/circles/X`, `/?view=discover` → `/discover` for backward compatibility.

**`HomeClient.jsx`**: Now a 2-line re-export shim for `BrandedSpinner`. Not a real component — do not add code here.

## F.1) High-Risk Files (Touch with Caution)

- `app/api/[[...path]]/route.js` (central API handler, ~7100 lines)

---

## G) Reusable Helpers (Prefer These)

- `lib/trips/getUserActionRequired.js`
- `lib/trips/buildTripCardData.js`
- `lib/trips/progressSnapshot.ts`
- `lib/trips/nextAction.ts`
- `lib/navigation/routes.js` — `tripHref()`, `circlePageHref()`
- `lib/dashboard/getDashboardData.js`
- `components/common/BrandedSpinner.jsx` — branded loading spinner

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

- All pages are standalone App Router routes (no SPA monolith).
- Command Center V2 is the default trip view at `/trips/[tripId]`.
- Chat is the primary interactive surface.
- Circle Updates are read-only digests.
- Privacy never blocks collaboration.
- LLM features are assistive and leader-gated.
- Use `tripHref()` / `circlePageHref()` for navigation URLs, never raw string concatenation.

---

## Needs Confirmation

- MongoDB index definitions (not explicitly defined in code)
- Production deployment process
- Exact itinerary ideas character limit
