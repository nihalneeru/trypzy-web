# Internal Systems Reference

Detailed documentation for Tripti's internal subsystems. Linked from [CLAUDE.md](../CLAUDE.md) Section 10.

---

## Nudge Engine

A nudge engine is **active** in the current codebase.

**How it works**:
- Evaluates trip state (metrics, viewer context) and produces nudges via `computeNudges()` in `lib/nudges/NudgeEngine.ts`
- Surfaced as **system messages in trip chat** (channel: `chat_card`) with `bg-brand-sand` styling
- Nudges are **informational, non-blocking, and role-aware** — celebrate progress, clarify next steps without pressuring
- Dedupe: server-side via `nudge_events` collection (cooldown-based) and `metadata.eventKey` on chat messages
- Client triggers evaluation via `GET /api/trips/:tripId/nudges` on trip load (fire-and-forget in `CommandCenterV3.tsx`)
- Feature flag: `NEXT_PUBLIC_NUDGES_ENABLED` (set to `'false'` to disable)

**Key files**:
- `lib/nudges/NudgeEngine.ts` — Pure function engine, 8 nudge types
- `lib/nudges/types.ts` — Type definitions (NudgeType, NudgeChannel, NudgeAudience)
- `lib/nudges/copy.ts` — User-facing text templates and emoji helpers
- `lib/nudges/metrics.ts` — `computeTripMetrics()` from trip + windows + participants
- `lib/nudges/store.ts` — Dedupe, cooldown, chat message persistence
- `docs/NUDGE_ENGINE_SURFACING.md` — Discovery notes and architecture

**Do NOT** document exact rules, thresholds, or cooldown durations in user-facing docs. The engine is intentionally opaque to users.

---

## Event System (Data Moat)

An event logging system for capturing group coordination behavior. Foundation of Tripti's data moat.

**Core concept**: Log state-changing actions as immutable events. Learn how groups coordinate without adding new UX flows.

**Architecture**:
- **Critical events** (trip created, dates locked, canceled): `await` the write
- **Non-critical events** (window suggested, reaction): fire-and-forget
- **Idempotency**: Duplicate events silently skipped via unique index on `idempotencyKey`

**Key files**:
```
lib/events/
├── index.js              # Public API exports
├── types.js              # EVENT_TYPES enum (source of truth)
├── emit.js               # emitTripEvent(), emitCriticalEvent(), emitNonCriticalEvent()
├── instrumentation.js    # High-level helpers (emitTripCreated, emitWindowSuggested, etc.)
├── firstAction.js        # First-action tracking per traveler
├── nudgeCorrelation.js   # Links nudges to subsequent actions (30min window)
├── aggregates.js         # Daily aggregation jobs
└── indexes.js            # Index management
```

**Instrumented endpoints** (all emit events automatically):
- Trip creation, status changes, cancellation
- Date window suggested, supported, proposed, withdrawn
- Reaction submitted (works/maybe/cant)
- Dates locked, traveler joined/left, leader changed

**High-value signals**:
- `traveler.participation.first_action` — early engagement predicts completion
- `scheduling.reaction.submitted` with `reaction: 'cant'` — conflict signal
- `nudge.system.correlated_action` — measures nudge effectiveness
- Silence (absence of events) — the strongest negative signal

**Collections**:
- `trip_events` — Append-only event log (indexes: `tripId+timestamp`, `circleId+eventType+timestamp`, `idempotencyKey`)
- `nudge_events` — Short-lived correlation cache (TTL 7 days)
- `trip_coordination_snapshots` — Per-trip daily aggregates
- `circle_coordination_profiles` — Per-circle longitudinal behavior

**Daily aggregation job**:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://tripti.ai/api/jobs/aggregates
```

**Reference**: See `docs/EVENTS_SPEC.md` for full schema and taxonomy.

---

## Admin Debug Endpoints

Internal endpoints for investigating user issues during beta. Protected by `x-admin-debug-token` header. Returns 404 (not 401) if token is missing/invalid to prevent endpoint discovery.

**Event Query**:
```
GET /api/admin/events?tripId=abc123&limit=100
```
Query params: `tripId`, `circleId`, `actorId`, `eventType`, `since`, `until`, `limit`. Requires at least `tripId` or `circleId`. Default limit 200, max 1000.

**Trip Health Check**:
```
GET /api/admin/events/trips/:tripId/health
```
Returns instrumentation integrity: `totalEvents`, `lastEventAt`, `hasTripCreated`, `hasAnySchedulingActivity`, `warnings[]`.

**Key files**:
- `app/api/admin/events/route.js` — Event query endpoint
- `app/api/admin/events/trips/[tripId]/health/route.js` — Health check endpoint

---

## Itinerary LLM Pipeline

The itinerary system uses LLM calls for generation and revision. Key infrastructure in `lib/server/llm.js`.

**Key files**:
- `lib/server/llm.js` — LLM functions (generateItinerary, reviseItinerary, summarizeFeedback, summarizePlanningChat)
- `lib/server/fetchWithRetry.js` — Retry wrapper with exponential backoff
- `lib/server/tokenEstimate.js` — Token estimation and prompt size guards
- `docs/ITINERARY_LLM_PIPELINE.md` — Full pipeline documentation

**Core functions**:
| Function | Purpose |
|----------|---------|
| `generateItinerary()` | Create v1 from ideas + trip metadata |
| `reviseItinerary()` | Apply feedback/reactions to create v2+ |
| `summarizeFeedback()` | Structure feedback + reactions + chat for revision |
| `summarizePlanningChat()` | Derive structured brief from planning chat (v1 only, flagged) |

**Retry logic** (`fetchWithRetry`): Exponential backoff (500ms base, 2 retries max). Retries on HTTP 429, 5xx, network errors.

**Token guards** (`tokenEstimate.js`): Estimation: `ceil(text.length / 4)`. Default max: 12000 tokens (configurable via `ITINERARY_MAX_PROMPT_TOKENS`). Truncation: ideas 10 → 5 → 3 (generation), newIdeas → feedback arrays (revision).

**Reaction aggregation** (in `summarizeFeedback`):
- Exclusive categories (pace, budget): majority wins or "SPLIT" on tie
- Non-exclusive categories (focus, logistics): aggregated with counts
- Reactions are HARD CONSTRAINTS in revision prompts

**Feature flags**:
| Flag | Default | Purpose |
|------|---------|---------|
| `ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE` | **ON** | Chat brief for v1 generation (set `0` to disable) |
| `ITINERARY_CHAT_BRIEF_LOOKBACK_DAYS` | 14 | Chat lookback window |
| `ITINERARY_CHAT_BRIEF_MAX_MESSAGES` | 200 | Max messages for brief |
| `ITINERARY_CHAT_BRIEF_MAX_CHARS` | 6000 | Max chars after formatting |
| `ITINERARY_CHAT_BRIEF_MODEL` | (uses OPENAI_MODEL) | Optional model override |
| `ITINERARY_CHAT_BUCKETING` | **ON** | Relevance bucketing for revision chat (set `0` to disable) |
| `ITINERARY_MAX_PROMPT_TOKENS` | 12000 | Max estimated prompt tokens |

**Chat brief for v1**: Pre-generation step summarizes planning chat → structured brief (mustDos, avoid, preferences, constraints, openQuestions). Injected into prompt. Fallback: continues without brief on failure.

**Chat bucketing for revision**: Separates chat into "Relevant" and "Other" (keyword matching OR length > 20 chars). Limits: 20 relevant + 10 other messages.

**Version rules**: Max 3 versions per trip (`ITINERARY_CONFIG.MAX_VERSIONS`). Latest version is always active.

**Revise button**: Enabled when feedback form entries OR reactions exist for latest version. UI shows count or "Waiting for feedback or reactions".

**Observability** (`llmMeta` on `itinerary_versions`): Stores model, timestamps, token estimates, counts (ideas, feedback, reactions, chat messages, chat brief stats). Does NOT store raw prompts, chat content, or PII.
