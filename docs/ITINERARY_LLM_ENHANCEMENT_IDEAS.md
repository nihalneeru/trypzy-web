# Itinerary LLM Enhancement Ideas

> **Last verified against code:** 2026-02-01
> **Status:** Living document for future improvements
> **Note:** Some items marked "IMPLEMENTED" reflect recent work; code is source of truth.

---

## Recently Implemented (Week 1)

### A) Retry Logic for LLM Fetch Calls - IMPLEMENTED
- **Status:** Shipped in `lib/server/fetchWithRetry.js`
- **Behavior:** Exponential backoff (500ms base, 2 retries max) on HTTP 429, 5xx, and network errors
- **All LLM functions now use `fetchWithRetry()` instead of raw `fetch`**

### B) Prompt Token Estimation Guard - IMPLEMENTED
- **Status:** Shipped in `lib/server/tokenEstimate.js`
- **Behavior:** Estimates tokens (chars/4), truncates ideas array if over `ITINERARY_MAX_PROMPT_TOKENS`
- **Truncation:** 10 → 5 → 3 ideas for generation; similar strategy for revision

### C) Reaction Aggregation with Tie Surfacing - IMPLEMENTED
- **Status:** Shipped in `summarizeFeedback()` in `lib/server/llm.js`
- **Behavior:** Vote counting per category, tie detection for exclusive categories (pace, budget)
- **On tie:** Returns `null` for that category, surfaces "SPLIT" signal to LLM

### D) llmMeta Observability - IMPLEMENTED
- **Status:** Shipped on all `itinerary_versions` documents
- **Fields:** model, generatedAt, promptTokenEstimate, ideaCount, feedbackCount, reactionCount, chatMessageCount
- **Extended for chat brief and bucketing features**

### E) Planning Chat Brief for v1 Generation - IMPLEMENTED
- **Status:** Shipped behind `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1`
- **Behavior:** Summarizes pre-generation chat into structured brief
- **Fallback:** On failure, continues without brief (no blocking)

### F) Soft Chat Relevance Bucketing for Revision - IMPLEMENTED
- **Status:** Shipped behind `ITINERARY_CHAT_BUCKETING=1`
- **Behavior:** Separates chat into "relevant" and "other" buckets using keyword heuristic
- **Limits:** 20 relevant + 10 other messages

---

## Future Enhancement Ideas

### 1) Itinerary Diff Visualization
**Priority:** Medium
**Effort:** Medium

Show users what changed between versions with highlighted additions/removals/modifications. Currently, users only see the changelog text.

**Approach:**
- Compare `days[].blocks[]` between versions
- Generate structured diff at save time
- Store in version document or compute on-demand
- UI: color-coded blocks (green=added, red=removed, yellow=modified)

### 2) Block-Level Feedback Targeting
**Priority:** Low
**Effort:** Medium

Allow feedback to target specific blocks (e.g., "Day 2, Block 3") rather than just version-level feedback.

**Current state:** Feedback form has optional `target` field but it's free-text
**Enhancement:** Structured block selector in UI, validated target format

### 3) Regenerate Single Day
**Priority:** Low
**Effort:** High

Allow regenerating a single day while preserving others. Useful when one day is problematic but others are good.

**Challenges:**
- Maintaining coherence across days (transit notes, cumulative activities)
- Version semantics (is this a new version or in-place edit?)
- Increased LLM calls

### 4) Itinerary Templates
**Priority:** Low
**Effort:** Medium

Pre-built itinerary structures for common trip types (weekend getaway, week-long vacation, etc.).

**Use cases:**
- Faster generation for common patterns
- Seed ideas/structure for new trips
- Could reduce LLM dependency for simple trips

### 5) Cost Estimation Refinement
**Priority:** Low
**Effort:** High

Currently, `estCost` on blocks is LLM-generated and often inaccurate. Could integrate with pricing APIs or use more structured cost modeling.

**Challenges:**
- API integration complexity
- Currency handling
- Real-time pricing volatility

### 6) Multi-Language Support
**Priority:** Low
**Effort:** Medium

Generate itineraries in user's preferred language.

**Current state:** All generation is English-only
**Approach:** Pass language preference to LLM, adjust system prompt

### 7) Itinerary Export
**Priority:** Medium
**Effort:** Low

Export itinerary to common formats (PDF, calendar events, Google Maps list).

**Simplest approach:** Generate structured data, use client-side libraries for export

### 8) Activity Booking Integration
**Priority:** Low
**Effort:** High

Link itinerary blocks to bookable activities/restaurants/tours.

**Challenges:**
- Partner integrations
- Availability checking
- Commission/revenue model

---

## Deferred / Out of Scope

### Streaming Responses
**Why deferred:** Current generation times (5-15s) are acceptable. Streaming adds complexity without major UX improvement for short responses.

### Real-time Collaborative Editing
**Why out of scope:** Conflicts with "leader generates/revises" model. Would require significant architecture changes.

### AI-Powered Booking Optimization
**Why out of scope:** Business model dependency, significant integration work, outside MVP scope.

---

## Evaluation Criteria for New Enhancements

When considering new LLM pipeline enhancements, evaluate against:

1. **MVP Relevance:** Does it help trips get locked and executed?
2. **Failure Impact:** What happens if it fails? (Must be graceful)
3. **Feature Flag:** Can it be gated for safe rollout?
4. **Observability:** Can we measure its effectiveness?
5. **Token Budget:** Does it fit within prompt limits?
6. **Maintenance:** Does it add significant complexity?

Prefer enhancements that:
- Are additive (no breaking changes)
- Have clear rollback path
- Provide measurable improvement
- Don't block core flows on failure
