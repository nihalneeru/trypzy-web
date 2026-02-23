# CLAUDE.md

## 0) Product in 60 seconds

**What Tripti is**: A group travel coordination platform that reduces decision paralysis through progressive scheduling. Friend groups propose trips, share availability, vote on date windows, and lock dates—all without requiring unanimous participation.

**Who it's for**: Friend groups (typically 4-30 people) planning trips together. Adults roughly 21-55 who are already socially connected.

**MVP success definition**: A user should be able to say: "Planning this trip felt calmer and clearer than our usual group chat."

**Core principle**: Availability ≠ Commitment. Only locking dates represents commitment. The system can progress without unanimous participation.

### 0.5) Product philosophy, business model & brand guardrails

**Product philosophy**: Tripti reduces coordination friction, not enforce participation. Uneven participation is normal. A few motivated planners move the group forward. Others stay informed and join later without guilt. If a flow trades simplicity for control, simplicity wins.

**Key principles**:
- Low-pressure participation: users can observe without acting
- Commitment only at explicit lock points
- Chat-first coordination: decisions live where conversation happens
- Progress over perfection: partial clarity beats stalled consensus

**Target users**: Friend groups/families (3–10 people), 1–3 natural leaders, groups that find chat-based planning chaotic. NOT for corporate travel, large tours, or power planners.

**Business model**: MVP proves friction reduction. Monetization paths (future): hosted trips, premium features, partner integrations.

**Metrics that matter**: % trips reaching "locked", time to lock, drop-off by stage, planner satisfaction.

**Brand & voice**:
- **Tagline**: "Nifty plans. Happy circles."
- **Tone**: Calm, friendly, non-preachy. Helpful, not controlling
- **Use**: "Plan together", "Move forward", "When you're ready"
- **Avoid**: "You must", "Everyone needs to…", "Required", "Incomplete" (for people)

**UX guardrails** (important for engineering decisions):
- CTAs should feel inviting, not demanding
- Read-only states are acceptable and intentional
- Progress indicators should clarify, not pressure
- If a UI element creates anxiety or obligation, it's probably wrong
- Removing redundant UI is preferable to adding more explanation

**Non-goals for MVP**: No complex role hierarchies, no required onboarding tours, no AI-first experiences replacing user intent, no multi-product surface area (Trips first).

**Language note**: The build chain is JavaScript-based (SWC strips TS automatically, `ignoreBuildErrors: true`). The codebase has both `.js/.jsx` and `.ts/.tsx` files. Either is fine for new code — follow the conventions of nearby files. Do not introduce strict typing or `tsc`-based compilation.

## 1) Tripti Brand Colors

**CSS Variables** (defined in `app/globals.css`):
```css
--brand-red: #FA3823;      /* Attention/CTAs/Blockers */
--brand-blue: #00334D;     /* Secondary CTAs/Links */
--brand-carbon: #2E303B;   /* Text/Dark elements */
--brand-sand: #F2EDDA;     /* Light backgrounds/Highlights */
```

**Tailwind Usage**:
- `text-brand-red`, `bg-brand-red` - Primary CTAs, blockers, errors
- `text-brand-blue`, `bg-brand-blue` - Secondary CTAs, links, active states
- `text-brand-carbon`, `bg-brand-carbon` - Text, dark UI elements
- `bg-brand-sand` - Highlights, selected states, light backgrounds

**Typography**: Inter font family (`font-inter`)

## 2) Current MVP Funnel (as implemented)

**Trip stages** (from `lib/trips/stage.js`):
1. **PROPOSED** → 2. **DATES_LOCKED** → 3. **ITINERARY** → 4. **STAY** → 5. **PREP** → 6. **ONGOING** → 7. **COMPLETED**

**Status field** (`trip.status`): `'proposed'` → `'scheduling'` → `'voting'` → `'locked'` → `'completed'` | `'canceled'`

**Stage transitions**:
- `proposed` → `scheduling`: Auto on first date window suggestion (date_windows mode) or first availability submission (legacy top3_heatmap mode)
- `scheduling` → `locked`: Leader proposes a window → travelers react → leader locks via `POST /api/trips/:id/lock-proposed` (date_windows mode, default)
- `scheduling` → `voting` → `locked`: Legacy path (top3_heatmap mode only)
- `locked` → `completed`: Auto when `endDate < today`

**Current scheduling flow (date_windows mode)** — three phases via `DateWindowsFunnel`:
1. **COLLECTING** — Travelers suggest date windows via free-form text, parsed by `normalizeWindow()` (no LLM). Support/overlap detection. Leader sees response-rate insight card (>=80%: blue card with leading option; >=50%: lighter blue; <50%: no card).
2. **PROPOSED** — Leader selects a window. Travelers react: Works / Maybe / Can't. Threshold = `ceil(memberCount / 2)`.
3. **LOCKED** — Leader locks dates (can override threshold). Trip moves to itinerary planning.

**Key guardrails**:
- **Role-based permissions**: Leader = `trip.createdBy`. Enforced server-side via `validateStageAction()` (`lib/trips/validateStageAction.js`)
- **Participation minimums**: None. System progresses with partial participation
- **Post-lock read-only**: Availability/voting blocked. Canceled trips read-only. Left travelers cannot send messages

## 3) Architecture snapshot

**Frameworks/libraries**:
- Next.js 14.2.3 (App Router), React 18.x, MongoDB 6.6.0 (native driver, no ORM)
- Tailwind CSS 3.4.1 + shadcn/ui, JWT authentication (jsonwebtoken 9.0.3)
- Vitest 4.0.16 (unit tests), Playwright 1.57.0 (E2E tests)

**Collections** (core — 40 total in MongoDB):
- `users`, `circles`, `memberships` — Identity & groups
- `trips`, `trip_participants`, `trip_join_requests`, `trip_invitations` — Trip core
- `date_windows`, `window_supports`, `duration_preferences` — Date scheduling (current)
- `trip_date_picks`, `availabilities`, `votes` — Legacy scheduling (top3_heatmap)
- `trip_messages` — Chat
- `itinerary_ideas`, `itinerary_versions`, `itinerary_feedback`, `itinerary_reactions` — Itinerary
- `accommodation_options`, `accommodation_votes`, `stay_requirements` — Accommodation
- `prep_items`, `transport_items`, `prep_suggestions_cache` — Trip prep
- `trip_events`, `nudge_events`, `trip_coordination_snapshots`, `circle_coordination_profiles` — Events/analytics
- `push_tokens`, `push_events` — Push notifications
- `posts`, `reports`, `friendships` — Social/discover

**Traveler determination**: Collaborative trips = all circle members (unless `trip_participants.status === 'left'/'removed'`). Hosted trips = explicit `trip_participants` with `status='active'`. See `isActiveTraveler()`.

**State enforcement**:
- **Server**: `requireAuth()`, leader checks (`trip.createdBy === userId`), `validateStageAction()`, `canViewerSeeTrip()`, `isActiveTraveler()` for write endpoints, input length limits
- **Client**: Buttons disabled by role, CTAs via `getUserActionRequired()`, removed travelers see read-only banner

**Source of truth**: Trip stage computed client-side (`deriveTripPrimaryStage()`) but validated server-side. Progress steps computed server-side (`computeTripProgressSnapshot()`). Traveler status and privacy always server-side.

## 4) Key file map (high-signal only)

**Routes/pages** (all standalone Next.js App Router routes):
- `app/page.js` → `app/WelcomePageWrapper.jsx` — Auth gate (authenticated → `/dashboard`)
- `app/dashboard/page.js` — Primary authenticated landing
- `app/trips/[tripId]/page.js` — Trip detail (Command Center V3)
- `app/circles/[circleId]/page.js` — Circle detail
- `app/discover/page.js`, `app/members/[userId]/page.js`, `app/settings/privacy/page.js`
- `app/login/page.jsx`, `app/signup/page.jsx`

**Command Center V3** (inside `components/trip/command-center-v2/` directory):
```
CommandCenterV3.tsx          # Main orchestrator
ProgressStrip.tsx            # Top strip: trip name/dates + horizontal chevrons
ContextCTABar.tsx            # Bottom bar: travelers/expenses/memories + priority CTA
OverlayContainer.tsx         # Slide-in drawer wrapper (right or bottom)
overlays/
  SchedulingOverlay.tsx, ItineraryOverlay.tsx, AccommodationOverlay.tsx,
  TravelersOverlay.tsx, PrepOverlay.tsx, ExpensesOverlay.tsx,
  MemoriesOverlay.tsx, MemberProfileOverlay.tsx, TripInfoOverlay.tsx
```

**Key components**:
- `components/trip/scheduling/DateWindowsFunnel.tsx` — Current scheduling UI
- `components/common/BrandedSpinner.jsx` — Loading spinner (used 15+ places)
- `components/trip/TripTabs/tabs/ChatTab.tsx` — Chat surface
- `components/trip/chat/ActionCard.tsx` — CTA cards in chat
- `components/dashboard/TripCard.jsx`, `TripProgressMini.jsx`

**API**:
- `app/api/[[...path]]/route.js` — Centralized API handler (~13,000 lines, pattern matching)
- `app/api/trips/[tripId]/expenses/route.js` — Expenses API
- `app/api/discover/posts/route.js` — Discover posts API

**Core lib**:
- `lib/trips/stage.js` — `deriveTripPrimaryStage()`, `computeProgressFlags()`
- `lib/trips/validateStageAction.js` — Server-side stage validation
- `lib/trips/normalizeWindow.js` — Deterministic date text parser (no LLM)
- `lib/trips/progressSnapshot.ts` — Server-side progress computation
- `lib/trips/nextAction.ts` — CTA computation (`getNextAction()`)
- `lib/trips/getUserActionRequired.js` — Action requirement computation
- `lib/trips/canViewerSeeTrip.js` — Privacy filtering
- `lib/navigation/routes.js` — `tripHref()`, `circlePageHref()` (canonical URL generators)
- `lib/server/db.js` — MongoDB singleton
- `lib/server/auth.js` — JWT helpers
- `lib/server/llm.js` — OpenAI integration

**Internal systems** (see [`docs/INTERNAL_SYSTEMS.md`](docs/INTERNAL_SYSTEMS.md) for details):
| System | Key entry point | Purpose |
|--------|----------------|---------|
| Nudge Engine | `lib/nudges/NudgeEngine.ts` | Informational chat nudges (8 types, role-aware) |
| Event System | `lib/events/emit.js` | Immutable event log (data moat) |
| Admin Debug | `app/api/admin/events/route.js` | Beta investigation endpoints |
| Itinerary LLM | `lib/server/llm.js` | Generation, revision, chat briefs |

**Tests**:
- `tests/api/` — API tests (stage, privacy, expenses, etc.)
- `tests/trips/` — Trip utility tests
- `tests/nudges/` — Nudge engine tests
- `tests/events/` — Event emitter tests
- `tests/itinerary/` — Itinerary pipeline tests
- `tests/push/` — Push notification tests
- `tests/admin/` — Admin endpoint tests
- `tests/circles/`, `tests/navigation/` — Additional unit tests
- `e2e/` — Playwright E2E tests

## 5) Command Center V3 - Layout

```
┌───────────────────────────────────────────────┐
│  ProgressStrip: Trip Name + Dates             │
│  [▶Proposed][▶Dates][▶Itinerary][▶Stay][▶Prep]│ ← Horizontal chevrons
├───────────────────────────────────────────────┤
│              CHAT FEED (scrollable)           │
├───────────────────────────────────────────────┤
│  [  Type a message...              ] [➤]      │
├───────────────────────────────────────────────┤
│  [👥 4] [💰] [📷]     [Pick your dates  📅]   │ ← Context CTA Bar
└───────────────────────────────────────────────┘
```

- **Chevrons**: Blue = completed/active, Red = blocker, Gray = future. Blocker/active point DOWN, others RIGHT
- **Overlays**: Right-slide (scheduling, itinerary, accommodation, prep, member profile, trip info). Bottom-slide (travelers, expenses, memories). Backdrop/Escape to close. Unsaved changes protection
- **CTA Bar**: Left = quick-action buttons (travelers, expenses, memories). Right = priority CTA (role/state-aware, algorithm in `ContextCTABar.tsx`)
- **Blocker detection**: `deriveBlockerStageKey()` — dates → itinerary → accommodation → null

## 6) API Routes Reference

**Itinerary**:
- `GET/POST /api/trips/:tripId/itinerary/ideas` — List/add ideas
- `POST /api/trips/:tripId/itinerary/ideas/:ideaId/like` — Like idea
- `POST /api/trips/:tripId/itinerary/generate` — Generate itinerary (leader only)

**Duration preferences**:
- `POST /api/trips/:tripId/duration-preference` — Set preference (weekend/extended/week/week_plus/flexible)
- `GET /api/trips/:tripId/duration-preferences` — Aggregated preferences

**Admin/Jobs**: See [`docs/INTERNAL_SYSTEMS.md`](docs/INTERNAL_SYSTEMS.md)

## 7) Progress Step Icons

| Step | Icon | Color (when current) |
|------|------|---------------------|
| tripProposed | Lightbulb | brand-red |
| datesLocked | Calendar | brand-red |
| itinerarySelected | Map | brand-red |
| accommodationChosen | Home | brand-red |
| prepStarted | Clipboard | brand-red |
| tripOngoing | Rocket | brand-red |
| memoriesAdded | Camera | gray (utility) |
| expensesSplit | DollarSign | gray (utility) |

## 8) How to run locally

**Prerequisites**: Node.js 18+, MongoDB, npm

**Installation**: `npm install`

**Environment variables** (`.env.local`):
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=tripti
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000
OPENAI_API_KEY=your-openai-key
ADMIN_DEBUG_TOKEN=your-admin-token
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx
UPSTASH_REDIS_REST_URL=your-upstash-redis-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-token
# Optional: CRON_SECRET, OPENAI_MODEL, ITINERARY_MAX_VERSIONS=3
# NEXT_PUBLIC_NUDGES_ENABLED=false
```

**Commands**:
```bash
npm run dev           # Development server
npm run test          # Unit tests
npm run test:e2e      # E2E tests
npm run build         # Production build
npm run seed          # Seed data (alex.traveler@example.com / password123)
```

**GOLDEN RULE: Never work directly on main branch.**
Always create a feature branch (`feat/`, `fix/`), work there, create PR to merge into main.

## 9) "If you only read 5 things" (for Claude)

1. **All pages are standalone App Router routes**: `/dashboard`, `/trips/[tripId]`, `/circles/[circleId]`, `/discover`, `/members/[userId]`. Use `tripHref()` and `circlePageHref()` from `lib/navigation/routes.js` for all navigation URLs.

2. **Command Center V3 is the only trip view**: Chat-centric with slide-in overlays. Lives in `components/trip/command-center-v2/` (V3 code inside a v2 directory — historical naming).

3. **Blocker-driven UI**: The red chevron shows what's blocking the trip (dates → itinerary → accommodation). CTA bar shows the priority action based on user role and trip state.

4. **Traveler determination differs by trip type**: Collaborative = circle members. Hosted = explicit participants. See `isActiveTraveler()`.

5. **Brand colors are enforced**: Use `brand-red` for CTAs/blockers, `brand-blue` for secondary actions/links, `brand-sand` for highlights. Never use generic Tailwind colors (red-600, blue-500).

## 10) Deferred until public launch

- Rate limiting (needs Redis/Upstash infrastructure)
- Remaining generic Tailwind color cleanup (20+ files, low priority)
- Accessibility polish (aria-hidden, aria-live)
