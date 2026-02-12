# Tripti – Product Philosophy & Business Context

⚠️ This document is **not** marketing copy and **not** runtime LLM context.  
It exists to align human developers and AI collaborators (ChatGPT, Claude, Cursor)  
on the **business intent, product principles, and design constraints** behind Tripti.

---

## 1. What Tripti Is (and Is Not)

**Tripti is a group travel coordination product**, not a content platform.

The core problem Tripti solves is **group decision paralysis**:
- too many opinions
- unclear ownership
- fragmented chats
- endless “we should plan this” conversations that never converge

Tripti exists to:
- turn *social intent* into *decisions*
- turn *discussion* into *momentum*
- help groups **lock plans**, not browse ideas endlessly

### Tripti is NOT:
- a social feed
- a discovery-first travel app
- a marketplace
- a solo itinerary generator
- a “scroll and save” inspiration product

---

## 2. Target User & Social Context

**Primary users**
- Adults roughly 21–55
- Already socially connected (friends, family, alumni groups, micro-communities)
- Planning trips collaboratively, not alone

**Key assumption**
> Trips happen *because of people*, not because of destinations.

This is why:
- Circles exist before trips
- Trips are created *within* social context
- Visibility and nudging are social, not public

---

## 3. The Core Product Wedge

### The wedge is **coordination**, not content.

Tripti wins by:
- making the *next action obvious*
- reducing ambiguity about who needs to do what
- applying **light social pressure** at the right moment

The MVP wedge features:
- Stage-based trip planning
- Chat as the primary interaction surface
- Explicit actions (vote, submit idea, approve, finalize)
- Minimal but intentional nudges

---

## 4. Stage-Based Planning (Non-Negotiable)

Trips move through **clear stages**, each with:
- a single dominant goal
- a small set of allowed actions
- a clear notion of “done”

Stages exist to:
- prevent infinite discussion
- give the product permission to nudge
- reduce cognitive load

**Stages are sacred.**
Do not:
- collapse stages
- allow actions from future stages
- reintroduce ambiguity once a stage is complete

---

## 5. Chat-First, Not Feed-First

**Trip Chat is the primary interactive surface.**

Why:
- Chat is where coordination naturally happens
- It already carries social accountability
- It keeps context local to the trip

### Explicit design choices
- No separate “activity feed” for interaction
- Circle updates are **read-only digests**
- System messages clarify state changes, not replace conversation

Chat is where:
- CTAs appear
- nudges happen
- decisions are made

---

## 6. Social Nudging Philosophy

Tripti uses **nudging, not nagging**.

Good nudges:
- “Waiting on you” (only when truly blocking)
- Countdown once dates are locked
- Visibility of participation (ideas submitted, votes cast)

Bad nudges:
- Persistent red badges everywhere
- Passive notifications with no clear action
- Shaming or public callouts

### Key rule
> A nudge must map to a **specific, valuable action**.

If no action exists, do not nudge.

---

## 7. Privacy & Trust Model

Privacy exists to:
- protect personal visibility
- avoid social awkwardness
- **never block collaboration**

### Core invariant
> Privacy settings must NEVER hide trips from people who are legitimately collaborating.

Concretely:
- Dashboard always shows your trips
- Circle members always see circle trips
- Travelers always see their trips
- Privacy settings only affect **profile views**

Trust > configurability.

This is why overly granular privacy options are avoided.

---

## 8. LLM Philosophy (Critical)

LLMs are **assistive tools**, not decision-makers.

### Principles
- LLMs help synthesize, not originate group intent
- Human input always comes first
- LLM usage is gated (cost + trust)
- Leaders have more power than passengers

### Explicit constraints
- Not everyone can generate itineraries
- Leaders cannot spam generation
- Ideas come from humans first
- LLM output is editable, not final by default

LLMs exist to:
- reduce effort
- increase clarity
- accelerate convergence

They do NOT:
- replace discussion
- override votes
- remove ownership

---

## 9. Business Model Constraints (High-Level)

Even at MVP, business realities matter.

Key constraints:
- LLM calls are expensive → must be intentional
- Stickiness comes from coordination loops, not content volume
- MVP focus > feature breadth
- Trust and clarity now > monetization now

Tripti optimizes for:
- repeat usage within the same social groups
- multiple trips per circle over time
- becoming the *default place* where a group plans trips

---

## 10. Anti-Patterns (Do Not Introduce)

The following are explicitly against Tripti’s philosophy:

- ❌ Infinite scrolling feeds
- ❌ Duplicate chat surfaces
- ❌ Passive “FYI” notifications with no CTA
- ❌ Auto-generating itineraries without human input
- ❌ Hiding collaborative trips due to privacy confusion
- ❌ Treating trips as public content objects
- ❌ Optimizing for anonymous browsing

If a feature resembles the above, it is likely wrong.

---

## 11. How to Evaluate New Features

Every proposed feature should answer **yes** to at least one:

- Does this reduce decision friction?
- Does this clarify the next action?
- Does this reinforce ownership?
- Does this help the group converge faster?

If it only:
- adds information
- adds visibility
- adds optionality

…it is probably not MVP-worthy.

---

## 12. North Star

> Tripti succeeds when groups say:  
> **“Let’s just plan it on Tripti.”**

Not:
- “Let’s browse”
- “Let’s save ideas”
- “Let’s scroll”

But:
- **plan**
- **decide**
- **lock**
