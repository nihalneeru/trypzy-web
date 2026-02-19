# Push Notifications Implementation Spec

> **Status**: Final (v2 — hybrid architecture)
> **Approach**: Hybrid — event-driven inline dispatch + trip-load evaluation + 1 daily Vercel cron
> **Platforms**: iOS (APNS) + Android (FCM) and Web (Web Push API + VAPID)
> **Hosting**: Vercel Hobby plan (2 cron jobs, 1x/day each)

---

## 1. Architecture Overview

### 1.1 Platform Strategy: APNS for iOS + FCM for Android + Web Push for Browsers

| Platform | Technology | Server Library | Token Format | Phase |
|---|---|---|---|---|
| **iOS** | APNS (direct) | `@parse/node-apn` | APNS device token (~64 hex chars) | Phase 0 |
| **Android** | FCM (native) | `firebase-admin` | FCM registration token (~150 chars) | Phase 0 |
| **Web** | Web Push API + VAPID | `web-push` | PushSubscription JSON (endpoint + p256dh + auth) | Phase 3 |

**Why this approach (Option B — hybrid)**:
- **Zero iOS native changes** — Capacitor's `@capacitor/push-notifications` already returns APNS tokens on iOS. No Firebase SDK, no `GoogleService-Info.plist`, no Podfile changes, no App Store resubmission for push
- **`@parse/node-apn`** is actively maintained (replaces unmaintained `apn` v2.2.0, last release 8+ years ago)
- Android already has conditional `google-services` plugin support in `build.gradle` — near-zero native setup
- Web Push uses the W3C standard — no Firebase client SDK needed (saves ~100KB)
- Two server send paths (APNS + FCM) routed by `provider` field on token — clean separation

**Why NOT FCM-for-all (Option A)**:
- Requires Firebase iOS SDK init in `AppDelegate.swift` + `GoogleService-Info.plist` + Podfile changes
- Requires App Store resubmission just to change how tokens are generated
- Adds Firebase as iOS runtime dependency for a single feature
- FCM migration sequencing is fragile (old APNS tokens coexist with new FCM tokens)

### 1.2 Delivery Channels

Push notifications fire from three trigger points:

| Trigger Type | When | Examples | Infra Cost |
|---|---|---|---|
| **Inline (event-driven)** | Immediately after an API mutation | Trip created, dates proposed, dates locked, join request | Zero — runs in the same request |
| **Trip-load evaluation** | When any traveler opens a trip | 7-day reminder, trip started, momentum reminder | Zero — piggybacks on existing nudge eval |
| **Daily cron sweep** | Once/day at 9am UTC | Catch missed time-based + stall notifications | 1 Vercel cron slot |

### 1.3 Delivery Pipeline

```
API mutation / Trip load / Cron sweep
  |
  v
pushRouter(db, { type, tripId, trip, context })
  |
  |-- Copy lookup: PUSH_COPY[type](context) --> { title, body }
  |-- Audience resolution: resolveTargetUsers(db, type, trip, context) --> userId[]
  |     (filters out left/removed travelers via isActiveTraveler logic)
  |-- Per-user loop:
  |     |-- Dedupe check: atomic upsert on push_events (skip if exists)
  |     |-- Daily cap check: count push_events today (skip if >= 3, P0 exempt)
  |     |-- Deep link: buildDeepLink(tripId, overlay?) --> { tripId, overlay }
  |     |-- Queue for send
  |-- Parallel send: sendPushBatch(db, tokens, { title, body, data })
        |
        |-- Fetch tokens from push_tokens (all devices per user)
        |-- Route by provider field:
        |     |-- provider: 'apns' --> apnProvider.send(notification)  (iOS)
        |     |-- provider: 'fcm'  --> admin.messaging().sendEach()   (Android)
        |     |-- provider: 'web'  --> webpush.sendNotification()     (Phase 3)
        |-- Prune invalid tokens (APNS: status 410; FCM: registration-token-not-registered)
```

### 1.4 Global Guardrails

- **Max 3 push notifications per user per day** (P0 exempt from cap)
- **Daily cap uses UTC midnight** (known limitation — user-local time requires timezone storage, Phase 3+)
- **Soft dependency**: All push code fails silently if APNS/Firebase not configured
- **Idempotent dedupe**: Every push uses atomic `$setOnInsert` upsert on `push_events` — no race conditions
- **Parallel sends**: All APNS/FCM sends use `Promise.allSettled()` — never sequential
- **P0 inline dispatches are `await`ed** — Vercel serverless can terminate before non-awaited promises resolve. P1 inline dispatches are fire-and-forget (`.catch(console.error)`)
- **Foreground behavior**: Default OS behavior (banner shown). No in-app interception — user sees the state change via chat polling anyway.

---

## 2. Platform Setup (Phase 0)

### 2.1 iOS Setup (Zero Native Changes)

**No native changes required.** Capacitor's `@capacitor/push-notifications` plugin already:
- Requests notification permission
- Returns raw APNS device tokens
- Handles `pushNotificationReceived` and `pushNotificationActionPerformed` events

The existing `native-bridge/page.jsx` registration flow sends the APNS token to `POST /api/push/register`. The only change is adding the `provider` field (see Section 2.5).

**APNS auth key**: The existing `.p8` file (Apple Push Notification Authentication Key) is used directly by `@parse/node-apn` on the server. No need to upload it to Firebase Console.

### 2.2 Android Native Changes

**Files to modify**:
- `native/android/app/google-services.json` — Add file (download from Firebase Console)
- `native/android/app/build.gradle` — Add `implementation 'com.google.firebase:firebase-messaging'` (the `apply plugin: 'com.google.gms.google-services'` block is already conditionally present at lines 47-54)

**Firebase project setup for Android only**:
1. Create Firebase project in Firebase Console
2. Register Android app (`ai.tripti.app`) — download `google-services.json`
3. Generate Firebase Admin SDK service account key — base64-encode for `FIREBASE_SERVICE_ACCOUNT_JSON` env var
4. No iOS app registration needed in Firebase

### 2.3 Server-Side Changes

**Replace `apn` with `@parse/node-apn` (iOS) + `firebase-admin` (Android)**:

```javascript
// lib/push/sendPush.js — new implementation
import apn from '@parse/node-apn'
import admin from 'firebase-admin'

// ============ APNS Provider (iOS) ============

let _apnProvider = null
function getApnProvider() {
  if (_apnProvider) return _apnProvider
  const keyBase64 = process.env.APNS_KEY_BASE64
  if (!keyBase64) return null  // APNS not configured — skip silently
  _apnProvider = new apn.Provider({
    token: {
      key: Buffer.from(keyBase64, 'base64'),
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
    },
    production: process.env.NODE_ENV === 'production',
  })
  return _apnProvider
}

// ============ Firebase App (Android) ============

function getFirebaseApp() {
  if (admin.apps.length) return admin.apps[0]  // Hot-reload guard
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!encoded) return null  // FCM not configured — skip silently
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString())
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
}

// ============ Unified Send ============

export async function sendPush(db, userIds, { title, body, data }) {
  // Fetch ALL tokens for target users (supports multiple devices)
  const tokens = await db.collection('push_tokens')
    .find({ userId: { $in: userIds }, provider: { $in: ['apns', 'fcm'] } })
    .toArray()

  if (tokens.length === 0) return

  // Split by provider
  const apnsTokens = tokens.filter(t => t.provider === 'apns')
  const fcmTokens = tokens.filter(t => t.provider === 'fcm')

  const results = await Promise.allSettled([
    sendApns(db, apnsTokens, { title, body, data }),
    sendFcm(db, fcmTokens, { title, body, data }),
  ])

  // Log any failures (non-blocking)
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[push] ${i === 0 ? 'APNS' : 'FCM'} batch failed:`, r.reason?.message)
    }
  })
}

async function sendApns(db, tokens, { title, body, data }) {
  if (tokens.length === 0) return
  const provider = getApnProvider()
  if (!provider) return

  const results = await Promise.allSettled(tokens.map(t => {
    const note = new apn.Notification()
    note.alert = { title, body }
    note.sound = 'default'
    note.topic = process.env.APNS_BUNDLE_ID || 'ai.tripti.app'
    note.threadId = data?.tripId || undefined  // Group by trip in notification center
    if (data) note.payload = data
    return provider.send(note, t.token)
  }))

  // Prune invalid tokens (status 410 = unregistered)
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.failed?.length > 0) {
      const failure = r.value.failed[0]
      if (failure.status === '410' || failure.response?.reason === 'Unregistered') {
        db.collection('push_tokens').deleteOne({ _id: tokens[i]._id }).catch(() => {})
      }
    }
  })
}

async function sendFcm(db, tokens, { title, body, data }) {
  if (tokens.length === 0) return
  const app = getFirebaseApp()
  if (!app) return

  const messages = tokens.map(t => ({
    token: t.token,
    notification: { title, body },
    data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {},
    android: { priority: 'high', notification: { sound: 'default' } },
  }))

  const results = await admin.messaging().sendEach(messages)

  // Prune invalid tokens
  results.responses.forEach((res, i) => {
    if (res.error?.code === 'messaging/registration-token-not-registered' ||
        res.error?.code === 'messaging/invalid-registration-token') {
      db.collection('push_tokens').deleteOne({ _id: tokens[i]._id }).catch(() => {})
    }
  })
}
```

### 2.4 Multi-Device Token Storage Fix

**Current problem**: `push_tokens` uses `updateOne({ userId })` with upsert — one token per user. Second device overwrites first.

**Fix — Register endpoint**: Change upsert key from `{ userId }` to `{ userId, token }`, add `provider` field:

```javascript
// POST /api/push/register handler — updated
const platform = body.platform || 'ios'
const provider = platform === 'android' ? 'fcm' : 'apns'  // iOS = APNS token, Android = FCM token

await db.collection('push_tokens').updateOne(
  { userId, token },  // was: { userId }
  { $set: { userId, token, platform, provider, updatedAt: new Date().toISOString() },
    $setOnInsert: { createdAt: new Date().toISOString() } },
  { upsert: true }
)
```

**Fix — Unregister endpoint**: `DELETE /api/push/register` must accept `{ token }` in the request body and delete by `{ userId, token }` (not just `{ userId }`). Without this, logging out on one device removes a random token from multi-device users:

```javascript
// DELETE /api/push/register handler — updated
const { token } = await request.json()
await db.collection('push_tokens').deleteOne({ userId: auth.user.id, token })  // was: { userId }
```

**Unregister on logout**: The client must call `DELETE /api/push/register` with the current device token before clearing the auth session. Add this to the logout flow in the app.

### 2.5 Android Platform Detection Fix

The existing `native-bridge/page.jsx` hardcodes `platform: 'ios'`. Fix:

```javascript
// native-bridge/page.jsx — updated registration
const platform = window.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'ios'
// ... in the registration listener:
body: JSON.stringify({ token: pushToken.value, platform })
```

### 2.6 Environment Variables

**Keep** (still needed for direct APNS):
```env
APNS_KEY_BASE64=...            # Base64-encoded .p8 auth key
APNS_KEY_ID=...                # Key ID from Apple Developer Console
APNS_TEAM_ID=...               # Team ID from Apple Developer Console
APNS_BUNDLE_ID=ai.tripti.app  # iOS bundle ID (optional, defaults in code)
```

**Add**:
```env
FIREBASE_SERVICE_ACCOUNT_JSON=...   # Base64-encoded Firebase Admin SDK service account JSON (Android only)

# Phase 3 (Web Push):
# VAPID_PUBLIC_KEY=...
# VAPID_PRIVATE_KEY=...
# VAPID_SUBJECT=mailto:hello@tripti.ai
```

**Keep**:
```env
CRON_SECRET=...                     # Required (mandatory) for /api/jobs/push-sweep
```

---

## 3. New Files

### `lib/push/pushRouter.js`

Central dispatcher. Every push notification (except legacy nudge-triggered pushes) goes through this function.

```javascript
/**
 * Route a push notification through the pipeline.
 *
 * Steps:
 * 1. Look up copy from PUSH_COPY registry
 * 2. Resolve target user IDs (filters left/removed travelers)
 * 3. Per-user: atomic dedupe check + daily cap check
 * 4. Build deep link payload
 * 5. Send to eligible users in parallel via sendPush()
 *
 * Each step has its own try/catch with structured logging:
 *   [push:{type}] step failed for tripId={tripId}: {error}
 *
 * @param {object} db - MongoDB instance
 * @param {object} opts
 * @param {string} opts.type - Push type (e.g., 'trip_created_notify')
 * @param {string} opts.tripId
 * @param {object} opts.trip - Full trip object
 * @param {object} [opts.context] - Type-specific context (actorName, dates, etc.)
 * @returns {Promise<{ sent: number, suppressed: number, failed: number }>}
 */
export async function pushRouter(db, { type, tripId, trip, context = {} }) { ... }
```

### `lib/push/pushCopy.js`

All push notification copy. Each entry is a function receiving `(context, { userId, trip })` and returning `{ title, body }`. The second argument enables per-user copy variants (e.g., `dates_locked` shows different copy for leader vs travelers by checking `trip.createdBy === userId`).

**Convention**: Title is always the trip name (more useful than "Tripti" when scanning notification list). Subtitle "Tripti" is set via APNS `alert.subtitle` / FCM `notification.tag`.

### `lib/push/pushAudience.js`

Audience resolution. Maps notification type to target user IDs.

**Critical**: Must replicate `isActiveTraveler()` logic — for collaborative trips, check both `memberships` (circleId, status !== 'left') AND `trip_participants` (tripId, status !== 'left'/'removed'). Extract shared utility function `getActiveTravelerIds(db, trip)` that both `pushAudience.js` and the API route's `isActiveTraveler()` can use.

### `lib/push/pushDedupe.js`

Atomic dedupe and daily cap logic using `push_events` collection.

**Dedupe** uses atomic `$setOnInsert` upsert (not findOne-then-insert):

```javascript
export async function tryRecordPush(db, { userId, dedupeKey, pushType, tripId }) {
  const result = await db.collection('push_events').updateOne(
    { userId, dedupeKey },
    { $setOnInsert: { userId, dedupeKey, pushType, tripId, sentAt: new Date() } },
    { upsert: true }
  )
  return result.upsertedCount > 0  // true = not a duplicate, safe to send
}
```

**Daily cap** (UTC-based, known limitation):

```javascript
export async function isDailyCapped(db, userId) {
  // Note: Uses UTC midnight. A user in PST could receive up to 6 pushes
  // in a 24hr window across the UTC boundary. Acceptable for beta.
  // Fix: Switch to user-local midnight when timezone storage is added.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const count = await db.collection('push_events').countDocuments({
    userId,
    sentAt: { $gte: todayStart },
  })
  return count >= 3
}
```

### `lib/push/pushDeepLink.js`

Builds deep link payload for Capacitor / web routing.

### `app/api/jobs/push-sweep/route.js`

Daily cron endpoint. `CRON_SECRET` is **mandatory** (returns 500 if not set, unlike the optional check in `/api/jobs/aggregates`).

---

## 4. Modified Files

### `lib/push/sendPush.js`

**Changes**:
- Replace `apn` with `@parse/node-apn` for iOS + `firebase-admin` for Android (see section 2.3)
- Extract `sendPush(db, userIds, { title, body, data })` as general-purpose function
- Route by `provider` field: APNS tokens via `@parse/node-apn`, FCM tokens via `firebase-admin`
- Sends use `Promise.allSettled()` for parallel delivery
- No `badge` count on APNS (never increments/clears properly — remove entirely)
- iOS notifications grouped by trip using `threadId: tripId`
- **Rewrite `sendPushForNudge()`** to delegate to the new `sendPush()` function (the old code uses the `apn` package directly, which is being removed). It remains a separate path that calls `sendPush()` directly — does NOT route through `pushRouter()`. This avoids double-dedupe since the nudge engine already has its own dedupe via `nudge_events`.

### `lib/push/pushEligible.js`

**Changes**:
- Remove `dates_locked` from `PUSH_ELIGIBLE_TYPES` (it moves to inline dispatch via `pushRouter`)
- Keep `leader_can_lock_dates` and `leader_ready_to_propose` in the nudge path for now (they are evaluated by the nudge engine and sent via `sendPushForNudge`)

### `app/api/[[...path]]/route.js`

**Inline dispatch points** — P0 types are `await`ed (Vercel serverless can terminate non-awaited promises); P1 types use `.catch(console.error)`:

| Endpoint | Push Type | Priority | Condition |
|---|---|---|---|
| `POST /api/trips` | `trip_created_notify` | P0 | After successful insert |
| `POST /api/trips/:id/date-windows` | `first_dates_suggested` | P0 | Only when count of windows for trip === 1 |
| `POST /api/trips/:id/date-windows/:wid/support` | `window_supported_author` | P1 | Skip if supporter === author |
| `POST /api/trips/:id/proposed-window` | `dates_proposed_by_leader` | P0 | After successful creation |
| `POST /api/trips/:id/lock-proposed` | `dates_locked` | P0 | After successful lock |
| `POST /api/trips/:id/cancel` | `trip_canceled` | P0 | After successful cancel |
| `POST /api/trips/:id/itinerary/ideas` | `first_idea_contributed` | P1 | Only when count of ideas for trip === 1 |
| `POST /api/trips/:id/itinerary/generate` | `itinerary_generated` | P1 | After successful generation |
| `POST /api/trips/:id/join-requests` | `join_request_received` | P0 | After successful insert (201) |
| Join request approval endpoint | `join_request_approved` | P1 | After status set to approved |
| `POST /api/trips/:id/transfer-leadership` | `leader_transferred` | P1 | After successful transfer |
| `POST /api/trips/:id/expenses` | `expense_added` | P1 | After successful insert |
| Accommodation select endpoint | `accommodation_selected` | P1 | After successful selection |

### `app/api/[[...path]]/route.js` — GET `/api/trips/:id/nudges`

**Trip-load push evaluation** — after existing nudge computation, also check:

| Push Type | Condition |
|---|---|
| `prep_reminder_7d` | `lockedStartDate` is 5–7 days from today |
| `trip_started` | `lockedStartDate` is today (±12hr tolerance) |
| `collecting_momentum_reminder` | Trip in `scheduling` 48+ hours, <50% response rate, viewer hasn't participated |

All evaluated with atomic dedupe — fire at most once per trip per user.

### Deep Link Handling

**Problem identified by Codex**: The `pushNotificationActionPerformed` listener was placed in `native-bridge/page.jsx` which unmounts after navigation. Also, `window.location.href` causes a full page reload, losing unsaved overlay state.

**Fix**: Register the listener at the app root level and use client-side navigation:

1. Create `components/common/PushHandler.jsx` — mounted in root layout, registers Capacitor listener once
2. Use Next.js `router.push()` instead of `window.location.href`
3. If user is already on the target trip, just open the overlay without navigating
4. `CommandCenterV3.tsx` reads `?overlay=` from URL params on mount, auto-opens overlay, then cleans URL with `replaceState`

### `vercel.json` (new file)

```json
{
  "crons": [
    {
      "path": "/api/jobs/push-sweep",
      "schedule": "0 9 * * *"
    }
  ]
}
```

Note: This uses 1 of 2 Hobby plan cron slots. The existing `/api/jobs/aggregates` is NOT a Vercel cron — it is triggered externally. The second slot remains unallocated.

---

## 5. Database Changes

### New Collection: `push_events`

Tracks every push notification sent. Used for atomic dedupe, daily cap, and analytics.

```javascript
{
  // Written at send time:
  userId: string,         // Recipient
  dedupeKey: string,      // e.g., 'trip_created:tripId:userId'
  pushType: string,       // e.g., 'trip_created_notify'
  tripId: string,
  sentAt: Date,           // Date type for TTL + daily cap

  // NOT stored (per Codex review — reconstruct from pushType if needed):
  // title, body, deepLink
}
```

**Indexes**:
- `{ userId: 1, dedupeKey: 1 }` — atomic dedupe upsert (unique)
- `{ userId: 1, sentAt: -1 }` — daily cap count query
- `{ sentAt: 1 }` — TTL index, expire after 30 days

### Existing Collection: `push_tokens`

**Schema change**: Support multiple devices per user + `provider` field for platform routing.

```javascript
{
  userId: string,
  token: string,           // APNS device token (iOS) or FCM registration token (Android) or 'web:endpoint_hash' (Phase 3)
  platform: 'ios' | 'android' | 'web',
  provider: 'apns' | 'fcm' | 'web',   // Server-side routing key (iOS→apns, Android→fcm)
  // Phase 3 (web only):
  subscription: { endpoint, keys: { p256dh, auth } } | null,
  createdAt: string,
  updatedAt: string,
}
```

**Index change**: Unique index on `{ userId: 1, token: 1 }` (was effectively `{ userId: 1 }`).

**Why `provider` separate from `platform`**: Future-proofing. If we ever migrate iOS to FCM (Option A), we change `provider` from `'apns'` to `'fcm'` without touching `platform`. The routing logic only reads `provider`.

---

## 6. Notification Catalog (17 types)

### P0 — Must Have (8 notifications)

Ship in Phase 1. Exempt from daily cap.

#### 6.1 `trip_created_notify`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips` |
| **Audience** | All circle members except creator |
| **Copy** | Title: `"[TripName]"` / Body: `"[CreatorName] started planning this trip — take a look when you're ready."` |
| **Dedupe** | `trip_created:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: null }` |

#### 6.2 `trip_canceled`

| Field | Value |
|---|---|
| **Trigger** | Inline — trip cancel endpoint |
| **Audience** | All active travelers except the canceler |
| **Copy** | Title: `"[TripName]"` / Body: `"[LeaderName] canceled this trip."` |
| **Dedupe** | `trip_canceled:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: null }` |
| **Notes** | Flagged as missing by Codex review. Travelers must know when a trip they were planning is called off. |

#### 6.3 `first_dates_suggested`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/date-windows`, only when first window for the trip |
| **Audience** | All active travelers except the suggester |
| **Copy** | Title: `"[TripName]"` / Body: `"Date ideas are rolling in. Add yours when you're ready!"` |
| **Dedupe** | `first_dates:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: 'scheduling' }` |

#### 6.4 `dates_proposed_by_leader`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/proposed-window` |
| **Audience** | All active travelers except leader |
| **Copy** | Title: `"[TripName]"` / Body: `"[LeaderName] suggested [StartDate–EndDate]. Let them know if it works!"` |
| **Dedupe** | `dates_proposed:{tripId}:{windowId}` / Per proposal |
| **Deep link** | `{ tripId, overlay: 'scheduling' }` |

#### 6.5 `leader_can_lock_dates` (enhance existing)

| Field | Value |
|---|---|
| **Trigger** | Nudge engine (existing path via `sendPushForNudge`) |
| **Audience** | Leader only |
| **Copy** | Title: `"[TripName]"` / Body: `"[X] travelers said [StartDate–EndDate] works. Confirm the dates when you're ready."` |
| **Dedupe** | `leader_lock:{tripId}` / 72 hours (existing) |
| **Deep link** | `{ tripId, overlay: 'scheduling' }` |
| **Migration** | Enhance existing copy to include dates and count. Stays in nudge path (not pushRouter). |

#### 6.6 `dates_locked` (move to inline)

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/lock-proposed` |
| **Audience** | All active travelers |
| **Copy (travelers)** | Title: `"[TripName]"` / Body: `"Dates confirmed: [StartDate–EndDate]! Next up — share trip ideas."` |
| **Copy (leader)** | Title: `"[TripName]"` / Body: `"You confirmed [StartDate–EndDate]. Nice work!"` |
| **Dedupe** | `dates_locked:{tripId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: 'itinerary' }` |
| **Migration** | Remove `dates_locked` from `PUSH_ELIGIBLE_TYPES` set in `pushEligible.js` to prevent double-fire from nudge path. |

#### 6.7 `itinerary_generated`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/itinerary/generate` |
| **Audience** | All active travelers except leader |
| **Copy (v1)** | Title: `"[TripName]"` / Body: `"The itinerary is ready! Take a look and share your thoughts."` |
| **Copy (v2+)** | Title: `"[TripName]"` / Body: `"Itinerary updated based on feedback — see what changed."` |
| **Dedupe** | `itinerary_generated:{tripId}:v{version}` / Per version |
| **Deep link** | `{ tripId, overlay: 'itinerary' }` |

#### 6.8 `join_request_received`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/join-requests` (status 201) |
| **Audience** | Leader only |
| **Copy** | Title: `"[TripName]"` / Body: `"[RequesterName] wants to join — take a look when you're ready."` |
| **Dedupe** | `join_request:{tripId}:{requesterId}` / 24 hours |
| **Deep link** | `{ tripId, overlay: 'travelers' }` |

---

### P1 — High Value (9 notifications)

Ship in Phase 2. Subject to daily cap.

#### 6.9 `leader_ready_to_propose` (enhance existing)

| Field | Value |
|---|---|
| **Trigger** | Nudge engine (existing path via `sendPushForNudge`) |
| **Audience** | Leader only |
| **Copy** | Title: `"[TripName]"` / Body: `"Over half your group has weighed in. [LeadingDates] has the most support."` |
| **Dedupe** | `leader_propose:{tripId}` / 72 hours (existing) |
| **Deep link** | `{ tripId, overlay: 'scheduling' }` |

#### 6.10 `window_supported_author`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/date-windows/:wid/support` |
| **Audience** | Original window author only (skip if supporter === author) |
| **Copy** | Title: `"[TripName]"` / Body: `"[SupporterName] likes your dates — gaining traction!"` |
| **Dedupe** | `window_supported:{windowId}:{authorUserId}` / 2 hours (coalesce) |
| **Deep link** | `{ tripId, overlay: 'scheduling' }` |

#### 6.11 `join_request_approved`

| Field | Value |
|---|---|
| **Trigger** | Inline — join request approval |
| **Audience** | The requester only |
| **Copy** | Title: `"[TripName]"` / Body: `"You're in! Your request to join was approved."` |
| **Dedupe** | `join_approved:{tripId}:{requesterId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: null }` |

#### 6.12 `expense_added`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/expenses` |
| **Audience** | All travelers in the split except submitter |
| **Copy** | Title: `"[TripName]"` / Body: `"[SubmitterName] added an expense — check it out."` |
| **Dedupe** | `expense_added:{tripId}:{expenseId}` / None (each unique) |
| **Deep link** | `{ tripId, overlay: 'expenses' }` |
| **Notes** | Dollar amount intentionally omitted from copy (lock screen privacy). |

#### 6.13 `accommodation_selected`

| Field | Value |
|---|---|
| **Trigger** | Inline — accommodation selection endpoint |
| **Audience** | All active travelers |
| **Copy** | Title: `"[TripName]"` / Body: `"Your stay is set! Check out the details."` |
| **Dedupe** | `accommodation_selected:{tripId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: 'accommodation' }` |

#### 6.14 `first_idea_contributed`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/itinerary/ideas`, only when first idea for trip |
| **Audience** | All active travelers except the contributor |
| **Copy** | Title: `"[TripName]"` / Body: `"[ContributorName] shared a trip idea — see what's on the list."` |
| **Dedupe** | `first_idea:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: 'itinerary' }` |

#### 6.15 `prep_reminder_7d`

| Field | Value |
|---|---|
| **Trigger** | Trip-load eval OR daily cron — `lockedStartDate` is 5–7 days from today |
| **Audience** | All active travelers |
| **Copy** | Title: `"[TripName]"` / Body: `"One week away! Check the prep list."` |
| **Dedupe** | `prep_7d:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: 'prep' }` |
| **Notes** | Range check (5–7 days) handles timezone differences. |

#### 6.16 `trip_started`

| Field | Value |
|---|---|
| **Trigger** | Trip-load eval OR daily cron — `lockedStartDate` is today (±12hr) |
| **Audience** | All active travelers |
| **Copy** | Title: `"[TripName]"` / Body: `"Starts today — have an amazing time!"` |
| **Dedupe** | `trip_started:{tripId}:{userId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: null }` |

#### 6.17 `leader_transferred`

| Field | Value |
|---|---|
| **Trigger** | Inline — `POST /api/trips/:id/transfer-leadership` |
| **Audience** | New leader only |
| **Copy** | Title: `"[TripName]"` / Body: `"You're now leading this trip. Check in when you're ready."` |
| **Dedupe** | `leader_transferred:{tripId}:{newLeaderId}` / 30d (TTL-bound) |
| **Deep link** | `{ tripId, overlay: null }` |

---

### Deferred to Future (not in scope)

Listed in priority order — top items should be evaluated first after Phase 2 data is available.

| Priority | Notification | Why Deferred |
|---|---|---|
| **Highest** | `collecting_momentum_reminder` | Addresses the #1 failure mode (trip stalls in scheduling because nobody acts). Deferred because it risks feeling naggy at beta scale. **Evaluate first** once Phase 1 data shows drop-off rates at the scheduling stage. The cron sweep query already has the stall detection block commented out — one-line uncomment when data justifies it. |
| High | `trip_completed_recap` | Drives post-trip engagement (memories, expenses). Low urgency since users who care will open the app. |
| Medium | `traveler_left` (leader-only) | Leader needs to know when someone drops out (affects accommodation, expenses). Target leader only — the person who left should NOT receive a notification about their own departure. Copy: "Someone left [TripName]. Check the travelers list." (deliberately vague, no name). |
| Medium | `prep_reminder_3d` | Redundant with `prep_reminder_7d`. Add only if data shows 7d reminder insufficient. |
| Medium | `join_request_rejected` | Notify the requester when their request is declined. Low volume, but good UX closure. |
| Low | `accommodation_option_added` | Noisy if multiple options added same day. Revisit with coalescing logic. |
| Low | `packing_list_ready` | Low engagement value — packing generation is leader-triggered, deep in prep flow. |
| Low | `chat_mention` | Requires @mention feature (parsing + UI) that doesn't exist yet. |
| N/A | Quiet hours | Requires user timezone storage. |
| N/A | Notification preferences UI | Per-category opt-out in app settings. Ship after initial data on opt-out rates. |

**Why we rejected some Codex suggestions**:
- `reaction_submitted` to leader — would fire on every reaction, too noisy. Leader already gets `leader_can_lock_dates` at threshold.
- Push token format validation — over-engineering. Invalid tokens fail at send time and get pruned.

---

## 7. Daily Cron Sweep

### Endpoint: `POST /api/jobs/push-sweep`

**Auth**: `CRON_SECRET` is **mandatory**. Returns 500 (not silent skip) if not set. This differs from `/api/jobs/aggregates` which has an optional check.

```javascript
export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[push-sweep] CRON_SECRET not configured')
    return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(null, { status: 404 })  // 404 not 401 (prevent discovery)
  }

  // 1. Query eligible trips (locked with upcoming dates OR scheduling with stalls)
  // 2. Dedupe check first (before audience resolution) to short-circuit early
  // 3. For eligible trips, evaluate time-based notifications
  // 4. Parallelize all sends with Promise.allSettled()
  // 5. Return summary
}
```

**Query** — targets both locked trips (time-based) and scheduling trips (stall detection):

```javascript
const now = new Date()
const eightDaysFromNow = new Date(now.getTime() + 8 * 86400000)
const threeDaysAgo = new Date(now.getTime() - 3 * 86400000)
const twoDaysAgo = new Date(now.getTime() - 2 * 86400000)

const trips = await db.collection('trips').find({
  $or: [
    // Time-based: locked trips with upcoming/recent dates
    {
      status: 'locked',
      $or: [
        { lockedStartDate: { $gte: now.toISOString().slice(0, 10), $lte: eightDaysFromNow.toISOString().slice(0, 10) } },
        { lockedEndDate: { $gte: threeDaysAgo.toISOString().slice(0, 10), $lte: now.toISOString().slice(0, 10) } },
      ]
    },
    // Stall detection: scheduling trips older than 48 hours (future — not Phase 1-2)
    // { status: 'scheduling', updatedAt: { $lte: twoDaysAgo.toISOString() } },
  ]
}).toArray()
```

**Timeout mitigation** (Vercel Hobby = 10 second limit):
1. Dedupe check at trip level BEFORE audience resolution (skip trips where all pushes already sent)
2. Parallel sends via `Promise.allSettled()`
3. Process at most 30 trips per sweep (log warning if more)
4. At beta scale (~50 trips total) this is well within limits

---

## 8. Nudge Engine Integration

The existing nudge-triggered pushes (`leader_can_lock_dates`, `leader_ready_to_propose`) remain on their current path:

```
computeNudges() → filterSuppressedNudges() → sendPushForNudge()
```

`sendPushForNudge()` calls `sendPush()` directly — it does NOT go through `pushRouter()`. This avoids double-dedupe since the nudge engine has its own dedupe via `nudge_events`.

**Changes to `pushEligible.js`**:
```javascript
const PUSH_ELIGIBLE_TYPES = new Set([
  'leader_can_lock_dates',
  'leader_ready_to_propose',
  // REMOVED: 'dates_locked' — moved to inline dispatch via pushRouter
])
```

---

## 9. Rollout Plan

### Phase 0: Platform Foundation (Week 1)

1. Install `@parse/node-apn` (iOS) and `firebase-admin` (Android)
2. Rewrite `sendPush.js` with hybrid APNS/FCM routing by `provider` field
3. Fix multi-device token storage (`{ userId, token }` upsert key)
4. Add `provider` field to token registration
5. Fix `native-bridge/page.jsx` for Android platform detection
6. Test APNS delivery on real iOS device, FCM delivery on real Android device
7. Add token unregister on logout flow

### Phase 1: P0 Notifications + Deep Linking (Week 2)

1. Create `lib/push/pushRouter.js`, `pushCopy.js`, `pushAudience.js`, `pushDedupe.js`, `pushDeepLink.js`
2. Create `push_events` collection with indexes
3. Implement 8 P0 notifications (inline dispatch, `await`ed)
4. Remove `dates_locked` from `PUSH_ELIGIBLE_TYPES`
5. Create `components/common/PushHandler.jsx` at app root for deep link handling
6. Add `?overlay=` param handling in `CommandCenterV3.tsx`
7. Write unit tests for pushRouter, pushDedupe, pushCopy
8. Test on real devices (iOS + Android)

### Phase 2: P1 Notifications + Cron (Week 3-4)

1. Implement 9 P1 notifications
2. Add trip-load evaluation for time-based notifications (`prep_reminder_7d`, `trip_started`)
3. Create `vercel.json` with cron config
4. Create `/api/jobs/push-sweep` endpoint
5. Add daily cap logic
6. Write integration tests for cron endpoint
7. Deploy and monitor push_events for anomalies

### Phase 3: Web Push + Polish (Future)

1. Add `web-push` npm package
2. Create service worker (`public/sw.js`)
3. Add push subscription UI (permission prompt + token registration)
4. Add web sending path to `sendPush()`
5. Notification preferences UI in app settings

---

## 10. Testing Strategy

### Unit Tests

- `tests/push/pushRouter.test.js` — Copy lookup, audience resolution returns, dedupe integration
- `tests/push/pushDedupe.test.js` — Atomic upsert behavior, cooldown expiry, daily cap at boundary
- `tests/push/pushCopy.test.js` — All copy functions return non-empty title + body, no "you must" language
- `tests/push/pushAudience.test.js` — Filters left/removed travelers, handles collaborative vs hosted trips

### Integration Tests

- `tests/api/push-sweep.test.js` — Cron auth (mandatory CRON_SECRET), trip evaluation, correct types dispatched
- `tests/api/push-inline.test.js` — Verify push fires on each API mutation (mock `sendPush`)

### Manual Testing Checklist

- [ ] iOS: Push received via APNS, tap opens correct trip + overlay
- [ ] Android: Push received via FCM, tap opens correct trip + overlay
- [ ] Multi-device: Both devices receive the push
- [ ] Dedupe: Same push not received twice
- [ ] Left traveler: Does NOT receive pushes after leaving
- [ ] Daily cap: 4th non-P0 push in a day is suppressed
- [ ] APNS env vars missing: iOS push silently skipped, no crashes
- [ ] Firebase env vars missing: Android push silently skipped, no crashes
- [ ] Token unregister on logout: Old device stops receiving pushes

---

## 11. Monitoring

### Key Metrics

| Metric | Source |
|---|---|
| Pushes sent per type per day | `push_events` aggregation |
| Push-to-app-open rate | Correlate `push_events.sentAt` with next `trip_events` timestamp for same user |
| Daily cap hit rate | Users with `count(push_events) >= 3` per day |
| Token churn rate | Count of tokens pruned per day (log in `sendPush`) |
| Cron sweep duration | Log execution time in sweep response |

### Admin Endpoint

Extend existing `/api/admin/events` pattern:

```
GET /api/admin/push-stats?tripId=abc123
```

Returns: `{ totalSent, byType: { trip_created_notify: 5, ... }, recentPushes: [...] }`

---

## 12. Decision Log

| Decision | Alternatives Considered | Rationale |
|---|---|---|
| **Hybrid: APNS for iOS + FCM for Android (Option B)** | FCM for all (Option A), Direct APNS + FCM + Web Push (Option C) | Zero iOS native changes, no Firebase iOS dependency, no App Store resubmission. `@parse/node-apn` is actively maintained. Capacitor already returns APNS tokens. AI Council (Claude + Gemini + GPT-5.2) unanimously recommended Option B. |
| `@parse/node-apn` for iOS | `apn` v2.2.0 (unmaintained), FCM proxy | Actively maintained fork, drop-in replacement, direct APNS HTTP/2 |
| `provider` field on push_tokens | Derive from `platform` field | Future-proofing: if iOS ever migrates to FCM, change `provider` without touching `platform`. Clean routing logic. |
| P0 dispatches `await`ed | All fire-and-forget | Vercel serverless can terminate before non-awaited promises resolve. P0 notifications are critical enough to justify the small latency cost. |
| No `badge` count on APNS | `badge: 1` on all pushes | Badge never increments or clears properly without server-side count tracking. Removing is cleaner than implementing badge management. |
| iOS `threadId` for notification grouping | No grouping | Groups notifications by trip in iOS notification center. Zero cost, better UX. |
| Trip name as notification title | "Tripti" as title | More useful when scanning notifications across multiple trips |
| Atomic upsert dedupe | findOne-then-insert | Prevents race condition when two triggers fire simultaneously |
| `sendPushForNudge` stays separate | Route through pushRouter | Avoids double-dedupe with nudge engine's own dedupe layer |
| Daily cap at 3 (UTC) | 5 per day, user-local time | Conservative for beta. UTC is a known limitation, acceptable without timezone storage |
| Omit dollar amount in expense push | Include amount | Lock screen privacy concern |
| No `reaction_submitted` push | Batched reaction notifications to leader | Leader already gets `leader_can_lock_dates` at threshold — per-reaction pushes are too noisy |
| No `collecting_momentum_reminder` in Phase 1-2 | Include in cron sweep | Risks feeling naggy. Evaluate after drop-off data is available. |
| Mandatory `CRON_SECRET` for push-sweep | Optional (match aggregates pattern) | Unauthenticated sweep would spam all users |
| Token unregister on logout | Leave tokens until they expire | Prevents phantom pushes to logged-out devices. Small implementation cost. |
| Defer `collecting_momentum_reminder` | Include in Phase 1-2 cron sweep | Risks feeling naggy at beta scale. Highest-priority deferred item — evaluate first after Phase 1 data. Cron query block is pre-written (commented out). |
