# CLAUDE.md

## 0) Product in 60 seconds

**What Trypzy is**: A group travel coordination platform that reduces decision paralysis through progressive scheduling. Friend groups propose trips, share availability, vote on date windows, and lock dates—all without requiring unanimous participation.

**Who it's for**: Friend groups (typically 4-30 people) planning trips together. Designed for both small groups (where everyone's input matters) and large/flaky groups (where partial participation is expected). Adults roughly 21-55 who are already socially connected.

**MVP success definition**: A user should be able to say: "Planning this trip felt calmer and clearer than our usual group chat." If that is true, MVP is successful—even if not everyone participated equally.

**Core principle**: Availability ≠ Commitment. Only locking dates represents commitment. The system can progress without unanimous participation.

### 0.5) Product philosophy, business model & brand guardrails

**Product philosophy (founder intent)**

Trypzy exists to reduce coordination friction, not to enforce participation.

Most group trips fail or become stressful not because people don't care, but because:
- participation is uneven
- decisions require too much synchronous effort
- social pressure creates avoidance

Trypzy is intentionally designed around the belief that:
- Uneven participation is normal and acceptable
- A small number of motivated planners should be able to move the group forward
- Others should be able to stay informed and join later without guilt or friction

We optimize for momentum, clarity, and psychological safety—not maximum engagement.

**Key principles**:
- Low-pressure participation: users can observe without acting
- Commitment only when necessary: hard decisions happen only at explicit lock points
- Chat-first coordination: decisions live where conversation already happens
- Progress over perfection: partial clarity is better than stalled consensus

**What we explicitly do NOT optimize for (MVP)**:
- Forcing everyone to vote, respond, or confirm
- Real-time collaboration or synchronous scheduling
- Power-user planning depth (spreadsheets, granular constraints)
- Heavy analytics or participation scoring
- "Social pressure" mechanics (nagging, streaks, guilt-driven nudges)

If a flow trades simplicity for control, simplicity wins.

**Target users (MVP)**:
- **Primary**: Friend groups, families, or small circles (3–10 people). Trips where 1–3 people naturally take the lead. Groups that already coordinate via chat apps and feel planning is "chaotic"
- **Not for (yet)**: Corporate travel, large-scale tours, users who expect rigid task assignment or full participation enforcement, power planners who want deep constraint modeling

**Business model (current + near-term)**:
- **MVP goal**: Prove that Trypzy reduces planning friction and gets trips locked faster than chat-only coordination
- **Value creation (pre-monetization)**: Faster commitment, fewer abandoned trips, less back-and-forth confusion, clear "what's decided vs not" visibility
- **Likely monetization paths (future, not MVP blockers)**: Hosted or guided trips, premium planning features (advanced itinerary versions, exports, templates), partner integrations (stays, activities), white-label group travel planning

**Metrics that matter now**:
- % of trips that reach "locked"
- Time from trip creation → lock
- Drop-off by stage
- Planner satisfaction (not total engagement)

**Brand & voice guardrails**:
- **Tagline**: "Trips made easy"
- **Tone**: Calm, friendly, non-preachy. Never scolding or guilt-inducing. Confident but not corporate. Helpful, not controlling
- **Language we like**: "Plan together", "Move forward", "When you're ready", "Next step"
- **Language we avoid**: "You must", "Everyone needs to…", "Required", "Incomplete" (for people)

The product should feel like a helpful organizer, not a manager.

**UX guardrails (important for engineering decisions)**:
- CTAs should feel inviting, not demanding
- Read-only states are acceptable and intentional
- Leadership should emerge naturally, not be over-emphasized
- Progress indicators should clarify, not pressure
- Removing redundant UI is preferable to adding more explanation
- If a UI element creates anxiety or obligation, it's probably wrong

**Non-goals for MVP (hard constraints)**:
- No complex role hierarchies beyond what's required for safety
- No required onboarding tours
- No AI-first experiences that replace user intent
- No multi-product surface area (Trips first, everything else later)

## 1) Trypzy Brand Colors

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
1. **PROPOSED** - Trip created, dates not locked
2. **DATES_LOCKED** - Dates finalized, itinerary not finalized
3. **ITINERARY** - Itinerary finalized, accommodation not chosen
4. **STAY** - Accommodation chosen, prep not started
5. **PREP** - Prep started, trip not ongoing
6. **ONGOING** - Trip dates are active (today within range)
7. **COMPLETED** - Trip end date has passed

**Status field** (`trip.status`): `'proposed'` → `'scheduling'` → `'voting'` → `'locked'` → `'completed'` | `'canceled'`

**Stage transitions**:
- `proposed` → `scheduling`: Auto on first availability submission
- `scheduling` → `voting`: Manual (leader action via `POST /api/trips/:id/open-voting`)
- `voting` → `locked`: Manual (leader action via `POST /api/trips/:id/lock`)
- `locked` → `completed`: Auto when `endDate < today`

**Key guardrails**:
- **Role-based permissions**: Trip leader (`trip.createdBy === userId`) can lock dates, open voting, cancel trip, transfer leadership. Enforced server-side in `app/api/[[...path]]/route.js` via `validateStageAction()` (`lib/trips/validateStageAction.js`)
- **Participation minimums**: None enforced. System can progress with partial participation
- **Post-lock read-only behavior**: Once dates are locked, availability/voting actions are blocked. Canceled trips are read-only. Left travelers cannot send messages (ChatTab checks `viewer.isActiveParticipant`)

## 3) Architecture snapshot

**Frameworks/libraries**:
- Next.js 14.2.3 (App Router)
- React 18.x
- MongoDB 6.6.0 (native driver, no ORM)
- Tailwind CSS 3.4.1 + shadcn/ui (48 components)
- JWT authentication (jsonwebtoken 9.0.3)
- Vitest 4.0.16 (unit tests), Playwright 1.57.0 (E2E tests)

**Data model overview**:

**Collections**:
- `users`: `{ id, email, name, password (hashed), avatarUrl, privacy: { profileVisibility, tripsVisibility, allowTripJoinRequests, showTripDetailsLevel }, createdAt, updatedAt }`
- `circles`: `{ id, name, description, ownerId, inviteCode, createdAt }`
- `trips`: `{ id, name, description, circleId, createdBy, type: 'collaborative'|'hosted', status: 'proposed'|'scheduling'|'voting'|'locked'|'completed'|'canceled', schedulingMode: 'date_windows' (default for collaborative) | 'top3_heatmap' (legacy), startDate, endDate, lockedStartDate, lockedEndDate, destinationHint, itineraryStatus: 'collecting_ideas'|'drafting'|'selected'|'published'|'revising'|null, canceledAt, canceledBy, createdAt, updatedAt }`
- `memberships`: `{ userId, circleId, role: 'owner'|'member', joinedAt }`
- `trip_participants`: `{ tripId, userId, status: 'active'|'left'|'removed', joinedAt, createdAt, updatedAt }`
- `trip_date_picks`: `{ tripId, userId, picks: [{ rank, startDateISO, endDateISO }], createdAt, updatedAt }` (top3_heatmap mode)
- `availabilities`: `{ tripId, userId, day (YYYY-MM-DD) | isBroad: true | isWeekly: true, status: 'available'|'maybe'|'unavailable', createdAt }` (legacy)
- `votes`: `{ tripId, userId, selectedWindow: { startDate, endDate }, createdAt }`
- `trip_messages`: `{ tripId, userId, content, createdAt }`
- `itinerary_ideas`: `{ tripId, userId, title, description, createdAt }`
- `trip_join_requests`: `{ tripId, userId, message, status, createdAt }`

**Traveler determination**:
- **Collaborative trips**: All circle members are travelers unless `trip_participants.status === 'left'/'removed'` (see `isActiveTraveler()` in `app/api/[[...path]]/route.js:67`)
- **Hosted trips**: Only explicit `trip_participants` with `status='active'` are travelers

**Where state is enforced**:
- **Server-side (API routes)**: All authenticated endpoints check `requireAuth()` (`app/api/[[...path]]/route.js:53`). Trip actions check `trip.createdBy === userId` for leader-only operations. Stage transitions validated via `validateStageAction()` (`lib/trips/validateStageAction.js`). Privacy filtering applied via `canViewerSeeTrip()` (`lib/trips/canViewerSeeTrip.js`)
- **Client-side (UI)**: Buttons disabled/hidden based on role (leader vs traveler). CTAs shown/hidden based on `getUserActionRequired()` (`lib/trips/getUserActionRequired.js`). Privacy settings affect UI visibility (but server is source of truth)

**Source of truth**:
- **Trip stage**: Computed client-side via `deriveTripPrimaryStage()` (`lib/trips/stage.js:129`) but validated server-side via `validateStageAction()`
- **Progress steps**: Computed server-side via `computeTripProgressSnapshot()` (`lib/trips/progressSnapshot.ts`) and passed via `trip.progress` field
- **Traveler status**: Server-side via `isActiveTraveler()` function
- **Privacy**: Server-side via `canViewerSeeTrip()` and `applyProfileTripPrivacy()` (`lib/trips/applyProfileTripPrivacy.js`)

## 4) Key file map (high-signal only)

**Routes/pages**:
- `app/page.js` - Root page (wraps WelcomePageWrapper)
- `app/WelcomePageWrapper.jsx` - Auth check, routes to WelcomePage or HomeClient
- `app/HomeClient.jsx` - Main SPA component (~4000 lines after cleanup, handles all authenticated views)
- `app/dashboard/page.js` - Dashboard server component (fetches data via `getDashboardData()`)
- `app/trips/[tripId]/page.js` - Trip detail page (redirects to SPA with query params)
- `app/circles/[circleId]/page.js` - Circle detail page (redirects to SPA)
- `app/members/[userId]/page.js` - Member profile page (server component)
- `app/login/page.jsx` - Login page
- `app/signup/page.jsx` - Signup page
- `app/settings/privacy/page.js` - Privacy settings page

**Command Center V2 Components** (current default trip view):
```
components/trip/command-center-v2/
├── CommandCenterV2.tsx           # Main orchestrator (~600 lines)
├── FocusBannerV2.tsx            # Top banner showing trip name/dates
├── ProgressChevrons.tsx         # Right sidebar with arrow-shaped stage indicators
├── ContextCTABar.tsx            # Bottom bar: travelers/expenses/memories + priority CTA
├── OverlayContainer.tsx         # Slide-in drawer wrapper (right or bottom)
├── index.ts                     # Exports
└── overlays/
    ├── SchedulingOverlay.tsx    # Date picking, voting, lock (~950 lines)
    ├── ItineraryOverlay.tsx     # Ideas, generation, feedback (~1250 lines)
    ├── AccommodationOverlay.tsx # Stays, options, Airbnb search (~800 lines)
    ├── TravelersOverlay.tsx     # Join requests, leave, transfer (~600 lines)
    ├── PrepOverlay.tsx          # Transport, packing, documents (~650 lines)
    ├── ExpensesOverlay.tsx      # Add expense, balances (~700 lines)
    ├── MemoriesOverlay.tsx      # Gallery, add memory (~480 lines)
    ├── MemberProfileOverlay.tsx # Profile card, shared circles, trips (~540 lines)
    └── index.ts                 # Exports
```

**Shared Components**:
- `components/trip/TripTabs/tabs/ChatTab.tsx` - Chat surface (used by Command Center V2)
- `components/trip/chat/ActionCard.tsx` - CTA card component for ChatTab
- `components/trip/TransferLeadershipDialog.tsx` - Leadership transfer dialog
- `components/trip/CancelTripDialog.tsx` - Trip cancellation dialog
- `components/dashboard/TripCard.jsx` - Trip card component
- `components/dashboard/TripProgressMini.jsx` - Progress indicator component
- `components/marketing/WelcomePage.tsx` - Public welcome page

**Hooks**:
- `hooks/use-trip-chat.ts` - Chat message management with 5-second polling
- `hooks/use-trip-intelligence.ts` - LLM-powered blocker detection, nudges, consensus

**API**:
- `app/api/[[...path]]/route.js` - Centralized API handler (~7100 lines, pattern matching)
- `app/api/trips/[tripId]/expenses/route.js` - Dedicated expenses API routes
- `app/api/discover/posts/route.js` - Discover posts API
- `app/api/seed/discover/route.js` - Dev seed endpoint

**Lib/utils**:
- `lib/trips/stage.js` - Stage computation (`deriveTripPrimaryStage()`, `getPrimaryTabForStage()`, `computeProgressFlags()`)
- `lib/trips/validateStageAction.js` - Server-side stage transition validator
- `lib/trips/progress.js` - Progress step definitions (`TRIP_PROGRESS_STEPS`)
- `lib/trips/progressSnapshot.ts` - Server-side progress computation
- `lib/trips/nextAction.ts` - CTA computation (`getNextAction()`)
- `lib/trips/getUserActionRequired.js` - Action requirement computation
- `lib/trips/canViewerSeeTrip.js` - Privacy filtering logic
- `lib/trips/applyProfileTripPrivacy.js` - Profile view privacy filtering
- `lib/trips/buildTripCardData.js` - Trip card data builder
- `lib/trips/getVotingStatus.js` - Voting aggregation logic
- `lib/trips/getBlockingUsers.js` - Blocking users computation
- `lib/dashboard/getDashboardData.js` - Dashboard data fetcher (server-side)
- `lib/navigation/routes.js` - Route helpers (`tripHref()`, `circlePageHref()`)
- `lib/server/db.js` - MongoDB connection singleton
- `lib/server/auth.js` - JWT auth helpers
- `lib/server/llm.js` - OpenAI integration

**Nudge Engine**:
- `lib/nudges/NudgeEngine.ts` - Pure nudge evaluation (`computeNudges()`)
- `lib/nudges/store.ts` - Dedupe, cooldown, chat message persistence
- `lib/nudges/metrics.ts` - Trip metrics computation for nudge evaluation
- `lib/nudges/copy.ts` - User-facing nudge text and emoji helpers

**Tests**:
- `tests/api/` - API unit tests (stage enforcement, privacy, expenses, etc.)
- `tests/trips/` - Trip utility tests (voting status, blocking users)
- `tests/nudges/` - Nudge engine tests (engine, store, overlap, surfacing)
- `e2e/` - Playwright E2E tests (navigation, discover flow)

## 5) Command Center V2 - Current Implementation

**Layout Structure**:
```
┌─────────────────────────────────────────┬─────┐
│  Focus Banner (Trip Name + Dates)       │  ▼  │ ← Proposed chevron
├─────────────────────────────────────────┤  ▼  │ ← Dates chevron
│                                         │  ▼  │ ← Itinerary chevron
│           CHAT FEED                     │  ▼  │ ← Accommodation chevron
│         (scrollable)                    │  ▼  │ ← Prep chevron
│                                         │  ▼  │ ← Ongoing chevron
│                                         │  ○  │ ← Memories chevron
│                                         │  ○  │ ← Expenses chevron
│                                         │─────│
│                                         │  👥 │ ← Travelers button
├─────────────────────────────────────────┴─────┤
│  [  Type a message...              ] [➤]      │
├───────────────────────────────────────────────┤
│  [👥 4] [💰] [📷]     [Pick your dates  📅]   │ ← Context CTA Bar
└───────────────────────────────────────────────┘
```

**Key Features**:
- **Progress Chevrons**: SVG arrow shapes on right sidebar (72px wide)
  - Green = completed, Red (`brand-red`) = current blocker, Gray = future, Blue (`brand-blue`) = active overlay
  - Points DOWN by default, LEFT when it's the blocker (indicating what needs attention)
  - Always visible on right side (desktop and mobile)
- **Slide-in Overlays**: Drawer from right or bottom
  - Right overlays: scheduling, itinerary, accommodation, prep, member profile (max-width 448px)
  - Bottom overlays: travelers, expenses, memories
  - Offset from chevron sidebar (doesn't cover it)
  - Backdrop click or Escape to close
  - Unsaved changes protection with confirmation dialog
- **Context CTA Bar**: Bottom bar with two sections
  - Left: Travelers count, Expenses, Memories quick-action buttons
  - Right: Priority-based CTA button (red background)
- **Focus Banner**: Shows trip name, locked dates (if any), and an inline blocker indicator text (e.g. "Waiting on dates") styled with type-based colors

**CTA Priority Algorithm** (in `ContextCTABar.tsx`):
1. Lock dates (leader only, when `canLockDates` and status is `voting`)
2. Vote on dates (if voting open and user hasn't voted)
3. Pick dates (if user hasn't submitted availability)
4. Add ideas (if collecting ideas and user has < 3 ideas)
5. Generate itinerary (leader only, when dates locked and no itinerary)
6. Choose stay (when dates locked and accommodation not selected)

**Overlay Triggers**:
| Trigger | Opens | Slide Direction |
|---------|-------|-----------------|
| Progress chevron | Corresponding stage overlay | Right |
| CTA bar button | Context-sensitive overlay | Right |
| Travelers button (left of CTA) | Travelers overlay | Bottom |
| Expenses button | Expenses overlay | Bottom |
| Memories button | Memories overlay | Bottom |
| Traveler avatar | Member profile overlay | Right |

**State Management**:
```typescript
type OverlayType =
  | 'proposed' | 'scheduling' | 'itinerary' | 'accommodation'
  | 'travelers' | 'prep' | 'expenses' | 'memories' | 'member' | null

const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
const [overlayParams, setOverlayParams] = useState<{ memberId?: string }>({})
```

**Blocker Detection** (drives chevron highlighting):
```typescript
// Priority: DATES (if not locked) → ITINERARY (if no itinerary) → ACCOMMODATION → READY
function deriveBlockerStageKey(trip): 'scheduling' | 'itinerary' | 'accommodation' | null
```

## 6) API Routes Reference

**Itinerary endpoints** (updated namespace):
- `GET /api/trips/:tripId/itinerary/ideas` - List ideas
- `POST /api/trips/:tripId/itinerary/ideas` - Add idea
- `POST /api/trips/:tripId/itinerary/ideas/:ideaId/like` - Like idea
- `POST /api/trips/:tripId/itinerary/generate` - Generate itinerary (leader only)

**Circle updates** (activity feed):
- `circle_created` - When circle owner creates circle
- `circle_member_joined` - When members join circle
- Updates derived from `memberships` collection with `joinedAt` timestamps

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

**Prerequisites**:
- Node.js 18+
- MongoDB (local or remote)
- npm

**Installation**:
```bash
npm install
```

**Environment variables** (`.env.local`):
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trypzy
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000
OPENAI_API_KEY=your-openai-key
# Optional:
# OPENAI_API_URL=https://api.openai.com/v1/chat/completions
# OPENAI_MODEL=gpt-4o-mini
# ITINERARY_MAX_VERSIONS=3
# NEXT_PUBLIC_NUDGES_ENABLED=false  (set to 'false' to disable nudge system messages)
```

**Development**:
```bash
npm run dev
```

**Testing**:
```bash
npm run test          # Unit tests
npm run test:e2e      # E2E tests
npm run build         # Production build
```

**Seed data**:
```bash
npm run seed
```
Creates test users: alex.traveler@example.com / password123

## 9) "If you only read 5 things" (for Claude)

1. **Command Center V2 is the only trip view**: Chat-centric with slide-in overlays. Progress chevrons on right sidebar (72px), overlays slide from right or bottom depending on type.

2. **Blocker-driven UI**: The red chevron shows what's blocking the trip (dates → itinerary → accommodation). CTA bar shows the priority action based on user role and trip state.

3. **Traveler determination differs by trip type**: Collaborative = circle members. Hosted = explicit participants. See `isActiveTraveler()`.

4. **Brand colors are enforced**: Use `brand-red` for CTAs/blockers, `brand-blue` for secondary actions/links, `brand-sand` for highlights. Never use generic Tailwind colors (red-600, blue-500).

5. **API routes for itinerary use `/itinerary/` namespace**: Ideas at `/trips/:id/itinerary/ideas`, generation at `/trips/:id/itinerary/generate`.

## 10) Recent MVP Hardening (2026-01-23)

**Round 1 (feat/mvp-hardening branch)**:
- Chat-first ActionCards for post-lock stages
- Post-mutation state refresh in all overlays
- Progress snapshot wiring for CTA decisions
- Prep item DELETE endpoints
- Transfer leadership endpoint
- Brand color enforcement (partial)
- Mobile responsiveness (44px touch targets)
- E2E and unit test coverage

**Round 2 (Private Beta Hardening)**:
- `ErrorBoundary` component (`components/common/ErrorBoundary.tsx`) - catches React errors gracefully
- Expense fixes: division by zero protection, race condition fix using atomic `$pull`
- JWT secret: fails in production if not set (no more hardcoded fallback)
- Overlay error states: all overlays now show error UI with retry button
- `useTripChat` hook: exposes `error` state, stops polling after 3 failures
- Join request actor fix: shows "Leader approved X's request" instead of "X joined"

**Deferred until public launch**:
- Rate limiting
- CORS wildcard fix
- Remaining generic Tailwind colors (30+ files)
- Skeleton loaders
- Accessibility polish (aria-hidden, color contrast)

**Reference**: See `MVP_HARDENING_PLAN_V2.md` for full audit findings.

## 10.5) Nudge Engine (INTERNAL)

A nudge engine exists and is **active** in the current codebase.

**How it works**:
- The engine evaluates trip state (metrics, viewer context) and produces nudges via `computeNudges()` in `lib/nudges/NudgeEngine.ts`
- Nudges are surfaced as **system messages in trip chat** (channel: `chat_card`) with distinct `bg-brand-sand` styling
- Nudges are **informational, non-blocking, and role-aware** — they celebrate progress (e.g. "first availability submitted") and clarify next steps without pressuring
- Dedupe is handled server-side via the `nudge_events` collection (cooldown-based) and `metadata.eventKey` on chat messages
- The client triggers nudge evaluation via `GET /api/trips/:tripId/nudges` on trip load (fire-and-forget in `CommandCenterV2.tsx`)
- Feature flag: `NEXT_PUBLIC_NUDGES_ENABLED` (set to `'false'` to disable)

**Key files**:
- `lib/nudges/NudgeEngine.ts` — Pure function engine, 8 nudge types
- `lib/nudges/types.ts` — Type definitions (NudgeType, NudgeChannel, NudgeAudience)
- `lib/nudges/copy.ts` — User-facing text templates and emoji helpers
- `lib/nudges/metrics.ts` — `computeTripMetrics()` from trip + windows + participants
- `lib/nudges/store.ts` — Dedupe, cooldown, chat message persistence
- `docs/NUDGE_ENGINE_SURFACING.md` — Discovery notes and architecture

**Do NOT** document exact rules, thresholds, or cooldown durations in user-facing docs. The engine is intentionally opaque to users.

## 11) Key Component APIs

**CommandCenterV2 Props**:
```typescript
interface CommandCenterV2Props {
  trip: Trip
  token: string
  user: User
  onRefresh: (updatedTrip?: Trip) => void
}
```

**OverlayContainer Props**:
```typescript
interface OverlayContainerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  hasUnsavedChanges?: boolean
  rightOffset?: string      // e.g., "72px" to not cover chevron sidebar
  slideFrom?: 'right' | 'bottom'  // default: 'right'
}
```

**ProgressChevrons Props**:
```typescript
interface ProgressChevronsProps {
  progressSteps: Record<string, boolean>
  blockerStageKey: string | null  // which chevron points left (the blocker)
  onChevronClick: (overlayType: OverlayType) => void
  activeOverlay: OverlayType
}
```

**ContextCTABar Props**:
```typescript
interface ContextCTABarProps {
  trip: any
  user: any
  travelerCount: number
  onOpenOverlay: (overlayType: string) => void
}
```

**Overlay Pattern** (all overlays follow this):
```typescript
interface XxxOverlayProps {
  trip: Trip
  token: string
  user: User
  onRefresh: (updatedTrip?: Trip) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
  // Optional: onMemberClick for navigation to member profile
}
```