# Trip Boost Features Spec — "Leader's Sanity Kit"

> Status: DRAFT
> Target: Phase 2 (post-activation trigger: 50 locked trips from 20+ circles)
> Last updated: 2026-02-20
> Depends on: REVENUE_MODEL_SPEC.md (pricing, gating philosophy, payment infra)

## Executive Summary

Trip Boost ($4.99/trip) unlocks three painkiller features that solve the three biggest post-lock headaches: **arguments** (Decision Cards), **repetitive questions** (Trip Brief), and **money awkwardness** (Settle Up). These replace the original "vitamin" feature set (extra itinerary versions, AI packing, photo export).

**Design principles:**
- Gate shareability and automation, never correctness or freshness
- Features must feel like a "calm assistant," not a "project manager"
- Free tiers must be useful enough to demonstrate value — stingy free = brand damage
- No upsells in protected moments (post-lock celebration, join, active scheduling, chat feed)

---

## Feature 1: Decision Cards

### Problem
Groups waste hours in circular debates ("Pizza or sushi?", "Which neighborhood?", "Rent a car or Uber?"). Decisions get made verbally, then re-litigated because nobody remembers the outcome. The leader becomes an unpaid referee.

### Solution
Structured polls with closure. Any traveler creates a decision with options. Group votes. Leader (or deadline) closes it. Result is pinned as settled. No more re-litigating.

### Free vs Boosted

| Capability | Free | Boosted |
|---|---|---|
| Create decisions | Unlimited | Unlimited |
| Vote | Simple majority (tap one) | Simple majority |
| Deadlines | — | Optional deadline per decision |
| Auto-close on deadline | — | Yes (winning option locks) |
| Leader tie-break | — | Leader prompted on tie at deadline |
| "Nudge non-voters" button | — | Yes (sends push to non-voters) |

**No ranked-choice voting.** It's high complexity, low usage, confusing UX, and rarely changes the outcome vs simple majority. Permanently out of scope.

### UX Flow

**Creating a decision:**
1. In chat: new quick-action button (dice icon) next to the message input
2. Tapping opens an inline form above the keyboard: Question + 2-5 options (text fields) + optional deadline (Boosted only)
3. Submit → creates decision → posts system message in chat as a votable card
4. Also accessible from a "Decisions" section in a new overlay (or within the Trip Info overlay)

**Voting:**
1. Decision card renders inline in chat (distinct style, not a regular message)
2. Each option shows as a tappable row with vote count
3. User taps to vote. Can change vote before close. One vote per person.
4. Vote count updates optimistically (no WebSockets needed — poll on chat refresh, 5-second interval via existing `useTripChat`)

**Closing a decision:**
- **Manual:** Leader taps "Close" on any open decision → winning option locks
- **Auto-close (Boosted):** When deadline passes, server-side cron closes it. Winning option locks. On tie → leader gets a push notification to break the tie.
- System message in chat: "Decided: Pizza for Friday dinner (4 votes)"

**Viewing resolved decisions:**
- Locked decisions appear in a "Decided" list (within Trip Info overlay or dedicated section)
- Each shows: question, winning option, vote count, when decided
- Also feeds into Trip Brief (Feature 3)

### Data Model

**New collection: `decisions`**
```javascript
{
  id: String,                    // uuid
  tripId: String,
  createdBy: String,             // userId
  question: String,              // max 200 chars
  options: [
    { id: String, label: String }  // 2-5 options, label max 100 chars
  ],
  votes: [
    { userId: String, optionId: String, votedAt: String }
  ],
  status: 'open' | 'closed',
  closedAt: String | null,       // ISO timestamp
  closedBy: String | null,       // userId (leader) or 'system' (auto-close)
  winningOptionId: String | null,
  deadline: String | null,       // ISO timestamp (Boosted only)
  tieBreakPending: Boolean,      // true when auto-close hits a tie
  createdAt: String,
  updatedAt: String
}
```

**Indexes:**
- `{ tripId: 1, status: 1 }` — fetch open/closed decisions per trip
- `{ tripId: 1, deadline: 1 }` — cron query for auto-close

### API Endpoints

All endpoints require `requireAuth()` + `isActiveTraveler()`.

| Method | Path | Description | Gate |
|---|---|---|---|
| GET | `/api/trips/:tripId/decisions` | List all decisions for trip | Free |
| POST | `/api/trips/:tripId/decisions` | Create decision | Free (deadline field ignored unless Boosted) |
| POST | `/api/trips/:tripId/decisions/:id/vote` | Cast or change vote | Free |
| POST | `/api/trips/:tripId/decisions/:id/close` | Close decision (leader only) | Free |
| POST | `/api/trips/:tripId/decisions/:id/nudge` | Nudge non-voters (push) | Boosted only |

**Validation rules:**
- `question`: required, 1-200 chars
- `options`: 2-5 items, each label 1-100 chars, no duplicates
- `deadline`: must be in the future, only persisted if trip is Boosted
- Vote: user must not have status `left`/`removed`
- Close: only `trip.createdBy` can close (or system via cron)
- Cannot vote on or close a `status: 'closed'` decision
- Cannot create decisions on cancelled trips

**Auto-close cron job:**
- Runs every 15 minutes via Vercel Cron (or piggyback on existing `/api/jobs/aggregates`)
- Query: `{ status: 'open', deadline: { $lte: now } }`
- For each: compute winner. If tie → set `tieBreakPending: true`, push notify leader. If clear winner → close, post system message.
- Idempotency: check `status === 'open'` before updating

### Chat Integration

Decision cards render as a distinct message type in `ChatTab.tsx`:

**System message on creation:**
```
subtype: 'decision_created'
metadata: { decisionId, question, optionCount, creatorName }
```

**System message on close:**
```
subtype: 'decision_closed'
metadata: { decisionId, question, winningOption, voteCount }
```

**Inline card rendering:** When ChatTab encounters `subtype: 'decision_created'`, it fetches the decision data and renders a votable card inline (similar to nudge card styling but with interactive vote buttons). Renders as read-only after close.

### Edge Cases

| Edge Case | Handling |
|---|---|
| Tie at deadline | Set `tieBreakPending: true`, push leader, keep open until leader closes |
| Only 1 person votes | Still valid — leader can close. System message shows "(1 vote)" |
| Creator votes for own option | Allowed — normal behavior |
| Traveler leaves trip | Their vote remains counted (historical accuracy) |
| Traveler joins late | Can vote on open decisions |
| Edit option after votes | Not allowed — close and recreate |
| Delete decision | Only creator or leader, only while `status: 'open'` |

### Push Notifications

| Type | Audience | Priority | Copy |
|---|---|---|---|
| `decision_created` | All travelers except creator | P1 | "{creatorName} started a vote: {question}" |
| `decision_closed` | All travelers | P1 | "Decided: {winningOption}" |
| `decision_nudge` | Non-voters only | P1 | "Haven't voted yet: {question}" |
| `decision_tie_break` | Leader only | P0 | "It's a tie! Break the tie: {question}" |

---

## Feature 2: Trip Brief Auto-Pin

### Problem
The leader repeatedly answers the same questions: "What's the address?", "What time is check-in?", "What are we doing Saturday?", "Wait, what did we decide about the car?" Information is scattered across chat, overlays, and external apps. Non-Tripti users (partners, parents, pet-sitters) have no way to see the plan.

### Solution
A living, auto-refreshing summary that consolidates all trip information into one pinned view. Shareable via a public link (Boosted) so non-app users can access the plan.

### Free vs Boosted

| Capability | Free | Boosted |
|---|---|---|
| Full in-app brief (all sections) | Yes | Yes |
| Auto-refresh when data changes | Yes | Yes |
| Public shareable link | Yes (growth vector) | Yes |
| Export/print (clean printable view) | — | Yes |
| "Hide exact address" toggle | — | Yes |

**Critical design choice:** The shareable link is **free** — it's a growth engine. Every public brief page shows "Planned with Tripti" branding to non-users who are exactly the target demographic. The paid value is **export/print** (tangible artifact) and **address privacy controls**. We never gate correctness or freshness — stale data is trust poison.

### UX Flow

**Accessing the brief:**
- Pinned card at the top of the chat feed (above messages, below input)
- Tapping the card opens the full brief in a right-slide overlay
- Also accessible from the Progress Strip (new "Brief" indicator after dates lock)

**Brief sections (all auto-populated from existing trip data):**

1. **Overview** — Trip name, dates, destination, circle name, traveler count
2. **Accommodation** — Selected stay details (name, address, check-in/out times) if set; "Not yet chosen" otherwise
3. **Day-by-Day Highlights** — If itinerary exists: date header + list of activities for each day. If no itinerary: "Itinerary not yet generated"
4. **Decisions** — List of closed decisions (question → winning option). "No decisions yet" if none
5. **Open Items** — Open decisions still being voted on (question + deadline if set)
6. **Packing Reminders** — Group packing items (scope: 'group') from `prep_items`. Personal items excluded (privacy)
7. **Expenses Summary** — Total spent, per-person balance summary (positive = owed, negative = owes). Not full settlement — that's in Feature 3.

**Graceful degradation:** Each section renders independently. Missing data shows a friendly empty state, not a broken layout. The brief is useful even with only dates + destination.

**Shareable link (Boosted):**
- Leader taps "Share" in brief overlay → generates/shows public URL
- URL format: `https://preview.tripti.ai/t/{briefToken}` (short, clean)
- Public page: server-rendered, no auth required, `noindex` meta tag
- Shows all brief sections except: exact accommodation address (unless leader enables it via "Show address" toggle)
- Leader can "Regenerate link" (invalidates old token) or "Disable link" (removes `briefToken`)

**Export/print (Boosted):**
- "Export" button in brief overlay → opens a clean, print-optimized view
- CSS `@media print` styling — no navigation, no app chrome
- User uses browser print → PDF or paper

### Data Model

**Modified collection: `trips`** — add fields:
```javascript
{
  briefToken: String | null,       // Unguessable token for public link (uuid v4)
  briefTokenCreatedAt: String | null,
  briefShowAddress: Boolean,       // Default false — controls address visibility on public link
}
```

**No separate brief collection.** The brief is computed on-read from existing trip data (decisions, itinerary_versions, prep_items, expenses). This avoids sync/staleness issues entirely.

### API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/trips/:tripId/brief` | Compute and return brief data | Authenticated traveler |
| POST | `/api/trips/:tripId/brief/share` | Generate/return briefToken | Authenticated leader (free) |
| DELETE | `/api/trips/:tripId/brief/share` | Revoke briefToken | Authenticated leader |
| PATCH | `/api/trips/:tripId/brief/settings` | Toggle `briefShowAddress` | Authenticated leader (Boosted only) |
| GET | `/api/public/brief/:briefToken` | Public brief data (no auth) | None — token validates access |

**`GET /api/trips/:tripId/brief` response shape:**
```javascript
{
  overview: {
    tripName: String,
    destination: String | null,
    startDate: String | null,
    endDate: String | null,
    circleName: String,
    travelerCount: Number,
  },
  accommodation: {
    name: String | null,
    address: String | null,
    checkIn: String | null,
    checkOut: String | null,
    link: String | null,
  } | null,
  dayByDay: [
    {
      date: String,         // "2026-03-15"
      dayLabel: String,     // "Saturday, Mar 15"
      items: [{ time: String | null, title: String, notes: String | null }]
    }
  ],
  decisions: {
    closed: [{ question: String, answer: String, decidedAt: String }],
    open: [{ question: String, optionCount: Number, deadline: String | null }],
  },
  packingReminders: [{ title: String, quantity: Number | null }],  // group scope only
  expensesSummary: {
    totalCents: Number,
    currency: String,
    balances: [{ userId: String, userName: String, balanceCents: Number }],
  },
  // Metadata
  canShare: Boolean,        // true if trip is Boosted
  shareUrl: String | null,  // public URL if briefToken exists
  showAddress: Boolean,
}
```

**`GET /api/public/brief/:briefToken`:**
- Looks up trip by `briefToken`
- Returns same shape but: address redacted unless `briefShowAddress: true`, no expense details (privacy), no userId fields
- Returns 404 if token invalid or trip cancelled
- Sets `Cache-Control: no-store` (brief should always be fresh)
- Sets `X-Robots-Tag: noindex`

### Public Brief Page

**New route: `app/t/[briefToken]/page.jsx`**
- `'use client'` component
- Fetches from `GET /api/public/brief/:briefToken`
- Clean, read-only layout — trip name as header, sections as cards
- Tripti branding at bottom: "Planned with Tripti — tripti.ai"
- Mobile-responsive
- No login prompt, no app chrome
- `<meta name="robots" content="noindex">` to prevent indexing

### Auto-Refresh Strategy

The brief is computed on every `GET /api/trips/:tripId/brief` request (no caching in V1). Since the brief overlay is only open when the user is actively looking at it, and chat already polls every 5 seconds, this is acceptable. If performance becomes an issue, add server-side caching with invalidation on trip mutations.

**No event-driven recomputation needed in V1.** The brief reads live data on each request.

### Edge Cases

| Edge Case | Handling |
|---|---|
| No itinerary generated | "Day-by-Day" section shows "Itinerary not yet generated" |
| No accommodation selected | Section shows "Not yet chosen" |
| No decisions | Section shows "No decisions yet" |
| Brief shared, then trip cancelled | Public link returns 404 with "This trip is no longer available" |
| Traveler removed, had voted on decisions | Votes remain (historical), their name still shows in public brief |
| Multiple accommodations | V1: show the most recently selected. V2: support multiple stays |
| Leader transfers | New leader inherits brief management (share/revoke/settings) |

### Push Notifications

None for the brief itself — it's a passive reference, not an action-driven feature.

---

## Feature 3: Settle Up

### Problem
After a group trip, figuring out "who owes whom" is the most dreaded part. The leader often eats costs to avoid awkward conversations. Even when using the existing expense tracker, the "balances" view only shows net amounts — it doesn't tell you the simplest way to square up. And nobody wants to be the one who sends the "you owe me $47" message.

### Solution
A one-tap "Settle Up" calculation that computes the minimum number of payments to get everyone to zero, with copy-to-clipboard settlement instructions. The system does the math and the asking — the leader doesn't have to.

### Free vs Boosted

| Capability | Free | Boosted |
|---|---|---|
| Add/view/delete expenses | Yes | Yes |
| Per-person balances (who's up/down) | Yes | Yes |
| "Settle Up" — minimum payment plan | — | Yes |
| Copy settlement summary to clipboard | — | Yes |
| "Send reminder" push to individual debtor | — | Yes |
| "Mark as settled" per payment | — | Yes |

**The free tier still has full expense tracking.** Users see their balances but must figure out the payment plan themselves. The Boosted "Settle Up" button does the math, generates the instructions, and handles the social friction of asking.

### UX Flow

**Settle Up button:**
- Appears in the Expenses overlay, below the balances summary
- Only visible when there are unsettled balances (at least one person owes money)
- Tapping opens the Settle Up view

**Settle Up view (Boosted):**
- Header: "Settle Up — {tripName}"
- List of payment instructions, e.g.:
  ```
  Alice → David: $45.00
  Bob → David: $22.50
  Carol → Alice: $12.00
  ```
- Each row has:
  - Sender avatar + name → Receiver avatar + name: amount
  - "Send Reminder" button (sends push to the debtor)
  - "Mark Settled" checkbox (tracks settlement locally on the trip)
- "Copy All" button: copies a clean text summary to clipboard
  ```
  Trip: Beach Weekend — Settle Up
  ─────────────────────────
  Alice owes David $45.00
  Bob owes David $22.50
  Carol owes Alice $12.00
  ─────────────────────────
  Total: 3 payments
  ```
- "Share" button: same text, triggers native share sheet (Capacitor)

**Send Reminder:**
- Push notification to the debtor: "Settle up for {tripName}: you owe {creditorName} {amount}"
- Max 1 reminder per debtor per 48 hours (cooldown)
- Dedupe key: `settle_reminder:{tripId}:{debtorId}:{creditorId}`

**Mark Settled:**
- Optimistic UI checkbox per payment row
- Persisted on the trip document (not a separate collection)
- Does NOT modify expenses — settlement tracking is independent of the expense records
- Leader or either party (debtor or creditor) can mark settled

### Settlement Algorithm

**Already exists client-side** in `ExpensesOverlay.tsx` (lines 304-335). The greedy algorithm:

1. Compute net balance per person: `paid - owed`
2. Split into debtors (negative balance) and creditors (positive balance)
3. Sort debtors descending by amount owed, creditors descending by amount owed to them
4. Greedily match: for each (debtor, creditor) pair, settle `min(abs(debtor.balance), creditor.balance)`
5. Produces `[{ from: userId, to: userId, amountCents: Number }]`

**For Boosted:** Move this algorithm server-side (or keep client-side and just gate the UI). Server-side is preferred for the "Send Reminder" push notification, which needs the settlement data.

### Data Model

**Modified collection: `trips`** — add fields:
```javascript
{
  settlements: [
    {
      fromUserId: String,       // debtor
      toUserId: String,         // creditor
      amountCents: Number,
      settled: Boolean,         // default false
      settledAt: String | null, // ISO timestamp
      settledBy: String | null, // userId who marked it
      reminderSentAt: String | null, // last reminder timestamp (cooldown)
    }
  ]
}
```

**Important:** `settlements` is a **computed snapshot** that gets regenerated whenever expenses change. It is NOT an independent ledger. When an expense is added/deleted, the settlement plan is recomputed.

**Recomputation trigger:** On `POST /api/trips/:tripId/expenses` and `DELETE /api/trips/:tripId/expenses`, after the expense mutation succeeds, recompute settlements and `$set` the new array. Preserve `settled` status for payments that haven't changed (match by `fromUserId + toUserId`).

### API Endpoints

| Method | Path | Description | Gate |
|---|---|---|---|
| GET | `/api/trips/:tripId/settlements` | Get computed settlement plan | Boosted only |
| PATCH | `/api/trips/:tripId/settlements/:index/settle` | Mark payment as settled/unsettled | Boosted, debtor or creditor or leader |
| POST | `/api/trips/:tripId/settlements/:index/remind` | Send reminder push to debtor | Boosted, creditor or leader, 48hr cooldown |

**`GET /api/trips/:tripId/settlements` response:**
```javascript
{
  payments: [
    {
      index: Number,
      from: { userId: String, name: String },
      to: { userId: String, name: String },
      amountCents: Number,
      currency: String,
      settled: Boolean,
      settledAt: String | null,
    }
  ],
  summary: {
    totalPayments: Number,
    settledCount: Number,
    totalAmountCents: Number,
    currency: String,
  }
}
```

### Edge Cases

| Edge Case | Handling |
|---|---|
| No expenses | Settlement endpoint returns empty `payments: []` |
| Only 1 person in split | No settlement needed (they paid for themselves) |
| Expense added after some settlements marked | Recompute plan. Preserve `settled` for unchanged pairs. If a settled pair's amount changes, reset `settled: false` and notify both parties. |
| Expense deleted | Same recomputation logic |
| Traveler leaves trip | Their balance remains (you still owe even if you left). They can still be sent reminders if they have push tokens. |
| Currency mismatch | V1: all expenses use trip currency. No multi-currency settlement. |
| Rounding | Use integer cents throughout. Remainder (e.g., $10 split 3 ways) assigned to first debtor in sort order (max 1 cent difference). |
| Zero balance | User doesn't appear in settlement plan |

### Push Notifications

| Type | Audience | Priority | Copy |
|---|---|---|---|
| `settle_reminder` | Individual debtor | P1 | "Settle up for {tripName}: you owe {creditorName} {amount}" |

Cooldown: 48 hours per (tripId, debtorId, creditorId) tuple.
Dedupe key: `settle_reminder:{tripId}:{fromUserId}:{toUserId}`

---

## Feature Gating Infrastructure

### Trip-level boost status

Existing fields from REVENUE_MODEL_SPEC.md:
```javascript
trip.boostStatus: 'free' | 'boosted'  // default: 'free'
trip.boostedBy: String | null
trip.boostedAt: String | null
```

### Gating helper

**New file: `lib/trips/isFeatureGated.js`**
```javascript
/**
 * Check if a feature requires Boost and the trip is not boosted.
 * Returns true if the feature is BLOCKED (needs boost).
 */
export function isFeatureGated(trip, feature) {
  if (trip.boostStatus === 'boosted') return false

  const GATED_FEATURES = new Set([
    'decision_deadline',
    'decision_auto_close',
    'decision_nudge_voters',
    'brief_export',
    'brief_show_address',
    'settle_up',
    'settle_reminder',
    'settle_mark',
  ])

  return GATED_FEATURES.has(feature)
}
```

### Inline gate card pattern

When a free user taps a gated feature, show an **inline card** (not a modal) within the overlay:

```
┌─────────────────────────────────────────────┐
│  ✨ Boost this trip                          │
│                                              │
│  {feature description}                       │
│                                              │
│  Boosting also unlocks:                      │
│  • Decision deadlines & auto-close           │
│  • Shareable trip brief link                 │
│  • Settle Up — who owes whom                 │
│                                              │
│  [ Boost this trip — $4.99 ]                 │
└─────────────────────────────────────────────┘
```

- Card uses `bg-brand-sand` background (consistent with nudge cards)
- No lock icons, no "premium" badges, no crown emojis
- Button links to Stripe Checkout (web) or "Continue on tripti.ai" (native)
- Card is contextual: only appears when the user tries the specific gated action

---

## Upsell Trigger Points

| Trigger | Feature | Where |
|---|---|---|
| User creates 3rd+ decision and adds a deadline | Decision Cards | Decision creation form |
| Leader taps "Nudge non-voters" | Decision Cards | Decision card in overlay |
| Leader taps "Export" on brief | Trip Brief | Brief overlay |
| Leader taps "Hide address" toggle | Trip Brief | Brief overlay |
| Any user taps "Settle Up" | Settle Up | Expenses overlay |
| Creditor taps "Send Reminder" | Settle Up | Settle Up view |

**Never trigger upsells:**
- Right after dates lock (celebration)
- Right after someone joins (welcome)
- During active scheduling (coordination)
- Inside the chat feed (sacred space)
- On page load or overlay open (no surprise modals)

---

## Implementation Plan

### Phase A: Decision Cards (5 days)

| Task | Effort | Notes |
|---|---|---|
| `decisions` collection + indexes | 0.5 day | |
| CRUD endpoints (create, vote, close, list) | 1.5 days | In `app/api/[[...path]]/route.js` |
| Nudge endpoint (Boosted gate) | 0.5 day | |
| Decision card component (votable inline card in chat) | 1.5 days | New component rendered in `ChatTab.tsx` |
| "Decisions" section in Trip Info overlay | 0.5 day | List of open + closed |
| Auto-close cron job | 0.5 day | Piggyback on existing `/api/jobs/aggregates` |
| Push notifications (4 types) | 0.5 day | Via existing pushRouter |
| Feature gate inline card | 0.5 day | Shared component |

### Phase B: Trip Brief (5 days)

| Task | Effort | Notes |
|---|---|---|
| `GET /api/trips/:tripId/brief` endpoint | 1 day | Aggregates from trips, decisions, itinerary_versions, prep_items |
| Brief overlay component | 1.5 days | New overlay in CommandCenterV3 |
| Pinned brief card above chat | 0.5 day | In ChatTab or CommandCenterV3 |
| `POST/DELETE /api/trips/:tripId/brief/share` | 0.5 day | Token generation/revocation |
| `GET /api/public/brief/:briefToken` endpoint | 0.5 day | No-auth route |
| Public brief page (`app/t/[briefToken]/page.jsx`) | 1 day | Server-rendered, mobile-responsive |
| Export/print view | 0.5 day | CSS `@media print` |
| Feature gate for share/export | 0.5 day | |

### Phase C: Settle Up (4 days)

| Task | Effort | Notes |
|---|---|---|
| Settlement computation (server-side) | 0.5 day | Port existing client-side algorithm |
| `settlements` field on trips + recomputation on expense mutation | 1 day | Modify POST/DELETE expense endpoints |
| `GET /api/trips/:tripId/settlements` endpoint | 0.5 day | Boosted gate |
| `PATCH settle` and `POST remind` endpoints | 0.5 day | |
| Settle Up UI in Expenses overlay | 1 day | Payment list, mark settled, copy, share |
| Push notification for reminders | 0.5 day | Via pushRouter, 48hr cooldown |
| Feature gate inline card in Expenses overlay | 0.5 day | |

### Phase D: Gating + Polish (2 days)

| Task | Effort | Notes |
|---|---|---|
| `isFeatureGated()` helper | 0.5 day | |
| Inline gate card component (shared) | 0.5 day | |
| Stripe Checkout integration for Boost | 1 day | From REVENUE_MODEL_SPEC.md |
| Social notification on boost ("trip just got an upgrade!") | 0.5 day | System message in chat |

**Total: ~16 days** (vs 10-12 for original vitamin features)

---

## Database Changes Summary

### Modified collections

**`trips`** — new fields:
```javascript
{
  boostStatus: 'free' | 'boosted',     // default: 'free'
  boostedBy: String | null,
  boostedAt: String | null,
  stripePaymentId: String | null,
  briefToken: String | null,
  briefTokenCreatedAt: String | null,
  briefShowAddress: Boolean,            // default: false
  settlements: [                        // computed, recomputed on expense changes
    {
      fromUserId: String,
      toUserId: String,
      amountCents: Number,
      settled: Boolean,
      settledAt: String | null,
      settledBy: String | null,
      reminderSentAt: String | null,
    }
  ]
}
```

### New collections

**`decisions`** — decision polls:
```javascript
{
  id: String,
  tripId: String,
  createdBy: String,
  question: String,
  options: [{ id: String, label: String }],
  votes: [{ userId: String, optionId: String, votedAt: String }],
  status: 'open' | 'closed',
  closedAt: String | null,
  closedBy: String | null,
  winningOptionId: String | null,
  deadline: String | null,
  tieBreakPending: Boolean,
  createdAt: String,
  updatedAt: String
}
```

**Indexes:**
- `decisions`: `{ tripId: 1, status: 1 }`, `{ tripId: 1, deadline: 1 }`
- `trips`: existing indexes sufficient (briefToken lookups are rare, covered by `{ briefToken: 1 }` sparse index)

### New collection: `boost_purchases` (from REVENUE_MODEL_SPEC.md)

```javascript
{
  id: String,
  tripId: String,
  userId: String,
  amount: Number,         // cents
  currency: String,
  stripeSessionId: String,
  stripePaymentIntentId: String,
  status: 'completed' | 'refunded' | 'disputed' | 'chargeback',
  createdAt: String,
}
```

---

## Interaction Between Features

```
Decision Cards ──closed decisions──→ Trip Brief (Decisions section)
                                          │
Prep Items ──group packing items──→ Trip Brief (Packing section)
                                          │
Itinerary ──day-by-day activities──→ Trip Brief (Day-by-Day section)
                                          │
Expenses ──balances──→ Trip Brief (Expenses Summary section)
    │
    └──expense mutations──→ Settle Up (recomputes settlement plan)
```

All three features make the Trip Brief richer. The Brief is the "presentation layer" that makes the other features' output visible and shareable. This creates a virtuous cycle: the more the group uses Decision Cards and tracks expenses, the more valuable the Brief becomes.

---

## What's Explicitly Out of Scope (V1)

- Ranked-choice voting (permanently)
- Task assignments with due dates (too PM-like for friend groups)
- Real-time WebSocket updates (polling via existing 5s chat refresh is sufficient)
- Multi-currency expense handling
- Venmo/PayPal integration for actual payments
- PDF generation (server-side) — use browser print instead
- Anonymous voting
- Decision comments/threads
- Brief customization (section reordering, custom notes)
- Offline brief caching (V2, requires Capacitor storage work)
- Weather integration
- Map embeds

---

## Metrics

### Decision Cards
- Decisions created per trip
- Vote participation rate (votes / travelers per decision)
- % of decisions that use deadlines (Boosted adoption)
- Time from creation to close
- "Nudge non-voters" usage rate

### Trip Brief
- Brief views per trip (in-app)
- Public link generation rate (free — growth metric)
- Public link views by non-authenticated users (growth signal — potential new users)
- Public link → signup conversion rate
- Export/print usage (Boosted adoption)

### Settle Up
- % of trips with expenses that open Settle Up
- "Send Reminder" usage rate
- "Mark Settled" completion rate (all payments settled)
- Time from last expense to full settlement

### Bundle-level
- Boost conversion rate (purchases / trips reaching locked)
- Feature usage delta (Boosted vs free trips)
- Which gated feature triggers most Boost purchases (attribution)
- NPS/satisfaction delta for Boosted trips

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Decision Cards feel like "just polls" | Low perceived value vs free poll tools | Anchor value on closure + deadline automation, not polling itself |
| Brief data is wrong/stale | Trust destruction | Compute on-read from live data, never cache in V1 |
| Public brief link shared too widely | Privacy concern | Unguessable UUID token, revocable, address hidden by default |
| Settle Up feels like Splitwise clone | "Why not just use Splitwise?" | Emphasize in-context value: no re-entering expenses, connected to the trip |
| Low adoption of all 3 features | $4.99 feels overpriced | Each feature must stand alone as useful; bundle is bonus |
| Groups leave Tripti after dates lock | No surface area for Boost | Decision Cards + Brief create post-lock engagement hooks |
| Notification overload from 3 features | Users disable push entirely | Hard cap: max 2 system notifications per feature per day per user |

---

## Rejected Alternatives for This Bundle

| Alternative | Why Rejected |
|---|---|
| Assignments + due dates | PM vibes violate brand; social friction of "assigning" friends |
| Ranked-choice voting | High complexity, low usage, confusing UX |
| Auto-refresh as paid gate | Users expect data to be fresh; gating it feels broken |
| Separate "Settle Up" app/flow | Must be in-context of the trip to differentiate from Splitwise |
| AI-generated brief (LLM) | Risk of hallucination in a "source of truth" document; deterministic is safer |
| Custom brief templates | Scope creep; V1 brief must be opinionated and simple |

---

## Appendix: Copy Guidelines

All copy must follow Tripti brand voice: calm, friendly, never guilt or pressure.

**Decision Cards:**
- Create button: "Start a vote"
- Vote prompt: "What does the group think?"
- Close system message: "Decided: {option}" (not "LOCKED" or "FINAL")
- Nudge: "Quick reminder to vote on: {question}" (not "You haven't voted!")

**Trip Brief:**
- Pin card: "Trip Brief — your plan at a glance"
- Share CTA: "Share with anyone" (not "Share publicly")
- Empty section: "Not yet decided" / "Not yet chosen" / "No expenses yet"

**Settle Up:**
- Button: "Settle Up"
- Reminder: "Friendly reminder from {tripName}: you owe {name} {amount}"
- Mark settled: "Settled" (not "Paid" — we don't verify actual payment)
- Empty state: "All squared up!" (when all marked settled)
