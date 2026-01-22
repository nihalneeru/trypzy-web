# CLAUDE_CONTEXT.md

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

## 1) Current MVP Funnel (as implemented)

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

**What users can do at each stage**:

**PROPOSED**:
- All travelers: Submit availability/date picks (`POST /api/trips/:id/date-picks`)
- Leader: Open voting (`POST /api/trips/:id/open-voting`)
- CTA location: ChatTab bottom (ActionCard component)

**DATES_LOCKED**:
- All travelers: View locked dates, submit itinerary ideas (`POST /api/trips/:id/itinerary-ideas`)
- Leader: Generate itinerary from ideas (`POST /api/trips/:id/generate-itinerary`), select final itinerary
- CTA location: ChatTab bottom, ItineraryTab

**ITINERARY**:
- All travelers: View itinerary, submit accommodation requirements
- Leader: Mark accommodation as chosen
- CTA location: AccommodationTab

**STAY**:
- All travelers: View accommodation, start prep checklist
- Leader: Mark prep as started
- CTA location: PrepTab

**PREP**:
- All travelers: Update prep checklist, share memories
- CTA location: PrepTab, MemoriesTab

**ONGOING**:
- All travelers: Share memories, chat
- CTA location: ChatTab, MemoriesTab

**COMPLETED**:
- All travelers: View memories, read-only access
- CTA location: None (read-only)

**Key guardrails**:
- **Role-based permissions**: Trip leader (`trip.createdBy === userId`) can lock dates, open voting, cancel trip, transfer leadership. Enforced server-side in `app/api/[[...path]]/route.js` via `validateStageAction()` (`lib/trips/validateStageAction.js`)
- **Participation minimums**: None enforced. System can progress with partial participation
- **Post-lock read-only behavior**: Once dates are locked, availability/voting actions are blocked. Canceled trips are read-only. Left travelers cannot send messages (ChatTab checks `viewer.isActiveParticipant`)

**Chat-centric CTA pattern**:
- CTAs appear at bottom of ChatTab (`components/trip/TripTabs/tabs/ChatTab.tsx`)
- Computed via `getNextAction()` (`lib/trips/nextAction.ts`) based on stage and user role
- Rendered as ActionCard component (`components/trip/chat/ActionCard.tsx`)
- Recent change: Removed redundant top pills, CTAs only at bottom

## 2) Architecture snapshot

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
- `trips`: `{ id, name, description, circleId, createdBy, type: 'collaborative'|'hosted', status: 'proposed'|'scheduling'|'voting'|'locked'|'completed'|'canceled', schedulingMode: 'top3_heatmap'|legacy, startDate, endDate, lockedStartDate, lockedEndDate, destinationHint, itineraryStatus: 'collecting_ideas'|'drafting'|'selected'|'published'|'revising'|null, canceledAt, canceledBy, createdAt, updatedAt }`
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

## 3) Key file map (high-signal only)

**Routes/pages**:
- `app/page.js` - Root page (wraps WelcomePageWrapper)
- `app/WelcomePageWrapper.jsx` - Auth check, routes to WelcomePage or HomeClient
- `app/HomeClient.jsx` - Main SPA component (~5500 lines, handles all authenticated views)
- `app/dashboard/page.js` - Dashboard server component (fetches data via `getDashboardData()`)
- `app/trips/[tripId]/page.js` - Trip detail page (redirects to SPA with query params)
- `app/circles/[circleId]/page.js` - Circle detail page (redirects to SPA)
- `app/members/[userId]/page.js` - Member profile page (server component)
- `app/login/page.jsx` - Login page
- `app/signup/page.jsx` - Signup page
- `app/settings/privacy/page.js` - Privacy settings page

**Components**:
- `components/marketing/WelcomePage.tsx` - Public welcome page (hero, icon flow, CTAs)
- `components/dashboard/TripCard.jsx` - Trip card component (shows trip status, progress, navigation)
- `components/dashboard/TripProgressMini.jsx` - Progress indicator component
- `components/trip/command-center/TripCommandCenter.tsx` - **Default trip detail view** (three-zone layout: focus banner, decision cards, chat)
- `components/trip/command-center/TripFocusBanner.tsx` - Zone 1: "What's blocking this trip?" with LLM intelligence
- `components/trip/command-center/AccommodationShortlist.tsx` - Inline accommodation voting (max 3 options)
- `components/trip/command-center/decision-modules/SchedulingDecisionModule.tsx` - Date picking/voting accordion
- `components/trip/command-center/decision-modules/ItineraryDecisionModule.tsx` - Itinerary planning accordion
- `components/trip/command-center/decision-modules/AccommodationDecisionModule.tsx` - Accommodation selection accordion
- `components/trip/command-center/decision-modules/TravelersModule.tsx` - Secondary module for travelers
- `components/trip/command-center/decision-modules/PrepModule.tsx` - Secondary module for prep checklist
- `components/trip/command-center/decision-modules/ExpensesModule.tsx` - Secondary module for expenses
- `components/trip/TripTabs/TripTabs.tsx` - Tab container for legacy trip detail view (via `?ui=legacy`)
- `components/trip/TripTabs/tabs/ChatTab.tsx` - Chat surface (used by both Command Center and legacy)
- `components/trip/TripTabs/tabs/PlanningTab.tsx` - Availability/voting interface (legacy, accessed via Command Center actions)
- `components/trip/TripTabs/tabs/ItineraryTab.tsx` - Itinerary idea submission and LLM generation (legacy)
- `components/trip/TripTabs/tabs/AccommodationTab.tsx` - Stay requirements and selection (legacy)
- `components/trip/TripTabs/tabs/PrepTab.tsx` - Preparation checklist (legacy)
- `components/trip/TripTabs/tabs/MemoriesTab.tsx` - Photo sharing (legacy)
- `components/trip/TripTabs/tabs/TravelersTab.tsx` - Participant management (legacy)
- `components/trip/TripTabs/tabs/ExpensesTab.tsx` - Expense tracking (legacy)
- `components/trip/chat/ActionCard.tsx` - CTA card component for ChatTab
- `components/trip/TransferLeadershipDialog.tsx` - Leadership transfer dialog
- `components/trip/CancelTripDialog.tsx` - Trip cancellation dialog

**Hooks**:
- `hooks/use-trip-chat.ts` - Chat message management with 5-second polling
- `hooks/use-trip-intelligence.ts` - LLM-powered blocker detection, nudges, consensus, accommodation preferences

**API**:
- `app/api/[[...path]]/route.js` - Centralized API handler (~7100 lines, pattern matching)
- `app/api/trips/[tripId]/expenses/route.js` - Dedicated expenses API routes (GET, POST, DELETE)
- `app/api/discover/posts/route.js` - Discover posts API
- `app/api/seed/discover/route.js` - Dev seed endpoint

**Lib/utils**:
- `lib/trips/stage.js` - Stage computation (`deriveTripPrimaryStage()`, `getPrimaryTabForStage()`, `computeProgressFlags()`)
- `lib/trips/validateStageAction.js` - Server-side stage transition validator
- `lib/trips/progress.js` - Progress step definitions (`TRIP_PROGRESS_STEPS`)
- `lib/trips/progressSnapshot.ts` - Server-side progress computation (`computeTripProgressSnapshot()`)
- `lib/trips/nextAction.ts` - CTA computation for ChatTab (`getNextAction()`)
- `lib/trips/getUserActionRequired.js` - Action requirement computation
- `lib/trips/canViewerSeeTrip.js` - Privacy filtering logic
- `lib/trips/applyProfileTripPrivacy.js` - Profile view privacy filtering
- `lib/trips/buildTripCardData.js` - Trip card data builder
- `lib/trips/getVotingStatus.js` - Voting aggregation logic
- `lib/trips/getBlockingUsers.js` - Blocking users computation
- `lib/dashboard/getDashboardData.js` - Dashboard data fetcher (server-side)
- `lib/navigation/routes.js` - Route helpers (`tripHref()`, `circlePageHref()`, `dashboardCircleHref()`)
- `lib/server/db.js` - MongoDB connection singleton
- `lib/server/auth.js` - JWT auth helpers (`requireAuth()`, `getUserFromToken()`)
- `lib/server/llm.js` - OpenAI integration (`generateItinerary()`, `summarizeFeedback()`, `reviseItinerary()`)

**Tests**:
- `tests/api/trip-stage-enforcement.test.js` - Stage transition validation tests
- `tests/api/trip-privacy-permissions.test.js` - Privacy filtering tests
- `tests/api/trip-expenses.test.js` - Expenses API tests
- `tests/api/trip-deletion-leaving.test.js` - Trip deletion and leaving tests
- `tests/api/circle-join-backfill.test.js` - Circle join backfill tests
- `tests/api/validate-stage-action.test.js` - Stage action validator tests
- `tests/trips/getVotingStatus.test.js` - Voting status computation tests
- `tests/trips/getBlockingUsers.test.js` - Blocking users tests
- `e2e/navigation.spec.ts` - Navigation E2E tests
- `e2e/discover-flow.spec.js` - Discover flow E2E tests

## 4) Recent work + known context

**Trip Command Center (Phases 1-8 + Phase 9 Part 1) - CURRENT DEFAULT**:
- Command Center is now the **default trip detail view** (no query param needed)
- Legacy tab-based UI accessible via `?ui=legacy` for debugging
- Three-zone architecture:
  1. **Trip Focus Banner** (Zone 1): Shows current blocker (DATES/ITINERARY/ACCOMMODATION/READY) with LLM confidence score
  2. **Decision Cards** (Zone 2): Accordion modules - only one expanded at a time. Primary blockers (Scheduling, Itinerary, Accommodation) + secondary modules under "+ More" (Travelers, Prep, Expenses)
  3. **Chat Feed** (Zone 3): Primary interaction surface with 5-second polling
- LLM integration via `lib/server/llm.js`: `detectBlocker()`, `generateNudge()`, `summarizeConsensus()`, `extractAccommodationPreferences()`
- Accommodation inline voting: Max 3 options, vote → confirm → lock flow
- Actions like "Pick Dates" navigate to legacy tabs (`?ui=legacy&tab=planning`) until inline UI is built

**Phase 9 remaining work** (future PR):
- Build inline scheduling UI in Command Center (replace legacy tab navigation)
- Build inline itinerary UI in Command Center
- Delete `TripDetailViewLegacy` (~1,640 lines in `app/HomeClient.jsx`)
- Remove `?ui=legacy` fallback

**New dashboard/home page messaging**:
- Welcome page (`components/marketing/WelcomePage.tsx`) updated with tagline "Trips made easy" (browser title in `app/layout.js`)
- Hero headline: "Plan trips together — without the chaos."
- Subheadline removed (was: "Trypzy helps groups plan trips smoothly — even when not everyone participates the same way.")
- Icon flow updated: Proposed (Lightbulb), Dates (Calendar), On Trip (Rocket), Prep (Luggage unchanged)
- Redundant CTAs removed from under icon flow, only bottom CTA section remains

**Removal of redundant chat top pills**:
- ChatTab (`components/trip/TripTabs/tabs/ChatTab.tsx`) previously had CTAs at top and bottom
- Top pills removed, CTAs now only at bottom via ActionCard component
- CTA computation via `getNextAction()` (`lib/trips/nextAction.ts`)

**Trip progress pane + nav fixes**:
- Progress pane shows 8 steps: Proposed → Dates → Itinerary → Stay → Prep → Ongoing → Memories → Expenses
- Navigation logic unified via `deriveTripPrimaryStage()` and `getPrimaryTabForStage()` (`lib/trips/stage.js`)
- Tab synchronization fixed in `app/HomeClient.jsx` (manual tab change ref prevents race conditions)
- Deep link support: `/?tripId=X&tab=Y` routes correctly via `WelcomePageWrapper.jsx`

**Known "stacked PR" risks**:
- Large files prone to merge conflicts: `app/HomeClient.jsx` (~5500 lines), `app/api/[[...path]]/route.js` (~7100 lines)
- Navigation state management (`app/HomeClient.jsx`) has complex URL normalization logic with ref guards (`authRedirectRef`, `dashboardRedirectRef`) to prevent infinite loops
- Privacy logic (`lib/trips/canViewerSeeTrip.js`, `lib/trips/applyProfileTripPrivacy.js`) is complex and context-aware—easy to regress if not careful
- Stage computation (`lib/trips/stage.js`) must stay in sync between client and server—server validates via `validateStageAction()`

**Places where merges could have missed changes**:
- Expenses API routes: Recently moved from catch-all router to dedicated file (`app/api/trips/[tripId]/expenses/route.js`). Ensure no duplicate routes remain
- Trip progress computation: `expensesSettled` logic reverted in catch-all router—ensure consistency with progress snapshot
- Frontend-backend ID synchronization: ExpensesTab uses `p.userId` from `participantsWithStatus`—ensure backend validation matches

## 5) MVP Readiness: risks & weak spots (based on code)

**Risk 1: Leader leaves trip without transfer**
- **Symptom**: Trip becomes unactionable (no one can lock dates, open voting)
- **Likely cause**: `POST /api/trips/:id/leave` allows leader to leave without `transferToUserId` (`app/api/[[...path]]/route.js`)
- **How to reproduce**: Create trip as leader, leave without transferring leadership
- **Suggested fix direction**: Require `transferToUserId` for leaders, or auto-transfer to oldest active traveler

**Risk 2: Voting after lock**
- **Symptom**: Users can vote after dates are locked (wasted votes, confusion)
- **Likely cause**: `validateStageAction()` checks `tripStatus !== 'voting'` but may not check `tripStatus === 'locked'` for vote action (`lib/trips/validateStageAction.js:124`)
- **How to reproduce**: Lock trip, attempt to vote via `POST /api/trips/:id/vote`
- **Suggested fix direction**: Add explicit `locked` check in vote validation

**Risk 3: Lock twice**
- **Symptom**: Leader can lock dates multiple times (redundant API calls, potential state corruption)
- **Likely cause**: `validateStageAction()` checks `tripStatus === 'locked'` but endpoint may not be idempotent (`lib/trips/validateStageAction.js:136`)
- **How to reproduce**: Lock trip, call lock endpoint again
- **Suggested fix direction**: Make lock endpoint idempotent (return success if already locked)

**Risk 4: Pick availability after lock**
- **Symptom**: Users can submit date picks after dates are locked (confusing, wasted data)
- **Likely cause**: `validateStageAction()` checks `tripStatus === 'locked'` for `submit_date_picks` but may not be enforced in endpoint (`lib/trips/validateStageAction.js:88`)
- **How to reproduce**: Lock trip, attempt to submit date picks via `POST /api/trips/:id/date-picks`
- **Suggested fix direction**: Ensure endpoint calls `validateStageAction()` before processing

**Risk 5: Refresh mid-action loses state**
- **Symptom**: User submits availability/vote, refreshes page, action appears lost (but actually saved)
- **Likely cause**: No optimistic UI updates, no loading states persist across refresh (`components/trip/TripTabs/tabs/PlanningTab.tsx`)
- **How to reproduce**: Submit availability, refresh immediately, check if UI shows submitted state
- **Suggested fix direction**: Add optimistic updates, persist loading state in URL or localStorage

**Risk 6: Multi-tab behavior inconsistent**
- **Symptom**: User opens trip in two tabs, performs action in one tab, other tab shows stale state
- **Likely cause**: No real-time updates (polling/refetch only on navigation), no WebSocket/SSE (`app/HomeClient.jsx`)
- **How to reproduce**: Open trip in two tabs, submit availability in one, check other tab
- **Suggested fix direction**: Add polling on focus, or show "Refresh" button when stale

**Risk 7: Navigation: logo/back returns to wrong page**
- **Symptom**: Clicking logo or back button goes to old landing page instead of dashboard
- **Likely cause**: Navigation guards (`authRedirectRef`, `dashboardRedirectRef`) may not cover all cases (`app/HomeClient.jsx:1834`)
- **How to reproduce**: Navigate to trip detail, click logo, verify redirects to dashboard not `/`
- **Suggested fix direction**: Ensure all navigation paths use `dashboardCircleHref()` or `router.replace('/dashboard')`

**Risk 8: Trip card visibility rules per role/traveler**
- **Symptom**: Travelers don't see their trips, or non-travelers see private trips
- **Likely cause**: Privacy filtering (`lib/trips/canViewerSeeTrip.js`) may not account for all contexts (dashboard vs profile vs circle)
- **How to reproduce**: Set user privacy to "Private", check if own trips appear on dashboard
- **Suggested fix direction**: Ensure `applyProfileTripPrivacy()` only filters in profile views, never dashboard/circle

**Risk 9: Stage transition not atomic**
- **Symptom**: Trip status updated but progress steps not updated (inconsistent state)
- **Likely cause**: Stage transitions update `trip.status` but may not call `computeTripProgressSnapshot()` (`lib/trips/progressSnapshot.ts`)
- **How to reproduce**: Lock trip, check if `trip.progress.steps.datesLocked` is true
- **Suggested fix direction**: Ensure all stage transitions call progress snapshot computation

**Risk 10: Leave trip at each stage edge cases**
- **Symptom**: User leaves trip during voting, votes still counted (or leader leaves, voting stuck)
- **Likely cause**: `POST /api/trips/:id/leave` updates `trip_participants.status` but may not clean up votes/availability (`app/api/[[...path]]/route.js`)
- **How to reproduce**: Submit vote, leave trip, check if vote still appears in aggregation
- **Suggested fix direction**: Clean up votes/availability on leave, or mark as "left" but keep for historical accuracy

**Risk 11: API/UI mismatch on traveler validation**
- **Symptom**: UI shows user as traveler but API rejects action (or vice versa)
- **Likely cause**: Frontend uses `trip.participantsWithStatus` but backend uses `isActiveTraveler()`—may diverge (`components/trip/TripTabs/tabs/ExpensesTab.tsx` vs `app/api/[[...path]]/route.js:67`)
- **How to reproduce**: Collaborative trip, user has no `trip_participants` record, check if UI shows as traveler but API rejects
- **Suggested fix direction**: Ensure frontend uses same logic as `isActiveTraveler()` (circle member check for collaborative)

**Risk 12: Refresh consistency on trip detail page**
- **Symptom**: User refreshes trip detail page, sees stale data (old stage, old progress)
- **Likely cause**: Trip data fetched on mount but not refetched on URL change (`app/HomeClient.jsx`)
- **How to reproduce**: Navigate to trip, change trip in another tab, refresh, check if data updates
- **Suggested fix direction**: Add refetch on `tripId` change in URL, or show "Refresh" button

## 6) MVP Audit Checklist (actionable)

**User leaves at each stage**:
1. Create trip as traveler (not leader)
2. Submit availability in PROPOSED stage
3. Leave trip via TravelersTab
4. Verify: Cannot send messages in ChatTab, cannot submit availability, trip card shows "Left" status
5. Repeat for SCHEDULING, VOTING, LOCKED stages

**Leader leaves at each stage**:
1. Create trip as leader
2. Submit availability in PROPOSED stage
3. Attempt to leave without transferring leadership
4. Verify: TransferLeadershipDialog appears, cannot leave without transfer
5. Transfer to another traveler, then leave
6. Verify: New leader can lock dates, old leader cannot
7. Repeat for SCHEDULING, VOTING stages (cannot leave in LOCKED—verify this)

**Voting after lock**:
1. Create trip, submit availability, open voting, lock dates
2. Attempt to vote via `POST /api/trips/:id/vote`
3. Verify: Returns 400 "Voting is not open for this trip"
4. Check UI: Voting interface hidden/disabled in PlanningTab

**Lock twice**:
1. Create trip, submit availability, open voting
2. Lock dates via `POST /api/trips/:id/lock`
3. Lock again via same endpoint
4. Verify: Returns 400 "Trip is already locked" or idempotent success
5. Check UI: Lock button hidden/disabled

**Pick availability late**:
1. Create trip, lock dates
2. Attempt to submit date picks via `POST /api/trips/:id/date-picks`
3. Verify: Returns 400 "Trip dates are locked; picks cannot be changed"
4. Check UI: Date picker hidden/disabled in PlanningTab

**Refresh mid-action**:
1. Submit availability in PlanningTab
2. Immediately refresh page (Cmd+R / Ctrl+R)
3. Verify: Availability still shows as submitted (not lost)
4. Repeat for vote submission

**Multi-tab behavior**:
1. Open trip detail in two browser tabs
2. Submit availability in tab 1
3. Check tab 2: Shows stale state (expected—no real-time)
4. Refresh tab 2: Shows updated state
5. Verify: No errors, no infinite loops

**Navigation: logo/back always returns to dashboard**:
1. Navigate to trip detail (`/?tripId=X`)
2. Click Trypzy logo in header
3. Verify: Redirects to `/dashboard` (not `/`)
4. Use browser back button
5. Verify: Returns to dashboard (not welcome page if authenticated)
6. Repeat from circle detail page

**Trip card visibility rules**:
1. Set user privacy to "Private" (`/settings/privacy`)
2. Create trip as that user
3. Check dashboard: Trip appears (own trips always visible)
4. Check circle page: Trip appears (circle trips always visible)
5. Check another user's profile: Trip hidden (private trips hidden from non-travelers)
6. Check own profile: Trip appears (own trips always visible)

**API/UI mismatch on traveler validation**:
1. Create collaborative trip
2. Add user to circle (membership) but NOT to `trip_participants`
3. Check UI: User appears as traveler in TravelersTab
4. Attempt to submit availability via API
5. Verify: API accepts (collaborative trips allow circle members)
6. Check ExpensesTab: User can add expense (matches `isActiveTraveler()` logic)

## 7) How to run locally

**Prerequisites**:
- Node.js 18+
- MongoDB (local or remote connection)
- npm or yarn

**Installation**:
```bash
npm install
```

**Environment variables** (create `.env.local` in root):
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trypzy
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=http://localhost:3000
OPENAI_API_KEY=your-openai-api-key-here
```

**Development**:
```bash
npm run dev
```
App available at `http://localhost:3000`

**Seeding sample data**:
```bash
npm run seed
```
Creates seed users (alex.traveler@example.com / password123, sam.explorer@example.com / password123), circles, trips, discover posts.

**Testing**:
```bash
npm run test          # Unit tests (Vitest)
npm run test:watch    # Watch mode
npm run test:e2e      # E2E tests (Playwright)
npm run test:all      # All tests
```

**Building for production**:
```bash
npm run build
npm start
```

**Key env vars referenced**:
- `MONGO_URL` / `MONGO_URI`: MongoDB connection string (`lib/server/db.js`, `tests/testUtils/dbTestHarness.js`)
- `DB_NAME`: Database name (`lib/server/db.js`, `tests/testUtils/dbTestHarness.js`)
- `JWT_SECRET`: JWT signing secret (`app/api/[[...path]]/route.js:11`, `lib/server/auth.js`)
- `CORS_ORIGINS`: CORS allowed origins (`app/api/[[...path]]/route.js:28`)
- `OPENAI_API_KEY`: OpenAI API key (`lib/server/llm.js`)
- `NODE_ENV`: Environment mode (affects seed endpoint availability)

## 8) "If you only read 5 things" (for Claude)

1. **Command Center is the default trip detail view**: `TripCommandCenter` (`components/trip/command-center/TripCommandCenter.tsx`) is now the default. Three zones: Focus Banner (blocker), Decision Cards (accordion), Chat Feed. Legacy tab UI accessible via `?ui=legacy`. Actions like "Pick Dates" still navigate to legacy tabs until inline UI is built.

2. **Stage computation is client-side but validated server-side**: `deriveTripPrimaryStage()` (`lib/trips/stage.js:129`) computes stage client-side for UI responsiveness, but `validateStageAction()` (`lib/trips/validateStageAction.js`) validates server-side. Must stay in sync.

3. **Traveler determination differs by trip type**: Collaborative trips = all circle members (unless `status='left'/'removed'`). Hosted trips = only explicit `trip_participants` with `status='active'`. See `isActiveTraveler()` (`app/api/[[...path]]/route.js:67`).

4. **Privacy filtering is context-aware**: `canViewerSeeTrip()` (`lib/trips/canViewerSeeTrip.js`) filters trips, but `applyProfileTripPrivacy()` (`lib/trips/applyProfileTripPrivacy.js`) only applies in profile views. Dashboard/circle always show own/circle trips regardless of privacy.

5. **Navigation state management is complex**: `app/HomeClient.jsx` has URL normalization logic with ref guards (`authRedirectRef`, `dashboardRedirectRef`) to prevent infinite loops. Deep links (`/?tripId=X&tab=Y`) route via `WelcomePageWrapper.jsx`.
