# AI Development Context Guide for Trypzy

> **⚠️ IMPORTANT DISCLAIMER**: This document is for **human developers and external LLM tools** (ChatGPT, Claude, Cursor agent) working on the Trypzy codebase. It is **NOT** used by Trypzy's runtime AI features (e.g., itinerary generation). This is purely a development guide.

---

## A) Project Identity

### What Trypzy Is
Trypzy is a **private, trust-based trip planning platform** for friend groups. The core value proposition is progressive scheduling: friends propose trips, share availability, vote on promising date windows, and lock dates when ready—all without requiring unanimous participation.

### MVP Target
- **Primary users**: Friend groups organizing trips together
- **Core workflow**: Progressive scheduling (broad intent → availability → voting → locked dates)
- **Key principle**: Availability ≠ Commitment. Only locking dates represents commitment.

### Core Product Principles

1. **Chat-First**: Trip Chat is the ONLY interactive conversation surface. All other surfaces (Circle Updates) are read-only digests.
2. **Circle-Based**: Private friend groups (Circles) organize trips. Circle membership grants access to circle content.
3. **Stage-Based Planning**: Trips progress through explicit stages (proposed → scheduling → voting → locked → planning)
4. **Privacy-First**: Trust-based design with context-aware privacy controls that never prevent users from seeing their own trips.
5. **Progressive Narrowing**: Scheduling narrows intent until a single moment of commitment (date locking), then everything flows from that.

### Trip Command Center (Default Trip Detail View)

The Trip Command Center is now the **default experience** when viewing a trip. It implements a chat-centric, decision-focused UI.

**Three-Zone Architecture:**
```
┌─────────────────────────────────────────────────────┐
│  Zone 1: Trip Focus Banner                           │
│  - "What's blocking this trip?" (DATES/ITINERARY/   │
│    ACCOMMODATION/READY)                              │
│  - LLM confidence score, recommended action CTA     │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Zone 2: Decision Cards (Accordion)                  │
│  - Primary: Scheduling, Itinerary, Accommodation    │
│  - Secondary (under "+ More"): Travelers, Prep,     │
│    Expenses                                          │
│  - Only ONE expanded at a time                      │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  Zone 3: Trip Chat Feed                             │
│  - Primary interaction surface                      │
│  - 5-second polling for new messages                │
└─────────────────────────────────────────────────────┘
```

**Key Files:**
- `components/trip/command-center/TripCommandCenter.tsx` - Main orchestrator
- `components/trip/command-center/TripFocusBanner.tsx` - Zone 1
- `components/trip/command-center/decision-modules/*.tsx` - Zone 2 modules
- `hooks/use-trip-intelligence.ts` - LLM blocker detection
- `hooks/use-trip-chat.ts` - Chat with polling

**Legacy Fallback:** Add `?ui=legacy` to access old tab-based UI. Actions like "Pick Dates" currently navigate to legacy tabs (`?ui=legacy&tab=planning`).

**Future Work:** Build inline UI for scheduling/itinerary, then delete `TripDetailViewLegacy` (~1,640 lines).

---

## B) Golden Rules (Non-Negotiables)

### Privacy Model Scoping

**CRITICAL**: Privacy settings have strict context boundaries. Violating these rules causes user-visible bugs.

#### Rule 1: Upcoming Trips Visibility
- **ONLY applies to**: Other-user profile views (`PROFILE_VIEW` context)
- **NEVER applies to**: Dashboard, Circle trips page, Trip detail pages, Self profile views
- **Implementation**: Use `applyProfileTripPrivacy()` with correct context parameter
- **Files**: `lib/trips/applyProfileTripPrivacy.js`, `app/api/[[...path]]/route.js` (line ~7040)

**Correct usage**:
```javascript
// ✅ CORRECT: Profile view (other-user)
const { filteredTrips } = await applyProfileTripPrivacy({
  viewerId,
  ownerId: targetUserId,
  ownerPrivacy: targetUser.privacy,
  trips,
  context: 'PROFILE_VIEW'
})

// ✅ CORRECT: Dashboard (self context)
// DO NOT call applyProfileTripPrivacy at all
const trips = await db.collection('trips').find({ circleId: { $in: circleIds } }).toArray()
// Use trips directly, no filtering
```

**Incorrect usage**:
```javascript
// ❌ WRONG: Filtering trips in dashboard
const filtered = await filterTripsByPrivacy(db, trips, userId) // NO! This hides trips from owner
```

#### Rule 2: Trip Details Level
- **ONLY affects**: Profile views for non-travelers
- **NEVER affects**: Travelers, owners, or any self contexts
- **Implementation**: Check `applyDetailsLevel` flag from `applyProfileTripPrivacy()`
- **When limited**: Hide dates, reduce metadata. Travelers always see full details.

#### Rule 3: Profile Visibility
- Controls whether other users can view a member's profile page at all
- If `profileVisibility === 'private'` and `viewerId !== ownerId`: block profile access
- Owner can always view their own profile

### Permissions Model

#### Circle Member vs Traveler vs Invite/Pending

**Circle Member**:
- User in `memberships` collection for a circle
- Grants access to circle content (trips, posts, updates)
- Determined by: `memberships` collection lookup

**Traveler** (Active):
- **Collaborative trips**: All circle members are travelers by default (unless `trip_participants.status === 'left'/'removed'`)
- **Hosted trips**: Only users with `trip_participants` record and `status === 'active'`
- **Computation**: See `lib/trips/buildTripCardData.js` and trip detail APIs
- **Key files**: `app/api/[[...path]]/route.js` (lines ~7010-7085)

**Invite/Pending**:
- User has `trip_join_requests` record with `status === 'pending'`
- Only for hosted trips
- Shown in member profile when `allowTripJoinRequests === true`

**Backfill Rule**: When user joins circle, automatically add to `trip_participants` for all existing collaborative trips (see `app/api/[[...path]]/route.js` lines ~500-555)

### CTA Rules

#### Single Primary CTA
- **One CTA per trip card**: Either red (action required) or neutral (view trip)
- **Source of truth**: `trip.actionRequired` (computed via `getUserActionRequired()`)
- **File**: `components/dashboard/TripCard.jsx` (lines 86-117)

#### CTA Color Logic
```javascript
// ✅ CORRECT
const actionRequired = trip.actionRequired === true
const primaryLabel = actionRequired 
  ? 'Pick your dates' // or 'Vote on dates'
  : 'View trip'

const ctaColor = actionRequired
  ? 'bg-primary text-primary-foreground' // Red
  : 'border border-input bg-background' // Neutral
```

**Incorrect patterns**:
```javascript
// ❌ WRONG: Using pendingActions.length
const showRed = pendingActions.length > 0 // NO! This shows red for non-blocking actions

// ❌ WRONG: Stage-based color
const showRed = trip.status === 'locked' // NO! Locked trips don't need action
```

#### "Waiting on you" Badge
- **Shown when**: `trip.actionRequired === true`
- **Separate from CTA**: Badge is informational, CTA is actionable
- **Location**: Above primary CTA in TripCard

#### No Redundant CTAs
- Do not add "See details" or "View more" if primary CTA already navigates to trip
- Trip card is already a Link, so CTA inside is redundant navigation

### Trip Stage Ordering

**Status values** (stored in `trips.status`):
1. `'proposed'` - Initial state, broad date window
2. `'scheduling'` - Collecting availability (auto-transitions from `proposed` when first availability submitted)
3. `'voting'` - Voting on top date windows (manual, leader opens)
4. `'locked'` - Dates finalized (manual, leader locks)
5. `'completed'` - Trip end date has passed

**Stage transitions**:
- `proposed` → `scheduling`: Automatic when first availability/date pick submitted
- `scheduling` → `voting`: Manual (leader calls `/api/trips/:id/open-voting`)
- `voting` → `locked`: Manual (leader calls `/api/trips/:id/lock`)
- `locked` → planning begins (itinerary, accommodation, prep)
- Any stage → `completed`: Automatic when `endDate < today`

**What each stage means**:
- **Proposed**: "We're thinking about this" - broad intent established
- **Scheduling**: "This is taking shape" - availability being collected
- **Voting**: "Decision soon" - choosing between realistic options
- **Locked**: "Dates are real" - commitment moment, planning begins
- **Completed**: Trip in the past

**Files**: `lib/trips/stage.js`, `lib/trips/progress.js`

---

## C) Common Workflows (Step-by-Step)

### Workflow 1: Create Circle → Invite Code → Join Circle

**Steps**:
1. User creates circle: `POST /api/circles` → returns circle with `inviteCode`
2. Share invite code (6-char uppercase, e.g., "ABC123")
3. Another user joins: `POST /api/circles/join` with `{ inviteCode: "ABC123" }`
4. **Backfill happens automatically**: User added to `trip_participants` for all existing collaborative trips in circle
5. User sees trips immediately on dashboard/circle page

**Key files**:
- `app/api/[[...path]]/route.js` (lines 373-564)
- Backfill logic: lines 500-555

**Verification**:
- Check `memberships` collection has new record
- Check `trip_participants` has records for all collaborative trips in circle
- User should see trips on dashboard without refresh

### Workflow 2: Create Trip in Circle

**Steps**:
1. User navigates to circle page or dashboard
2. Clicks "Create trip" (or "Create first trip" from onboarding)
3. Fills form: name, type (collaborative/hosted), start/end dates, duration
4. Submits: `POST /api/trips` with `{ circleId, name, type, startDate, endDate, duration }`
5. Trip created with `status: 'proposed'` (or `'locked'` for hosted)
6. For collaborative: All circle members are implicitly travelers
7. For hosted: Only creator is traveler (others must request to join)

**Key files**:
- `app/api/[[...path]]/route.js` (lines 646-730)
- `components/dashboard/CreateTripDialog.jsx`

**Verification**:
- Trip appears in circle trips list
- Trip appears on dashboard
- All circle members can see trip (for collaborative)

### Workflow 3: Date Voting Flow (Waiting on You Logic)

**Steps**:
1. Trip in `'proposed'` or `'scheduling'` stage
2. User hasn't submitted availability/date picks
3. `getUserActionRequired()` returns `true` → "Waiting on you" badge shown
4. User clicks trip card → lands on Planning tab
5. User submits date picks: `POST /api/trips/:id/date-picks` with `{ picks: [...] }`
6. `getUserActionRequired()` now returns `false` → badge disappears
7. When all users respond, leader sees "Lock dates" CTA
8. Leader locks: `POST /api/trips/:id/lock` → status becomes `'locked'`

**Key files**:
- `lib/trips/getUserActionRequired.js`
- `components/dashboard/TripCard.jsx` (lines 162-168)
- `app/api/[[...path]]/route.js` (lines 1602-1898 for date-picks, 1899-2019 for lock)

**Verification**:
- Badge appears/disappears based on `actionRequired`
- CTA color changes based on `actionRequired`
- No badge for locked/completed trips

### Workflow 4: Dates Locked → Itinerary Ideas Submission + Likes

**Steps**:
1. Trip status is `'locked'`
2. Itinerary tab shows ideas submission UI
3. User submits idea: `POST /api/trips/:id/ideas` with `{ text: "..." }`
4. Max 3 ideas per user (enforced server-side)
5. Ideas displayed with like count, sorted by likes then recency
6. User can like/unlike: `POST /api/trips/:id/ideas/:ideaId/like`
7. If user has < 3 ideas: "Waiting on you" badge shown (if this logic exists)
8. Leader can see ideas count, "Generate itinerary" button (disabled until enough ideas)

**Key files**:
- `app/api/[[...path]]/route.js` (lines 4096-4276)
- `components/trip/TripTabs/tabs/ItineraryTab.tsx`

**Verification**:
- Ideas appear in itinerary tab
- Like count updates correctly
- Max 3 ideas enforced
- Character limit (~120) enforced

### Workflow 5: Trip Chat System Messages

**Steps**:
1. System messages are emitted for key events:
   - Trip created
   - Dates locked
   - Member joined
   - Vote aggregation ("X/Y voted on dates")
2. Messages stored in `trip_messages` with `isSystem: true`, `userId: null`
3. Messages fetched: `GET /api/trips/:id/messages`
4. System messages chronologically interleaved with user messages
5. Rendered visually distinct (centered/muted) in ChatTab

**Key files**:
- `lib/chat/emitTripChatEvent.js`
- `app/api/[[...path]]/route.js` (lines 2868-2996)
- `components/trip/TripTabs/tabs/ChatTab.tsx`

**Verification**:
- System messages appear in chat timeline
- No duplicate messages
- Chronological order correct

### Workflow 6: Member Profile View + Join Request Behavior

**Steps**:
1. User A views User B's profile: `GET /api/users/:userId/profile`
2. Profile shows upcoming trips: `GET /api/users/:userId/upcoming-trips`
3. Privacy check: If B's `tripsVisibility === 'private'` and A ≠ B: return empty list
4. For each trip, compute `viewerIsTraveler` (server-side)
5. Show "Request to join" only if:
   - `!isViewingOwnProfile`
   - `!viewerIsTraveler`
   - `allowTripJoinRequests !== false`
   - No pending request exists
6. User A clicks "Request to join" → `POST /api/trips/:id/join-requests`
7. Leader sees request in dashboard notifications
8. Leader approves: `PATCH /api/trips/:id/join-requests/:requestId` → creates `trip_participants` record

**Key files**:
- `app/members/[userId]/page.js`
- `app/api/[[...path]]/route.js` (lines 6920-7109 for upcoming-trips, 2294-2609 for join-requests)

**Verification**:
- No "Request to join" shown when viewer is already traveler
- Privacy correctly hides trips on profile
- Join request creates participant record

### Workflow 7: Privacy Settings Update Behavior

**Steps**:
1. User navigates to `/settings/privacy`
2. Updates setting: `PATCH /api/users/:id` with privacy object
3. **Critical**: Privacy changes do NOT affect user's own view of trips
4. Changes only affect what others see on profile
5. Dashboard/circle pages immediately reflect (no filtering applied)

**Key files**:
- `app/settings/privacy/page.js`
- `app/api/[[...path]]/route.js` (lines 6750-6820)

**Verification**:
- User still sees own trips on dashboard after setting to "Private"
- Other users see empty list on profile if "Private"
- Self profile view shows all trips

---

## D) Key Files to Touch vs Avoid

### High-Risk Files (Touch with Caution)

**`app/HomeClient.jsx`** (~5500 lines)
- **Risk**: Large file, prone to merge conflicts, contains most client logic
- **Safe refactor strategy**:
  - Extract focused components (e.g., `TripDetailView`, `DashboardView`)
  - Move domain logic to `lib/` helpers
  - Avoid large structural changes unless necessary
  - Test thoroughly after any changes

**`app/api/[[...path]]/route.js`** (~7100 lines)
- **Risk**: Centralized API handler, easy to break multiple endpoints
- **Safe refactor strategy**:
  - Add new endpoints at end of file
  - Use pattern matching carefully (test route patterns)
  - Don't modify shared helpers without checking all usages
  - Keep route handlers focused and isolated

### Reusable Helpers (Prefer These)

**Trip Domain Logic** (`lib/trips/`):
- `getUserActionRequired.js` - Source of truth for "Waiting on you" badge
- `applyProfileTripPrivacy.js` - Context-aware privacy filtering
- `buildTripCardData.js` - Canonical trip card data builder (used by dashboard + circle pages)
- `stage.js` - Trip stage computation and navigation
- `progress.js` - Progress milestone definitions
- `getTripCountdownLabel.js` - Countdown label helper

**Dashboard Logic** (`lib/dashboard/`):
- `getDashboardData.js` - Dashboard data fetching (circles, trips, notifications)
- `sortTrips.js` - Trip sorting logic
- `getTripPrimaryHref.js` - Navigation helpers

**Navigation** (`lib/navigation/`):
- `routes.js` - Canonical URL helpers (use these, don't concatenate strings)

### Where to Add Tests

**Unit Tests** (`tests/api/`):
- Test API endpoints with Vitest
- Use test database: `trypzy_test`
- Pattern: Setup → Execute → Assert → Cleanup
- See `tests/api/trip-privacy-permissions.test.js` for examples

**E2E Tests** (`e2e/`):
- Test user flows with Playwright
- See `e2e/navigation.spec.ts` for examples

**Test Structure**:
```javascript
describe('Feature Name', () => {
  let client, db
  
  beforeAll(async () => {
    client = new MongoClient(MONGO_URI)
    await client.connect()
    db = client.db(TEST_DB_NAME)
  })
  
  afterAll(async () => {
    await client.close()
  })
  
  beforeEach(async () => {
    // Clean up test data
  })
  
  it('should do something', async () => {
    // Test implementation
  })
})
```

### Files to Avoid Modifying

- **`components/ui/*`** - shadcn/ui components, only modify if adding Trypzy-specific behavior
- **`lib/server/db.js`** - Database connection, don't change unless fixing connection issues
- **`lib/server/auth.js`** - Auth helpers, only modify for security fixes
- **`next.config.js`** - Next.js config, only modify for build/deployment issues

---

## E) How to Debug Fast

### Where Logs Are Printed

**Navigation logs** (development only):
- `app/HomeClient.jsx` line ~5502: `console.log('[NAV] App component', ...)`
- Shows: pathname, tripId, circleId, returnTo, view, auth state

**API route debugging**:
- `app/api/[[...path]]/route.js` line ~6181: Debug log for route and auth header
- Check browser Network tab for API responses
- Check MongoDB directly for data state

### Common Issues and How to Reproduce

#### Issue 1: Circle Join - Trip Not Showing

**Symptoms**: User joins circle, but doesn't see existing trips

**Debug steps**:
1. Check `memberships` collection: `db.memberships.find({ userId: '...', circleId: '...' })`
2. Check `trip_participants` collection: `db.trip_participants.find({ userId: '...', tripId: '...' })`
3. Verify backfill ran: Should have `trip_participants` records for all collaborative trips
4. Check trip type: Backfill only runs for `type: 'collaborative'`
5. Check API response: `GET /api/dashboard` should include trips in user's circles

**Fix**: Ensure backfill logic runs in `POST /api/circles/join` (lines 500-555)

#### Issue 2: CTA Mismatches (Red When Should Be Neutral)

**Symptoms**: Trip card shows red CTA even when user has no required action

**Debug steps**:
1. Check `trip.actionRequired` value (should be `false` for locked/completed trips)
2. Check `getUserActionRequired()` logic: Only returns `true` for Dates Picking stages
3. Verify CTA uses `actionRequired`, not `pendingActions.length`
4. Check trip status: Locked/completed trips should never show red CTA

**Fix**: Use `trip.actionRequired` as source of truth in `TripCard.jsx`

#### Issue 3: setState During Render

**Symptoms**: Console error "Cannot update a component while rendering a different component"

**Debug steps**:
1. Search for `setState` calls in component body (not in event handlers or useEffect)
2. Check for conditional hooks (hooks called inside `if` statements)
3. Verify all hooks called unconditionally at top level
4. Check for early returns before hooks

**Fix**: Move state updates to `useEffect` or event handlers

**Example fix**:
```javascript
// ❌ WRONG
function Component({ trip }) {
  if (trip.status !== 'locked') return null
  const [state, setState] = useState() // Hook after early return!
}

// ✅ CORRECT
function Component({ trip }) {
  const [state, setState] = useState() // Hooks first
  useEffect(() => {
    if (trip.status === 'locked') {
      setState(...) // State update in effect
    }
  }, [trip.status])
  if (trip.status !== 'locked') return null // Early return after hooks
}
```

#### Issue 4: Privacy Filtering Hiding Own Trips

**Symptoms**: User with privacy=Private can't see own trips on dashboard

**Debug steps**:
1. Check if `filterTripsByPrivacy` is called in dashboard/circle endpoints
2. Verify dashboard uses trips directly (no privacy filtering)
3. Check `applyProfileTripPrivacy` context: Should be `'DASHBOARD'` or `'CIRCLE_TRIPS'`
4. Verify self-context check: `viewerId === ownerId` should bypass filtering

**Fix**: Remove privacy filtering from self contexts (dashboard, circle pages)

#### Issue 5: "Request to join" Shown When Already Traveler

**Symptoms**: Member profile shows "Request to join" for trip user is already on

**Debug steps**:
1. Check `viewerIsTraveler` computation in upcoming-trips endpoint
2. Verify `trip_participants` record exists with `status === 'active'`
3. Check collaborative trip logic: Circle members are travelers by default
4. Verify frontend uses `trip.viewerIsTraveler` from server response

**Fix**: Ensure `viewerIsTraveler` computed correctly server-side

### Where to Look in API Route for Permissions Issues

**Membership checks**:
- Look for: `db.collection('memberships').findOne({ userId, circleId })`
- File: `app/api/[[...path]]/route.js` (multiple locations)
- Pattern: Check membership before allowing circle/trip access

**Traveler checks**:
- Look for: `trip_participants` queries or circle membership checks
- Collaborative trips: Check `circleMemberUserIds.has(userId)` and `status !== 'left'/'removed'`
- Hosted trips: Check `trip_participants` record with `status === 'active'`
- File: `app/api/[[...path]]/route.js` (lines ~7010-7085 for upcoming-trips, similar patterns elsewhere)

**Privacy checks**:
- Look for: `applyProfileTripPrivacy()` or `filterTripsByPrivacy()` calls
- Verify context parameter is correct
- Self contexts should NOT call privacy filters
- File: `app/api/[[...path]]/route.js` (line ~7040 for profile view)

**Owner checks**:
- Look for: `trip.createdBy === userId` or `circle.ownerId === userId`
- Used for: Lock dates, approve join requests, edit trip details

---

## F) Testing Expectations

### Unit Tests (Vitest)

**Location**: `tests/api/`

**Existing test files**:
- `trip-privacy-permissions.test.js` - Privacy and permissions rules
- `trip-privacy-filter.test.js` - Privacy filtering logic
- `circle-join-backfill.test.js` - Circle join backfill behavior
- `auth.test.js` - Authentication
- `trip-deletion-leaving.test.js` - Trip deletion and leaving
- `discover-posts.test.js` - Discover posts

**Test structure**:
- Use test database: `trypzy_test`
- Clean up test data in `beforeEach`
- Test both success and error cases
- Test edge cases (missing data, invalid inputs)

**Required regression tests** (from recent fixes):
1. Privacy: User with privacy=Private sees own trips on dashboard
2. Privacy: Other user viewing profile with privacy=Private sees empty trips list
3. Circle join: User joins circle → sees existing trips immediately
4. CTA: Red CTA only when `actionRequired === true`
5. Profile CTAs: No "Request to join" when viewer is already traveler

### E2E Tests (Playwright)

**Location**: `e2e/`

**Existing test files**:
- `navigation.spec.ts` - Navigation flows
- `discover-flow.spec.js` - Discover feature flows

**Coverage**: Minimal (2 files). Consider adding:
- Circle creation and join flow
- Trip creation and date locking flow
- Privacy settings update flow

### Test Commands

```bash
npm run test          # Run unit tests
npm run test:watch   # Watch mode
npm run test:e2e     # Run E2E tests
npm run test:all     # Run all tests
```

### Adding New Tests

**For API endpoints**:
1. Create test file in `tests/api/`
2. Follow existing patterns (see `trip-privacy-permissions.test.js`)
3. Test both success and error paths
4. Test edge cases (missing data, invalid inputs, permission boundaries)

**For UI components**:
- Consider E2E tests for critical user flows
- Unit tests for complex logic (extract to `lib/` helpers)

---

## G) PR Discipline

### Commit Message Style

**Format**: `Type: Brief description`

**Types**:
- `Fix:` - Bug fixes
- `Feat:` - New features
- `Refactor:` - Code refactoring
- `Docs:` - Documentation updates
- `Test:` - Test additions/updates

**Examples**:
```
Fix: remove TypeScript syntax from JSX and add lint guard
Fix: user who joins circle later must see existing trips (backfill travelers)
Fix: "Waiting on you" badge spam on TripCards
Feat: add itinerary idea submission and voting
Refactor: unify TripCard CTA semantics and colors
```

### PR Titles/Bodies Conventions

**Title format**: `[Type] Brief description`

**Body should include**:
1. **Goal**: What problem is being solved
2. **Changes**: List of files changed and why
3. **Testing**: How to verify the changes
4. **Breaking changes**: If any (usually none for MVP)

**Example**:
```markdown
## Goal
Fix privacy bug where "Upcoming Trips Visibility = Private" incorrectly hides trips from owner on dashboard.

## Changes
- Removed `filterTripsByPrivacy` from dashboard and circle trips endpoints
- Added context-aware privacy helper `applyProfileTripPrivacy`
- Updated member profile endpoint to use context-aware helper

## Testing
- User with privacy=Private still sees own trips on dashboard
- Other users viewing profile with privacy=Private see empty trips list
- All existing tests pass
```

### When to Split PRs

**Split if**:
- PR touches multiple unrelated features
- PR is > 500 lines of changes
- PR mixes refactoring with feature work
- PR has high risk of conflicts (e.g., `HomeClient.jsx`)

**Keep together if**:
- Changes are tightly coupled (e.g., API + UI for same feature)
- Changes are small and focused (< 200 lines)
- Changes are in different files with no overlap

### How to Verify Before Merge

**Checklist**:
- [ ] All tests pass (`npm run test:all`)
- [ ] No console errors in browser
- [ ] No TypeScript syntax in `.js`/`.jsx` files
- [ ] Privacy rules verified (self contexts show all trips)
- [ ] CTA logic verified (red only when `actionRequired === true`)
- [ ] No "Request to join" shown when viewer is traveler
- [ ] Circle join backfill works (new members see existing trips)
- [ ] No React hooks violations (hooks called unconditionally)
- [ ] No `setState` during render

**Manual verification steps**:
1. Create circle, create trip, join as another user → verify trip appears
2. Set privacy=Private → verify own trips still visible on dashboard
3. View other user's profile with privacy=Private → verify trips hidden
4. Create trip in Dates Picking → verify "Waiting on you" badge appears
5. Submit availability → verify badge disappears
6. Lock dates → verify CTA becomes neutral "View trip"

---

## Quick Reference: File Locations

### Critical Files
- **Trip Command Center (default)**: `components/trip/command-center/TripCommandCenter.tsx`
- **Focus Banner**: `components/trip/command-center/TripFocusBanner.tsx`
- **Decision Modules**: `components/trip/command-center/decision-modules/`
- **Trip Intelligence Hook**: `hooks/use-trip-intelligence.ts`
- **Trip Chat Hook**: `hooks/use-trip-chat.ts`
- **Privacy logic**: `lib/trips/applyProfileTripPrivacy.js`, `lib/trips/filterTripsByPrivacy.js`
- **Action required**: `lib/trips/getUserActionRequired.js`
- **Trip card data**: `lib/trips/buildTripCardData.js`
- **Trip stages**: `lib/trips/stage.js`
- **Dashboard data**: `lib/dashboard/getDashboardData.js`
- **API routes**: `app/api/[[...path]]/route.js`
- **Main SPA**: `app/HomeClient.jsx`
- **Trip card UI**: `components/dashboard/TripCard.jsx`
- **LLM functions**: `lib/server/llm.js` (includes `detectBlocker()`, `generateNudge()`, `summarizeConsensus()`)

### Legacy Files (accessible via ?ui=legacy)
- **Legacy trip detail**: `TripDetailViewLegacy` in `app/HomeClient.jsx` (~1,640 lines, lines 4071-5705)
- **Legacy tab container**: `components/trip/TripTabs/TripTabs.tsx`
- **Legacy tabs**: `components/trip/TripTabs/tabs/*.tsx`

### Test Files
- **Privacy tests**: `tests/api/trip-privacy-permissions.test.js`
- **Circle join tests**: `tests/api/circle-join-backfill.test.js`
- **E2E tests**: `e2e/navigation.spec.ts`

### Documentation
- **Setup**: `SETUP.md`
- **Scheduling MVP**: `scheduling_mvp.md`
- **Features**: `docs/features/`

---

## Common Patterns to Follow

### Adding a New API Endpoint
1. Add route handler in `app/api/[[...path]]/route.js`
2. Use pattern matching: `if (route.match(/^\/path\/pattern$/) && method === 'METHOD')`
3. Check authentication: `const auth = await requireAuth(request)`
4. Check permissions (membership, ownership, etc.)
5. Return: `handleCORS(NextResponse.json(data))`
6. Add tests in `tests/api/`

### Adding a New Trip Stage Feature
1. Update `lib/trips/stage.js` if adding new stage
2. Update `lib/trips/progress.js` if adding progress milestone
3. Update `lib/trips/getUserActionRequired.js` if stage requires action
4. Update `components/trip/TripTabs/` if adding new tab
5. Add API endpoint for stage transition if needed
6. Add tests

### Adding Privacy-Aware Trip Filtering
1. **NEVER** call `filterTripsByPrivacy` in dashboard/circle endpoints
2. **ONLY** use `applyProfileTripPrivacy` with correct context
3. Contexts: `'DASHBOARD'`, `'CIRCLE_TRIPS'`, `'TRIP_PAGE'`, `'SELF_PROFILE'` → no filtering
4. Context: `'PROFILE_VIEW'` → apply filtering
5. Always check `viewerId === ownerId` for self-views

### Fixing React Hooks Issues
1. Move all `useState`, `useEffect` calls to top of component
2. Remove early returns before hooks
3. Move conditional logic inside hooks or after hooks
4. Use `useEffect` for side effects, not component body

---

## Recent MVP Hardening (2026-01-23)

**Security & Error Handling (Private Beta Hardening)**:
- `ErrorBoundary` component wraps main content (`components/common/ErrorBoundary.tsx`)
- JWT secret validation: Fails in production if `JWT_SECRET` not set (`route.js:10-16`, `auth.js:4-9`)
- Expense race condition fixed: Uses atomic `$pull` instead of `findIndex+splice`
- Division by zero protection in expense splitting
- All overlays have error states with retry buttons
- `useTripChat` hook exposes error state, stops polling after 3 consecutive failures

**Chat-First Improvements**:
- Join request approval now shows correct actor: "Leader approved X's request to join"
- Post-lock ActionCards in ChatTab (ideas, accommodation, prep)
- Post-mutation state refresh in all overlays

**Test Coverage**:
- 481 unit tests passing
- E2E tests for core trip flows (`e2e/trip-flow.spec.ts`)
- Tests for progress snapshot, CTA priority, prep delete, transfer leadership

**Reference**: See `MVP_HARDENING_PLAN_V2.md` for full audit findings.

---

## Needs Confirmation

The following items may need verification:
- Exact MongoDB index definitions (not explicitly defined in code)
- Production deployment process (assumed Vercel/Node.js hosting)
- Exact character limit for itinerary ideas (code shows ~120, but exact value may vary)
- Whether "Waiting on you" badge logic includes itinerary ideas requirement (currently only Dates Picking per `getUserActionRequired.js`)
