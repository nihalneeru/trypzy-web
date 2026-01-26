# Trypzy Repository Summary

## 1. Project Overview

Trypzy is a **private, trust-based trip planning platform** for friend groups. The core value proposition is solving group decision paralysis through progressive scheduling: friends propose trips, share availability, vote on promising date windows, and lock dates—all without requiring unanimous participation. The platform is organized around **Circles** (private friend groups) and **Trips** (collaborative or hosted travel plans).

**Target users**: Friend groups (typically 4-30 people) planning trips together. Designed to handle both small groups (where everyone's input matters) and large/flaky groups (where partial participation is expected). Adults roughly 21-55 who are already socially connected.

**Core user flows**:
- Circle creation and invite-based membership
- Trip proposal with date windows (default scheduling mode: `date_windows`)
- Date window collection and support signaling
- Date locking and itinerary planning
- Trip Chat as the primary interactive surface (via **Command Center V2**)
- Lightweight system nudges in chat to celebrate progress and clarify next steps
- Circle Updates digest showing read-only trip activity
- Itinerary idea submission and LLM-assisted generation
- Accommodation selection and prep tracking

**Core principle**: Availability ≠ Commitment. Only locking dates represents commitment. The system can progress without unanimous participation.

## 2. Tech Stack

**Frameworks**:
- Next.js 14.2.3 (App Router)
- React 18.x
- Node.js 18+

**Styling**:
- Tailwind CSS 3.4.1
- shadcn/ui component library (48 components built on Radix UI primitives)
- CSS strategy: Utility-first with component composition via `cn()` helper

**Backend / API approach**:
- Centralized API route handler: `app/api/[[...path]]/route.js` (~7100 lines, pattern matching)
- Dedicated routes: `app/api/discover/posts/route.js`, `app/api/seed/discover/route.js`
- Server-side utilities in `lib/server/` (db.js, auth.js, cors.js, llm.js)
- JWT-based authentication (jsonwebtoken 9.0.3)
- bcryptjs 3.0.3 for password hashing

**Data layer**:
- MongoDB 6.6.0 (native driver, no ORM)
- Collections created on first insert
- No explicit schema validation (relies on application logic)
- Connection pooling via singleton pattern in `lib/server/db.js`

**Auth**:
- JWT tokens stored client-side (localStorage)
- Protected routes use `requireAuth()` helper
- Token validation on every authenticated request
- No refresh token mechanism (MVP)

**State management**:
- React hooks (useState, useEffect, useRef)
- Client-side state in `HomeClient.jsx` (~5500 lines SPA component)
- Server state fetched via API calls (no global state management library)
- URL query params for navigation state (`?tripId=X&tab=Y`)

**Tooling**:
- **Testing**: Vitest 4.0.16 (unit), Playwright 1.57.0 (E2E)
- **Linting**: ESLint (not installed in devDependencies, but referenced in build)
- **Build**: Next.js standalone output mode (Vercel-ready)
- **Package manager**: Yarn 1.22.22

**External integrations**:
- OpenAI API (via `lib/server/llm.js`) for itinerary generation
- date-fns 4.1.0 for date utilities
- sonner 2.0.5 for toast notifications

## 3. Repository Structure

```
/app
├── page.js                    # Root page (wraps HomeClient.jsx)
├── HomeClient.jsx             # Main SPA component (~5500 lines)
├── layout.js                  # Root layout
├── globals.css                # Global styles
├── api/
│   ├── [[...path]]/route.js   # Centralized API handler (~7100 lines)
│   ├── discover/posts/        # Discover posts API
│   └── seed/discover/         # Dev seed endpoint
├── dashboard/page.js          # Dashboard page (server component)
├── circles/[circleId]/        # Circle detail page
├── trips/[tripId]/            # Trip detail page (redirects to SPA)
├── members/[userId]/          # Member profile page
└── settings/privacy/          # Privacy settings page

/components
├── dashboard/                  # Dashboard-specific components
│   ├── TripCard.jsx
│   ├── CircleSection.jsx
│   ├── CreateCircleDialog.jsx
│   ├── CreateTripDialog.jsx
│   └── GlobalNotifications.jsx
├── trip/
│   ├── TripTabs/              # Trip detail tabs
│   │   ├── TripTabs.tsx
│   │   └── tabs/
│   │       ├── ChatTab.tsx
│   │       ├── PlanningTab.tsx
│   │       ├── ItineraryTab.tsx
│   │       ├── AccommodationTab.tsx
│   │       ├── PrepTab.tsx
│   │       ├── MemoriesTab.tsx
│   │       └── TravelersTab.tsx
│   ├── chat/                   # Chat-specific components
│   ├── CancelTripDialog.tsx
│   └── TransferLeadershipDialog.tsx
├── ui/                        # shadcn/ui component library (48 components)
└── brand/                     # Branding components (TrypzyLogo)

/lib
├── server/                    # Server-side utilities
│   ├── db.js                  # MongoDB connection
│   ├── auth.js                # JWT auth helpers
│   ├── cors.js                # CORS handling
│   └── llm.js                 # OpenAI integration
├── trips/                     # Trip domain logic (17 files)
│   ├── stage.js               # Stage computation
│   ├── progress.js            # Progress tracking
│   ├── buildTripCardData.js   # Trip card data builder
│   ├── getUserActionRequired.js
│   ├── applyProfileTripPrivacy.js
│   ├── canViewerSeeTrip.js    # Privacy filtering
│   └── ...
├── dashboard/                 # Dashboard data fetching
│   ├── getDashboardData.js
│   └── sortTrips.js
├── navigation/                # Route helpers
│   └── routes.js
├── chat/                      # Chat event emission
├── nudges/                    # Nudge engine (evaluation, copy, dedupe, metrics)
├── itinerary/                 # Itinerary processing
├── accommodations/             # Accommodation helpers
├── prep/                      # Prep suggestions
└── utils.js                   # General utilities (cn helper)

/tests                        # Unit tests (Vitest)
├── api/                       # API endpoint tests (8 files)
├── itinerary/                 # Itinerary-specific tests
├── nudges/                    # Nudge engine tests (4 files, 53 tests)
├── trips/                     # Trip domain tests
└── setup.js                   # Test setup/teardown

/e2e                          # End-to-end tests (Playwright)
├── navigation.spec.ts
└── discover-flow.spec.js

/public
├── brand/                     # Brand assets (logos, icons)
└── uploads/                   # User-uploaded images

/docs
├── api/                       # API documentation
├── features/                   # Feature specifications
└── tests/                     # Testing documentation
```

**Directory purposes**:
- `/app`: Next.js App Router pages and API routes
- `/components`: React components organized by domain (dashboard, trip, ui)
- `/lib`: Shared utilities organized by domain (server, trips, dashboard, etc.)
- `/tests`: Unit tests using Vitest
- `/e2e`: End-to-end tests using Playwright
- `/public`: Static assets served directly
- `/docs`: Documentation for API, features, and tests

## 4. Architecture & Data Flow

### Client ↔ API Interaction Model

**Request flow**:
1. Client component calls `api(endpoint, options, token)` helper (defined in `HomeClient.jsx`)
2. Helper adds JWT token to `Authorization: Bearer <token>` header
3. Request sent to `/api/<endpoint>`
4. API route handler (`app/api/[[...path]]/route.js`) pattern-matches route
5. `requireAuth()` validates JWT and fetches user from DB
6. Route handler executes business logic
7. Response returned as JSON with CORS headers

**Response handling**:
- Success: Data returned directly to component
- Error: Error message in `{ error: string }` format, displayed via toast (sonner)

### How Trip / Circle Data is Fetched and Cached

**Dashboard data**:
- Server component (`app/dashboard/page.js`) calls `getDashboardData(userId)`
- Function fetches circles, trips, and related data in bulk (avoids N+1)
- Applies privacy filtering server-side
- Returns structured data: `{ circles: [], globalNotifications: [] }`
- Client-side SPA (`HomeClient.jsx`) receives data and manages local state

**Trip detail data**:
- Client calls `api('/trips/:id')` on navigation
- API returns full trip object with computed fields (`_computedStage`, `_primaryTab`)
- Client stores in `selectedTrip` state
- No explicit caching (refetch on navigation)

**Circle data**:
- Fetched via `api('/circles')` or `api('/circles/:id')`
- Stored in `circles` state array
- Updated on create/join operations

### Where Business Logic Lives

**Server-side (API routes)**:
- Authentication & authorization
- Data validation
- Privacy filtering (`lib/trips/canViewerSeeTrip.js`)
- Stage transitions (validated via `lib/trips/validateStageAction.js`)
- Trip participant management
- LLM itinerary generation

**Client-side (`HomeClient.jsx`)**:
- UI state management
- Navigation logic (URL normalization, popstate handling)
- Form handling
- Toast notifications
- Local state for selected trip/circle

**Shared utilities (`lib/`)**:
- Stage computation (`lib/trips/stage.js`)
- Progress tracking (`lib/trips/progress.js`)
- Trip card data building (`lib/trips/buildTripCardData.js`)
- Route helpers (`lib/navigation/routes.js`)

### Stage-Based Gating Patterns

**Trip stages** (from `lib/trips/stage.js`):
- `PROPOSED` → `DATES_LOCKED` → `ITINERARY` → `STAY` → `PREP` → `ONGOING` → `COMPLETED`

**Stage enforcement**:
- Server validates stage transitions via `validateStageAction()`
- Client computes stage via `deriveTripPrimaryStage()`
- UI shows/hides actions based on stage
- Navigation routes to appropriate tab based on stage

**Role-based gating**:
- Trip leader: `trip.createdBy === userId` (enforced server-side)
- Active traveler: `trip_participants.status === 'active'` or implicit for collaborative trips
- Circle member: `memberships` collection lookup
- Permissions checked server-side before allowing actions

### Simple Flow Diagram

```
User Action (Click Trip Card)
  ↓
UI Component (HomeClient.jsx)
  ↓
API Call (api('/trips/:id'))
  ↓
API Route Handler (route.js)
  ↓
Auth Check (requireAuth())
  ↓
Business Logic (fetch trip, compute stage)
  ↓
Privacy Filter (canViewerSeeTrip())
  ↓
MongoDB Query
  ↓
Response (JSON with trip data)
  ↓
Client State Update (setSelectedTrip)
  ↓
UI Re-render (TripDetailView)
```

## 5. Domain Model

### Core Entities

#### User
**Key fields**:
- `id` (string, unique)
- `email`, `name`, `password` (hashed)
- `avatarUrl` (optional)
- `privacy` (object): `profileVisibility`, `tripsVisibility`, `allowTripJoinRequests`, `showTripDetailsLevel`
- `createdAt`, `updatedAt`

**Relationships**:
- One-to-many: `memberships` → Circles
- One-to-many: `trips` (as creator)
- Many-to-many: `trip_participants` → Trips

#### Circle
**Key fields**:
- `id` (string, unique)
- `name`, `description`
- `ownerId` (references users.id)
- `inviteCode` (uppercase, 6 chars)
- `createdAt`

**Relationships**:
- One-to-many: `memberships` → Users
- One-to-many: `trips` → Trips
- Owner: `ownerId === users.id`

#### Trip
**Key fields**:
- `id` (string, unique)
- `name`, `description`
- `circleId` (references circles.id)
- `createdBy` (references users.id) - **trip leader**
- `type`: `'collaborative'` | `'hosted'`
- `status`: `'proposed'` | `'scheduling'` | `'voting'` | `'locked'` | `'completed'` | `'canceled'`
- `schedulingMode`: `'date_windows'` (default for collaborative) | `'top3_heatmap'` (legacy)
- `startDate`, `endDate` (broad window)
- `lockedStartDate`, `lockedEndDate` (finalized dates)
- `destinationHint` (optional, editable by leader even when locked)
- `itineraryStatus`: `'collecting_ideas'` | `'drafting'` | `'selected'` | `'published'` | `'revising'` | `null`
- `canceledAt`, `canceledBy` (for canceled trips)
- `createdAt`, `updatedAt`

**Relationships**:
- Many-to-one: `circleId` → Circle
- One-to-many: `trip_participants` → Users
- One-to-many: `trip_messages` → Messages
- One-to-many: `itinerary_ideas` → Ideas
- One-to-many: `trip_join_requests` → Join Requests

**Ownership / permissions**:
- **Trip leader**: `trip.createdBy === userId` (can lock dates, open voting, cancel trip, transfer leadership)
- **Active travelers**: Can submit availability/votes, leave trip (non-leaders), view full trip details
- **Circle members**: Can view trip (subject to privacy), join collaborative trips automatically

#### Membership / Traveler

**`memberships` collection**:
- `userId`, `circleId`
- `role`: `'owner'` | `'member'`
- `joinedAt`

**`trip_participants` collection**:
- `tripId`, `userId`
- `status`: `'active'` | `'left'` | `'removed'` (default: `'active'`)
- `joinedAt`, `createdAt`, `updatedAt`

**Traveler determination**:
- **Collaborative trips**: All circle members are travelers (unless `status='left'/'removed'`)
- **Hosted trips**: Only explicit `trip_participants` with `status='active'` are travelers
- **Active travelers**: Used for privacy filtering and action requirements

#### Scheduling / Availability / Vote

**`trip_date_picks` collection** (top3_heatmap mode):
- `tripId`, `userId`
- `picks` (array of `{ rank, startDateISO, endDateISO }`)
- `createdAt`, `updatedAt`

**`availabilities` collection** (legacy system):
- `tripId`, `userId`
- `day` (YYYY-MM-DD) or `isBroad: true` or `isWeekly: true`
- `status`: `'available'` | `'maybe'` | `'unavailable'`
- `createdAt`

**`votes` collection**:
- `tripId`, `userId`
- `selectedWindow` (object with `startDate`, `endDate`)
- `createdAt`

**Scheduling flow**:
1. Trip created in `proposed` status
2. Leader or travelers submit availability/date picks
3. Auto-transition to `scheduling` when first availability submitted
4. Leader opens voting (`status='voting'`)
5. Travelers vote on top windows
6. Leader locks dates (`status='locked'`, sets `lockedStartDate`, `lockedEndDate`)

### Relationships Summary

| Entity | Relationship | Target | Type |
|--------|-------------|--------|------|
| User | has many | Memberships | One-to-many |
| User | has many | Trips (as creator) | One-to-many |
| User | has many | Trip Participants | Many-to-many (via junction) |
| Circle | has many | Memberships | One-to-many |
| Circle | has many | Trips | One-to-many |
| Trip | belongs to | Circle | Many-to-one |
| Trip | has many | Trip Participants | Many-to-many (via junction) |
| Trip | has many | Messages | One-to-many |
| Trip | has many | Itinerary Ideas | One-to-many |
| Trip | has many | Join Requests | One-to-many |

## 6. State & Permissions Model

### How Roles are Determined

**Trip Leader**:
- Determined by: `trip.createdBy === userId`
- Enforced: Server-side in API routes
- Permissions: Lock dates, open voting, cancel trip, transfer leadership, edit destinationHint even when locked

**Circle Owner**:
- Determined by: `circle.ownerId === userId`
- Enforced: Server-side in API routes
- Permissions: Manage circle, delete circle

**Active Traveler**:
- Determined by:
  - Collaborative trips: Circle member AND (`trip_participants.status !== 'left'/'removed'` OR no record exists)
  - Hosted trips: `trip_participants.status === 'active'`
- Enforced: Server-side in API routes
- Permissions: Submit availability/votes, view full trip details, leave trip (non-leaders)

**Circle Member**:
- Determined by: `memberships` collection lookup
- Enforced: Server-side in API routes
- Permissions: View circle trips (subject to privacy), join collaborative trips automatically

### How Trip Stages are Represented

**Status field** (`trip.status`):
- `'proposed'` → `'scheduling'` → `'voting'` → `'locked'` → `'completed'` | `'canceled'`

**Primary stage** (computed client-side via `deriveTripPrimaryStage()`):
- `PROPOSED` - Dates not locked
- `DATES_LOCKED` - Dates locked, itinerary not finalized
- `ITINERARY` - Itinerary finalized, accommodation not chosen
- `STAY` - Accommodation chosen, prep not started
- `PREP` - Prep started, trip not ongoing
- `ONGOING` - Trip dates are active (today within range)
- `COMPLETED` - Trip end date has passed

**Stage transitions**:
- `proposed` → `scheduling`: Auto on first availability submission
- `scheduling` → `voting`: Manual (leader action via `POST /api/trips/:id/open-voting`)
- `voting` → `locked`: Manual (leader action via `POST /api/trips/:id/lock`)
- `locked` → `completed`: Auto when `endDate < today`

### Where Permissions are Enforced

**Server-side (API routes)**:
- All authenticated endpoints check `requireAuth()`
- Trip actions check `trip.createdBy === userId` for leader-only operations
- Circle actions check `circle.ownerId === userId` for owner-only operations
- Privacy filtering applied in trip list endpoints (`canViewerSeeTrip()`)
- Stage transitions validated via `validateStageAction()`

**Client-side (UI)**:
- Buttons disabled/hidden based on role (leader vs traveler)
- CTAs shown/hidden based on `getUserActionRequired()`
- Privacy settings affect UI visibility (but server is source of truth)

### Known Invariants

1. **Trip always has exactly one leader**: `trip.createdBy` is set on creation and can be transferred via leave API with `transferToUserId`
2. **Collaborative trips**: All circle members are travelers unless explicitly left/removed
3. **Hosted trips**: Only explicit `trip_participants` are travelers
4. **Privacy**: Upcoming Trips Visibility ONLY applies to other-user profile views, never self/dashboard/circle pages
5. **Stage progression**: Stages progress forward only (no rollback in MVP)
6. **Canceled trips**: Read-only, no further scheduling/voting/lock actions allowed

## 7. Key Components & Modules

### TripTabs
**Location**: `components/trip/TripTabs/`
**Responsibility**: Tabbed interface for trip detail view
**Tabs**:
- `ChatTab`: Primary interactive conversation surface
- `PlanningTab`: Scheduling/availability/voting interface
- `ItineraryTab`: Idea submission and LLM generation
- `AccommodationTab`: Stay requirements and selection
- `PrepTab`: Preparation checklist
- `MemoriesTab`: Photo sharing
- `TravelersTab`: Participant management

**Boundaries**: Handles tab switching, passes trip data to child tabs, manages active tab state

### ChatTab
**Location**: `components/trip/TripTabs/tabs/ChatTab.tsx`
**Responsibility**: Trip chat interface with user messages and system messages
**Features**:
- Chronological message display
- System messages (read-only, visually distinct)
- Inline CTAs for stage transitions
- Message composition (disabled for left users/canceled trips)

**Boundaries**: Owns chat message rendering, delegates message sending to API

### Dashboard
**Location**: `app/dashboard/page.js` (server) + `HomeClient.jsx` (client)
**Responsibility**: Main landing page showing circles and trips
**Features**:
- Circle list with trips
- Trip cards with status badges
- Global notifications
- Navigation to trip/circle detail

**Boundaries**: Server component fetches data, client SPA handles navigation and state

### Progress Pane
**Location**: `components/dashboard/TripProgressMini.jsx` + `lib/trips/progress.js`
**Responsibility**: Visual progress indicator for trip milestones
**Steps**: Proposed → Dates → Itinerary → Stay → Prep → Ongoing → Memories → Expenses

**Boundaries**: Computes progress from trip data, displays visual steps

### Scheduling Logic
**Location**: `lib/trips/` + `components/trip/command-center-v2/overlays/SchedulingOverlay.tsx`
**Responsibility**: Date window collection, support signaling, date locking
**Features**:
- Date windows mode (default): travelers propose date ranges, signal support, leader proposes and locks
- Legacy modes: top3 heatmap (date picks), broad/weekly/per-day availability
- Lock confirmation with guardrails

**Boundaries**: UI in SchedulingOverlay, business logic in API routes, helpers in `lib/trips/`

### Navigation Helpers
**Location**: `lib/navigation/routes.js`
**Responsibility**: Canonical URL generation and route helpers
**Functions**:
- `tripHref(tripId)`: Generate trip URL
- `circlePageHref(circleId)`: Generate circle URL
- `dashboardCircleHref(circleId)`: Generate dashboard with circle filter

**Boundaries**: Pure functions, no side effects

### Stage Computation
**Location**: `lib/trips/stage.js`
**Responsibility**: Compute trip primary stage and tab routing
**Functions**:
- `deriveTripPrimaryStage(trip)`: Compute current stage
- `getPrimaryTabForStage(stage)`: Map stage to default tab
- `computeProgressFlags(trip)`: Compute progress step flags

**Boundaries**: Pure functions, no API calls, used by both client and server

### Nudge Engine
**Location**: `lib/nudges/`
**Responsibility**: Evaluate trip state and produce informational system messages in chat
**Features**:
- Pure function engine (`computeNudges()`) evaluating 8 nudge types
- Nudges surfaced as system messages in trip chat with `bg-brand-sand` styling
- Dedupe via `nudge_events` collection (cooldown-based)
- Feature-flagged via `NEXT_PUBLIC_NUDGES_ENABLED`

**Boundaries**: Engine is pure (no side effects), persistence in `store.ts`, API wiring in `route.js`

### Privacy Filtering
**Location**: `lib/trips/canViewerSeeTrip.js` + `lib/trips/applyProfileTripPrivacy.js`
**Responsibility**: Apply privacy rules to trip visibility
**Rules**:
- "Most restrictive wins": If any active traveler is private, non-travelers can't see trip
- Context-aware: Different rules for profile views vs dashboard/circle views

**Boundaries**: Server-side filtering, applied in dashboard and trip list endpoints

## 8. External Dependencies

### Notable NPM Packages

**UI Libraries**:
- `@radix-ui/*` (15+ packages): Headless UI primitives for shadcn/ui components
- `lucide-react`: Icon library
- `sonner`: Toast notifications
- `recharts`: Chart library (used in progress visualization)

**Form & Validation**:
- `react-hook-form`: Form state management
- `zod`: Schema validation
- `@hookform/resolvers`: Zod integration for react-hook-form

**Date Handling**:
- `date-fns`: Date utilities and formatting
- `react-day-picker`: Date picker component

**Data & State**:
- `mongodb`: Native MongoDB driver (no ORM)
- `jsonwebtoken`: JWT token generation/validation
- `bcryptjs`: Password hashing

**Build & Dev**:
- `next`: Next.js framework
- `react`, `react-dom`: React library
- `tailwindcss`: CSS framework
- `vitest`: Unit testing
- `playwright`: E2E testing

### LLM Integration

**OpenAI API** (`lib/server/llm.js`):
- `generateItinerary()`: Generate itinerary from ideas
- `summarizeFeedback()`: Summarize user feedback
- `reviseItinerary()`: Revise itinerary based on feedback

**Usage**: Gated by leader permissions, cost considerations, rate limiting

### Why They Exist

- **Radix UI**: Accessible, unstyled primitives for building custom components
- **shadcn/ui**: Copy-paste component library (not installed, components in repo)
- **MongoDB native driver**: Lightweight, no ORM overhead for MVP
- **JWT**: Stateless authentication, no session storage needed
- **Vitest/Playwright**: Comprehensive testing strategy (unit + E2E)

## 9. Known Constraints & Assumptions

### MVP Constraints

1. **No trip rollback**: Once dates are locked, cannot unlock (MVP decision)
2. **No refresh tokens**: JWT only, tokens stored client-side
3. **No real-time updates**: Polling/refetch on navigation (no WebSockets)
4. **Single leader**: Only one trip leader at a time (can transfer)
5. **Limited itinerary ideas**: Max 3 ideas per user per trip
6. **No trip editing**: Trip name/description not editable after creation (destinationHint is exception)
7. **Image storage**: Local filesystem (`public/uploads/`), not cloud storage

### Scale Assumptions

1. **Small to medium groups**: Optimized for 4-30 person circles
2. **Low trip volume**: Assumes < 100 trips per circle
3. **Synchronous operations**: No background jobs, all operations synchronous
4. **Single region**: No multi-region deployment considerations
5. **MongoDB indexes**: Not explicitly defined (relies on default indexes)

### Tradeoffs Made

1. **Large SPA component**: `HomeClient.jsx` (~5500 lines) - Chosen for MVP speed, refactor later
2. **Centralized API route**: `route.js` (~7100 lines) - Pattern matching keeps it organized, but large file
3. **No ORM**: Native MongoDB driver - Chosen for flexibility and performance
4. **Client-side state**: No global state management - Chosen for simplicity
5. **Privacy complexity**: Context-aware privacy rules - Chosen for user trust, adds complexity
6. **Stage computation client-side**: `deriveTripPrimaryStage()` - Chosen for responsiveness, but must stay in sync with server

### Explicit Constraints

1. **Circle Lounge removed**: POST to `/api/circles/:id/messages` returns 410 Gone
2. **Circle Updates read-only**: No composer, digest only
3. **Trip Chat is primary surface**: No duplicate interactive chat surfaces
4. **Privacy never blocks collaboration**: Travelers always see their trips
5. **No anonymous browsing**: All content requires authentication

## 10. Open Questions / Areas of Risk

### Fragile Areas

1. **Privacy logic** (`lib/trips/canViewerSeeTrip.js`, `lib/trips/applyProfileTripPrivacy.js`):
   - Complex context-aware rules
   - Easy to regress privacy behavior
   - **Mitigation**: Comprehensive tests in `tests/api/trip-privacy-permissions.test.js`

2. **Trip stage transitions** (`lib/trips/stage.js`, `lib/trips/validateStageAction.js`):
   - Multiple status fields (`status`, `itineraryStatus`)
   - Risk of inconsistent state if transitions not atomic
   - **Mitigation**: Use `computeTripProgressSnapshot` as source of truth

3. **Traveler computation**:
   - Different logic for collaborative vs hosted trips
   - Computed in multiple places (dashboard, circle pages, trip pages)
   - **Mitigation**: Centralize in `buildTripCardData.js` where possible

4. **Navigation state** (`HomeClient.jsx`):
   - Complex URL normalization logic
   - Popstate handler with ref guards to prevent loops
   - **Risk**: Infinite redirect loops if guards fail
   - **Mitigation**: Refs (`authRedirectRef`, `dashboardRedirectRef`) prevent loops

5. **Large files**:
   - `HomeClient.jsx` (~5500 lines) - Hard to navigate, prone to merge conflicts
   - `route.js` (~7100 lines) - Large but organized via pattern matching
   - **Mitigation**: Refactor only when necessary, prefer extracting focused components

### Incomplete Flows

1. **E2E test coverage**: Only 2 test files (`navigation.spec.ts`, `discover-flow.spec.js`)
2. **Visual regression testing**: None
3. **Performance testing**: No load testing or performance benchmarks
4. **Error recovery**: Limited error handling for network failures
5. **Offline support**: None (assumes always-online)

### Things Future Work Should Be Careful With

1. **Don't filter trips by privacy in self contexts**: Use `applyProfileTripPrivacy` with correct context
2. **Don't call `setState` during render**: Use `useEffect` for side effects
3. **Don't assume `api` is global**: Pass as prop or use fetch helper
4. **Don't use TypeScript syntax in `.js`/`.jsx` files**: ESLint configured to prevent this
5. **Don't create duplicate interactive surfaces**: Trip Chat is the only interactive chat
6. **Don't bypass stage validation**: Always use `validateStageAction()` for stage transitions
7. **Don't assume traveler status**: Always check `trip_participants` status for hosted trips
8. **Don't forget circle join backfill**: New members must be added to existing collaborative trips

### Testing Gaps

- E2E coverage is minimal (2 test files)
- Unit tests cover API routes but not all edge cases
- No visual regression testing
- Privacy rules have good test coverage after recent hardening
- No performance/load testing

### Performance Considerations

- `HomeClient.jsx` is large but necessary for SPA architecture
- MongoDB queries could benefit from explicit indexes (not defined in code)
- Image uploads stored in `public/uploads/` (consider cloud storage for production)
- LLM calls for itinerary generation are expensive (consider caching)
- No query result caching (refetch on every navigation)

---

**Last Updated**: 2026-01 (post MVP hardening + nudge engine surfacing)
