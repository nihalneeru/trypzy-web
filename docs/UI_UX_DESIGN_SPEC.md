# Tripti.ai UI + UX Design Spec

> **Status:** Active
> **Council reviewed:** 2026-02-24 (Gemini 3 Pro + GPT-5.2, 2 rounds with cross-review)
> **Agent reviewed:** 2026-02-24 (UI Auditor + Creative Design Guru + UX Expert + Devil's Advocate)
> **Last updated:** 2026-02-24

Purpose: A practical, vetted design rulebook for Tripti.ai. The product is a **group-decision + coordination engine** — not an itinerary app.

---

## 0) Product Pillars (non-negotiables)

### Pillar A — Decisions are the product
Tripti's core objects are **Decisions** (Dates / Stay / Itinerary / Budget / Transport), not chat threads and not documents.

**Every trip screen must answer in 5 seconds:**
1. What are we deciding right now?
2. What's already locked?
3. What do I do next (one-tap)?

### Pillar B — Reduce planner burden ("Planner Shield")
The system — not the planner — should nudge people.
- Reminders come from Tripti, not the leader.
- Progress is visible to everyone.
- Locking is a clear, celebrated event.

### Pillar C — AI is a convergence engine
AI is used to **propose fewer options, summarize disagreement, and move the group toward a lock** — not to generate travel content or auto-resolve decisions.

**Operational definition of "Convergence Engine":**
1. **Option reduction**: Many constraints/options → 2–3 candidate options + rationale
2. **Disagreement surfacing**: "2 people can't do Feb 10–12; 4 prefer weekends; 1 is flexible" (cite signals, not names)
3. **Next-action recommendation**: "Ask for 2 missing votes" or "Leader can lock with warning"
4. **Confidence + failure mode**: If signals are weak: "Not enough responses to narrow — send nudge?" (never fake certainty)

**UI rule**: Use "Tripti suggests..." not "AI suggests..." — the system has a name.

### Pillar D — Chat is the canvas, decisions are the artifacts
Chat is where friend groups naturally coordinate. The system surfaces decisions INTO the chat stream — not in a separate "Decide" tab. Users should never leave the conversation to find or act on a decision.

---

## 1) Information Architecture

### Canonical architecture: Command Center + Overlays

> **Council + team consensus**: The current chat-centric Command Center with slide-in overlays is the correct architecture. Do NOT migrate to a tab-based trip hub. Tabs would feel like a SaaS dashboard; the target users are friends, not coworkers.

**The model:**
- **Base layer**: Chat feed + pinned status card (max 1) + Context CTA Bar
- **Interaction model**: Decisions are overlays (right-slide or bottom-sheet) that slide over chat
- **Return behavior**: Closing an overlay returns to the same chat scroll position

**Navigation hierarchy:**
```
Dashboard (circles + trips)
  └── Trip (Command Center)
        ├── Chat feed (always visible)
        ├── Status card (max 1, priority: blocker > scheduling > itinerary)
        ├── ProgressStrip (horizontal chevrons)
        ├── Context CTA Bar (one primary action)
        └── Overlays (slide-in):
              ├── Scheduling (right-slide)
              ├── Itinerary (right-slide)
              ├── Accommodation (right-slide)
              ├── Prep (right-slide)
              ├── Trip Info (right-slide)
              ├── Brief (right-slide)
              ├── Member Profile (right-slide)
              ├── Travelers (bottom-sheet)
              ├── Expenses (bottom-sheet)
              └── Memories (bottom-sheet)
```

**Rules:**
- One primary CTA per screen (Context CTA Bar). No competing CTAs.
- Maximum one status card above chat at a time. Priority: blocker stage > scheduling > itinerary.
- Deep links: `?overlay=scheduling` opens the correct overlay after auth. Every push notification must map to a specific overlay.

### Primary routes (standalone pages)
- `/dashboard` — Active trips + circles. NO global "open decisions" aggregation (premature for MVP).
- `/trips/[tripId]` — Command Center (single trip hub)
- `/circles/[circleId]` — Circle detail
- `/settings/privacy` — Account settings
- `/p/[shareId]` — Public trip preview (unauthenticated)
- `/t/[briefToken]` — Public trip brief (unauthenticated)

### Explicitly deferred (not in MVP)
- Dedicated Inbox/notifications route (notifications live in AppHeader dropdown)
- Global "open decisions" view across trips
- "Files" or "Track" tabs — expenses and prep are overlays, not top-level surfaces
- Offline vote queuing (requires service worker + IndexedDB — infrastructure, not product)

---

## 2) Design System

### Layout + spacing
- 8pt spacing grid (Tailwind: p-2=8px, p-4=16px, p-6=24px, etc.)
- Primary content: `max-w-5xl` for trip view, `max-w-7xl` for dashboard
- Mobile: bottom sheets and stacked cards. Avoid dense tables.

### Typography
- Font: Inter (`font-inter`)
- Hierarchy: Page Title (text-2xl+) / Section Title (text-sm font-semibold) / Body (text-sm) / Meta (text-xs, minimum 11px — never smaller)
- Numeric emphasis for progress: **4/7 responded** (bold fraction)
- **Minimum legibility**: 11px (text-xs). Never use text-[9px] or text-[10px].

### Brand color semantics

| Signal | Color | Token | Usage |
|--------|-------|-------|-------|
| Needs your action NOW | `#FA3823` | `brand-red` | Blocker chevrons, blocking CTA button, left accent on "your turn" cards |
| Completed / Active | `#00334D` | `brand-blue` | Completed steps, responded indicators, secondary CTAs, links |
| In motion / Warmth | `#F2EDDA` | `brand-sand` | Locked card backgrounds, overlap zones, "next up" indicators, active avatar rings |
| Text / Structure | `#2E303B` | `brand-carbon` | Body text, dark UI elements, card titles |
| Non-blocking / Waiting | `brand-carbon/20` | — | Future steps, passive waiting states, disabled elements |

**Critical rules:**
- `brand-red` = action needed. NEVER use as a persistent background for non-blocking states.
- `brand-sand` = warmth/progress. Use as the "in motion" state between red (needs action) and blue (done).
- Never use raw Tailwind colors (green-600, red-500) for semantic states. Use brand tokens only.
- Never use color alone — always pair with text labels + icons.

### Semantic status tokens (CSS custom properties to add)
```css
--color-success: var(--brand-blue);     /* Locked / completed */
--color-warning: var(--brand-red);      /* Needs action / blocker */
--color-info: var(--brand-sand);        /* Draft / in-progress / suggested */
--color-danger: #DC2626;                /* Destructive actions only (delete/leave) */
```

### Buttons
- One primary CTA per screen.
- Secondary actions: ghost buttons or text links in `brand-blue`.
- Destructive actions: require confirmation dialog with explanation of consequences.
- Lock button: 200ms intentional delay before action fires (feels deliberate, not accidental).

---

## 3) Core UI Patterns

### 3.1 Decision surfaces (NOT a new component — enhance existing overlays)

> **Council consensus**: Don't build a new `DecisionCard` component on top of the existing overlay system. Instead, enhance existing surfaces: ProgressStrip, status cards, and overlay headers.

**Enhanced status card (pinned above chat, max 1 at a time):**
- Left edge: 4px vertical accent bar — `brand-red` when action needed, `brand-blue` when informational
- Response visualization: Filled pips (●●●●○○○) instead of "4/7 responded" text
  - ● = responded (brand-carbon), ○ = not yet (brand-sand)
  - Pips animate on mount: left-to-right, 40ms stagger
  - When a new person responds: pip animates ○ → ● with gentle pop (scale 0.8→1.1→1.0, 200ms)
- "Your stance" indicator: Show "You: Not responded / Works / Maybe / Can't" explicitly
- Lock readiness: "Ready to lock" vs "Needs 2 more" with clear threshold
- Single CTA button — tapping opens the relevant overlay

**ProgressStrip enhancements:**
- Minimum 11px labels (currently 9px — must fix)
- Active step: brand-sand dashed ring on the *next* step after current blocker (signals "this is where we're headed")
- Participation arc: small SVG ring around blocker step that fills proportionally (brand-red at 0–49%, brand-blue at 50%+)

**Context CTA Bar enhancements:**
- Background: neutral/white when not blocking, `brand-red` ONLY when `isBlocking: true`
- CTA button: always `brand-red` for primary action, `brand-blue` for secondary

### 3.2 Lock Moment (the signature celebration)

When a decision locks, trigger a three-layer animation sequence:

**Layer 1 — Ring burst**: The corresponding ProgressStrip circle emits a radial ring (brand-sand, 400ms, CSS `@keyframes` with scale + opacity).

**Layer 2 — Card seal**: Status card transitions: left accent bar snaps from red to brand-blue with a brief flash through brand-sand. Locked date text types-in with CSS `steps()` animation (300ms). Feels like a receipt printing.

**Layer 3 — Chat echo**: System message appears with brand-sand background + shield icon (NOT a generic gray bubble). Copy: "Dates locked: Mar 7–9" + "Next: Choose accommodation" (one-tap to next overlay).

**What NOT to do**: No confetti library, no screen-wide overlay, no sound. The brand is calm. A big celebration creates anxiety for travelers who weren't part of the lock decision.

**Haptic feedback** (Capacitor only): `Haptics.impact({ style: ImpactStyle.Medium })` on lock confirmation. The ONLY haptic in the app — makes lock feel physically distinct from every other tap.

### 3.3 Convergence Timeline (scheduling signature)

A visual replacement for the text-list of date windows in the scheduling overlay:

```
   Feb 1          Feb 10          Feb 20          Mar 1
   |───────────────|───────────────|───────────────|
   [████████░░░░░░░░░░░░░░░░░░░░░░░░] Window A
   [░░░░░░░░████████████░░░░░░░░░░░░] Window B
   [░░░░░░░░░░░░████████████████░░░░] Window C
              ↑ overlap zone (brand-blue/20)
```

- Each window = translucent bar (brand-sand, 60% opacity, overlapping)
- Overlap zones darken to brand-blue/20, showing consensus visually
- Most-overlap zone gets brand-red underline
- PROPOSED phase: non-selected bars shrink to 0px width (400ms), leaving only the proposed window
- SVG-based, ~100 lines. Renders as `<ConvergenceTimeline windows={dateWindows} />`

### 3.4 Update Feed Items ("Receipts")

System messages in chat for key events should be visually distinct:
- Brand-sand bubble background + event icon (calendar, home, checkmark)
- Tappable: leads to the relevant overlay state
- Examples: "Dates locked: Mar 7–9", "Neha voted for Option B", "New stay option added"

---

## 4) UX Flow Standards

### 4.1 Trip Creation
**Goal**: Create trip → immediately start first decision.

**Steps** (max 3 inputs before "Create"):
1. Trip name (required)
2. Destination hint (optional)
3. Invite (optional, can skip)

**Post-creation**: Auto-navigate to trip Command Center with scheduling overlay open (not dashboard).

### 4.2 Invite + Join
- Share sheet: Capacitor Share plugin with prefilled message: "Plan [trip name] with me on Tripti — add your dates here: [deep link]"
- Deep link opens specific overlay after auth: `/trips/[tripId]?overlay=scheduling`
- Post-login return: localStorage `returnTo` preserves the intended destination

### 4.3 Dates Decision (Convergence Mode)

**Primary input**: Free-form text (handles vague availability: "early March", "first weekend of Feb", "last week of June", "March"). Parsed deterministically by `normalizeWindow.js`. Calendar date range picker as optional visual aid for users who know exact dates.

> **Founder override**: Users express availability windows, not exact dates. Free-form text handles vagueness naturally ("sometime in March") — a calendar forces false precision. Calendar is a secondary visual aid, not a replacement.

**Phase: COLLECTING**
- Header: "When works for everyone?"
- Convergence Timeline showing submitted windows with overlap zones
- Duration preference chips (Weekend / Extended weekend / Week / Flexible)
- "I'm flexible" as a valid response option
- Progress pips (●●●●○○○) showing response rate

**Phase: PROPOSED**
- Leader selects a window → Convergence Timeline animates non-selected bars to 0px width
- Travelers react: Works / Maybe / Can't (single-tap inline buttons)
- Lock readiness indicator: "4 of 7 — ready to lock" or "Needs 2 more"

**Phase: LOCKED**
- Lock Moment animation sequence (Section 3.2)
- Lock Banner in overlay: locked dates + "Next: Choose accommodation" (one-tap)
- ICS calendar export button

**Leader actions**: Collapse to a single "Propose and lock" flow — one button, not 4 competing actions.

**AI behavior**:
- Proposes 2–3 candidate windows (not more) with rationale
- Shows "Needs review" rather than fake certainty
- Labeled as "Tripti suggests" — never "AI suggests"

### 4.4 Stay Decision
- Option cards: neighborhood, cost band, key proximity info
- Vote controls (single tap)
- Lock banner when chosen → "Itinerary will use this as base" + "Generate plan"
- Cross-nudge: If itinerary exists but stay is missing: "Your itinerary can be better with a locked stay"

### 4.5 Itinerary (Draft → Review → Apply)
- AI generates a **draft** — clearly labeled, not auto-applied
- Day cards with time blocks
- "Why this?" inline explanation for 1–2 key picks
- Section-level controls: "Regenerate Day 2", "Swap activity" (future enhancement)
- Version history for undo (already implemented)

### 4.6 Chat (the primary canvas)

**Rules:**
- Chat is always visible. Decisions surface as overlays over chat.
- System messages for key events use distinct visual treatment (Section 3.4)
- "Quote to chat": From any overlay option, users can tap "Discuss" to paste a preview card into chat with keyboard open
- Decisions should NEVER require leaving chat to a separate surface
- NO separate comment threads on objects — keep discussion in the single chat stream

> **Council directive**: Do NOT build object-linked comment threads (Linear/Figma pattern). Friends don't manage threads — they talk in one stream. "Quote to chat" keeps discussion contextual without fragmenting.

---

## 5) Progress + Status Language

### User-facing status terms
- **Open**: Input needed (maps to internal: proposed, scheduling, collecting)
- **Shortlisting**: Narrowing options (maps to internal: proposed/proposed-window, voting)
- **Locked**: Decision finalized (maps to internal: locked)

Avoid: "finalized", "confirmed", "closed", "narrowing" (internal jargon).

### Voice guidelines
- Friendly, direct, non-cutesy. System nudges sound neutral ("Tripti reminder").
- Good: "2 people haven't weighed in yet. Locking tomorrow."
- Bad: "You should really respond." / "Everyone needs to vote!"
- CTAs use inviting verbs: "Share your vote", "React to dates", "Pick your dates"

### Planner Shield copy
System-generated nudges in chat use a Tripti shield icon (not a person avatar) to signal "this came from the system, not the leader nagging you."

---

## 6) Feedback, Loading, and Error States

### Loading
- Content skeletons for all primary surfaces (already implemented)
- AI task step labels: "Gathering ideas..." → "Building the itinerary..." → "Polishing the plan..."
- Scheduling: step labels for analysis: "Analyzing availability..." → "Finding best windows..."

### Errors (actionable)
Every error must include:
- What happened (plain language)
- What to do next (retry button, edit link, or contact support)

### Optimistic UI (mandatory for collaboration speed)
- Votes, reactions, "Works/Maybe/Can't" responses must update UI **instantly** before API confirmation
- On failure: revert with subtle "Couldn't save — tap to retry" toast
- Show "Sending..." only as subtle state, never blocking spinners

---

## 7) Mobile-Native Patterns (Capacitor)

### Navigation
- Overlays slide in from right (decisions) or bottom (utilities) — already implemented
- Overlay slide-in: add slight spring overshoot (-8px past target, spring back, 300ms). CSS only:
  ```css
  @keyframes slideInRight {
    0% { transform: translateX(100%); }
    85% { transform: translateX(-8px); }
    100% { transform: translateX(0); }
  }
  ```

### Keyboard + safe area contracts
- CTA bar + chat composer must NEVER be covered by keyboard
- Bottom sheets must respect safe areas
- iOS: keyboard pushes content up. Android: back closes sheet/drawer first, then navigates.

### Haptics
- Lock confirmed: `ImpactStyle.Medium` (the only haptic in the app)

### Deep links
- Every invite/notification link routes to: Trip → specific overlay
- If auth required → authenticate → return to intended overlay
- URL schema: `/trips/[tripId]?overlay=[overlayType]`

### What to skip (Capacitor limitations)
- Real-time cursor presence (WebSocket infrastructure too heavy)
- Offline vote queuing (requires service worker + IndexedDB + sync)
- Native push/pop transitions (CSS transitions are sufficient)

---

## 8) Trust + Safety UX

### Audit trail
Surface key events as distinct chat messages (Section 3.4):
- "Option added/removed"
- "Lock event" (with Lock Moment animation)
- "Votes changed"

### Privacy boundaries
- Inside trip: show member names + avatars
- Public sharing: `sanitizeForPublic()` strips all PII
- Public brief: no userIds, no names, no expenses detail

### Destructive actions
- "Leave trip" and "Delete trip" must be clearly separated (different overlays/sections)
- Both require confirmation dialog with consequence explanation
- "Delete account" on dedicated settings page with explanation

---

## 9) Micro-interactions (polish layer)

### Vote tap
- `active:scale-95 transition-transform duration-75` on vote buttons
- Selected state: background fills from center outward using `clip-path` animation

### ProgressStrip circles
- Current: `hover:scale-110` — keep
- Add: participation arc fills on hover to show response rate

### Overlay transitions
- Spring overshoot on slide-in (Section 7)
- Preserve chat scroll position on overlay close (already implemented)

### Empty states with personality
**Dashboard with no trips:**
```
○ ○ ○
"Your circles are quiet right now."
"Start a trip and shake things up."
[Start a trip]
```
Three circles animate with breathing pulse (scale 0.9→1.0, 2s ease, 0.6s stagger). Brand-sand color.

**Scheduling with 0 windows:**
```
[calendar icon, brand-sand, 40px]
"No dates yet. Be the first."
[+ Suggest a window]
```

**Stalled trip card (no activity 7+ days):** Subtle `bg-brand-sand/20` tint instead of pure white. No text label — subconscious warmth signal.

---

## 10) Analytics & Quality Gates

### Metrics that matter
- Time from `trip_created` → `first_vote_cast`
- Time from `trip_created` → `dates_locked`
- Vote participation rate per decision
- Planner manual reminders per trip (target: near 0)

### UX quality gates (before any release)
- [ ] 5-second test: user knows what's happening
- [ ] One-tap next action on every primary screen
- [ ] All empty/error/loading states implemented
- [ ] All decisions have status + progress + CTA
- [ ] brand-red NEVER used for non-blocking states
- [ ] No text smaller than 11px
- [ ] Optimistic UI for all vote/reaction actions

---

## 11) "Stand Out" Checklist

Tripti is NOT an itinerary planner if users see:
- [ ] A Convergence Timeline showing options narrowing
- [ ] A Lock Moment with animation + chat echo + haptic
- [ ] Response pips (●●●●○○○) showing group momentum
- [ ] System-generated nudges with Planner Shield branding
- [ ] brand-sand as warmth/progress color throughout
- [ ] "Tripti suggests..." (not "AI suggests...")

If any of those are missing, the app will be bucketed with itinerary planners.

---

## Appendix A: Competitive Positioning

> "Tripti doesn't build your itinerary first. It gets your group to commit first."

| Competitor | What they do | How Tripti differs |
|-----------|-------------|-------------------|
| Wanderlog | Itinerary document editor | Tripti is a group decision engine — itinerary is an output, not the product |
| TripIt | Solo corporate trip organizer | Tripti is for friend groups — collaborative, not individual |
| Wonderplan | AI generates full trip plan | Tripti uses AI to converge group opinions, not replace human intent |
| Splitwise | Expense splitting | Tripti includes expenses but the core is getting to "locked" decisions |

## Appendix B: UI Do / Don't

**Do:**
- One primary CTA per screen
- Decision-first language ("lock", "vote", "choose")
- Draft → review → apply for AI edits
- "Quote to chat" for discussing specific options
- brand-sand as the warm middle state
- Celebrate locks with animation

**Don't:**
- Bury decisions in a separate tab away from chat
- Show long AI essays (2–3 sentences max for suggestions)
- Require typing when tapping works
- Auto-lock without explicit leader action + warning
- Use brand-red for non-blocking states
- Build separate comment threads on objects
- Use text smaller than 11px
- Show blocking "Your Turn" modals (low-pressure participation is core philosophy)

## Appendix C: Review History

| Date | Reviewers | Key decisions |
|------|-----------|---------------|
| 2026-02-24 | Gemini 3 Pro, GPT-5.2 (2 rounds) | Commit to Command Center + overlays. Kill tab-based IA. Decision Card = enhanced status cards, not new component. |
| 2026-02-24 | UI Auditor agent | 15 gaps identified. Top: chat-first vs decide-first resolved in favor of chat-first. |
| 2026-02-24 | Creative Design Guru agent | Convergence Timeline, Lock Moment, response pips, brand-sand expansion proposed. |
| 2026-02-24 | UX Expert agent | P0 bugs found (variable order, status card stacking). Calendar picker for scheduling recommended. |
| 2026-02-24 | Devil's Advocate agent | Filtered scope creep. Deferred: circle diagram, offline queuing, Files/Track tabs, threaded comments. |
