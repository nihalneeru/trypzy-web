# Trypzy Repository Summary

## 1. Product Overview

Trypzy is a **private, trust-based trip planning platform** for friend groups. The core workflow enables progressive scheduling: friends propose trips, share availability, vote on promising date windows, and lock dates when ready—all without requiring unanimous participation. The platform is organized around **Circles** (private friend groups) and **Trips** (collaborative or hosted travel plans). 

**Key workflows**:
1. Circle creation and invite-based membership
2. Trip proposal with broad date windows
3. Availability collection via flexible scheduling modes (broad/weekly/per-day or top3_heatmap)
4. Voting on top date windows
5. Date locking and itinerary planning
6. Trip Chat as the primary interactive conversation surface
7. Circle Updates digest showing read-only trip activity

**Core principle**: Availability ≠ Commitment. Only locking dates represents commitment. The system can progress without unanimous participation.

**Target users**: Friend groups (typically 4-30 people) planning trips together. Designed to handle both small groups (where everyone's input matters) and large/flaky groups (where partial participation is expected).

## 2. Tech Stack

- **Framework**: Next.js 14.2.3 (App Router)
- **React**: 18.x
- **Styling**: Tailwind CSS 3.4.1 + shadcn/ui components (Radix UI primitives)
- **Data Layer**: MongoDB 6.6.0 (native driver, no ORM)
- **Authentication**: JWT (jsonwebtoken 9.0.3) with bcryptjs 3.0.3 for password hashing
- **Hosting**: Next.js standalone output mode (assumes Vercel or similar Node.js hosting)
- **Testing**: 
  - Vitest 4.0.16 (unit tests)
  - Playwright 1.57.0 (E2E tests)
- **Additional**: 
  - OpenAI API integration (for itinerary generation via `lib/server/llm.js`)
  - date-fns 4.1.0 for date utilities
  - sonner 2.0.5 for toast notifications

## 3. Repository Layout

### `/app`
Next.js App Router directory:
- **`page.js`** - Root page (wraps `HomeClient.jsx`)
- **`HomeClient.jsx`** - Main SPA component (~5500 lines, contains most client-side logic)
- **`layout.js`** - Root layout
- **`globals.css`** - Global styles and Tailwind config
- **`api/[[...path]]/route.js`** - Centralized API route handler (~7100 lines, handles most endpoints via pattern matching)
- **`api/discover/posts/route.js`** - Discover posts API
- **`api/seed/discover/route.js`** - Dev seed endpoint
- **`dashboard/page.js`** - Dashboard page (server component)
- **`circles/[circleId]/page.js`** - Circle detail page
- **`trips/[tripId]/page.js`** - Trip detail page (redirects to SPA)
- **`members/[userId]/page.js`** - Member profile page
- **`settings/privacy/page.js`** - Privacy settings page

### `/components`
React components organized by domain:
- **`dashboard/`** - Dashboard-specific components (TripCard, CircleSection, dialogs)
- **`trip/TripTabs/`** - Trip detail tabs (ChatTab, ItineraryTab, PlanningTab, AccommodationTab, PrepTab, MemoriesTab, TravelersTab)
- **`trip/chat/`** - Chat-specific components
- **`ui/`** - shadcn/ui component library (48 components)
- **`brand/`** - Branding components (TrypzyLogo)

### `/lib`
Shared utilities organized by domain:
- **`server/`** - Server-side utilities (db.js, auth.js, cors.js, llm.js)
- **`trips/`** - Trip domain logic (13 files: stage.js, progress.js, buildTripCardData.js, getUserActionRequired.js, applyProfileTripPrivacy.js, etc.)
- **`dashboard/`** - Dashboard data fetching and sorting
- **`navigation/`** - Route helpers (routes.js)
- **`chat/`** - Chat event emission
- **`itinerary/`** - Itinerary processing utilities
- **`accommodations/`** - Accommodation helpers
- **`prep/`** - Prep suggestions
- **`utils.js`** - General utilities (cn helper, etc.)

### `/tests`
Unit tests (Vitest):
- **`api/`** - API endpoint tests (6 test files)
- **`itinerary/`** - Itinerary-specific tests
- **`setup.js`** - Test setup/teardown

### `/e2e`
End-to-end tests (Playwright):
- **`navigation.spec.ts`** - Navigation flow tests
- **`discover-flow.spec.js`** - Discover feature tests

### `/public`
Static assets:
- **`brand/`** - Brand assets (logos, icons)
- **`uploads/`** - User-uploaded images

### `/docs`
Documentation:
- **`api/`** - API documentation
- **`features/`** - Feature specifications
- **`tests/`** - Testing documentation

### `/scripts`
Utility scripts:
- **`seed-discover.js`** - Seed script for discover posts

## 4. Key Domain Concepts

### Circles
Private friend groups. Each circle has:
- `id`, `name`, `description`, `ownerId`, `inviteCode`
- Members join via invite code
- Circle-scoped content (trips, posts, updates)
- Owner has management privileges

### Trips
Travel plans with two types:
- **Collaborative**: All circle members are travelers by default (can leave/be removed)
- **Hosted**: Only explicit participants (via trip_participants) are travelers

### Trip Stages (Status)
Progressive states:
- **`proposed`** - Initial state, broad date window
- **`scheduling`** - Collecting availability (auto-transitions from `proposed` when first availability submitted)
- **`voting`** - Voting on top date windows
- **`locked`** - Dates finalized, planning begins
- **`completed`** - Trip end date has passed

### Travelers vs Members
- **Circle Members**: Users in `memberships` collection for a circle
- **Travelers**: 
  - Collaborative trips: All circle members (unless status='left'/'removed' in trip_participants)
  - Hosted trips: Only users with active `trip_participants` records
- **Active Travelers**: Travelers with status='active' (default if no record exists for collaborative)

### Privacy/Permissions
Four privacy settings (stored in `users.privacy`):
- **Profile Visibility**: `circle` | `public` | `private` - Controls profile page access
- **Upcoming Trips Visibility**: `circle` | `public` | `private` - **ONLY affects other-user profile views**, never self/dashboard/circle pages
- **Trip Details Level**: `limited` | `full` - **ONLY affects profile views for non-travelers**
- **Allow Trip Join Requests**: `boolean` - Controls "Request to join" CTA visibility

### Trip Chat
Primary interactive conversation surface:
- User messages + system messages (trip events, vote aggregation)
- Chronologically interleaved
- System messages are read-only, visually distinct
- No reactions, threads, or inline actions

### Circle Updates
Read-only digest of trip activity:
- Derived from trip events (creation, status changes, joins, votes)
- Replaces former "Circle Lounge" interactive chat
- Shows on Circle page default tab
- Clicking updates navigates to relevant Trip Chat

### Itinerary Ideas
User-submitted ideas for locked trips:
- Max 3 ideas per user per trip
- Character limit (~120)
- Like/unlike functionality
- Sorted by likes then recency
- "Waiting on you" badge when user has < 3 ideas (if this logic is implemented)

### Join Requests
Request to join hosted trips:
- Stored in `trip_join_requests` collection
- Status: `pending` | `approved` | `rejected`
- Only shown when `allowTripJoinRequests` is true and viewer is not already traveler

## 5. Data Model Summary

### Primary Collections

**`users`**
- `id` (string, unique)
- `email`, `name`, `password` (hashed)
- `avatarUrl` (optional)
- `privacy` (object): `profileVisibility`, `tripsVisibility`, `allowTripJoinRequests`, `showTripDetailsLevel`
- `createdAt`, `updatedAt`

**`circles`**
- `id` (string, unique)
- `name`, `description`
- `ownerId` (references users.id)
- `inviteCode` (uppercase, 6 chars)
- `createdAt`

**`memberships`**
- `userId` (references users.id)
- `circleId` (references circles.id)
- `role`: `'owner'` | `'member'`
- `joinedAt`

**`trips`**
- `id` (string, unique)
- `name`, `description`
- `circleId` (references circles.id)
- `createdBy` (references users.id)
- `type`: `'collaborative'` | `'hosted'`
- `status`: `'proposed'` | `'scheduling'` | `'voting'` | `'locked'` | `'completed'`
- `schedulingMode`: `'top3_heatmap'` | legacy availability system
- `startDate`, `endDate` (broad window)
- `lockedStartDate`, `lockedEndDate` (finalized dates)
- `destinationHint` (optional, editable by leader even when locked)
- `itineraryStatus`: `'collecting_ideas'` | `'drafting'` | `'published'` | `'revising'` | `null`
- `createdAt`, `updatedAt`

**`trip_participants`**
- `tripId` (references trips.id)
- `userId` (references users.id)
- `status`: `'active'` | `'left'` | `'removed'` (default: `'active'`)
- `joinedAt`, `createdAt`, `updatedAt`
- For collaborative trips: circle members are implicitly active unless status='left'/'removed'
- For hosted trips: only explicit participants are travelers

**`trip_date_picks`** (top3_heatmap mode)
- `tripId`, `userId`
- `picks` (array of { rank, startDateISO, endDateISO })
- `createdAt`, `updatedAt`

**`availabilities`** (legacy system)
- `tripId`, `userId`
- `day` (YYYY-MM-DD) or `isBroad: true` or `isWeekly: true`
- `status`: `'available'` | `'maybe'` | `'unavailable'`
- `createdAt`

**`votes`**
- `tripId`, `userId`
- `selectedWindow` (object with startDate, endDate)
- `createdAt`

**`trip_messages`**
- `id` (string, unique)
- `tripId`, `userId` (null for system messages)
- `content` (text)
- `isSystem` (boolean)
- `subtype` (for system messages: `'milestone'`, `'vote_aggregation'`, etc.)
- `createdAt`

**`trip_join_requests`**
- `id` (string, unique)
- `tripId`, `requesterId`
- `status`: `'pending'` | `'approved'` | `'rejected'`
- `message` (optional)
- `createdAt`, `updatedAt`

**`itinerary_ideas`**
- `id` (string, unique)
- `tripId`, `authorUserId`
- `text` (max ~120 chars)
- `likes` (array of userIds)
- `createdAt`

**`itineraries`**
- `id` (string, unique)
- `tripId`
- `items` (array of itinerary items)
- `status`: `'draft'` | `'selected'` | `'published'`
- `createdAt`, `updatedAt`

**`circle_messages`** (deprecated, read-only)
- Used for Circle Updates digest
- POST endpoint returns 410 Gone

**`posts`** (Discover feed)
- `id`, `userId`, `circleId` (optional)
- `caption`, `mediaUrls[]`
- `discoverable` (boolean)
- `createdAt`

### Relationships
- Users → Memberships → Circles (many-to-many)
- Circles → Trips (one-to-many)
- Trips → Trip Participants → Users (many-to-many via junction table)
- Trips → Trip Messages (one-to-many)
- Trips → Itinerary Ideas (one-to-many)
- Trips → Join Requests (one-to-many)

## 6. API Surface Summary

All routes in `app/api/[[...path]]/route.js` unless noted:

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login (returns JWT)
- `GET /api/auth/me` - Get current user

### Circles
- `POST /api/circles` - Create circle
- `GET /api/circles` - Get user's circles
- `POST /api/circles/join` - Join circle via invite code (backfills trip_participants for existing collaborative trips)
- `GET /api/circles/:id` - Get circle details (members, trips)
- `GET /api/circles/:id/updates` - Get Circle Updates digest (read-only)
- `GET /api/circles/:id/messages` - Get circle messages (read-only, deprecated)
- `POST /api/circles/:id/messages` - Returns 410 Gone (Circle Lounge removed)
- `GET /api/circles/:id/posts` - Get circle posts

### Trips
- `POST /api/trips` - Create trip
- `GET /api/trips/:id` - Get trip details
- `PATCH /api/trips/:id` - Update trip (destinationHint editable by leader even when locked)
- `DELETE /api/trips/:id` - Delete trip
- `POST /api/trips/:id/availability` - Submit availability (legacy system)
- `POST /api/trips/:id/date-picks` - Submit date picks (top3_heatmap mode)
- `POST /api/trips/:id/open-voting` - Leader opens voting
- `POST /api/trips/:id/vote` - Submit vote on date window
- `POST /api/trips/:id/lock` - Lock dates (leader only)
- `POST /api/trips/:id/join` - Join hosted trip
- `POST /api/trips/:id/leave` - Leave trip
- `GET /api/trips/:id/messages` - Get trip messages (includes system messages)
- `POST /api/trips/:id/messages` - Send trip message
- `GET /api/trips/:id/progress` - Get trip progress snapshot
- `PATCH /api/trips/:id/progress` - Update progress flags (manual steps)

### Join Requests
- `POST /api/trips/:id/join-requests` - Request to join trip
- `GET /api/trips/:id/join-requests` - Get join requests (leader only)
- `GET /api/trips/:id/join-requests/me` - Get viewer's join request status
- `PATCH /api/trips/:id/join-requests/:requestId` - Approve/reject request

### Itinerary
- `GET /api/trips/:id/ideas` - Get itinerary ideas
- `POST /api/trips/:id/ideas` - Submit idea (max 3 per user)
- `DELETE /api/trips/:id/ideas/:ideaId` - Delete idea
- `POST /api/trips/:id/ideas/:ideaId/like` - Toggle like on idea
- `GET /api/trips/:id/itineraries` - Get all itineraries for trip
- `GET /api/trips/:id/itineraries/selected` - Get selected itinerary
- `POST /api/trips/:id/itineraries/generate` - Generate itinerary via LLM
- `PATCH /api/trips/:id/itineraries/:itineraryId/select` - Select itinerary
- `PATCH /api/trips/:id/itineraries/:itineraryId/items` - Update itinerary items

### Discover
- `GET /api/discover/itineraries` - Get discoverable itineraries
- `GET /api/discover/itineraries/:id` - Get itinerary details
- `POST /api/discover/itineraries/:id/propose` - Propose itinerary as trip
- `POST /api/discover/posts/:id/propose` - Propose post as trip
- `GET /api/circles/:id/posts` - Get circle posts
- `POST /api/circles/:id/posts` - Create post

### User Profile
- `GET /api/users/:userId/profile` - Get user profile
- `GET /api/users/:userId/upcoming-trips` - Get user's upcoming trips (applies privacy filters for other-user views)
- `PATCH /api/users/:id` - Update user (including privacy settings)

### Dashboard
- `GET /api/dashboard` - Get dashboard data (circles, trips, notifications)

### Other
- `POST /api/upload` - Upload image
- `POST /api/reports` - Report content
- `POST /api/seed/discover` - Seed discover posts (dev only)

## 7. UI Navigation Map

### Pages

**`/` (Root)**
- Login page (unauthenticated)
- Redirects to `/dashboard` when authenticated

**`/dashboard`**
- Main dashboard showing circles and trips
- Query params: `?circleId=X` (selects circle), `?returnTo=Y` (breadcrumb return)
- Default landing: shows all circles with trips

**`/circles/[circleId]`**
- Circle detail page
- Tabs: Updates (default), Members, Trips, Memories
- Updates tab shows read-only digest of trip activity

**`/trips/[tripId]`**
- Trip detail page (redirects to `/?tripId=X` which loads SPA)
- Tabs: Chat (default), Planning, Itinerary, Accommodation, Prep, Memories, Going
- Tab selection via `?tab=chat` query param

**`/members/[userId]`**
- Member profile page
- Shows upcoming trips (respects privacy settings)
- "Request to join" CTA when applicable

**`/settings/privacy`**
- Privacy settings page
- Controls: Profile Visibility, Upcoming Trips Visibility, Trip Details Level, Allow Join Requests

### Routing Logic

- All authenticated routes require JWT token
- Trip detail pages redirect to SPA (`/?tripId=X&tab=Y`)
- Circle pages are server-rendered
- Dashboard is server-rendered but loads client-side SPA
- Navigation helpers in `lib/navigation/routes.js` ensure canonical URLs

## 8. Most Important Invariants / Rules

### Privacy Rules
1. **Upcoming Trips Visibility** ONLY applies to other-user profile views (`PROFILE_VIEW` context)
2. **Never filters trips** in self contexts: `DASHBOARD`, `CIRCLE_TRIPS`, `TRIP_PAGE`, `SELF_PROFILE`
3. Owner always sees own trips everywhere they have access
4. **Trip Details Level** ONLY affects profile views for non-travelers
5. Travelers/owners always see full trip details regardless of privacy setting

### Trip Access Rules
1. **Collaborative trips**: All circle members are travelers (unless status='left'/'removed')
2. **Hosted trips**: Only explicit `trip_participants` with status='active' are travelers
3. Circle membership grants access to circle's trips (subject to trip owner privacy for profile views)
4. When user joins circle, they're automatically added to `trip_participants` for all existing collaborative trips (backfill)

### CTA Rules
1. Red primary CTA only when `getUserActionRequired()` returns true (Dates Picking stages only)
2. Otherwise: neutral "View trip" CTA
3. "Waiting on you" badge shown when `actionRequired === true`
4. "Request to join" only shown when: not own profile, not already traveler, privacy allows, no pending request

### Stage Ordering
1. `proposed` → `scheduling` (auto on first availability)
2. `scheduling` → `voting` (manual, leader action)
3. `voting` → `locked` (manual, leader action)
4. `locked` → planning begins (itinerary, accommodation, prep)
5. `completed` when end date passes

### Trip Chat Rules
1. Trip Chat is the ONLY interactive conversation surface
2. System messages are read-only, chronologically interleaved
3. Circle Updates is read-only digest (no composer)
4. Circle Lounge chat removed (POST returns 410 Gone)

### Itinerary Ideas Rules
1. Max 3 ideas per user per trip
2. Only enabled when trip status is `locked`
3. Character limit ~120
4. "Waiting on you" badge when user has < 3 ideas (if this logic is implemented)

### Join Request Rules
1. Only for hosted trips
2. Requires `allowTripJoinRequests === true`
3. Leader can approve/reject
4. Approved requests create `trip_participants` record

## 9. Dev Workflow

### Environment Variables
Create `.env.local`:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trypzy
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=http://localhost:3000
OPENAI_API_KEY=your-openai-api-key-here  # Optional, for itinerary generation
```

### Running Locally
```bash
npm install
npm run dev  # Starts on http://localhost:3000
```

### Common Scripts
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm start` - Production server
- `npm run seed` - Seed discover posts
- `npm run test` - Run unit tests (Vitest)
- `npm run test:watch` - Watch mode
- `npm run test:e2e` - Run E2E tests (Playwright)
- `npm run test:all` - Run all tests

### Seed Users
After running `npm run seed`:
- `alex.traveler@example.com` / `password123`
- `sam.explorer@example.com` / `password123`

### Database
- MongoDB connection via `lib/server/db.js`
- Uses native MongoDB driver (no ORM)
- Collections created on first insert
- Test database: `trypzy_test` (used by test files)

## 10. Known Sharp Edges / Tech Debt

### Large Files
- **`app/HomeClient.jsx`** (~5500 lines) - Main SPA component, contains most client logic
  - Risk: Hard to navigate, prone to merge conflicts
  - Pattern: Refactor only when necessary, prefer extracting focused components
- **`app/api/[[...path]]/route.js`** (~7100 lines) - Centralized API handler
  - Risk: Large file, but pattern matching keeps it organized
  - Pattern: Consider splitting by domain if it grows further

### Risky Areas
1. **Privacy logic** - Recently refactored to be context-aware, but complex
   - Files: `lib/trips/applyProfileTripPrivacy.js`, `lib/trips/filterTripsByPrivacy.js`
   - Risk: Easy to regress privacy rules
   - Mitigation: Comprehensive tests in `tests/api/trip-privacy-permissions.test.js`

2. **Trip stage transitions** - Multiple status fields (`status`, `itineraryStatus`)
   - Files: `lib/trips/stage.js`, `lib/trips/progress.js`
   - Risk: Inconsistent state if transitions not atomic
   - Pattern: Use `computeTripProgressSnapshot` as source of truth

3. **Traveler computation** - Different logic for collaborative vs hosted
   - Files: Multiple places compute active travelers
   - Risk: Inconsistency between dashboard, circle pages, trip pages
   - Pattern: Centralize in `buildTripCardData.js` where possible

4. **React Hooks violations** - Conditional hooks in some components
   - Files: `components/trip/TripTabs/tabs/ItineraryTab.tsx` (recently fixed)
   - Risk: "Rendered more hooks" errors
   - Pattern: Always call hooks unconditionally at top level

### Patterns to Avoid
1. **Don't filter trips by privacy in self contexts** - Use `applyProfileTripPrivacy` with correct context
2. **Don't call `setState` during render** - Use `useEffect` for side effects
3. **Don't assume `api` is global** - Pass as prop or use fetch helper
4. **Don't use TypeScript syntax in `.js`/`.jsx` files** - ESLint configured to prevent this
5. **Don't create duplicate interactive surfaces** - Trip Chat is the only interactive chat

### Places That Frequently Regress
1. **Privacy filtering** - Applied incorrectly in dashboard/circle contexts
2. **CTA color logic** - Using `pendingActions.length` instead of `actionRequired`
3. **Traveler detection** - Not checking `trip_participants` status correctly
4. **Circle join backfill** - Forgetting to add new members to existing trips
5. **Hooks consistency** - Conditional hooks or hooks after early returns

### Testing Gaps
- E2E coverage is minimal (2 test files)
- Unit tests cover API routes but not all edge cases
- No visual regression testing
- Privacy rules have good test coverage after recent hardening

### Performance Considerations
- `HomeClient.jsx` is large but necessary for SPA architecture
- MongoDB queries could benefit from indexes (not explicitly defined in code)
- Image uploads stored in `public/uploads/` (consider cloud storage for production)
- LLM calls for itinerary generation are expensive (consider caching)

---

**Last Updated**: Based on codebase state as of latest changes (privacy hardening, circle join backfill, CTA consistency fixes)
