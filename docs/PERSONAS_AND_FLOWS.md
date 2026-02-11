# Trypzy Personas, Flows & Feature Map

> Reference doc for UX design. Covers who uses Trypzy, what they see at each stage, and what actions are available to them.

---

## 1. Personas

### The Planner (Trip Leader)

**Who**: The friend who always ends up organizing. Creates the trip, nudges people to respond, and makes final calls when the group stalls.

**Goals**:
- Get dates locked without endless back-and-forth
- See at a glance who has responded and who hasn't
- Move the trip forward even when some people are slow to respond
- Not feel like a nag

**Frustrations**:
- "I asked everyone 3 times and only 4 of 8 people replied"
- "We had momentum and then it died in the group chat"
- "I don't know if people are actually committed or just saying maybe"

**Key screens they care about**:
- Dashboard (my trips, what needs attention)
- Scheduling overlay (who responded, what dates overlap, when can I lock)
- Response-rate insight cards (am I ready to propose?)
- Itinerary generation (I want a draft without doing all the work)
- Travelers overlay (who's in, join requests to approve)

**Unique capabilities** (leader-only actions):
| Action | When available |
|--------|---------------|
| Propose a date window | Collecting phase, before any active proposal |
| Withdraw a proposal | While a proposal is active |
| Lock dates | After proposing (can override low approval) |
| Open voting | Legacy scheduling mode only |
| Cancel trip | Any stage |
| Transfer leadership | Any stage |
| Generate itinerary | After dates locked, no existing itinerary |
| Revise itinerary | After feedback/reactions on current version |
| Select accommodation | After options have votes |
| Approve/reject join requests | Any stage |

---

### The Go-With-The-Flow Traveler

**Who**: Happy to come on the trip, will respond when prompted, but won't initiate planning. The majority of any group.

**Goals**:
- Know what's been decided without reading 200 messages
- Respond quickly when it's their turn (dates, votes)
- Not feel guilty about responding late
- See the plan clearly once it's set

**Frustrations**:
- "I opened the chat and there are 47 unread messages about dates"
- "I don't know if dates are final or still being discussed"
- "I said I'm free but nothing happened after that"

**Key screens they care about**:
- Dashboard (which trips need my input)
- CTA bar (one clear action to take)
- Chat (what's happening, but not the primary action surface)
- Itinerary view (what are we doing)
- Prep checklist (what do I need to pack/book)

**Capabilities**:
| Action | When available |
|--------|---------------|
| Suggest date windows | Collecting phase |
| Support others' windows | Collecting phase |
| React to proposed dates (Works/Maybe/Can't) | Proposed phase |
| Vote on dates | Voting phase (legacy mode) |
| Add itinerary ideas | After dates locked |
| Like/react to itinerary | After itinerary generated |
| Vote on accommodation | After options exist |
| Add prep items (personal + group) | Stay/Prep stages |
| Add expenses | Any active stage |
| Upload memories | Any stage |
| Send chat messages | Any active stage (blocked after leaving) |
| Leave trip | Any stage |

---

### The Late Joiner

**Who**: Wasn't in the circle when the trip was created. Heard about it through a friend or invite link and wants in.

**Goals**:
- Join without disrupting what's already been planned
- Catch up on decisions quickly
- Participate from wherever the trip currently is

**Frustrations**:
- "I want to come but I don't know if I'm allowed to join"
- "I joined but I have no idea what's been decided"

**Flow**:
```
Joins circle (via invite link)
    |
    v
Sees trip in circle — but READ-ONLY
(late joiner: joined circle after trip.createdAt)
    |
    v
Taps "Ask to join" CTA
    |
    v
Join request sent to leader
(blocked if leader has allowTripJoinRequests = false)
    |
    v
Leader approves in Travelers overlay
    |
    v
Now a full Active Traveler
(can do everything a traveler can at the current stage)
```

**Key screens**:
- Trip view (read-only, with "Ask to join" CTA)
- Waiting state (request pending)
- Full trip view (after approval)

---

### The Observer / Left Traveler

**Who**: Someone who left the trip (or was removed), or a circle member browsing without joining.

**Goals**:
- See what's happening without participating
- Maybe rejoin later

**What they see**:
- Trip content: read-only
- Amber banner: "You left this trip (view only)"
- Chat: visible but input disabled
- No CTA bar actions
- No write operations anywhere

---

## 2. Trip Lifecycle & What Each Persona Sees

### Stage Map

```
PROPOSED ──> DATES_LOCKED ──> ITINERARY ──> STAY ──> PREP ──> ONGOING ──> COMPLETED

   also: CANCELED (read-only from any stage)
```

### Status transitions (internal)

```
proposed ──> scheduling ──> locked ──> completed
                  |
                  v
               voting ──> locked    (legacy mode only)

Any stage ──> canceled
```

---

### Stage 1: PROPOSED / COLLECTING

**What's happening**: Trip exists, group is suggesting dates.

#### Screen: Command Center

```
+-----------------------------------------------+
| ProgressStrip                                  |
| "Beach Weekend"  ·  No dates yet              |
| [>Proposed] [>Dates] [>Itinerary] [>Stay]... |
|   (red/down)  (gray)    (gray)     (gray)     |
+-----------------------------------------------+
|                                                |
|  CHAT FEED                                     |
|  - System: "Trip created!"                     |
|  - Alex: "I'm thinking mid-March"             |
|  - [Nudge card]: "Alex shared their dates.    |
|     The trip is getting started!"              |
|                                                |
+-----------------------------------------------+
| [ Type a message...                    ] [>]  |
+-----------------------------------------------+
| [4 travelers] [Expenses] [Memories]           |
|                        [ Pick your dates  ]   |
|                           ^red CTA, blocking  |
+-----------------------------------------------+
```

#### Leader view — Scheduling Overlay (right slide-in)

**Collecting phase**:
```
+------------------------------------------+
| Scheduling                          [X]  |
|                                          |
| YOUR GROUP'S DATE SUGGESTIONS            |
|                                          |
| "Feb 7-9"  (Alex + 2 supporters)  [+1]  |
| "Feb 14-16" (Jordan)              [+1]  |
| "First week of March" (Sam)       [+1]  |
|                                          |
| ---- Response insight (>=50%) ----       |
| [blue card]                              |
| "4 of 6 travelers have weighed in.      |
|  Feb 7-9 leads with 3 supporters."      |
|                                          |
| ---- Response insight (>=80%) ----       |
| [blue card]                              |
| "5 of 6 travelers have weighed in.      |
|  Feb 7-9 leads. You can propose any     |
|  option when ready."                     |
|                                          |
| ---- Threshold met ----                  |
| [red card]                               |
| "Feb 7-9 has enough support.            |
|  [Propose Feb 7-9]"                     |
|                                          |
+------------------------------------------+
```

**Proposed phase** (after leader proposes):
```
+------------------------------------------+
| Scheduling                          [X]  |
|                                          |
| LEADER'S PICK                            |
| Feb 7-9                                  |
|                                          |
| How does this work for you?              |
|                                          |
| [Works]  [Maybe]  [Can't]               |
|  (3)      (1)      (0)                  |
|                                          |
| Needs 3 of 5 to proceed                 |
|                                          |
| [Lock these dates]  (leader only)        |
+------------------------------------------+
```

#### Traveler view — Scheduling Overlay

**Collecting phase**: Same as leader but WITHOUT:
- Response insight cards
- Propose button

Instead shows:
```
+------------------------------------------+
| Add your dates                           |
| [  e.g. "Feb 7-9"              ] [Add]  |
| "You can change until locked"            |
+------------------------------------------+
```

**Proposed phase**: Same as leader but WITHOUT lock button. Shows reaction buttons.

---

### Stage 2: DATES_LOCKED

**What's happening**: Dates are set. Time to plan activities.

#### Screen: Command Center

```
+-----------------------------------------------+
| ProgressStrip                                  |
| "Beach Weekend"  ·  Feb 7-9                  |
| [>Proposed] [>Dates] [>Itinerary] [>Stay]... |
|   (blue/done) (blue)  (red/down)   (gray)    |
+-----------------------------------------------+
|                                                |
|  CHAT FEED                                     |
|  - [Nudge]: "It's official! The trip is       |
|     happening Feb 7-9. Time to plan the       |
|     fun stuff!"                                |
|                                                |
+-----------------------------------------------+
| [4 travelers] [Expenses] [Memories]           |
|                        [ Suggest an idea  ]   |
|                           ^blue CTA, optional |
+-----------------------------------------------+
```

#### Leader view — Itinerary Overlay

```
+------------------------------------------+
| Itinerary                           [X]  |
|                                          |
| IDEAS FROM THE GROUP (4)                 |
|                                          |
| "Snorkeling tour"  - Alex  [heart] 3    |
| "Beach bonfire"    - Sam   [heart] 2    |
| "Cooking class"    - Jo    [heart] 1    |
| "Sunset cruise"    - You   [heart] 2    |
|                                          |
| [+ Add an idea]                          |
|                                          |
| [Generate itinerary]  (leader only)      |
+------------------------------------------+
```

After generation:
```
+------------------------------------------+
| Itinerary v1                        [X]  |
|                                          |
| DAY 1 - Friday, Feb 7                   |
| - Arrive & check in                     |
| - Beach bonfire (evening)                |
|                                          |
| DAY 2 - Saturday, Feb 8                 |
| - Snorkeling tour (morning)             |
| - Cooking class (afternoon)             |
| - Sunset cruise (evening)               |
|                                          |
| DAY 3 - Sunday, Feb 9                   |
| - Free morning                          |
| - Check out by noon                     |
|                                          |
| FEEDBACK                                |
| [pace] [budget] [focus] [logistics]     |
|                                          |
| "3 feedback, 5 reactions since v1"      |
| [Revise itinerary]  (leader only)        |
+------------------------------------------+
```

---

### Stage 3: ITINERARY (Accommodation)

#### Accommodation Overlay

```
+------------------------------------------+
| Accommodation                       [X]  |
|                                          |
| OPTIONS                                  |
|                                          |
| [img] Beachfront Villa                   |
|       $200/night · 4 beds               |
|       Added by Alex · 3 votes           |
|       [Vote]                             |
|                                          |
| [img] Downtown Airbnb                    |
|       $150/night · 3 beds               |
|       Added by Sam · 1 vote             |
|       [Vote]                             |
|                                          |
| [+ Add option]                           |
|                                          |
| [Select stay]  (leader only, after votes)|
+------------------------------------------+
```

---

### Stage 4: STAY / PREP

#### Prep Overlay

```
+------------------------------------------+
| Trip Prep                           [X]  |
|                                          |
| TRANSPORT                                |
|  Smart Suggest (rule-based)              |
| [x] Flight - booked                     |
| [ ] Airport transfer                     |
| [+ Add transport item]                   |
|                                          |
| GROUP PACKING                            |
| [ ] Sunscreen                            |
| [ ] Snacks for the road                  |
| [x] First aid kit                        |
| [+ Add group item]                       |
|                                          |
| MY PACKING                               |
| [x] Passport                            |
| [ ] Swimsuit                             |
| [ ] Charger                              |
| [+ Add personal item]                    |
|                                          |
+------------------------------------------+
```

---

### Stage 5: ONGOING

Primary surface is **chat**. All planning is read-only. Active features:
- Chat (send messages)
- Expenses (add/split)
- Memories (upload photos)

---

### Stage 6: COMPLETED

Everything read-only. Primary CTA: "Share memories"

---

## 3. CTA Priority Algorithm

The bottom-right CTA button shows ONE action based on this priority (highest first):

| Priority | CTA Label | Who sees it | Condition | Style |
|----------|-----------|-------------|-----------|-------|
| 0 | Ask to join | Non-travelers | Not a participant | Red |
| 1 | Lock dates | Leader | Proposal has support | Red |
| 1b | Share your thoughts | Traveler | Proposal active, hasn't reacted | Red |
| 2 | Share your vote | Traveler | Voting open, hasn't voted (legacy) | Red |
| 3 | Pick your dates | Traveler | Dates not locked, hasn't submitted | Red |
| 4 | Suggest an idea | Traveler | < 2 ideas, itinerary not finalized | Blue |
| 5 | Generate itinerary | Leader | Dates locked, no itinerary | Blue |
| 6 | Select stay / Share your pick | Leader / Traveler | Accommodation stage | Red / Blue |
| 7 | Start prep | Any | Accommodation chosen | Blue |

**Visual rules**:
- **Red background** (`bg-brand-red`) = blocking action, urgent
- **Blue background** (`bg-brand-blue`) = optional/informational
- Labels truncate on small screens (breakpoint: `sm`)

---

## 4. Progress Strip (Chevron States)

```
[Proposed] [Dates] [Itinerary] [Stay] [Prep] [On Trip]
```

| State | Chevron direction | Color |
|-------|-------------------|-------|
| Completed | Right (>) | `brand-blue` |
| Active (current stage) | Down (v) | `brand-blue` |
| Blocker (needs action) | Down (v) | `brand-red` |
| Future | Right (>) | Gray |

The **blocker chevron** (red, pointing down) indicates what's blocking trip progress:
1. Scheduling (if dates not locked) — highest priority
2. Itinerary (if no itinerary after lock)
3. Accommodation (if no stay selected)

Only ONE chevron is red at a time.

---

## 5. Overlay Slide Directions

| Overlay | Trigger | Direction | Max Width |
|---------|---------|-----------|-----------|
| Scheduling | Chevron / CTA | Right | 448px |
| Itinerary | Chevron / CTA | Right | 448px |
| Accommodation | Chevron / CTA | Right | 448px |
| Prep | Chevron / CTA | Right | 448px |
| Trip Info | "Proposed" chevron | Right | 448px |
| Member Profile | Tap avatar | Right | 448px |
| Travelers | Traveler count button | Bottom | Full width |
| Expenses | Expenses button | Bottom | Full width |
| Memories | Memories button | Bottom | Full width |

All overlays:
- Close on backdrop click or Escape
- Show unsaved changes confirmation if dirty
- Have error state with retry button

---

## 6. Nudge Cards in Chat

System messages styled with `bg-brand-sand` background. Non-blocking, non-nagging.

| Nudge | Audience | Trigger | Copy |
|-------|----------|---------|------|
| First dates shared | Everyone | 1st person submits | "Alex shared their availability. The trip is getting started!" |
| Halfway there | Everyone | 50%+ responded | "4 people have shared their dates. Momentum is building." |
| Strong overlap | Everyone | 60%+ on one range | "Feb 7-9 works for 5 people!" |
| Dates locked | Everyone | Leader locks | "The trip is happening Feb 7-9. Time to plan the fun stuff!" |
| Ready to propose | Leader only | Good option exists | "Feb 7-9 looks promising. You can propose it whenever you're ready." |
| Ready to lock | Leader only | Threshold met | "Feb 7-9 has support. Lock it in when you're confident." |

**Push notifications** (native app only, same copy):
- Leader can lock dates
- Leader ready to propose
- Dates locked (all travelers)

---

## 7. Empty States

Every overlay has a friendly empty state. Key examples:

| Screen | Empty state copy |
|--------|-----------------|
| Chat | "No messages yet. Say hi to get things started." |
| Scheduling (no windows) | "No dates suggested yet. Add yours to get started." |
| Itinerary (no ideas) | "No ideas yet. What should the group do on this trip?" |
| Accommodation (no options) | "No stays added yet. Share a place you'd love to stay." |
| Prep (no items) | "Nothing here yet. Add items to your packing list." |
| Expenses (none) | "No expenses yet. Add one to start tracking costs." |
| Memories (none) | "No memories yet. Upload photos from your trip." |
| Discover feed (empty) | "Nothing here yet. Trips and updates from your circles will appear here." |

---

## 8. Key Design Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `brand-red` | #FA3823 | CTAs, blockers, errors, urgent actions |
| `brand-blue` | #00334D | Secondary CTAs, links, completed states |
| `brand-carbon` | #2E303B | Body text, dark UI elements |
| `brand-sand` | #F2EDDA | Highlights, nudge cards, selected states |
| Font | Inter | All text |
| Touch target | 44px min | WCAG mobile compliance |
| Overlay max-width | 448px | Right slide-in overlays |
| Content max-width | `max-w-5xl` | Trip view centered column |

---

## 9. Permission Matrix (Quick Reference)

| Action | Leader | Traveler | Late Joiner (pending) | Observer/Left |
|--------|--------|----------|----------------------|---------------|
| View trip | Yes | Yes | Read-only | Read-only |
| Send chat | Yes | Yes | No | No |
| Suggest dates | Yes | Yes | No | No |
| Support dates | Yes | Yes | No | No |
| Propose dates | **Yes** | No | No | No |
| Lock dates | **Yes** | No | No | No |
| React to proposal | Yes | Yes | No | No |
| Add ideas | Yes | Yes | No | No |
| Generate itinerary | **Yes** | No | No | No |
| Select accommodation | **Yes** | No | No | No |
| Add prep items | Yes | Yes | No | No |
| Add expenses | Yes | Yes | No | No |
| Upload memories | Yes | Yes | No | No |
| Cancel trip | **Yes** | No | No | No |
| Transfer leadership | **Yes** | No | No | No |
| Leave trip | Yes | Yes | No | No |
| Request to join | N/A | N/A | **Yes** | No |
