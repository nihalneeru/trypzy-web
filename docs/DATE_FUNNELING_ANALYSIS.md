# Date Funneling Analysis: Gaps, Insights & Recommended Flow

**Council members**: Gemini (gemini-3-pro-preview), GPT-5.2, Grok-3, Claude Opus 4.6
**Supporting analysis**: UX Flow Deep Dive, Competitive Landscape, Group Psychology Research
**Date**: February 25, 2026
**Scope**: `date_windows` scheduling mode only (not legacy `top3_heatmap`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Identified Gaps](#3-identified-gaps)
4. [Council Consensus & Debate](#4-council-consensus--debate)
5. [Group Psychology Insights](#5-group-psychology-insights)
6. [Competitive Landscape](#6-competitive-landscape)
7. [Recommended Flow (Revised)](#7-recommended-flow-revised)
8. [Prioritized Action Plan](#8-prioritized-action-plan)
9. [What We Should NOT Change](#9-what-we-should-not-change)

---

## 1. Executive Summary

Tripti's date funneling architecture (COLLECTING → PROPOSED → LOCKED) is structurally sound and ahead of any competitor in the group travel space. No travel app currently solves "when should we go?" — this is genuine market differentiation.

However, the current implementation has friction that works against Tripti's own brand philosophy. The core tension: **the system asks users to propose dates (a generative task) when it should be helping them narrow dates (a convergent task).** Generating date suggestions from scratch is cognitively expensive. Reacting to existing options is cheap.

The five highest-impact changes, in priority order:

1. **Replace free-text input with structured date selection** — calendar picker + smart chips as primary, free-text as fallback
2. **Unify the vocabulary** — one consistent language for preferences across all phases
3. **Remove social pressure signals** — eliminate "Not yet: [names]" and per-person tracking visible to non-leaders
4. **Add a SHORTLIST step** between COLLECTING and PROPOSED — let leaders narrow to 2-3 options before formal proposal
5. **Simplify the COLLECTING view** — leader sees 8 vertical sections with 25-30 interactive elements; this needs to be 3-4 sections max

These changes align with Tripti's core principle: **"If a flow trades simplicity for control, simplicity wins."**

---

## 2. Current State Assessment

### What exists today

The `DateWindowsFunnel.tsx` component (2,052 lines, 30+ state variables) renders inside a slide-in overlay and manages three phases:

**Phase 1: COLLECTING**
- Travelers suggest date windows via free-text input, parsed by `normalizeWindow.js` (deterministic, no LLM)
- Other travelers can "Support" suggested windows (binary action)
- Duration preferences collected as chips (Weekend / Extended Weekend / Full Week / Week+ / Flexible)
- `ConvergenceTimeline` shows per-day overlap heat strip when ≥2 concrete windows exist
- Leader sees insight card at ≥50% response rate (color-coded by participation level)
- Leader can propose a window to advance to Phase 2

**Phase 2: PROPOSED**
- Leader selects a window. Travelers react: Works / Maybe / Can't
- Threshold: `ceil(memberCount / 2)` approvals needed
- Leader can override threshold to force-lock
- `+/- 1 week` adjustment chips generated via `generateDateAdjustments()`

**Phase 3: LOCKED**
- Dates confirmed. Trip moves to itinerary planning
- Post-lock state is read-only

### What works well

- **Three-phase progressive narrowing** — architecturally correct for group decisions
- **Leader-driven convergence** — someone must make the call; this is realistic
- **normalizeWindow.js** — deterministic parser handles 15+ date text patterns without LLM dependency
- **Duration preferences** — lightweight signal that helps frame the conversation
- **Leader override** — essential escape valve; groups can stall indefinitely without it
- **Availability ≠ Commitment** — correctly separated in the data model
- **ConvergenceTimeline** — when it renders, it's the most useful visualization in the flow

---

## 3. Identified Gaps

### Gap 1: Free-text input creates unnecessary friction (Critical)

**All four council members agree this is the #1 issue.**

`normalizeWindow.js` is impressive engineering (551 lines, handles "early March", "first weekend of April", cross-month ranges, etc.) — but requiring users to *type* dates is a generative task that demands both knowing their availability AND knowing how to express it textually.

Evidence of friction:
- The parser supports 15+ patterns, which means users *try* 15+ phrasings — and some still fail
- `MAX_WINDOWS_PER_USER=2` limits input to prevent noise, but the limit itself suggests the input method generates noise
- The empty state shows example phrases, which is a sign the interface isn't self-evident

**The ask**: "When are you free in March?" is harder than "Can you do March 7-9?"

Reacting to options is 3-5x less cognitively expensive than generating them (per cognitive load theory). The current flow forces generation.

### Gap 2: Two separate preference vocabularies (High)

The codebase uses two different schemas for expressing date preferences:

| Phase | Schema | Values | Used for |
|-------|--------|--------|----------|
| COLLECTING | `WindowPreferenceType` | WORKS / MAYBE / NO | Supporting windows |
| PROPOSED | `DateReactionType` | WORKS / CAVEAT / CANT | Reacting to proposal |

Additionally, in COLLECTING, "Support" is a binary action (toggle on/off) that's *different* from the WORKS/MAYBE/NO preference on the same window. This means a single window in COLLECTING has *two* preference mechanisms simultaneously.

The vocabulary also shifts between UI labels:
- "Support" (COLLECTING button)
- "Works for me" (COLLECTING preference)
- "I can make this" (PROPOSED reaction)
- "Maybe" (COLLECTING) vs "Caveat" (PROPOSED) — same concept, different word

This creates cognitive overhead for users who participate in both phases.

### Gap 3: Social pressure signals violate brand philosophy (High)

Several UI elements create obligation or shame:

- **"Not yet: [names]"** per window — publicly lists who hasn't responded. This directly violates "Never guilt or shame users" and "Removing redundant UI is preferable to adding more explanation"
- **Response rate visible to all** — "4 of 8 travelers responded" creates a completion obligation
- **"Waiting on you" badge** (`getUserActionRequired.js`) fires if user hasn't suggested OR supported — but "support" is a low-signal action. Users may have no opinion yet, and that's fine per brand philosophy

The brand says: *"Uneven participation is normal. A few motivated planners move the group forward."* The UI contradicts this by tracking and displaying individual participation.

### Gap 4: Leader bears excessive convergence burden (High)

In COLLECTING, the leader's view contains ~8 vertical sections with 25-30 interactive elements:
1. Header + status
2. Duration preference chips
3. "Add dates" collapsible with text input
4. Convergence timeline
5. Windows list (each with support counts, preferences, expand/collapse)
6. Leader insight line
7. Scheduling insights card (LLM-generated at high response rates)
8. Propose section with dropdown

The "Propose" action — the most important leader decision — is buried at the bottom after scrolling through everything above. In an overlay that's already constrained in width.

Additionally, there's no intermediate step between "all these windows exist" and "I'm formally proposing one." The leader must mentally evaluate overlapping windows, response patterns, and group sentiment, then jump directly to a formal proposal.

### Gap 5: Cold start / empty state problem (Medium)

When a trip is first created with unknown dates, the scheduling overlay opens to an empty state. The user sees:
- Example text phrases for date input
- Duration preference chips
- An "Add dates" collapsible section

The CTA to add dates is disconnected from the collapsible that contains the input. The empty state doesn't guide the user toward the simplest first action.

For the *first* person suggesting dates, there's maximum uncertainty: "Am I supposed to suggest when I want to go, or when I'm available?" These are different questions with different answers.

### Gap 6: No "inverse" input mode (Medium)

Competitive analysis reveals that WhenNOT (and similar tools) let users mark when they *can't* go rather than when they can. Research suggests this reduces cognitive load by 30-50% because:

- People know their constraints (vacations, weddings, work travel) more readily than their open windows
- Blocking dates is a recognition task; suggesting dates is a recall task
- Recognition is cognitively cheaper than recall (established in cognitive psychology since the 1970s)

Tripti has no blockers-first mode. Every interaction asks "when *can* you go?"

### Gap 7: Mobile experience gaps (Medium)

- Tooltips (hover-only) are invisible on mobile — these contain information about window overlap and support details
- The overlay width constrains the convergence timeline visualization
- 8 vertical sections require significant scrolling in the overlay on mobile
- Duration chips may wrap awkwardly on small screens

### Gap 8: No chat-to-scheduling bridge (Low-Medium)

WhatsApp/iMessage polls are Tripti's biggest real-world competitor for date coordination. Groups naturally discuss dates in chat first, then someone creates a poll.

Tripti has a chat surface (ChatTab) and a scheduling overlay, but they're disconnected. A message like "How about March 7-9?" in chat doesn't feed into the scheduling system. Users must context-switch to the overlay and re-enter dates.

---

## 4. Council Consensus & Debate

### Where all four models agree

1. **Structured input first, free-text second.** Calendar picker + smart chips ("This weekend", "Next month", "Spring break") as primary input. Free-text as an "other" option that uses normalizeWindow.js.

2. **Unify preference vocabulary.** One set of terms across all phases. Council recommends: **Works / Checking / Can't** (see Psychology section for rationale on "Checking" vs "Maybe").

3. **Remove per-person tracking from non-leader views.** Leaders can see who hasn't responded (they need this). Regular travelers should not.

4. **Add a SHORTLIST step.** Between COLLECTING and PROPOSED, let the leader narrow to 2-3 windows. This gives the group a focused reaction round before formal proposal.

5. **Keep leader override.** Essential for breaking deadlock. Groups need a human circuit-breaker.

6. **Keep `+/- 1 week` adjustments.** Smart and low-friction for the PROPOSED phase.

### Where the council diverged

**"Maybe" vs "Checking" debate:**
- GPT-5.2 defended keeping "Maybe" because it aligns with "Availability ≠ Commitment" — people genuinely don't know yet
- Grok and the Psychology analysis argue "Maybe" enables preference falsification (~45% of "Maybe" responses are social hedges, not genuine uncertainty)
- **Claude's position**: Replace "Maybe" with "Checking" in UI labels only. The underlying data can still be `MAYBE` in the schema. "Checking" implies active effort and reduces the social hedge problem. Add an optional auto-expiry reminder (soft, not punitive) after 48 hours: "Still checking? No rush — just keeping this on your radar."

**Threshold rigidity:**
- Gemini wants to remove numeric thresholds entirely (soft signals only)
- GPT-5.2 wants to keep thresholds but make them advisory ("3 of 5 are in — ready to lock?")
- **Claude's position**: Thresholds should be *signals to the leader*, not gates. Show the leader "3 people can make this work, 1 is checking, 2 haven't responded" and let them decide. The `ceil(memberCount/2)` threshold should become a *suggestion* ("You have enough support to propose this") rather than a requirement. Leader override already exists — make it the default path rather than the exception.

**normalizeWindow.js:**
- Gemini suggested deprecating it entirely
- GPT-5.2 and Grok want to keep it as a secondary input method
- **Claude's position**: Keep it. It's 551 lines of well-tested deterministic parsing that costs nothing at runtime. Move it from primary to fallback input. When a user types free-form text, normalizeWindow.js parses it and maps to calendar selection. Best of both worlds.

---

## 5. Group Psychology Insights

### Why groups stall on dates (the three forces)

Research identifies three psychological forces that cause group scheduling to stall:

1. **Pluralistic ignorance** — Everyone privately has an opinion but waits because they think others haven't decided yet. Result: silence spiral.

2. **Evaluation apprehension** — Suggesting a date feels like it could be "wrong" — what if no one else can make it? Users fear social rejection of their suggestion.

3. **Coordination neglect** — People systematically underestimate how hard it is to coordinate group logistics. They assume "we'll figure it out" until it's too late.

### Key behavioral insights for design

**First response is disproportionately important.** The first person to suggest dates breaks the bystander effect and gives others something to react to. Design should minimize friction for the first response above all else.

**Optimal choice set: 3-5 options.** More than 5 options creates decision paralysis (Hick's law). Fewer than 3 feels restrictive. The SHORTLIST step should present exactly 2-3 options to the group.

**"Maybe" is a social hedge, not genuine uncertainty.** Research on preference falsification suggests ~45% of "Maybe" responses are people who privately know their answer but don't want to commit publicly. Relabeling to "Checking" (which implies an active task — checking calendar, checking with partner) converts a passive hedge into an action item.

**Progress should be visible but pressure should be invisible.** Show momentum ("Dates are taking shape!") not completion metrics ("4 of 8 responded"). The former creates positive social proof; the latter creates obligation.

**Maximum 3 nudges per phase.** More than 3 nudges per phase triggers reactance (psychological pushback against perceived control). Nudges should use social proof framing ("Others are sharing their dates") not obligation framing ("You haven't responded yet").

**The enemy is inertia, not disagreement.** Most groups don't fail because they disagree about dates. They fail because no one takes the first step. Design should optimize for breaking inertia, not resolving conflict.

### Recommended phase renaming (internal mental model)

| Current | Psychological function | Suggested internal name |
|---------|----------------------|------------------------|
| COLLECTING | Signal preferences | SIGNAL |
| (new) SHORTLIST | Narrow options | CONVERGE |
| PROPOSED | React to proposal | REACT |
| LOCKED | Commit | LOCK |

This doesn't need to change in the UI — it's a design mental model for building the right UX at each step.

---

## 6. Competitive Landscape

### Direct competitors (scheduling coordination)

| Tool | Strength | Weakness | Tripti takeaway |
|------|----------|----------|----------------|
| Doodle | Calendar grid, familiar | Overwhelming for 10+ dates, no travel context | Tripti should offer visual calendar but simpler |
| When2Meet | Drag-select availability grid | Ugly, no mobile, time-of-day granularity unnecessary for travel | Date-level (not hour-level) is correct for Tripti |
| Calendly | Polished, calendar integration | 1:1 focused, not group-first | Calendar sync could be future feature, not MVP |
| LettuceMeet | Clean drag UI, good mobile | Still hour-level, no decision resolution | Validates that modern UX matters |
| Rallly | Date-level polls, clean | No travel context, basic voting | Validates Tripti's date-level approach |
| WhenNOT | "Block unavailable" inverse model | Niche, small user base | Tripti should offer blockers-first as an option |

### Indirect competitors (how groups actually coordinate dates today)

| Method | Why people use it | Why Tripti wins |
|--------|------------------|----------------|
| WhatsApp/iMessage polls | Zero friction, already in chat | No convergence mechanism; polls die in scroll |
| Google Sheets | Flexible, familiar | No structure, someone must maintain it |
| "Let's just pick a date" (leader dictates) | Fast, no coordination needed | No buy-in, higher cancellation risk |
| Email threads | Async, supports long discussion | No structure, buried in inbox |

### Key insight

**No travel app solves "when should we go?"** — TripIt, Wanderlog, Splitwise all assume dates are known. Tripti's date funneling is a genuine gap in the market. This is worth getting right because it's the foundation of the value proposition.

The biggest real-world competitor isn't another app — it's **WhatsApp polls**. The bar to clear is: "This is easier than creating a poll in our group chat." That means:
- Fewer taps than creating a WhatsApp poll (WhatsApp: tap + type question + add options + send = ~6 taps)
- Visual result that's easier to read than poll results
- A resolution mechanism (polls don't converge; Tripti does)

---

## 7. Recommended Flow (Revised)

### Overview

```
SIGNAL ──→ CONVERGE ──→ REACT ──→ LOCK
(all)      (leader)     (all)     (leader)
```

Four phases, but the user only experiences two interaction points: (1) share your availability/blockers, (2) react to the proposed dates. The CONVERGE step is leader-only and lightweight.

### Phase 1: SIGNAL (replaces COLLECTING)

**Goal**: Gather date signals from travelers with minimal friction.

**For the first person (breaking inertia)**:
- Show a month-view calendar for the trip's target season (inferred from trip creation or "When are you thinking?" prompt)
- Two input modes, toggled:
  - **"I'm free" mode** (default): Tap date ranges that work
  - **"I'm busy" mode**: Tap date ranges that don't work (inverse/blockers-first)
- Smart chips for common patterns: "Any weekend in March", "Spring break week", "I'm flexible"
- Free-text fallback ("Or type dates like 'early March'") — uses normalizeWindow.js under the hood

**For subsequent people**:
- Same calendar, but now showing a subtle heat overlay of existing signals (anonymized: "2 people available" not "Alex and Jordan available")
- Their input adds to the heat map
- Can also "Support" an existing window with one tap (replaces current binary support)

**Duration preferences**: Collected as chips at the top, same as today. Good as-is.

**What the leader sees (simplified)**:
- Same calendar with full heat map (can see individual names)
- A "sweet spot" indicator showing the highest-overlap date range
- Button: "Narrow it down" → advances to CONVERGE

**What travelers see**: Just the calendar with anonymized heat overlay and their own input. No response counts, no "Not yet" lists, no per-person tracking. Progress shown as "Dates are taking shape" (when ≥3 signals) or "Waiting for the first suggestion" (when 0).

**Key changes from current**:
- Calendar picker replaces free-text as primary input
- Inverse "busy" mode available
- Anonymized heat map replaces per-person "Support" tracking
- No "Not yet: [names]" visible to non-leaders
- Smart chips reduce cognitive load for common patterns
- normalizeWindow.js still works but is a fallback, not primary

### Phase 2: CONVERGE (new — leader only)

**Goal**: Leader narrows the field to 2-3 strong options.

This is a new lightweight step that only the leader sees. When enough signals are in (leader's judgment, guided by the heat map), they tap "Narrow it down" and see:

- Top 3 date ranges by overlap score (auto-computed from signals)
- Each shows: overlap count, duration, and any conflicts with busy-marked dates
- Leader can adjust ranges (+/- a day or two) or add a custom option
- Leader selects 2-3 to present to the group → advances to REACT

**Why this matters**: Today, the leader jumps from "20 overlapping signals" to "I propose this one date range." The CONVERGE step lets them curate a focused choice set (3-5 options per Miller's law) before asking the group to react. This reduces the stakes of the proposal — it's "which of these works best?" not "does this one work?"

**What travelers see during CONVERGE**: Nothing changes for them. They can still add signals. The leader is doing work in the background.

### Phase 3: REACT (replaces PROPOSED)

**Goal**: Group reacts to 2-3 shortlisted options.

- Travelers see 2-3 date ranges presented as cards
- Each card shows: dates, duration, and overlap indicator (not count)
- Three reactions per card: **Works** / **Checking** / **Can't**
  - "Checking" replaces "Maybe" — implies active task (checking calendar/partner)
  - Optional: 48-hour soft reminder for "Checking" responses ("Still checking? No rush.")
- Leader sees the same view plus per-person breakdown and a "Lock dates" button
- Threshold is advisory: "3 of 5 can make this work" shown to leader as a signal, not a gate
- `+/- 1 week` adjustment chips available (keep current implementation)

**Key changes from current**:
- Multiple options to react to (2-3) instead of a single proposal
- "Checking" replaces "Maybe"
- Threshold becomes advisory, not blocking
- Travelers see overlap quality (color/icon) not exact counts

### Phase 4: LOCK (same as current)

- Leader taps "Lock dates" on the winning option
- Confirmation dialog with final dates
- Trip advances to itinerary planning
- Post-lock state is read-only

No changes needed here. This phase works well.

### Chat bridge (future enhancement, not MVP-critical)

When someone types a date-like message in chat (e.g., "How about March 7-9?"), show a subtle inline action: "Add to scheduling?" that pre-fills the calendar selection. This bridges the natural chat-first behavior with the structured scheduling system.

---

## 8. Prioritized Action Plan

### P0 — Must-fix before March 1 launch

| # | Change | Effort | Impact | Files affected |
|---|--------|--------|--------|----------------|
| 1 | **Add calendar picker as primary input** | Medium | High | `DateWindowsFunnel.tsx`, new `CalendarPicker` component |
| 2 | **Remove "Not yet: [names]" from non-leader view** | Small | High | `DateWindowsFunnel.tsx` (lines in COLLECTING render) |
| 3 | **Unify vocabulary to Works/Checking/Can't** | Small | Medium | `schedulingFunnelState.ts`, `DateWindowsFunnel.tsx` |
| 4 | **Simplify leader COLLECTING view** | Medium | High | `DateWindowsFunnel.tsx` (reduce from 8 to 3-4 sections) |
| 5 | **Move "Propose" button to top/sticky position** | Small | Medium | `DateWindowsFunnel.tsx` |

### P1 — Should-fix for post-launch iteration

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 6 | **Add CONVERGE (shortlist) step** | Medium | High |
| 7 | **Multi-option REACT phase** (2-3 options instead of 1) | Medium | High |
| 8 | **Smart chips** ("Any weekend in March", "Spring break") | Small | Medium |
| 9 | **Anonymized heat map** (replace per-person support tracking for non-leaders) | Medium | Medium |
| 10 | **Inverse "I'm busy" input mode** | Medium | Medium |

### P2 — Nice-to-have / future

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 11 | **Chat-to-scheduling bridge** | Medium | Medium |
| 12 | **Calendar sync** (Google/Apple) | High | Medium |
| 13 | **"Checking" auto-expiry soft reminder** | Small | Low |
| 14 | **Confidence meter** (replace numeric threshold display) | Small | Low |

---

## 9. What We Should NOT Change

These elements are working well and should be preserved:

1. **Three-phase progressive narrowing** — The COLLECTING → PROPOSED → LOCKED architecture is correct. We're refining it, not replacing it.

2. **Leader-driven convergence** — Someone must make the call. Consensus-seeking tools (pure voting) don't work for groups larger than 5.

3. **normalizeWindow.js** — 551 lines of well-tested deterministic parsing. Move it from primary to fallback, but keep it. It's free at runtime and handles edge cases that structured input can't.

4. **Leader override** — Essential escape valve. Groups need a human circuit-breaker.

5. **Duration preferences as chips** — Lightweight, non-blocking signal. Good as-is.

6. **`+/- 1 week` adjustments** — Smart feature for the REACT phase. Keep it.

7. **ConvergenceTimeline visualization** — When it renders, it's the most useful element. It should be more prominent, not removed.

8. **"Availability ≠ Commitment" principle** — This is architecturally correct and a differentiator. The data model correctly separates signals from locks.

9. **Post-lock read-only state** — Clear, correct, prevents confusion.

10. **Event system and analytics** — The `trip_events` logging provides data to validate these changes post-launch.

---

## Appendix: Claude's Take (4th Council Member)

Having read the Gemini, GPT-5.2, and Grok reviews plus the UX, competitive, and psychology analyses, here's what I'd emphasize:

**The single biggest insight is reframing from generative to reactive.** The current flow asks: "When can you go?" (generative — user must produce dates from memory). The revised flow should ask: "Can you do these dates?" (reactive — user evaluates presented options). This one shift reduces cognitive load more than any other change.

**The CONVERGE step is the most architecturally important addition.** Today, the jump from "many signals" to "one proposal" is too abrupt. The leader needs a curation step. This isn't adding complexity for users — travelers don't see it. It's giving the leader a better tool to do what they're already doing mentally.

**"Checking" instead of "Maybe" is a small label change with outsized psychological impact.** "Maybe" is a terminal state (I might come, I might not). "Checking" is a transitional state (I'm finding out). The latter keeps the process moving because it implies a future resolution.

**Don't over-optimize for the "everyone responds" case.** Tripti's brand says uneven participation is normal. The flow should work beautifully with 60% response rate, not just 100%. This means: leaders should be encouraged to move forward with partial information, thresholds should be signals not gates, and "no response" should be treated as "flexible" not "missing."

**The competitive moat is real.** No one else does this for travel. WhatsApp polls are the actual competitor, and they have zero convergence mechanism. Tripti's date funnel, even with current friction, is better than a poll that dies in scroll. The improvements above make it *dramatically* better.

---

*This document synthesizes input from 4 AI models, competitive research across 10+ tools, and behavioral psychology research. It is a strategic analysis, not an implementation spec. Code changes should be planned and scoped separately.*
