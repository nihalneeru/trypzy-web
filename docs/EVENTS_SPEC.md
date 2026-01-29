# Trypzy Event System Specification

> **Status:** MVP Implementation Spec
> **Last Updated:** 2026-01-29
> **Schema Version:** 1

## 1. Purpose

This document defines Trypzy's event logging system for building a defensible data moat. The system captures **group coordination behavior** — how friend groups move from trip proposal to locked dates — which is data no competitor can replicate without building the same product.

### Moat Thesis

Trypzy's moat is **coordination intelligence**: behavioral patterns of how real friend groups successfully (or unsuccessfully) coordinate multi-party commitments. This data:

1. Doesn't exist elsewhere (born inside Trypzy)
2. Compounds over time (more circles → better predictions → higher completion rates)
3. Is group-level, not creepy individual profiling
4. Prioritizes negative signals (rejections, silence, stalls) over outcomes

---

## 2. Event Schema

### TripEvent (Core Schema)

```typescript
interface TripEvent {
  _id: ObjectId;

  // Versioning (for schema evolution)
  schemaVersion: 1;

  // Identity
  tripId: ObjectId;
  circleId: ObjectId;
  eventType: string;  // Namespaced: 'scheduling.window.suggested'

  // Actor
  actorId: ObjectId | null;  // null for system events
  actorRole: 'leader' | 'traveler' | 'system';

  // Timing
  timestamp: Date;      // Server clock (always)
  tripAgeMs: number;    // Date.now() - trip.createdAt.getTime()

  // Dedupe (optional, for retry-safe operations)
  idempotencyKey?: string;

  // Payload (event-specific, minimal — IDs only, no full documents)
  payload: Record<string, unknown>;

  // Causal linking (optional, for nudge correlation)
  context?: {
    precedingEventId?: ObjectId;
    latencyFromPrecedingMs?: number;
    sessionId?: string;
  };
}
```

### Field Rationale

| Field | Why It Exists |
|-------|---------------|
| `schemaVersion` | Enables schema evolution without breaking old events |
| `tripId` / `circleId` | Required for all queries; circleId denormalized for aggregation |
| `eventType` | Namespaced string for filtering and grouping |
| `actorId` | Who performed the action (null for system) |
| `actorRole` | Critical for leader/traveler analysis; can't derive from actorId alone |
| `timestamp` | When it happened (server time, never client) |
| `tripAgeMs` | Time since trip creation; essential for cohort analysis |
| `idempotencyKey` | Prevents duplicate events on retries |
| `payload` | Event-specific data; kept minimal |
| `context` | Links related events (e.g., nudge → action) |

### Payload Conventions

**DO:**
```typescript
payload: { windowId: "...", reaction: "cant" }
payload: { fromStatus: "scheduling", toStatus: "locked" }
```

**DO NOT:**
```typescript
payload: { window: { /* full window object */ } }  // No full documents
payload: { user: { name: "Alex", email: "..." } }  // No PII
payload: { chatMessage: "Let's do Feb 7-9" }       // No message bodies
```

### Idempotency Key Patterns

Use these canonical patterns to prevent duplicate events on retries:

| Event Type | Idempotency Key Pattern |
|------------|------------------------|
| `scheduling.window.suggested` | `${tripId}:${userId}:window:${windowId}` |
| `scheduling.window.supported` | `${tripId}:${userId}:${windowId}:support` |
| `scheduling.reaction.submitted` | `${tripId}:${userId}:${windowId}:reaction` |
| `traveler.participation.first_action` | `${tripId}:${userId}:first_action` |
| `traveler.participation.joined` | `${tripId}:${userId}:joined` |
| `traveler.participation.left` | `${tripId}:${userId}:left:${timestamp}` |

**Note:** Not all events need idempotency keys. Use them for actions that could be retried (network failures, double-clicks). Lifecycle events like `trip.lifecycle.created` typically don't need them since the trip creation itself is idempotent.

---

## 3. Event Taxonomy

### Naming Convention

```
<domain>.<entity>.<action>
```

Examples:
- `trip.lifecycle.created`
- `scheduling.window.suggested`
- `nudge.system.correlated_action`

### MVP Event Types

#### Trip Lifecycle

| Event | Trigger | Payload |
|-------|---------|---------|
| `trip.lifecycle.created` | POST /api/trips | `{ tripType, schedulingMode }` |
| `trip.lifecycle.status_changed` | Any status transition | `{ fromStatus, toStatus, triggeredBy: 'user'\|'system' }` |
| `trip.lifecycle.canceled` | Trip canceled | `{ daysSinceCreated, reason? }` |
| `trip.lifecycle.completed` | End date passed | `{ durationDays }` |

#### Scheduling (date_windows mode)

| Event | Trigger | Payload |
|-------|---------|---------|
| `scheduling.window.suggested` | User suggests dates | `{ windowId, precision, durationDays }` |
| `scheduling.window.supported` | User supports another's window | `{ windowId }` |
| `scheduling.window.proposed` | Leader proposes a window | `{ windowId }` |
| `scheduling.window.proposal_rejected` | Leader pivots to different window | `{ windowId, newWindowId? }` |
| `scheduling.reaction.submitted` | User reacts works/maybe/cant | `{ windowId, reaction: 'works'\|'maybe'\|'cant' }` |
| `scheduling.dates.locked` | Dates finalized | `{ windowId, overrideUsed: boolean, approvalCount, totalReactions }` |

#### Participation

| Event | Trigger | Payload |
|-------|---------|---------|
| `traveler.participation.joined` | User joins trip | `{ method: 'circle_member'\|'invite'\|'request' }` |
| `traveler.participation.left` | User leaves trip | `{ reason: 'voluntary'\|'removed' }` |
| `traveler.participation.first_action` | First non-join action | `{ actionType, hoursSinceJoin }` |
| `traveler.role.leader_changed` | Leadership transferred | `{ fromUserId, toUserId }` |

#### Nudges

| Event | Trigger | Payload |
|-------|---------|---------|
| `nudge.system.displayed` | Nudge shown in chat | `{ nudgeType, targetAudience }` |
| `nudge.system.correlated_action` | Action within 30min of nudge | `{ nudgeType, actionType, latencySeconds }` |

#### Itinerary (Optional MVP)

| Event | Trigger | Payload |
|-------|---------|---------|
| `itinerary.version.generated` | AI generates itinerary | `{ versionNumber }` |
| `itinerary.version.selected` | Leader selects version | `{ versionId }` |
| `itinerary.idea.added` | User adds idea | `{ ideaId }` |
| `itinerary.idea.liked` | User likes idea | `{ ideaId }` |

---

## 4. Database Setup

### Collection: `trip_events`

```javascript
db.createCollection("trip_events")
```

### Indexes

```javascript
// Primary: query by trip timeline
db.trip_events.createIndex({ tripId: 1, timestamp: 1 })

// Circle-level aggregation
db.trip_events.createIndex({ circleId: 1, timestamp: -1 })

// Event type filtering
db.trip_events.createIndex({ eventType: 1, timestamp: -1 })

// Idempotency (sparse unique)
db.trip_events.createIndex(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
)
```

---

## 5. Derived Aggregates

### TripCoordinationSnapshot (per trip)

Computed daily or on-demand. Enables fast queries without replaying events.

```typescript
interface TripCoordinationSnapshot {
  tripId: ObjectId;
  circleId: ObjectId;

  // Outcome
  outcome: 'active' | 'locked' | 'canceled' | 'abandoned';
  timeToOutcomeHours: number | null;

  // Scheduling metrics
  windowsSuggested: number;
  windowsSupported: number;
  reactionsCollected: number;
  cantReactionCount: number;  // Key conflict signal

  // Engagement
  uniqueActors: number;
  participationRate: number;  // uniqueActors / totalTravelers

  // Nudge effectiveness
  nudgesDisplayed: number;
  nudgesWithCorrelatedAction: number;

  computedAt: Date;
}
```

### CircleCoordinationProfile (per circle)

Computed daily. Longitudinal view of circle behavior.

```typescript
interface CircleCoordinationProfile {
  circleId: ObjectId;

  // Volume
  tripCount: number;
  completedTripCount: number;
  canceledTripCount: number;

  // Efficiency
  completionRate: number;  // completed / (completed + canceled)
  medianTimeToLockDays: number | null;

  // Participation
  avgParticipationRate: number;
  avgFirstActionDelayHours: number;

  // Leadership
  uniqueLeaderCount: number;
  leaderConcentration: number;  // 0-1: 1 = always same leader

  // Nudge effectiveness
  avgNudgesBeforeLock: number;

  updatedAt: Date;
}
```

### Collections

```javascript
db.createCollection("trip_coordination_snapshots")
db.trip_coordination_snapshots.createIndex({ tripId: 1 }, { unique: true })
db.trip_coordination_snapshots.createIndex({ circleId: 1, computedAt: -1 })

db.createCollection("circle_coordination_profiles")
db.circle_coordination_profiles.createIndex({ circleId: 1 }, { unique: true })
```

---

## 6. Implementation

### Event Emitter

```typescript
// lib/events/emit.ts

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/server/db';

interface EmitOptions {
  idempotencyKey?: string;
  precedingEventId?: string;
  latencyFromPrecedingMs?: number;  // Caller computes this when correlating events
  sessionId?: string;
}

export async function emitTripEvent(
  tripId: string | ObjectId,
  circleId: string | ObjectId,
  eventType: string,
  actorId: string | ObjectId | null,
  actorRole: 'leader' | 'traveler' | 'system',
  tripCreatedAt: Date,
  payload: Record<string, unknown>,
  options?: EmitOptions
): Promise<string | null> {
  const db = await getDb();

  const event = {
    schemaVersion: 1,
    tripId: new ObjectId(tripId),
    circleId: new ObjectId(circleId),
    eventType,
    actorId: actorId ? new ObjectId(actorId) : null,
    actorRole,
    timestamp: new Date(),
    tripAgeMs: Date.now() - tripCreatedAt.getTime(),
    payload,
    ...(options?.idempotencyKey && { idempotencyKey: options.idempotencyKey }),
    ...(options?.precedingEventId && {
      context: {
        precedingEventId: new ObjectId(options.precedingEventId),
        ...(options.latencyFromPrecedingMs != null && {
          latencyFromPrecedingMs: options.latencyFromPrecedingMs
        }),
        sessionId: options.sessionId,
      }
    })
  };

  try {
    const result = await db.collection('trip_events').insertOne(event);
    return result.insertedId.toString();
  } catch (err: any) {
    // Handle duplicate idempotencyKey gracefully
    if (err.code === 11000 && options?.idempotencyKey) {
      console.log(`[events] Duplicate event skipped: ${options.idempotencyKey}`);
      return null;
    }
    console.error(`[events] Failed to emit ${eventType}:`, err);
    throw err;
  }
}
```

### Event Types Enum

```typescript
// lib/events/types.ts

export const EVENT_TYPES = {
  // Trip lifecycle
  TRIP_CREATED: 'trip.lifecycle.created',
  TRIP_STATUS_CHANGED: 'trip.lifecycle.status_changed',
  TRIP_CANCELED: 'trip.lifecycle.canceled',
  TRIP_COMPLETED: 'trip.lifecycle.completed',

  // Scheduling
  WINDOW_SUGGESTED: 'scheduling.window.suggested',
  WINDOW_SUPPORTED: 'scheduling.window.supported',
  WINDOW_PROPOSED: 'scheduling.window.proposed',
  WINDOW_PROPOSAL_REJECTED: 'scheduling.window.proposal_rejected',
  REACTION_SUBMITTED: 'scheduling.reaction.submitted',
  DATES_LOCKED: 'scheduling.dates.locked',

  // Participation
  TRAVELER_JOINED: 'traveler.participation.joined',
  TRAVELER_LEFT: 'traveler.participation.left',
  TRAVELER_FIRST_ACTION: 'traveler.participation.first_action',
  LEADER_CHANGED: 'traveler.role.leader_changed',

  // Nudges
  NUDGE_DISPLAYED: 'nudge.system.displayed',
  NUDGE_CORRELATED_ACTION: 'nudge.system.correlated_action',

  // Itinerary
  ITINERARY_GENERATED: 'itinerary.version.generated',
  ITINERARY_SELECTED: 'itinerary.version.selected',
  IDEA_ADDED: 'itinerary.idea.added',
  IDEA_LIKED: 'itinerary.idea.liked',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
```

### Usage Pattern in API Routes

```typescript
// In app/api/[[...path]]/route.js

import { emitTripEvent } from '@/lib/events/emit';
import { EVENT_TYPES } from '@/lib/events/types';

// After successful mutation:
if (result.modifiedCount > 0) {
  const isLeader = userId === trip.createdBy;

  // Non-blocking for non-critical events
  emitTripEvent(
    tripId,
    trip.circleId,
    EVENT_TYPES.REACTION_SUBMITTED,
    userId,
    isLeader ? 'leader' : 'traveler',
    trip.createdAt,
    { windowId, reaction },
    { idempotencyKey: `${tripId}:${userId}:${windowId}:reaction` }
  ).catch(err => console.error('[events] Emission failed:', err));

  return NextResponse.json({ success: true });
}

// Best-effort blocking for critical events
try {
  await emitTripEvent(
    tripId,
    trip.circleId,
    EVENT_TYPES.DATES_LOCKED,
    userId,
    'leader',
    trip.createdAt,
    { windowId, overrideUsed, approvalCount }
  );
} catch (err) {
  // Log prominently but don't break user flow
  console.error('[events] CRITICAL event failed:', err, { tripId, eventType: 'scheduling.dates.locked' });
  // TODO: Add Sentry/monitoring alert here in production
  // Continue with API response — UX stability > event durability
}
```

### Write Strategy

**Policy: Best-effort durability with monitoring.** We try hard to write events, but never break user flow. Critical event failures are logged and monitored, not blocking.

| Event Category | Strategy | Rationale |
|----------------|----------|-----------|
| **Critical** (trip.lifecycle.created, scheduling.dates.locked, trip.lifecycle.canceled) | `await` the write, catch and log failures | Core timeline should be trustworthy, but UX > durability |
| **Non-critical** (reactions, supports, nudges) | Fire-and-forget with `.catch()` | Avoid latency spikes |

**Note:** If you need guaranteed durability (e.g., for billing events), you'd need a transactional outbox pattern. For coordination analytics, best-effort is acceptable.

### Nudge Correlation

**Architecture decision:** Two collections for nudges:

| Collection | Purpose | Retention |
|------------|---------|-----------|
| `nudge_events` | Short-lived correlation cache. Fast lookup for "was a nudge shown recently?" | TTL: 7 days (add TTL index) |
| `trip_events` | Long-term event ledger. `nudge.system.correlated_action` events live here. | Indefinite |

This separation exists because:
1. `nudge_events` already exists in the codebase (used by `lib/nudges/store.ts`)
2. Correlation lookups need fast, recent-only queries
3. The long-term ledger only needs the correlation outcome, not every nudge display

```typescript
// When user takes an action, check for recent nudge
async function checkNudgeCorrelation(
  tripId: string,
  userId: string,
  actionType: string,
  tripCreatedAt: Date,
  circleId: string
) {
  const db = await getDb();

  // Find nudge displayed to this user in last 30 minutes
  // Uses nudge_events (short-lived cache) for fast lookup
  const recentNudge = await db.collection('nudge_events').findOne({
    tripId: new ObjectId(tripId),
    userId: new ObjectId(userId),
    displayedAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
  });

  if (recentNudge) {
    const latencyMs = Date.now() - recentNudge.displayedAt.getTime();

    // Emit correlation to trip_events (long-term ledger)
    await emitTripEvent(
      tripId,
      circleId,
      EVENT_TYPES.NUDGE_CORRELATED_ACTION,
      userId,
      'traveler',
      tripCreatedAt,
      {
        nudgeType: recentNudge.nudgeType,
        actionType,
        latencySeconds: Math.round(latencyMs / 1000)
      },
      {
        precedingEventId: recentNudge._id.toString(),
        latencyFromPrecedingMs: latencyMs  // Now correctly computed by caller
      }
    );
  }
}
```

**TTL Index for nudge_events:**
```javascript
db.nudge_events.createIndex(
  { displayedAt: 1 },
  { expireAfterSeconds: 604800 }  // 7 days
)
```

### First-Action Tracking

```typescript
// Track whether user has taken first action on this trip
async function maybeEmitFirstAction(
  tripId: string,
  userId: string,
  actionType: string,
  tripCreatedAt: Date,
  circleId: string
) {
  const db = await getDb();

  // Check if first_action already emitted for this user on this trip
  const existing = await db.collection('trip_events').findOne({
    tripId: new ObjectId(tripId),
    actorId: new ObjectId(userId),
    eventType: EVENT_TYPES.TRAVELER_FIRST_ACTION
  });

  if (!existing) {
    // Get join time
    const participant = await db.collection('trip_participants').findOne({
      tripId: new ObjectId(tripId),
      userId: new ObjectId(userId)
    });

    const hoursSinceJoin = participant?.joinedAt
      ? (Date.now() - participant.joinedAt.getTime()) / (1000 * 60 * 60)
      : null;

    await emitTripEvent(
      tripId,
      circleId,
      EVENT_TYPES.TRAVELER_FIRST_ACTION,
      userId,
      'traveler',
      tripCreatedAt,
      { actionType, hoursSinceJoin: hoursSinceJoin ? Math.round(hoursSinceJoin) : null },
      { idempotencyKey: `${tripId}:${userId}:first_action` }
    );
  }
}
```

---

## 7. Anti-Patterns (Do Not Do)

| Anti-Pattern | Risk | Instead |
|--------------|------|---------|
| Log chat message bodies | PII in event store | Log `chat.message.sent` with `{ lengthChars }` only |
| Store full user/trip objects in payload | Schema drift, bloat | Store IDs only, join at query time |
| Pre-compute aggregates in events | Blocks reprocessing | Store raw facts, compute aggregates in batch |
| Emit events for GET requests | Noise, no signal | Only emit for state changes |
| Block API response on all event writes | User-facing latency | Block only for critical events |
| Use client timestamps | Clock skew | Always use server time |
| Create new UX to collect data | Violates natural behavior principle | Instrument existing flows |

---

## 8. Privacy & Retention

### Current Stance (Document Now, Implement Later)

- Events retained indefinitely
- On user deletion: set `actorId = null`, keep `actorRole` and anonymized data
- Events never exposed to users directly
- Aggregates are non-identifying

### GDPR Considerations

- `actorId` is the only PII field
- Nullifying `actorId` preserves aggregate value while respecting deletion
- Consider adding `anonymizedAt` timestamp when implementing deletion

---

## 9. Defer List (Post-MVP)

| Item | Reason to Defer |
|------|-----------------|
| Real-time analytics dashboard | Internal tooling, not user-facing |
| ML model training pipeline | Need 6+ months of data |
| Cross-circle pattern learning | Privacy implications need careful design |
| Session-level funnel tracking | Adds complexity, limited MVP value |
| A/B test infrastructure | Premature optimization |
| Event streaming (Kafka) | MongoDB fine for MVP volume |
| User-facing "trip health" scores | Could create anxiety, needs careful UX |

---

## 10. Implementation Checklist

### Week 0-1: Infrastructure

- [ ] Create `trip_events` collection with indexes
- [ ] Create `lib/events/types.ts` (event type enum)
- [ ] Create `lib/events/emit.ts` (emitter function)
- [ ] Add reference to this spec in `CLAUDE.md`

### Week 1-2: Tier 1 Events

- [ ] `trip.lifecycle.created` — in POST /api/trips
- [ ] `trip.lifecycle.status_changed` — in all status transitions
- [ ] `trip.lifecycle.canceled` — in POST /api/trips/:id/cancel
- [ ] `scheduling.window.suggested` — in POST /api/trips/:id/date-windows
- [ ] `scheduling.window.supported` — in POST /api/trips/:id/date-windows/:id/support
- [ ] `scheduling.reaction.submitted` — in POST /api/trips/:id/date-windows/:id/react
- [ ] `scheduling.dates.locked` — in POST /api/trips/:id/lock-proposed
- [ ] `traveler.participation.joined` — in join logic
- [ ] `traveler.participation.left` — in POST /api/trips/:id/leave

### Week 2: High-Value Signals

- [ ] `traveler.participation.first_action` — call `maybeEmitFirstAction()` on relevant actions
- [ ] `traveler.role.leader_changed` — in POST /api/trips/:id/transfer-leadership

### Week 2-3: Nudge Correlation

- [ ] Ensure `nudge_events` collection logs nudge displays
- [ ] Add `checkNudgeCorrelation()` calls to relevant action handlers
- [ ] Emit `nudge.system.correlated_action` when correlation found

### Week 3: Aggregation

- [ ] Create `trip_coordination_snapshots` collection
- [ ] Create `circle_coordination_profiles` collection
- [ ] Build daily aggregation job (can be simple cron or scheduled API route)

### Ongoing

- [ ] PR review checklist: "Does this mutation emit an event?"
- [ ] Monitor event volume and error rates
- [ ] Review aggregates monthly for usefulness

---

## 11. Example Events

### Trip Created

```json
{
  "schemaVersion": 1,
  "tripId": "507f1f77bcf86cd799439011",
  "circleId": "507f1f77bcf86cd799439012",
  "eventType": "trip.lifecycle.created",
  "actorId": "507f1f77bcf86cd799439013",
  "actorRole": "leader",
  "timestamp": "2026-01-29T14:30:00.000Z",
  "tripAgeMs": 0,
  "payload": {
    "tripType": "collaborative",
    "schedulingMode": "date_windows"
  }
}
```

### Window Suggested

```json
{
  "schemaVersion": 1,
  "tripId": "507f1f77bcf86cd799439011",
  "circleId": "507f1f77bcf86cd799439012",
  "eventType": "scheduling.window.suggested",
  "actorId": "507f1f77bcf86cd799439014",
  "actorRole": "traveler",
  "timestamp": "2026-01-30T10:15:00.000Z",
  "tripAgeMs": 71100000,
  "idempotencyKey": "507f1f77bcf86cd799439011:507f1f77bcf86cd799439014:window:abc123",
  "payload": {
    "windowId": "abc123",
    "precision": "exact",
    "durationDays": 3
  }
}
```

### Nudge Correlated Action

```json
{
  "schemaVersion": 1,
  "tripId": "507f1f77bcf86cd799439011",
  "circleId": "507f1f77bcf86cd799439012",
  "eventType": "nudge.system.correlated_action",
  "actorId": "507f1f77bcf86cd799439014",
  "actorRole": "traveler",
  "timestamp": "2026-01-30T10:20:00.000Z",
  "tripAgeMs": 71400000,
  "payload": {
    "nudgeType": "first_availability_prompt",
    "actionType": "window_suggested",
    "latencySeconds": 847
  },
  "context": {
    "precedingEventId": "507f1f77bcf86cd799439099",
    "latencyFromPrecedingMs": 847000
  }
}
```

---

## Appendix: Quick Reference

### Critical Events (Block on Write)

- `trip.lifecycle.created`
- `trip.lifecycle.canceled`
- `scheduling.dates.locked`

### High-Value Negative Signals

- `scheduling.reaction.submitted` with `reaction: 'cant'`
- `traveler.participation.left`
- `scheduling.window.proposal_rejected`
- Absence of `traveler.participation.first_action` (silence)

### Moat-Critical Events

- `traveler.participation.first_action`
- `nudge.system.correlated_action`
- `scheduling.window.supported` (distinct from suggesting)
- All reaction events (works/maybe/cant distribution)
