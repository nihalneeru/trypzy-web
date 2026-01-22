# Command Center V2 - Chat-Centric Redesign Plan

## Overview

Transform the current 3-zone vertical stack into a **chat-centric design** where:
- Chat is the central, always-visible component
- All trip functionality is accessible via **slide-in overlays**
- Progress chevrons on the right side indicate trip stage and trigger overlays
- Context-sensitive CTA bar guides users to their next action

---

## Design Philosophy Alignment

From `PRODUCT_PHILOSOPHY.md`:
- **Chat-first**: Chat is where CTAs appear, nudges happen, decisions are made
- **Make next action obvious**: Context-sensitive CTA bar
- **Reduce cognitive load**: One overlay at a time, focused on single stage
- **Stage-based planning**: Progress chevrons show clear stages

---

## New Layout Structure

```
┌─────────────────────────────────────────┬─────┐
│  Focus Banner (Trip Name + Dates)       │     │
│  [Blocker indicator: "Pick your dates"] │  ▼  │ ← Proposed (gray)
├─────────────────────────────────────────┤  ▼  │ ← Dates (orange=current)
│                                         │  ▼  │ ← Itinerary
│                                         │  ▼  │ ← Stay
│           CHAT FEED                     │  ▼  │ ← Prep
│         (scrollable)                    │  ▼  │ ← On Trip
│                                         │  ○  │ ← Memories
│                                         │  ○  │ ← Expenses
├─────────────────────────────────────────┴─────┤
│  [👤][👤][👤][👤][👤] ← ← Traveler Strip      │
├───────────────────────────────────────────────┤
│  👥 3 going │ [  Pick your dates  📅 ]        │ ← CTA Bar (red/primary)
├───────────────────────────────────────────────┤
│  [  Type a message...              ] [➤]      │ ← Chat Input
└───────────────────────────────────────────────┘
```

---

## Overlay System Design

### Overlay Behavior (UX Recommendation)

Based on Trypzy's philosophy of "reducing cognitive load" and "chat-first":

1. **Slide-in drawer from right** (60-70% width on desktop, full-width on mobile)
2. **Chat remains visible** but dimmed (40% opacity backdrop)
3. **Dismissal**: X button, click backdrop, or Escape key
4. **Only one overlay at a time** (opening new one closes previous)
5. **Overlay header** shows stage name and close button
6. **Overlay content** is scrollable if needed

### Overlay Triggers

| Trigger | Opens |
|---------|-------|
| Progress chevron (Proposed) | Proposed overlay (trip details) |
| Progress chevron (Dates) | Scheduling overlay |
| Progress chevron (Itinerary) | Itinerary overlay |
| Progress chevron (Stay) | Accommodation overlay |
| Progress chevron (Prep) | Prep checklist overlay |
| Progress chevron (On Trip) | On-trip overlay (if applicable) |
| Progress chevron (Memories) | Memories overlay |
| Progress chevron (Expenses) | Expenses overlay |
| CTA bar button | Context-sensitive (current blocker's overlay) |
| Traveler avatar | Member profile overlay |
| Travelers icon (👥) | Travelers management overlay |

---

## Component Architecture

### New Components to Create

```
components/trip/command-center-v2/
├── CommandCenterV2.tsx           # Main container
├── ChatCentricLayout.tsx         # Layout with chat + sidebar
├── FocusBannerV2.tsx            # Simplified banner (trip + blocker)
├── ProgressChevrons.tsx         # Right-side stage indicators
├── TravelerStrip.tsx            # Horizontal avatar scroll
├── ContextCTABar.tsx            # Red action bar
├── OverlayContainer.tsx         # Slide-in drawer wrapper
└── overlays/
    ├── SchedulingOverlay.tsx    # Date picking, voting, lock
    ├── ItineraryOverlay.tsx     # Ideas, generation, feedback
    ├── AccommodationOverlay.tsx # Stays, options, selection
    ├── TravelersOverlay.tsx     # Join requests, leave, transfer
    ├── PrepOverlay.tsx          # Transport, packing, documents
    ├── ExpensesOverlay.tsx      # Add expense, balances
    ├── MemoriesOverlay.tsx      # Gallery, add memory
    └── MemberProfileOverlay.tsx # Profile card, trip cards, join request
```

### Reused Components

- `ChatTab.tsx` - Already supports `mode="command-center"`
- `useTripChat` hook - Message polling
- `useTripIntelligence` hook - Blocker detection
- Form dialogs from legacy tabs (refactored as overlay content)

---

## Implementation Phases

### Phase 1: Foundation (Branch: `feat/command-center-v2-foundation`)

**Goal**: Build the layout shell and overlay system

1. Create `CommandCenterV2.tsx` with new layout structure
2. Create `OverlayContainer.tsx` - reusable slide-in drawer
3. Create `ProgressChevrons.tsx` - clickable stage indicators
4. Create `TravelerStrip.tsx` - horizontal avatar scroll
5. Create `ContextCTABar.tsx` - context-sensitive action bar
6. Create `FocusBannerV2.tsx` - simplified banner
7. Wire up overlay open/close state management
8. Add toggle: `?ui=v2` to access new design (keep current as default)

**Deliverable**: Empty overlays that open/close correctly

---

### Phase 2: Scheduling Overlay (Branch: `feat/command-center-v2-scheduling`)

**Goal**: Full scheduling functionality inline

Extract from `PlanningTab.tsx`:
- Availability modes (broad, weekly, per-day)
- Availability submission
- Voting UI
- Lock dates (leader)
- Activity ideas jar

**Deliverable**: Complete scheduling workflow without leaving Command Center

---

### Phase 3: Itinerary Overlay (Branch: `feat/command-center-v2-itinerary`)

**Goal**: Full itinerary functionality inline

Extract from `ItineraryTab.tsx`:
- Ideas submission (3 per person)
- Grouped ideas by traveler
- Destination hint editing
- Itinerary viewer with day accordion
- Emoji reactions
- Feedback submission
- Generate/revise itinerary

**Deliverable**: Complete itinerary workflow without leaving Command Center

---

### Phase 4: Accommodation Overlay (Branch: `feat/command-center-v2-accommodation`)

**Goal**: Full accommodation functionality inline

Extract from `AccommodationTab.tsx` + existing `AccommodationShortlist.tsx`:
- Stays list by location
- Add accommodation option
- Search Airbnb (external link)
- Vote on options
- Select accommodation (leader)

**Deliverable**: Complete accommodation workflow without leaving Command Center

---

### Phase 5: Secondary Overlays (Branch: `feat/command-center-v2-secondary`)

**Goal**: Travelers, Prep, Expenses, Memories overlays

**Travelers Overlay** (from `TravelersTab.tsx`):
- Active travelers list
- Join requests (leader)
- Leave trip / Transfer leadership
- Cancel trip

**Prep Overlay** (from `PrepTab.tsx`):
- Transport items (add, view)
- Packing checklist
- Generate suggestions
- Mark complete

**Expenses Overlay** (from `ExpensesTab.tsx`):
- Add expense form
- Expense list
- Balance summary
- Delete expense

**Memories Overlay** (from `MemoriesTab.tsx`):
- Memory gallery
- Add memory
- Delete memory

**Deliverable**: All secondary functionality accessible via overlays

---

### Phase 6: Member Profile Overlay (Branch: `feat/command-center-v2-member`)

**Goal**: View member profile without leaving Command Center

Replicate `/members/[userId]` page as overlay:
- Profile header (avatar, name)
- Upcoming trips (with privacy filtering)
- "Request to Join" functionality
- Shared circles indicator

**Deliverable**: Click traveler avatar → member overlay

---

### Phase 7: Polish & Make Default (Branch: `feat/command-center-v2-default`)

**Goal**: Production-ready

1. Mobile responsiveness (full-width overlays)
2. Keyboard navigation (Escape to close)
3. Animation polish (slide transitions)
4. Loading states for overlay content
5. Error handling
6. Make V2 the default (`?ui=legacy` for old, `?ui=v1` for current Command Center)
7. Update context docs

---

### Phase 8: Cleanup (Branch: `feat/command-center-v2-cleanup`)

**Goal**: Remove legacy code

1. Delete `TripDetailViewLegacy` (~1,640 lines)
2. Delete old Command Center decision modules (if not reused)
3. Remove `?ui=legacy` and `?ui=v1` toggles
4. Clean up unused imports
5. Update tests

---

## CTA Bar Logic

The context-sensitive CTA bar shows the user's next action:

```typescript
function getContextCTA(trip, user): { icon: Icon, label: string, stage: Stage } | null {
  const blocker = deriveBlocker(trip, user)

  switch (blocker.type) {
    case 'DATES':
      if (!user.hasSubmittedAvailability) {
        return { icon: Calendar, label: 'Pick your dates', stage: 'scheduling' }
      }
      if (trip.status === 'voting' && !user.hasVoted) {
        return { icon: Vote, label: 'Vote on dates', stage: 'scheduling' }
      }
      if (user.isLeader && trip.canLock) {
        return { icon: Lock, label: 'Lock dates', stage: 'scheduling' }
      }
      break
    case 'ITINERARY':
      if (user.ideasCount < 3) {
        return { icon: Lightbulb, label: 'Add ideas', stage: 'itinerary' }
      }
      if (user.isLeader && !trip.hasItinerary) {
        return { icon: Sparkles, label: 'Generate itinerary', stage: 'itinerary' }
      }
      break
    case 'ACCOMMODATION':
      if (!trip.hasSelectedAccommodation) {
        return { icon: Home, label: 'Choose stay', stage: 'accommodation' }
      }
      break
    case 'READY':
      return null // No CTA needed
  }
  return null
}
```

---

## State Management

### Overlay State

```typescript
type OverlayType =
  | 'scheduling'
  | 'itinerary'
  | 'accommodation'
  | 'travelers'
  | 'prep'
  | 'expenses'
  | 'memories'
  | 'member'  // with memberId param
  | null

const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
const [overlayParams, setOverlayParams] = useState<Record<string, any>>({})

const openOverlay = (type: OverlayType, params?: Record<string, any>) => {
  setActiveOverlay(type)
  setOverlayParams(params || {})
}

const closeOverlay = () => {
  setActiveOverlay(null)
  setOverlayParams({})
}
```

---

## Migration Strategy

1. **Phase 1-6**: Build V2 behind `?ui=v2` toggle
2. **Phase 7**: Make V2 default, current becomes `?ui=v1`
3. **Phase 8**: Remove all legacy code after validation period

This ensures:
- Safe rollback at each phase
- No disruption to current users during development
- Clean git history with focused PRs

---

## Questions Resolved

| Question | Answer |
|----------|--------|
| Overlay trigger | Progress chevrons + CTA bar |
| Overlay style | Slide-in drawer (right side) |
| Chat visibility | Dimmed but visible behind overlay |
| Dismissal | X button, backdrop click, Escape |
| Focus banner | Simplified: Trip name + dates + blocker text |
| Progress stages | Same as current: Proposed→Dates→Itinerary→Stay→Prep→OnTrip→Memories→Expenses |
| CTA bar | Context-sensitive based on user's next action |
| Traveler click | Opens member profile overlay |

---

## Estimated Scope

| Phase | New Components | Lines (est.) | Complexity |
|-------|---------------|--------------|------------|
| 1. Foundation | 6 | ~600 | Medium |
| 2. Scheduling | 1 | ~800 | High |
| 3. Itinerary | 1 | ~700 | High |
| 4. Accommodation | 1 | ~400 | Medium |
| 5. Secondary | 4 | ~800 | Medium |
| 6. Member Profile | 1 | ~300 | Low |
| 7. Polish | - | ~200 | Low |
| 8. Cleanup | - | -1640 | Low |

**Total new code**: ~3,800 lines
**Net change after cleanup**: ~2,200 lines added

---

## Next Steps

1. Review this plan
2. Approve or request changes
3. Begin Phase 1 on `feat/command-center-v2-foundation`
