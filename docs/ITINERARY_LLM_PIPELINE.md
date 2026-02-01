# Itinerary LLM Pipeline

> **Last verified against code:** 2026-02-01
> **This document is a snapshot; code remains source of truth.**
> **Suggested review trigger:** when modifying `lib/server/llm.js` or itinerary routes in `app/api/[[...path]]/route.js`.

## Overview

The itinerary pipeline uses LLM calls to generate and revise trip itineraries based on:
- Trip metadata (destination, dates, group size)
- User-submitted itinerary ideas
- Structured feedback and quick reactions
- Optionally, a derived summary of planning chat (feature-flagged)

All LLM interactions use OpenAI-compatible APIs with retry logic, token guards, and observability metadata.

---

## Initial Itinerary Generation (v1)

Initial generation creates the first itinerary version for a locked trip.

### Default Mode (flag OFF)

When `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE` is not set or `!= "1"`:

**Inputs:**
- Trip metadata: destination hint, locked dates, group size
- Top 10 itinerary ideas (sorted by priority)
- Extracted constraints from ideas

**Behavior:**
- Chat messages are NOT considered
- Generation uses trip context + ideas only
- This is the stable, production-default behavior

### Enhanced Mode (flag ON)

When `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1`:

**Additional pre-generation step:**
1. Fetch bounded planning chat (see "Planning Chat Brief" section)
2. Call `summarizePlanningChat()` to derive a structured brief
3. Inject the brief into the generation prompt under a labeled section

**Fallback behavior:**
- If chat summarization fails for any reason, generation continues without the brief
- Failure is logged but does not block itinerary creation
- The resulting itinerary will match default mode output

**Why this exists:**
- Groups often discuss preferences in chat before formal idea submission
- The brief captures expressed intent without injecting raw chat noise
- Feature-flagged to allow validation before broad rollout

---

## Planning Chat Brief

### Purpose

Capture group planning intent discussed in chat without injecting raw message noise into generation prompts. The brief is a structured summary, not a transcript.

### Structure

```json
{
  "mustDos": ["activities the group explicitly wants"],
  "avoid": ["things to explicitly avoid"],
  "preferences": {
    "pace": "slow" | "balanced" | "fast" | "unknown",
    "budget": "lower" | "mid" | "high" | "unknown",
    "focus": ["themes like 'food', 'culture', 'adventure'"],
    "logistics": ["preferences like 'central location', 'avoid early mornings'"]
  },
  "constraints": ["hard constraints like 'must be back by 6pm on day 2'"],
  "openQuestions": ["unresolved questions or disagreements"],
  "confidence": {
    "pace": "low" | "medium" | "high",
    "budget": "low" | "medium" | "high"
  }
}
```

### Guarantees

- **No invented consensus**: Only extracts information clearly stated or strongly implied
- **Unclear signals marked as "unknown"**: When preferences are contradictory or mentioned by only one person without agreement
- **Recency preference**: When conflicts exist, recent messages take precedence
- **Conservative extraction**: When in doubt, values are "unknown" or arrays are empty

### Limitations

- Brief may be incomplete if relevant discussion happened outside the lookback window
- Brief may be stale if group preferences changed after summarization
- Single-person statements without group agreement are not treated as consensus

### Bounded Chat Window

To control prompt size and relevance, chat fetching is bounded:

| Parameter | Env Var | Default | Purpose |
|-----------|---------|---------|---------|
| Lookback days | `ITINERARY_CHAT_BRIEF_LOOKBACK_DAYS` | 14 | Only consider recent planning discussion |
| Max messages | `ITINERARY_CHAT_BRIEF_MAX_MESSAGES` | 200 | Limit DB query size |
| Max chars | `ITINERARY_CHAT_BRIEF_MAX_CHARS` | 6000 | Limit prompt injection size |

**Why these bounds exist:**
- Older messages may reflect outdated preferences
- Very long chat histories add noise without proportional signal
- Token limits on LLM context require bounded input

---

## Revision Flow (v2+)

### When Revisions Are Enabled

The leader can revise an itinerary when **any** of these conditions are met:
- There is feedback submitted via the feedback form for the latest version, OR
- There are quick reactions on the latest version

Both feedback and reactions are considered valid revision input. The UI reflects this:
- "X feedback, Y reactions since vN" when input exists
- "Waiting for feedback or reactions" when no input exists

### Revision Process

1. Fetch feedback messages for latest version
2. Fetch reactions for latest version
3. Fetch new ideas since latest version creation
4. Fetch recent chat messages since latest version (delta only)
5. Summarize all inputs via `summarizeFeedback()`
6. Call `reviseItinerary()` with current itinerary + feedback summary

### Chat in Revisions

Chat messages used in revisions are:
- **Delta only**: Messages created after the latest version's `createdAt`
- **Non-system**: System messages (nudges, milestones) are excluded
- **Limited**: Up to 30 messages (or 50 with bucketing enabled)

**With `ITINERARY_CHAT_BUCKETING=1`:**
- Messages are separated into "Relevant chat feedback" and "Other recent chat context"
- Relevance determined by keyword matching and message length
- Limits: 20 relevant + 10 other

### Version Rules

- **Version cap**: Maximum 3 versions per trip (configurable via `ITINERARY_CONFIG.MAX_VERSIONS`)
- **Latest version is active**: Only the highest-numbered version is displayed
- **Immutable history**: Previous versions are retained but not editable

---

## Observability (llmMeta)

Each `itinerary_versions` document includes an `llmMeta` object for debugging and analysis.

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | LLM model used (e.g., "gpt-4o-mini") |
| `generatedAt` | ISO string | Timestamp of LLM call |
| `promptTokenEstimate` | number | Estimated prompt tokens (chars/4) |
| `ideaCount` | number | Ideas included in prompt |
| `feedbackCount` | number | Feedback messages processed (v2+ only) |
| `reactionCount` | number | Reactions processed (v2+ only) |
| `chatMessageCount` | number | Chat messages included |

### v1-specific fields (when chat brief enabled)

| Field | Type | Description |
|-------|------|-------------|
| `chatBriefEnabled` | boolean | Whether chat brief feature was active |
| `chatBriefMessageCount` | number | Messages used for brief |
| `chatBriefCharCount` | number | Total chars in formatted messages |
| `chatBriefSucceeded` | boolean | Whether summarization succeeded |

### v2+ specific fields (when chat bucketing enabled)

| Field | Type | Description |
|-------|------|-------------|
| `chatBucketingEnabled` | boolean | Whether bucketing was active |
| `chatRelevantCount` | number | Messages in "relevant" bucket |
| `chatOtherCount` | number | Messages in "other" bucket |

### What is NOT stored

- Raw prompts sent to LLM
- Raw chat message content
- LLM chain-of-thought or reasoning
- User PII beyond counts

**Purpose of llmMeta:**
- Debug generation issues without re-running LLM calls
- Analyze prompt size trends across trips
- Inform future tuning of token limits and truncation strategies

---

## Feature Flags & Safety

### Generation Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE` | `"0"` (OFF) | Enable chat brief for v1 generation |
| `ITINERARY_CHAT_BRIEF_LOOKBACK_DAYS` | `"14"` | Chat lookback window |
| `ITINERARY_CHAT_BRIEF_MAX_MESSAGES` | `"200"` | Max messages to fetch |
| `ITINERARY_CHAT_BRIEF_MAX_CHARS` | `"6000"` | Max chars after formatting |
| `ITINERARY_CHAT_BRIEF_MODEL` | (uses `OPENAI_MODEL`) | Optional model override for summarization |

### Revision Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `ITINERARY_CHAT_BUCKETING` | `"0"` (OFF) | Enable relevance bucketing for revision chat |

### Token Guards

| Flag | Default | Purpose |
|------|---------|---------|
| `ITINERARY_MAX_PROMPT_TOKENS` | `"12000"` | Max estimated prompt tokens before truncation |

### Safe Fallback Behavior

All feature-flagged enhancements follow these principles:
1. **Flag OFF = unchanged behavior**: Default state matches pre-enhancement behavior
2. **Graceful degradation**: Failures in enhanced paths fall back to default behavior
3. **No silent data loss**: Failures are logged, not swallowed
4. **Additive only**: No breaking schema changes to existing data

---

## Token Management

### Estimation

Tokens are estimated as `ceil(text.length / 4)` (conservative for English text).

### Truncation Strategies

**For v1 generation:**
- If prompt exceeds limit, ideas are truncated: 10 → 5 → 3
- If still over limit after truncation, generation fails with user-friendly error

**For v2+ revision:**
- Truncation order: newIdeas (5 → 3 → 0) → feedback arrays (cap at 10 each)
- Current itinerary is never truncated (required for coherent revision)

### Why Truncation Exists

- LLM context windows have hard limits
- Overly long prompts reduce output quality
- Truncation is deterministic and predictable

---

## LLM Functions Reference

| Function | Purpose | Used By |
|----------|---------|---------|
| `summarizePlanningChat()` | Derive structured brief from chat | v1 generation (flag ON) |
| `generateItinerary()` | Create initial itinerary | v1 generation |
| `summarizeFeedback()` | Structure feedback + reactions + chat | v2+ revision |
| `reviseItinerary()` | Apply changes to existing itinerary | v2+ revision |

All functions:
- Use `fetchWithRetry()` for transient error handling
- Accept token guards via environment configuration
- Return `_meta` objects for observability
