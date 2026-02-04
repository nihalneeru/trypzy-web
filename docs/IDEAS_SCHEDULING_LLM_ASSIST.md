# Idea: LLM-Assisted Scheduling Insights

> **Status:** Ideation (not approved for MVP)
> **Created:** 2026-02-04
> **Last Updated:** 2026-02-04

---

## Problem Statement

### What problem are we solving?

During the COLLECTING phase, groups discuss dates in chat but may not formally submit date windows. The leader must:
1. Read through chat to understand preferences
2. Cross-reference with submitted windows and supports
3. Identify conflicts or constraints mentioned informally
4. Make a proposal decision

**Hypothesis:** Leaders may miss signals buried in chat, leading to suboptimal proposals or decision paralysis.

### Is this a real problem?

**Unknown.** We need to validate:
- Do leaders actually struggle to interpret signals?
- Or is the real problem participation (people not responding at all)?
- What % of trips have significant chat activity during scheduling?

**Current signals available to leaders:**
- Date windows with support counts
- Response rate insight card (>=50%, >=80% thresholds)
- Duration preferences (weekend/week/flexible)
- Reactions on proposed windows (Works/Maybe/Can't)

**Question:** Is the signal-to-noise ratio in chat high enough to warrant LLM processing?

---

## Proposed Solution

### Core Concept: "Scheduling Insight Card"

A **read-only, informational** card shown to the leader during COLLECTING phase that summarizes chat signals related to date preferences.

```
┌─────────────────────────────────────────────────┐
│ 💬 From your group's chat                       │
│                                                 │
│ • 3 people mentioned preferring weekends        │
│ • Alex can't do March 15-17 (work conflict)     │
│ • Sam suggested "somewhere warm" (no dates)     │
│                                                 │
│ ℹ️ AI-summarized from recent messages           │
└─────────────────────────────────────────────────┘
```

### What It Is NOT

- ❌ Not auto-creating date windows
- ❌ Not overriding explicit user signals
- ❌ Not required to proceed
- ❌ Not shown to all travelers (leader only)
- ❌ Not replacing the existing flow

### Design Principles

1. **Additive only** — Enhances existing flow, doesn't change it
2. **Informational** — Helps leader, doesn't decide for them
3. **Transparent** — Clearly labeled as AI-interpreted
4. **Fallback-safe** — If LLM fails, card doesn't show (no blocking)
5. **Conservative** — Only surfaces clear signals, not invented consensus

---

## Implementation Approach

### Option A: On-Demand (Recommended for MVP)

Leader clicks "Summarize chat" button to trigger LLM analysis.

**Pros:**
- No latency on page load
- User explicitly requests it (consent)
- Lower cost (only when needed)
- Simpler to implement

**Cons:**
- Requires user action
- May not be discovered

### Option B: Automatic with Caching

LLM analysis runs in background, cached for 1 hour.

**Pros:**
- Always available
- No wait time for leader

**Cons:**
- Higher cost (runs even if not needed)
- Stale data risk
- More complex implementation

### Option C: Triggered by Threshold

Only runs when: chat messages > N AND response rate < 50%

**Pros:**
- Targeted to situations where it's most useful
- Cost-efficient

**Cons:**
- May miss useful cases
- More complex logic

**Recommendation:** Start with **Option A** (on-demand) for MVP.

---

## Technical Design

### New LLM Function

```javascript
// lib/server/llm.js
export async function summarizeSchedulingChat(trip, chatMessages, dateWindows) {
  // Input:
  //   - trip: { name, destinationHint, startDate, endDate }
  //   - chatMessages: recent non-system messages (bounded)
  //   - dateWindows: existing windows with support counts
  //
  // Output:
  //   {
  //     datePreferences: ["weekends", "March"],
  //     conflicts: [{ user: "Alex", dates: "March 15-17", reason: "work" }],
  //     otherSignals: ["prefers warm weather"],
  //     confidence: "low" | "medium" | "high"
  //   }
}
```

### API Endpoint

```
POST /api/trips/:tripId/scheduling/chat-insights
```

- Auth: Leader only
- Rate limit: 1 request per 5 minutes per trip
- Response: `{ insights: {...}, generatedAt: "..." }`

### UI Component

```typescript
// components/trip/scheduling/SchedulingChatInsights.tsx
// - Only renders for leader
// - Only renders during COLLECTING phase
// - Button to trigger analysis
// - Displays structured insights
// - Clear "AI-generated" disclaimer
```

### Feature Flag

```
SCHEDULING_CHAT_INSIGHTS_ENABLED=1  (default: 0)
```

### Observability

Store in trip document (not a new collection):
```javascript
{
  schedulingInsights: {
    lastGeneratedAt: "2026-02-04T...",
    messageCount: 23,
    confidence: "medium",
    // NOT storing raw insights (may contain PII)
  }
}
```

---

## Bounded Chat Window

Same pattern as itinerary chat brief:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| Lookback days | 14 | Only recent planning discussion |
| Max messages | 100 | Limit context size |
| Max chars | 4000 | Fit within token budget |

---

## Prompt Design

### System Prompt

```
You are analyzing group chat messages to help a trip leader understand
date preferences. Extract ONLY information that is clearly stated or
strongly implied. Do NOT invent consensus. If signals are unclear or
contradictory, say so.
```

### User Prompt

```
Trip: {tripName} to {destination}
Considering dates: {startDate} to {endDate}

Existing date proposals:
{windowsList}

Recent chat messages:
{messagesList}

Extract:
1. Date preferences mentioned (specific dates, day-of-week, time-of-year)
2. Conflicts or constraints (who can't do what dates, and why if stated)
3. Other relevant signals (flexible, no preference, etc.)

If a signal is from only one person without group agreement, note it
as individual preference, not group consensus.

Output JSON:
{
  "datePreferences": [...],
  "conflicts": [{ "user": "...", "dates": "...", "reason": "..." }],
  "otherSignals": [...],
  "confidence": "low|medium|high",
  "summary": "One sentence summary for leader"
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Invented consensus | Prompt emphasizes "only clear signals"; confidence scoring |
| Stale insights | Show timestamp; allow refresh |
| Leader over-reliance | Disclaimer text; show raw signal counts |
| LLM hallucination | Structured output; validation |
| Cost | On-demand only; rate limiting |
| Latency | Async with loading state; not blocking |

---

## Success Metrics

### Quantitative
- % of leaders who use the feature (adoption)
- Time from COLLECTING → PROPOSED (does it speed up decisions?)
- % of trips that lock after using insights (completion)

### Qualitative
- Leader feedback: "Was this helpful?"
- Did insights match what was actually in chat?

### Failure Indicators
- Leaders ignore the insights
- Insights frequently wrong (based on feedback)
- No measurable impact on time-to-lock

---

## MVP Scope

### In Scope
- [ ] `summarizeSchedulingChat()` LLM function
- [ ] `POST /api/trips/:tripId/scheduling/chat-insights` endpoint
- [ ] Leader-only button in DateWindowsFunnel during COLLECTING
- [ ] Simple insight display card
- [ ] Feature flag (default OFF)
- [ ] Basic observability (timestamp, message count)

### Out of Scope (Future)
- Automatic/cached insights
- Insights during PROPOSED phase
- Traveler-visible insights
- Integration with window suggestion UI
- Nudges based on insights

---

## Open Questions

1. **Is this solving a real problem?** Need user feedback.
2. **What's the right confidence threshold?** Should we hide low-confidence insights?
3. **Should insights persist?** Or regenerate each time?
4. **How do we handle multilingual chats?** (Future consideration)

---

## Decision

**Not yet approved for MVP.**

Next steps:
1. Validate the problem exists (user interviews, analytics)
2. If validated, implement Option A (on-demand) behind feature flag
3. Measure adoption and impact before expanding

---

## Appendix: Current Scheduling Flow

```
COLLECTING
├── Travelers suggest date windows (free-form text → normalizeWindow)
├── Travelers support each other's windows
├── Leader sees response-rate insight card
└── Leader can propose any window when ready

PROPOSED
├── Travelers react: Works / Maybe / Can't
├── Approval threshold: ceil(memberCount / 2)
└── Leader can lock (with override if threshold not met)

LOCKED
└── Dates finalized, move to itinerary
```

The proposed LLM insight would augment the COLLECTING phase only.
