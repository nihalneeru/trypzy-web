# AI-Assisted Coordination — Implementation Spec

> Transforming Tripti from a scheduling tool into an AI-assisted group coordination platform for dates, destinations, and activities.

**GitHub Issues**: #206 (F0), #207 (F1), #208 (F3), #209 (F4), #210 (F2), #211 (F6)

---

## Phased Roadmap

| Phase | Features | Effort | Goal |
|-------|----------|--------|------|
| **Phase 1: Smart Assistant** | F0 (chat brief flag), F1 (trip status header) | ~1 week | "The app understands us" |
| **Phase 2: The Pivot** | F3 (destination consensus) | ~1-2 weeks | "Tripti handles where, not just when" |
| **Phase 3: Intelligence** | F4 (least misery), F5 (synthesis — folded into F1) | ~3-5 days | "The leader sees the full picture" |
| **Phase 4: Magic** | F2 (shared notes), F6 (smart propose) | ~2-3 weeks | "The AI is paying attention" |

---

## Phase 1: Smart Assistant

### F0: Enable Chat Brief for Itinerary Generation

**What**: Flip `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1` in production.

**Already built**:
- `summarizePlanningChat()` in `lib/server/llm.js` (~line 477)
- Extracts: mustDos, avoid, preferences (pace/budget/focus/logistics), constraints, openQuestions
- Injected into itinerary prompt under "PLANNING CHAT BRIEF" section
- Feature flag: `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE`
- Related flags: `ITINERARY_CHAT_BRIEF_LOOKBACK_DAYS` (default 14), `ITINERARY_CHAT_BRIEF_MAX_MESSAGES` (default 200)

**Action**: Set env var in Vercel production + preview. Verify with a test trip that has chat messages + itinerary generation.

**Cost impact**: One additional GPT-4o-mini call per itinerary generation (~$0.001/call).

---

### F1: Unified Trip Status Header Card

**What**: Pinned, collapsible header card above chat showing trip state + "since you were last here" summary.

#### Data Requirements

**New field on trip response** — `trip.lastVisitedAt` per user:

Add to `GET /api/trips/:id` response computation (~route.js line 1770):
```js
// Track last visit timestamp for "since you were last here"
const lastVisitKey = `lastVisit_${auth.user.id}`
const lastVisitedAt = trip[lastVisitKey] || null

// Update last visit (fire-and-forget)
db.collection('trips').updateOne(
  { id: tripId },
  { $set: { [lastVisitKey]: new Date().toISOString() } }
)
```

Add to response object:
```js
viewer: {
  ...existingViewerFields,
  lastVisitedAt,
}
```

**New field on trip response** — `trip.changesSinceLastVisit`:

Computed server-side when `lastVisitedAt` exists:
```js
changesSinceLastVisit: {
  newMessages: 5,           // count of trip_messages since lastVisitedAt
  newDateWindows: 1,        // count of date_windows since lastVisitedAt
  newDestinations: 2,       // count of destination_suggestions since lastVisitedAt (Phase 2)
  phaseChanged: true,       // true if trip status changed since lastVisitedAt
  summary: null,            // LLM summary (v2, only if significant changes)
}
```

For v1, keep this deterministic — just counts and boolean flags. No LLM.

#### Component: `TripStatusHeader`

**File**: `components/trip/command-center-v2/TripStatusHeader.jsx`

```
┌──────────────────────────────────────────────────┐
│ 📍 Collecting dates — 4 of 6 travelers responded │
│    Feb 7-9 leads with 4 supporters               │
│                                           [Hide] │
│                                                   │
│ Since you were away: 3 new messages, Alex         │
│ suggested Feb 7-9                          [View] │
└──────────────────────────────────────────────────┘
```

**Props**:
```jsx
{
  trip,            // Full trip object with schedulingSummary, changesSinceLastVisit
  user,            // Current user
  onOpenOverlay,   // (overlayType) => void
  onDismiss,       // () => void — hides until next visit
}
```

**Rendering logic**:
- Only shows when there's meaningful state to display (not on brand-new empty trips)
- Dismissible per visit (stored in sessionStorage, not DB)
- "Since you were away" section only shows if `lastVisitedAt` exists and changes > 0
- CTA button opens the relevant overlay (scheduling, destination, itinerary)
- Background: `bg-brand-sand/40` (matches existing status card styling)

**Phase states** (deterministic, no LLM):

| Trip State | Header Content |
|------------|---------------|
| `proposed`, no windows | "Start by suggesting dates that work for you" |
| `scheduling`, COLLECTING | "Collecting dates — X of Y responded. [leading option] leads" |
| `scheduling`, PROPOSED | "Leader proposed [dates] — X of Y reacted" |
| `locked`, no destination | "Dates locked ([dates]). Where should you go?" |
| `locked`, collecting destinations | "X destinations suggested. [leading] has most interest" |
| `locked`, destination locked | "Going to [destination] on [dates]. Itinerary is next" |
| Itinerary phases | "Itinerary [status]. [CTA]" |

**Wiring into CommandCenterV3** (~line 360, before ChatTab):
```jsx
{!isCancelled && !isCompleted && !isReadOnly && (
  <TripStatusHeader
    trip={trip}
    user={user}
    onOpenOverlay={openOverlay}
    onDismiss={() => setStatusHeaderDismissed(true)}
  />
)}
```

Replaces the existing `SchedulingStatusCard` and `ItineraryStatusCard` (consolidation).

---

## Phase 2: Destination Consensus

### F3: Destination Consensus Phase

#### Data Model

**Collection: `destination_suggestions`**
```js
{
  id: uuid(),
  tripId: string,
  suggestedBy: string,         // userId
  name: string,                // "Lisbon, Portugal"
  description: string,         // Optional notes, links
  budgetBracket: string|null,  // '<500' | '500-1k' | '1k-2k' | '2k+' | null
  isProposed: boolean,         // Leader proposed this one
  proposedAt: string|null,     // When leader proposed
  isLocked: boolean,           // Final decision
  lockedAt: string|null,
  createdAt: string,
}
```

**Collection: `destination_reactions`**
```js
{
  id: uuid(),
  suggestionId: string,
  tripId: string,
  userId: string,
  reaction: 'interested' | 'maybe' | 'pass',
  createdAt: string,
}
```

**Indexes**:
```js
destination_suggestions: { tripId: 1, createdAt: 1 }
destination_reactions: { suggestionId: 1, userId: 1 } (unique)
destination_reactions: { tripId: 1, userId: 1 }
```

#### API Endpoints

Add to `app/api/[[...path]]/route.js` (or new file `app/api/trips/[tripId]/destinations/route.js` if extracting):

**`GET /api/trips/:tripId/destinations`**
- Returns all destination suggestions + reactions + computed scores
- Includes `userReaction` for each suggestion (current user's reaction)
- Includes `reactionCounts: { interested: N, maybe: N, pass: N }` per suggestion
- Auth: any active traveler

**`POST /api/trips/:tripId/destinations`**
- Body: `{ name, description?, budgetBracket? }`
- Creates suggestion + auto-reaction ('interested') for submitter
- Emits `destination.suggested` event
- Auth: active traveler, trip must be locked (dates), destination not locked

**`POST /api/trips/:tripId/destinations/:id/react`**
- Body: `{ reaction: 'interested' | 'maybe' | 'pass' }`
- Upserts reaction (one per user per suggestion)
- Emits `destination.reaction.submitted` event
- Auth: active traveler

**`POST /api/trips/:tripId/destinations/:id/propose`** (leader only)
- Sets `isProposed = true` on the suggestion
- Emits `destination.proposed` event
- Auth: trip leader

**`POST /api/trips/:tripId/destinations/lock`** (leader only)
- Body: `{ suggestionId }`
- Sets `isLocked = true`, updates `trip.lockedDestination` and `trip.destinationHint`
- Emits `destination.locked` event
- Auth: trip leader

**`POST /api/trips/:tripId/destinations/ai-suggest`** (leader only)
- Returns 5-6 AI-generated destination suggestions based on: locked dates, group size, season, any chat signals
- Does NOT auto-add to suggestions — returns options for leader to review and add
- Uses `generateDestinationSuggestions()` (new function in `lib/server/llm.js`)
- Auth: trip leader

#### Component: `DestinationOverlay`

**File**: `components/trip/command-center-v2/overlays/DestinationOverlay.jsx`

**Phases** (mirrors DateWindowsFunnel):

**COLLECTING** (no proposal yet):
```
┌──────────────────────────────────────────┐
│ Where should you go?                      │
│                                           │
│ ┌─────────────────────────────────────┐   │
│ │ 🏖 Lisbon, Portugal       $500-$1k │   │
│ │ Suggested by Alex                    │   │
│ │ 4 interested · 1 maybe · 0 pass     │   │
│ │ [Interested] [Maybe] [Pass]         │   │
│ └─────────────────────────────────────┘   │
│                                           │
│ ┌─────────────────────────────────────┐   │
│ │ 🏔 Costa Rica             $1k-$2k  │   │
│ │ Suggested by Sarah                   │   │
│ │ 2 interested · 1 maybe · 1 pass     │   │
│ │ [Interested] [Maybe] [Pass]         │   │
│ └─────────────────────────────────────┘   │
│                                           │
│ [+ Suggest a destination]                 │
│                                           │
│ ── Leader tools ──                        │
│ [✨ Get AI suggestions] [Propose winner]  │
└──────────────────────────────────────────┘
```

**PROPOSED** (leader picked one):
```
┌──────────────────────────────────────────┐
│ Leader proposed: Lisbon, Portugal         │
│                                           │
│ React to confirm:                         │
│ [Interested ✓4] [Maybe 1] [Pass 0]       │
│                                           │
│ ── Leader ──                              │
│ [Lock destination] [Change proposal]      │
└──────────────────────────────────────────┘
```

**LOCKED**:
```
┌──────────────────────────────────────────┐
│ ✅ Destination locked: Lisbon, Portugal   │
│ Now plan your itinerary →                 │
└──────────────────────────────────────────┘
```

**Reaction buttons**: Same pattern as date scheduling — toggleable, one reaction per suggestion.
- "Interested" = green/brand-blue highlight
- "Maybe" = amber highlight
- "Pass on this one" = muted, with tooltip: "No hard feelings — helps find the best fit"

#### Progress Integration

**Option A (recommended for v1)**: Destination is a substep within `DATES_LOCKED` stage. No stage model changes. The `TripStatusHeader` shows "Dates locked — where should you go?" and the destination overlay is accessible from the same chevron or a CTA.

**Trip field additions**:
```js
// On trip document
lockedDestination: string | null,     // "Lisbon, Portugal"
destinationPhase: 'collecting' | 'proposed' | 'locked' | null,
```

**ContextCTABar integration**: Add destination CTA after dates are locked:
```
Priority: ... existing date CTAs ... → "Suggest a destination" (if user hasn't suggested) → "React to destination" (if proposal pending) → ... existing itinerary CTAs ...
```

#### Event Instrumentation

New event types in `lib/events/types.js`:
```js
'destination.suggested'           // payload: { suggestionId, name }
'destination.reaction.submitted'  // payload: { suggestionId, reaction }
'destination.proposed'            // payload: { suggestionId, name }
'destination.locked'              // payload: { suggestionId, name }
'destination.ai_suggest_used'     // payload: { count }
```

---

## Phase 3: Intelligence

### F4: Least Misery Leader Decision Support

#### Implementation

**New utility**: `lib/trips/leastMisery.js`

```js
/**
 * Compute least-misery and most-popular scores for a set of options.
 * Works for both date windows and destination suggestions.
 *
 * @param {Array} options - Array of { id, reactions: [{ userId, reaction }] }
 * @param {number} totalTravelers - Group size
 * @returns {{ leastMisery: Array, mostPopular: Array }}
 */
export function computeDecisionLenses(options, totalTravelers) {
  return options.map(opt => {
    const works = opt.reactions.filter(r =>
      r.reaction === 'works' || r.reaction === 'interested'
    ).length
    const cant = opt.reactions.filter(r =>
      r.reaction === 'cant' || r.reaction === 'pass'
    ).length
    const maybe = opt.reactions.filter(r => r.reaction === 'maybe').length

    return {
      id: opt.id,
      worksCount: works,
      maybeCount: maybe,
      conflictCount: cant,
      miseryScore: cant,                    // Lower = better for least misery
      popularityScore: works + (maybe * 0.5), // Higher = better for popularity
      coverage: (works + maybe) / totalTravelers,
    }
  })
}
```

**Leader UI in scheduling + destination overlays**:
- When 3+ options exist and leader can propose:
- Toggle between "Fewest conflicts" (sorted by miseryScore ASC) and "Most popular" (sorted by popularityScore DESC)
- Conflict detail (leader-only, expandable): "If you pick X, Jordan can't make it"
- Group view stays aggregated: "Works for 5 of 6"

**Wiring**: Import in `SchedulingOverlay.tsx` and `DestinationOverlay.jsx`. Show the lens toggle above the options list when `isLeader && options.length >= 3`.

### F5: AI Synthesis (folded into F1)

Synthesis capabilities are embedded in the `TripStatusHeader` component:
- Deterministic state summaries (Phase 1 — counts, phases, leading option)
- LLM-powered summaries (Phase 2 — only when significant chat volume warrants it)
- Triggered by state thresholds, not timers

No separate component needed.

---

## Phase 4: Magic

### F2: Shared Notes from Chat

#### Phase 2a: Deterministic Keyword Scanner

**New utility**: `lib/trips/extractNotes.js`

```js
const PATTERNS = [
  { regex: /can'?t\s+do\s+(.+)/i, type: 'blackout_date' },
  { regex: /budget\s+(under|below|max|no more than)\s+\$?([\d,]+)/i, type: 'budget_limit' },
  { regex: /need\s+(direct flights?|nonstop)/i, type: 'requirement' },
  { regex: /allergic\s+to\s+(.+)/i, type: 'requirement' },
  { regex: /no\s+(hiking|camping|hostels?|red.?eyes?)/i, type: 'dealbreaker' },
  { regex: /prefer\s+(not\s+to\s+)?(.+)/i, type: 'preference' },
  // ... expand based on real chat patterns
]

export function scanMessageForNotes(messageContent) {
  const matches = []
  for (const { regex, type } of PATTERNS) {
    const match = messageContent.match(regex)
    if (match) {
      matches.push({ type, extractedText: match[0], confidence: 'low' })
    }
  }
  return matches
}
```

**Integration point**: After `POST /api/trips/:id/messages` inserts the message, fire-and-forget:
```js
const notes = scanMessageForNotes(content)
if (notes.length > 0) {
  // Insert into extracted_notes (fire-and-forget, non-blocking)
  db.collection('extracted_notes').insertMany(
    notes.map(n => ({
      id: uuid(), tripId, source: 'chat_heuristic',
      noteType: n.type, value: { text: n.extractedText },
      sourceMessageId: messageId, sourceMessageText: content.slice(0, 200),
      authorUserId: auth.user.id,
      confidence: 'low', status: 'suggested',
      createdAt: new Date().toISOString(),
    }))
  ).catch(() => {}) // Silent failure OK
}
```

#### Phase 2b: LLM Refinement

**New function in `lib/server/llm.js`**: `refineExtractedNotes()`

- Runs on trip load alongside nudge evaluation
- Only if new messages since last refinement
- Reads heuristic-flagged notes + recent chat
- LLM upgrades confidence or marks as false positive
- Cached with `inputHash` pattern

#### Phase 2c: UI — Shared Notes Board

**New component**: `SharedNotesPanel.jsx` (embedded in TripStatusHeader expandable section or accessible via a "Notes" button)

- Lists all extracted notes with status badges (Suggested / Confirmed / Dismissed)
- Each note shows: source quote, author avatar, timestamp
- One-tap actions: [Confirm] [Dismiss] [Edit]
- Per-trip toggle: "Help with notes from chat: On/Off"

### F6: Smart Propose

**Implementation**: Extend the leader propose flow in scheduling + destination overlays.

When leader clicks "Propose":
1. Compute `leastMisery` scores (F4)
2. If `extracted_notes` exist, check for conflicts between top option and any confirmed constraints
3. Generate a one-sentence suggestion: "Feb 7-9 works for the most people and avoids Alex's March blackout"
4. Fallback (no LLM): "Feb 7-9 has the fewest conflicts (0) and 5 supporters"

**Always ends with**: "You can propose any option when you're ready."

---

## Cross-Cutting Concerns

### Privacy & Trust
- Chat scanning (F2) is opt-in per trip with clear disclosure
- Extracted notes require user confirmation before affecting recommendations
- Individual reactions/constraints shown only to leader; group sees aggregated counts
- Never extract emotional states or interpersonal dynamics — facts only

### LLM Cost Management
- F0: +1 GPT-4o-mini call per itinerary gen (~$0.001)
- F1 v1: Zero LLM (deterministic)
- F3: +1 call for AI suggestions (leader-initiated, optional)
- F2: +1 batch call per trip load (only when new messages, cached)
- F6: +1 call per propose action (optional)
- Total worst case: ~$0.005/trip/day — negligible

### Feature Flags
```env
ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1    # F0 (existing)
NEXT_PUBLIC_TRIP_STATUS_HEADER=1               # F1
NEXT_PUBLIC_DESTINATION_CONSENSUS=1            # F3
NEXT_PUBLIC_LEAST_MISERY=1                     # F4
NEXT_PUBLIC_SHARED_NOTES=1                     # F2
NEXT_PUBLIC_SMART_PROPOSE=1                    # F6
```

### Event Types (new)
```
destination.suggested
destination.reaction.submitted
destination.proposed
destination.locked
destination.ai_suggest_used
note.extracted
note.confirmed
note.dismissed
smart_propose.shown
smart_propose.accepted
smart_propose.overridden
```

---

## Files Modified/Created

### Phase 1
| File | Action |
|------|--------|
| `.env.local` / Vercel env | Set `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1` |
| `app/api/[[...path]]/route.js` | Add `lastVisitedAt` tracking + `changesSinceLastVisit` computation |
| `components/trip/command-center-v2/TripStatusHeader.jsx` | **New** — unified status header |
| `components/trip/command-center-v2/CommandCenterV3.tsx` | Wire TripStatusHeader, remove SchedulingStatusCard + ItineraryStatusCard |
| `components/trip/command-center-v2/SchedulingStatusCard.jsx` | **Delete** (consolidated into TripStatusHeader) |
| `components/trip/command-center-v2/ItineraryStatusCard.jsx` | **Delete** (consolidated into TripStatusHeader) |

### Phase 2
| File | Action |
|------|--------|
| `app/api/[[...path]]/route.js` | Add destination endpoints (GET/POST/react/propose/lock/ai-suggest) |
| `components/trip/command-center-v2/overlays/DestinationOverlay.jsx` | **New** — destination consensus overlay |
| `components/trip/command-center-v2/types.ts` | Add `'destination'` to OverlayType |
| `components/trip/command-center-v2/CommandCenterV3.tsx` | Wire DestinationOverlay + CTA |
| `components/trip/command-center-v2/ContextCTABar.tsx` | Add destination CTAs |
| `lib/trips/progress.js` | Add destination step (optional) |
| `lib/events/types.ts` | Add destination event types |
| `lib/server/llm.js` | Add `generateDestinationSuggestions()` |

### Phase 3
| File | Action |
|------|--------|
| `lib/trips/leastMisery.js` | **New** — decision lens computation |
| `components/trip/command-center-v2/overlays/SchedulingOverlay.tsx` | Add least misery toggle for leader |
| `components/trip/command-center-v2/overlays/DestinationOverlay.jsx` | Add least misery toggle for leader |

### Phase 4
| File | Action |
|------|--------|
| `lib/trips/extractNotes.js` | **New** — deterministic keyword scanner |
| `lib/server/llm.js` | Add `refineExtractedNotes()` |
| `app/api/[[...path]]/route.js` | Add note extraction post-hook + notes endpoints |
| `components/trip/command-center-v2/SharedNotesPanel.jsx` | **New** — notes board UI |

---

## Verification Checklist

### Phase 1
- [ ] `npm run build` — no errors
- [ ] Generate itinerary on a trip with chat messages — itinerary references chat context
- [ ] Open a trip after 24h — "since you were away" section shows correct counts
- [ ] Dismiss header — stays dismissed for the session
- [ ] Header shows correct phase/state for each trip status

### Phase 2
- [ ] Suggest a destination — appears in list with auto-reaction
- [ ] React to destination — reaction persists, counts update
- [ ] Leader proposes — proposal view shows for all travelers
- [ ] Leader locks — `trip.lockedDestination` set, itinerary prompt enriched
- [ ] AI suggest — returns reasonable destinations for the group's dates/season
- [ ] "Pass" reaction — feels neutral, not confrontational

### Phase 3
- [ ] Leader sees "Fewest conflicts" and "Most popular" toggle
- [ ] Conflict detail shows correct blocker info (leader-only)
- [ ] Group view shows aggregated counts, no individual names

### Phase 4
- [ ] Chat message "I can't do March" → note extracted with source quote
- [ ] User can confirm/dismiss notes
- [ ] LLM refinement upgrades confidence on valid notes
- [ ] Smart propose references confirmed notes in suggestion
