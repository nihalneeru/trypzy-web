# Open Trips: Discoverable Hosted Trips for Micro-Influencers

> **Status:** SPEC (pending implementation)
> **Goal:** Let power users create trips that strangers can discover and join without pre-existing circle membership
> **Council reviewed:** 2026-02-23 (Gemini + GPT-5.2 + Claude)
> **Last updated:** 2026-02-23

## Executive Summary

Extend the existing `hosted` trip type with visibility and join policy controls. A micro-influencer creates a trip, marks it as `unlisted`, and shares the link on Instagram/WhatsApp/TikTok. Interested users can view the trip landing page without logging in and request to join. No new trip type needed — just two new fields on the existing trip schema.

**The loop:** Host creates trip → shares link → stranger views landing page → requests to join → signs up → gets approved → invites their own friends → repeat.

---

## 1. Data Model Changes

### 1.1 `trips` Collection — New Fields

```javascript
{
  // ... existing fields ...

  // NEW: Visibility & join controls (hosted trips only)
  visibility: 'circle' | 'unlisted',    // default: 'circle'
  joinPolicy: 'invite' | 'request',     // default: 'invite'
  capacity: null | Number,              // optional max participants

  // NOTE: shareId and shareVisibility from GROWTH_TIER0_SPEC.md
  // are unified here. For open trips, shareId is generated when
  // visibility is set to 'unlisted'. The public preview page
  // (/p/[shareId]) serves as the trip landing page.
}
```

**Field rules by trip type:**

| Field | `collaborative` | `hosted` (private) | `hosted` (open) |
|-------|----------------|-------------------|-----------------|
| `visibility` | Always `'circle'` | `'circle'` | `'unlisted'` |
| `joinPolicy` | Always `'invite'` | `'invite'` | `'request'` |
| `capacity` | Ignored | Ignored | Optional |
| `shareId` | Via Tier 0 toggle | Via Tier 0 toggle | Auto-generated on creation |

**Why no `'public'` visibility yet:** Public means appearing in a global Explore feed, which requires moderation tooling, content filtering, and reporting infrastructure. Ship `unlisted` first (link-only sharing), add `public` + Explore later.

**Why no `'auto'` join policy yet:** Auto-join for strangers has safety implications (chat access, spam). Ship `request` first, add `auto` later with guardrails (verified host, account age, no reports).

### 1.2 `circles` Collection — New Field

```javascript
{
  // ... existing fields ...
  kind: 'user' | 'system',   // default: 'user'
}
```

**System circles:**
- Auto-created when a hosted trip is created without a `circleId`
- Name: `"{tripName} group"` (internal only, never shown to users)
- `kind: 'system'` — filtered out of ALL user-facing circle queries
- Cannot be joined via invite code
- One system circle per open trip (1:1 relationship)

**Why keep circles at all:** The `trip.circleId` foreign key is referenced in 40+ queries across the codebase. Removing it would be a massive refactor. System circles preserve compatibility with zero breaking changes.

### 1.3 `trip_participants` Collection — New Statuses

Current statuses: `'active'` | `'left'` | `'removed'`

**Add:**
```javascript
status: 'requested' | 'active' | 'waitlisted' | 'declined' | 'left' | 'removed'
```

| Status | Meaning | Access level |
|--------|---------|-------------|
| `requested` | User requested to join, awaiting leader approval | Public landing page only |
| `active` | Approved participant | Full trip access (chat, itinerary, etc.) |
| `waitlisted` | Capacity reached, in queue | Public landing page + waitlist position |
| `declined` | Leader declined the request | None (can re-request after cooldown) |
| `left` | User left voluntarily | Read-only (existing behavior) |
| `removed` | Leader removed user | Read-only (existing behavior) |

**Access control rule:** Only `status === 'active'` grants:
- Chat read/write
- Participant list visibility
- Accommodation/expense details
- Itinerary private notes
- Prep items

`requested` and `waitlisted` users see ONLY the public trip preview (same as non-users, plus their request status).

---

## 2. API Changes

### 2.1 Trip Creation — Allow Optional `circleId`

**Modify:** `POST /api/trips` in `app/api/[[...path]]/route.js`

**Current behavior:** Requires `circleId` (or auto-creates via trip-first onboarding).

**New behavior:**
```javascript
// If circleId is provided → existing behavior (no change)
// If circleId is omitted AND type === 'hosted':
//   1. Auto-create system circle: { name: "{tripName} group", kind: 'system', ownerId: userId }
//   2. Set trip.circleId to new system circle ID
//   3. If visibility === 'unlisted', auto-generate shareId (UUID v4)
//   4. Create trip_participant for creator: { status: 'active' }
```

**Request body additions:**
```javascript
{
  // ... existing fields ...
  visibility: 'circle' | 'unlisted',   // optional, default 'circle'
  joinPolicy: 'invite' | 'request',    // optional, default 'invite'
  capacity: Number | null,              // optional
}
```

**Validation:**
- `visibility` and `joinPolicy` only accepted when `type === 'hosted'`
- `collaborative` trips force `visibility: 'circle'`, `joinPolicy: 'invite'`
- `capacity` must be >= 2 if provided

### 2.2 Trip Join — New Endpoint

**New:** `POST /api/trips/:tripId/join`

```javascript
// Auth: required (user must be signed up)
// Body: { message?: string }  (optional intro message, max 500 chars)
//
// Logic:
// 1. Verify trip exists and visibility !== 'circle' (or user is circle member)
// 2. Verify trip is not canceled/completed
// 3. Check if user already has a trip_participant record
//    - If 'declined': allow re-request after 7-day cooldown
//    - If 'active': return 409 "already a participant"
//    - If 'requested'/'waitlisted': return 409 "already requested"
// 4. Check capacity (if set):
//    - If activeCount >= capacity AND joinPolicy !== 'request':
//      create with status 'waitlisted'
//    - Otherwise: create based on joinPolicy
// 5. Create trip_participant:
//    - joinPolicy 'request' → status: 'requested'
//    - joinPolicy 'auto' → status: 'active' (future)
// 6. Emit event: traveler.participation.requested
// 7. Notify leader (push + in-app)
//
// Response: { status: 'requested' | 'active' | 'waitlisted' }
```

**Important:** This endpoint does NOT create a `membership` record in the circle. Trip participation is decoupled from circle membership for open trips.

### 2.3 Participant Management — New Endpoints

**New:** `POST /api/trips/:tripId/participants/:userId/approve`
```javascript
// Auth: leader only
// Changes trip_participant status: 'requested' → 'active'
// Also creates membership record in the system circle (for chat access)
// Emits event: traveler.participation.approved
// Notifies approved user (push + in-app)
```

**New:** `POST /api/trips/:tripId/participants/:userId/decline`
```javascript
// Auth: leader only
// Changes trip_participant status: 'requested' → 'declined'
// Emits event: traveler.participation.declined
// Notifies declined user (in-app only, calm messaging)
```

**New:** `POST /api/trips/:tripId/participants/bulk-approve`
```javascript
// Auth: leader only
// Body: { userIds: string[] }
// Approves multiple pending requests at once
// For hosts with many requests (micro-influencer use case)
```

### 2.4 Update Existing Endpoints

**Modify:** `GET /api/trips/:tripId`
- If viewer has `trip_participant.status === 'requested'` or `'waitlisted'`:
  - Return sanitized public view (same as `/api/public/trips/[shareId]` from Tier 0)
  - Include `viewer.joinStatus: 'requested' | 'waitlisted'`
  - Do NOT return chat, participants, expenses, accommodation details

**Modify:** `isActiveTraveler()`
- No change needed — already checks `status === 'active'`
- `requested`/`waitlisted` users will naturally be blocked from write endpoints

**Modify:** Circle list queries (dashboard, sidebar, etc.)
- Add `kind: { $ne: 'system' }` filter to all circle queries
- Affected: `GET /api/circles`, `getDashboardData.js`, any circle dropdowns

### 2.5 Share Settings — Merge with Tier 0

The `PATCH /api/trips/:tripId/share-settings` endpoint from Tier 0 is extended:
```javascript
// Body can now include:
{
  shareVisibility: 'private' | 'link_only',  // existing Tier 0
  visibility: 'circle' | 'unlisted',         // open trip visibility
  joinPolicy: 'invite' | 'request',          // open trip join policy
  capacity: Number | null,                    // open trip capacity
}
```

**Or simplify:** Merge `shareVisibility` and `visibility` into one field. An `unlisted` hosted trip automatically has a shareable public preview. No need for two toggles.

---

## 3. UI Changes

### 3.1 Trip Creation Flow

**Modify:** Trip creation form (in `TripFormFields.jsx` or trip-first onboarding)

When user selects `type: 'hosted'`, show additional options:

```
┌──────────────────────────────────────┐
│  Trip Type                           │
│  [Collaborative ▾]                   │
│  "Your group suggests and votes..."  │
│                                      │
│  ── OR ──                            │
│                                      │
│  [Hosted ▾]                          │
│  "You set the details, others join"  │
│                                      │
│  (when Hosted is selected:)          │
│                                      │
│  Who can join?                       │
│  ○ Circle members only              │
│  ● Anyone with the link              │ ← sets visibility: 'unlisted'
│                                      │
│  (when "Anyone with the link":)      │
│                                      │
│  Capacity (optional)                 │
│  [  12  ]                            │
│  "Leave blank for unlimited"         │
└──────────────────────────────────────┘
```

**Copy guidance:**
- "Anyone with the link" (not "Public" — avoids implying searchability)
- "Leave blank for unlimited" (calm, no pressure)
- No mention of "influencer" or "followers"

### 3.2 Trip Landing Page (Reuses Tier 0 Public Preview)

The `/p/[shareId]` page from `GROWTH_TIER0_SPEC.md` becomes the landing page for open trips. Add join functionality:

```
┌────────────────────────────────────────────┐
│  Tripti logo (link to /)                   │
├────────────────────────────────────────────┤
│                                            │
│  🌴 Bali Surf Trip                         │
│  Bali, Indonesia · Mar 14-21 · 8 spots    │
│                                            │
│  Hosted by Nihal                           │
│  "Chill surfer, foodie, early riser"       │
│                                            │
├────────────────────────────────────────────┤
│                                            │
│  ITINERARY                                 │
│  Day 1 — Arrive & settle in               │
│  Day 2 — Surf lesson at Uluwatu           │
│  Day 3 — Rice terraces & cooking class    │
│  ...                                       │
│                                            │
├────────────────────────────────────────────┤
│                                            │
│  5 of 8 spots filled                       │
│                                            │
│  [Request to join]     ← brand-red CTA     │
│                                            │
│  "Nihal will review your request"          │
│                                            │
│  ── or ──                                  │
│                                            │
│  [Plan a trip like this]  ← brand-blue     │
│  (remix — from Tier 0)                     │
│                                            │
│  Planned on Tripti.ai                      │
└────────────────────────────────────────────┘
```

**States:**
- **Not logged in:** "Request to join" → redirects to `/signup?join={shareId}`
- **Logged in, not requested:** Shows "Request to join" button
- **Logged in, already requested:** Shows "Request sent — you'll hear back from Nihal"
- **Logged in, waitlisted:** Shows "You're on the waitlist (position #3)"
- **Logged in, active:** Redirects to `/trips/{tripId}` (full Command Center)
- **Capacity full + no waitlist:** Shows "This trip is full" + "Plan a trip like this" CTA

### 3.3 Leader: Join Request Management

**Modify:** `TravelersOverlay.tsx`

Add a "Requests" section at the top when open trip has pending requests:

```
┌──────────────────────────────────────┐
│  Travelers                     [X]   │
│                                      │
│  PENDING REQUESTS (3)                │
│  ┌────────────────────────────────┐  │
│  │ 👤 Alex T.                    │  │
│  │ "Love surfing! Based in LA"   │  │
│  │ [Approve]  [Decline]          │  │
│  ├────────────────────────────────┤  │
│  │ 👤 Sam K.                     │  │
│  │ (no message)                  │  │
│  │ [Approve]  [Decline]          │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Approve all (3)]    ← if many     │
│                                      │
│  ─────────────────────────────────   │
│  GOING (5 of 8)                      │
│  👤 Nihal (Leader)                   │
│  👤 Jordan M.                        │
│  👤 Riley P.                         │
│  ...                                 │
└──────────────────────────────────────┘
```

**Push notification to leader:** "Alex requested to join Bali Surf Trip"

### 3.4 Host Profile (Lightweight)

**Modify:** `users` collection — add optional fields:

```javascript
{
  // ... existing fields ...
  bio: string | null,              // max 200 chars, e.g. "Chill surfer, foodie"
  socialLinks: {                   // optional
    instagram: string | null,
    tiktok: string | null,
  } | null,
}
```

Displayed on the public trip landing page as "Hosted by {name}" + bio. No follower counts, no gamification.

### 3.5 System Circle Filtering

**Ensure system circles are hidden everywhere:**

| Location | Filter needed |
|----------|--------------|
| Dashboard circle list | `kind: { $ne: 'system' }` |
| "My Circles" page | `kind: { $ne: 'system' }` |
| Circle selector dropdowns (trip creation, discover) | `kind: { $ne: 'system' }` |
| Circle-based notifications | Skip if `circle.kind === 'system'` |
| `GET /api/circles` | `kind: { $ne: 'system' }` |

---

## 4. Event System Integration

Emit events for new actions (append to `lib/events/types.js`):

```javascript
// New event types
TRAVELER_REQUESTED: 'traveler.participation.requested',
TRAVELER_APPROVED: 'traveler.participation.approved',
TRAVELER_DECLINED: 'traveler.participation.declined',
TRAVELER_WAITLISTED: 'traveler.participation.waitlisted',
```

**High-value signals for open trips:**
- Request → approval latency (host responsiveness)
- Request → decline ratio (trip selectivity)
- Waitlist → active conversion (demand signal)
- Open trip completion rate vs friend-group trips

---

## 5. Privacy & Safety

### Redaction (same as Tier 0)

Public landing page shows ONLY:
- Trip name, destination, dates, duration
- Itinerary content (activities, schedule)
- Traveler count (number only, no names)
- Host display name + bio
- Capacity + spots remaining

Hidden from public view:
- Traveler names, IDs, emails, avatars
- Chat messages
- Accommodation details
- Expenses
- Private notes

### Abuse Prevention

| Control | Implementation |
|---------|---------------|
| Rate limit trip creation | Max 5 trips/day per user |
| Rate limit join requests | Max 20 requests/day per user |
| Content filter on title/description | Basic profanity check |
| Report trip button | On public landing page (stores in `reports` collection) |
| Verified email required | For creating unlisted trips |
| System circle isolation | Cannot be joined via invite code |
| Request cooldown | 7 days after decline before re-requesting |

### Chat Safety

- `requested`/`waitlisted` users have NO chat access
- Only `active` participants can read/write chat
- Leader can remove participants at any time (existing functionality)
- Consider: for open trips with 20+ participants, add "Announcements only" mode (leader-only posting) — defer to later

---

## 6. Implementation Order

| Phase | Work | Depends on |
|-------|------|-----------|
| **Phase 1** | Schema changes: `visibility`, `joinPolicy`, `capacity` on trips; `kind` on circles; new participant statuses | None |
| **Phase 1** | System circle auto-creation in `POST /api/trips` | Schema |
| **Phase 1** | Filter system circles from all user-facing queries | Schema |
| **Phase 2** | `POST /api/trips/:id/join` endpoint | Schema + participant statuses |
| **Phase 2** | `POST /api/trips/:id/participants/:userId/approve\|decline` | Join endpoint |
| **Phase 2** | Bulk approve endpoint | Approve endpoint |
| **Phase 2** | Access control: restrict `requested`/`waitlisted` from chat + sensitive data | Join endpoint |
| **Phase 3** | Trip creation UI: "Who can join?" radio + capacity field | Phase 1 |
| **Phase 3** | Public landing page: join CTA + request states | Tier 0 preview page + Phase 2 |
| **Phase 3** | TravelersOverlay: pending requests section + approve/decline | Phase 2 |
| **Phase 3** | Host bio field + display on landing page | Phase 1 |
| **Phase 4** | Event emission for new participation events | Phase 2 |
| **Phase 4** | Push notifications for join requests/approvals | Phase 2 |

**Relationship to Tier 0:** Phases 1-2 can be built in parallel with Tier 0. Phase 3 depends on the `/p/[shareId]` page from Tier 0 being built first.

---

## 7. What NOT to Build (Council Consensus)

| Feature | Why not |
|---------|---------|
| `tripType: 'open'` (third type) | Forks logic everywhere. Use hosted + flags. |
| Global "Explore Trips" feed (V1) | Needs moderation tooling. Ship unlisted first. |
| Follower counts | Status game, misaligned with calm brand |
| Auto-join for strangers (V1) | Safety risk. Request-to-join first. |
| "Only X spots left!" urgency copy | Pressure tactic. Use neutral "5 of 8 joined". |
| Complex host verification/badges | Over-engineering. Account age + verified email is enough for V1. |
| Influencer terminology in UI | Use "Host" / "Trip Leader". Tripti is calm, not hype. |
| Trip comments/reviews from non-participants | Moderation burden, low value |

---

## 8. Future Extensions (Not V1)

| Feature | When |
|---------|------|
| `visibility: 'public'` + Explore Trips feed | After moderation + reporting + 50+ open trips |
| `joinPolicy: 'auto'` for verified hosts | After measuring request approval patterns |
| Host profile page with trip portfolio | After open trips prove adoption |
| Trip tags/categories for search | When Explore feed ships |
| Waitlist auto-promote when spot opens | After capacity is validated |
| "Announcements only" chat mode for large groups | When open trips reach 20+ participants |
| Revenue: premium host features (priority listing, analytics) | Post-monetization |

---

## 9. Testing Checklist

- [ ] Hosted trip can be created without circleId (system circle auto-created)
- [ ] System circle is hidden from "My Circles", dashboard, dropdowns
- [ ] System circle cannot be joined via invite code
- [ ] `visibility: 'unlisted'` auto-generates shareId
- [ ] Collaborative trips reject `visibility: 'unlisted'` (forced to `'circle'`)
- [ ] Public landing page shows join CTA for open trips
- [ ] Non-authenticated user can view landing page
- [ ] "Request to join" requires authentication (redirects to signup)
- [ ] Join request creates `trip_participant` with `status: 'requested'`
- [ ] Join request does NOT create circle membership
- [ ] `requested` user cannot access chat, expenses, accommodation
- [ ] `requested` user sees "Request sent" state on landing page
- [ ] Leader receives notification for join requests
- [ ] Leader can approve/decline in TravelersOverlay
- [ ] Approve creates circle membership (for chat) + sets status to `active`
- [ ] Decline sets status to `declined`, user sees friendly message
- [ ] Declined user cannot re-request for 7 days
- [ ] Capacity limit prevents new active participants beyond cap
- [ ] When at capacity, new requests become `waitlisted`
- [ ] Bulk approve works for multiple pending requests
- [ ] Events emitted for requested/approved/declined/waitlisted
- [ ] Landing page shows "X of Y spots filled" when capacity is set
- [ ] Host bio displays on landing page
