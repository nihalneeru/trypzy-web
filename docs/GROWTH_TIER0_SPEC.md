# Growth Tier 0: Unlock Sharing

> **Status:** SPEC (pending implementation)
> **Goal:** Enable viral sharing by de-gating trip content for non-users
> **Estimated effort:** 2-3 weeks
> **Last updated:** 2026-02-23

## Executive Summary

All Tripti content is currently auth-gated. Shared links hit a login wall, creating 100% bounce for non-users. Tier 0 creates public, read-only trip previews with dynamic social cards and a conversion funnel that turns viewers into users.

**The compound loop:** Public itinerary → share in group chat → friend opens preview → signs up → remixes trip → invites their circle → repeat.

---

## Feature 1: Public Trip Preview Page

### What

A read-only, publicly accessible page showing a trip's itinerary, destination, dates, and vibe — without requiring authentication.

### Route Structure

```
/p/[shareId]              → Public trip preview (new)
/api/public/trips/[shareId] → Public trip data endpoint (new)
```

**Why `/p/[shareId]` instead of `/trips/[tripId]/preview`:**
- Short URLs share better in messaging apps
- `shareId` is a separate unguessable token (not the internal tripId)
- Revoking sharing = regenerate shareId (old links stop working)
- Clean separation from auth-gated `/trips/[tripId]`

### Schema Changes

**`trips` collection — add fields:**
```javascript
{
  // ... existing fields ...
  shareVisibility: 'private' | 'link_only',  // default: 'private'
  shareId: null | string,                     // UUID v4, generated on first share enable
  sharedAt: null | Date,                      // when sharing was first enabled
}
```

**Why no `'public'` option yet:** In beta, all shared trips are link-only (unguessable URL). No search indexing. `'public'` (discoverable/indexed) can be added later when Discovery goes public.

**Privacy constraint:** If ANY active traveler has `privacy.tripsVisibility === 'private'`, the trip cannot be made shareable. The UI should show a disabled toggle with explanation.

### API: Public Trip Data

**`GET /api/public/trips/[shareId]`** — No auth required.

```javascript
// New route file: app/api/public/trips/[shareId]/route.js

// 1. Look up trip by shareId (NOT tripId)
// 2. Verify shareVisibility === 'link_only'
// 3. Check no traveler has tripsVisibility === 'private'
// 4. Return sanitized response (see below)

// Response shape:
{
  trip: {
    name: "Beach Weekend",
    destinationHint: "Tulum, Mexico",
    lockedStartDate: "2026-03-07",
    lockedEndDate: "2026-03-09",
    duration: "3 days",
    type: "collaborative",
    travelerCount: 6,           // count only, no names/IDs
    status: "locked",           // or "completed"
  },
  itinerary: {                  // null if no itinerary
    version: 2,
    content: "...",             // rendered markdown
    ideaCount: 8,
  },
  circle: {
    name: "College Friends",
    inviteCode: "abc123",       // for "Join this group" CTA
  },
  cta: {
    remixUrl: "/signup?remix={shareId}",
    joinUrl: "/join/{inviteCode}?tripId={tripId}&ref=share",
  }
}
```

**What is EXCLUDED from public response:**
- Participant names, IDs, emails, avatars
- Chat messages
- Accommodation details (addresses, confirmation numbers, door codes)
- Expense data
- Private notes
- Internal IDs (tripId, circleId, userIds)

### Page Component

**`app/p/[shareId]/page.js`** — Server Component (for SEO + metadata).

```
┌────────────────────────────────────────────┐
│  Tripti logo (link to /)                   │
├────────────────────────────────────────────┤
│                                            │
│  🌴 Beach Weekend                          │
│  Tulum, Mexico · Mar 7-9 · 6 travelers    │
│                                            │
├────────────────────────────────────────────┤
│                                            │
│  ITINERARY                                 │
│  Day 1 — Friday, Mar 7                     │
│  • Arrive & check in                       │
│  • Beach bonfire (evening)                 │
│                                            │
│  Day 2 — Saturday, Mar 8                   │
│  • Snorkeling tour (morning)               │
│  • Cooking class (afternoon)               │
│                                            │
│  Day 3 — Sunday, Mar 9                     │
│  • Free morning                            │
│  • Check out by noon                       │
│                                            │
├────────────────────────────────────────────┤
│                                            │
│  [Plan a trip like this]  ← brand-red CTA  │
│  [Join this group]        ← brand-blue     │
│                                            │
│  Planned on Tripti.ai                      │
│  "Nifty plans. Happy circles."             │
└────────────────────────────────────────────┘
```

**Key decisions:**
- Server Component — renders on server for fast load + metadata
- No auth check — fully public
- Mobile-first layout (single column, large touch targets)
- Brand colors enforced (brand-red CTA, brand-carbon text, brand-sand highlights)
- `robots: { index: false, follow: false }` in beta (noindex)

### Leader UI: Enable Sharing

Add a "Share Trip" section to **TripInfoOverlay.tsx**:

```
┌──────────────────────────────────────┐
│  SHARE THIS TRIP                     │
│                                      │
│  [toggle] Allow link sharing         │
│                                      │
│  (when enabled:)                     │
│  🔗 https://tripti.ai/p/abc123      │
│  [Copy link]  [Share...]             │
│                                      │
│  "Anyone with this link can view     │
│   the itinerary. No personal info    │
│   is shared."                        │
│                                      │
│  (when disabled / blocked:)          │
│  "A traveler's privacy settings      │
│   prevent sharing this trip."        │
└──────────────────────────────────────┘
```

**API endpoint:** `PATCH /api/trips/:tripId/share-settings`
- Leader-only
- Body: `{ shareVisibility: 'private' | 'link_only' }`
- Generates `shareId` (UUID v4) on first enable, reuses on re-enable
- Returns `{ shareId, shareUrl }`

### Files to Create/Modify

| File | Change |
|------|--------|
| `app/p/[shareId]/page.js` | **NEW** — Public preview page (Server Component) |
| `app/api/public/trips/[shareId]/route.js` | **NEW** — Public trip data endpoint |
| `app/api/[[...path]]/route.js` | Add `PATCH /api/trips/:id/share-settings` handler |
| `components/trip/command-center-v2/overlays/TripInfoOverlay.tsx` | Add "Share Trip" section |
| `lib/trips/sanitizeForPublic.js` | **NEW** — Strip sensitive fields from trip data |

---

## Feature 2: Dynamic OG Images

### What

When a Tripti link is shared in iMessage/WhatsApp/Slack, show a rich preview card with trip name, destination, dates, and branding — not a generic logo.

### Route

```
/p/[shareId]/og → Dynamic OG image (PNG)
```

### Implementation

**`app/p/[shareId]/og/route.js`** — uses `@vercel/og` (`ImageResponse`).

```javascript
import { ImageResponse } from '@vercel/og';

// Generates a 1200x630 PNG card:
// ┌──────────────────────────────────┐
// │  [Tripti logo]                   │
// │                                  │
// │  🌴 Beach Weekend                │
// │  Tulum, Mexico                   │
// │  Mar 7-9, 2026 · 6 travelers    │
// │                                  │
// │  "Nifty plans. Happy circles."   │
// └──────────────────────────────────┘

// Colors: bg brand-sand (#F2EDDA), text brand-carbon (#2E303B),
//         accent brand-red (#FA3823)
```

### Metadata in Preview Page

**`app/p/[shareId]/page.js`** — dynamic `generateMetadata()`:

```javascript
export async function generateMetadata({ params }) {
  const trip = await fetchPublicTrip(params.shareId);
  if (!trip) return { title: 'Trip not found' };

  const title = `${trip.name} — ${trip.destinationHint || 'Trip'}`;
  const description = `${trip.duration} trip with ${trip.travelerCount} travelers. Plan yours on Tripti.`;
  const ogImageUrl = `${BASE_URL}/p/${params.shareId}/og`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/p/${params.shareId}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
    robots: { index: false, follow: false },  // noindex in beta
  };
}
```

### Files to Create

| File | Change |
|------|--------|
| `app/p/[shareId]/og/route.js` | **NEW** — OG image generator |
| `package.json` | Add `@vercel/og` |

---

## Feature 3: Non-User Conversion Funnel

### What

When a non-user clicks a shared link, they see the trip preview, then a clear path to sign up and take action — without losing context.

### Flow

```
1. Non-user receives link in WhatsApp/iMessage
   → Rich OG card preview (Feature 2)

2. Taps link → /p/[shareId]
   → Public preview page loads (no auth required)
   → Reads itinerary, sees trip details

3. Taps "Plan a trip like this" CTA
   → /signup?remix=[shareId]&ref=share
   → Signup page with context banner: "Sign up to remix Beach Weekend"

4. Signs up (email/password)
   → Redirect to /remix/[shareId]
   → Creates new trip from itinerary skeleton
   → Lands on new trip's Command Center

5. OR taps "Join this group" CTA
   → /join/[inviteCode]?tripId=[tripId]&ref=share
   → Existing join flow (already implemented)
```

### Remix Flow (Tier 1, but spec the API now)

**`POST /api/trips/remix`** — Creates a new trip from a shared trip's itinerary.

```javascript
// Body: { shareId: "abc123" }
// Auth: required (user must be signed up)
//
// Logic:
// 1. Look up source trip by shareId
// 2. Verify shareVisibility === 'link_only'
// 3. Auto-create circle: "{tripName} remix circle"
// 4. Create new trip (status: 'proposed', dates cleared)
// 5. Copy itinerary ideas (not versions)
// 6. Copy destination hint
// 7. Return new trip
//
// Response: { trip: { id, name, ... }, redirectUrl: "/trips/{newTripId}" }
```

**Note:** The remix endpoint is Tier 1 work. For Tier 0, the "Plan a trip like this" CTA can link to `/signup?ref=share` and we add remix later. The important thing is preserving the `shareId` through the signup flow.

### Signup Context Preservation

**Modify `app/signup/page.jsx`:**
- Read `?remix=` and `?ref=` query params
- Store in `sessionStorage` before signup
- After successful signup, redirect to remix flow (or dashboard with toast if remix not yet built)

### Privacy Safety Modal

When leader enables sharing, show a confirmation:

```
┌──────────────────────────────────────┐
│  Enable trip sharing?                │
│                                      │
│  Anyone with the link can see:       │
│  ✓ Trip name and destination         │
│  ✓ Trip dates                        │
│  ✓ Itinerary (activities, schedule)  │
│  ✓ Number of travelers               │
│                                      │
│  Hidden from public view:            │
│  ✗ Traveler names and profiles       │
│  ✗ Chat messages                     │
│  ✗ Accommodation details             │
│  ✗ Expenses                          │
│  ✗ Personal notes                    │
│                                      │
│  [Cancel]        [Enable sharing]    │
└──────────────────────────────────────┘
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `app/signup/page.jsx` | Preserve remix/ref query params through signup |
| `app/p/[shareId]/page.js` | CTAs with correct URLs (already in Feature 1) |
| `lib/trips/sanitizeForPublic.js` | Redaction logic (already in Feature 1) |

---

## Feature 4: Privacy Safeguards

### Defaults

- New trips: `shareVisibility: 'private'` (sharing OFF by default)
- Public pages: `robots: { index: false, follow: false }` (noindex in beta)
- Link-only: shareId is UUID v4 (unguessable, 36 chars)

### Redaction Rules (`sanitizeForPublic.js`)

| Data | Public view | Rationale |
|------|-------------|-----------|
| Trip name | Yes | Core identity |
| Destination hint | Yes | Core identity |
| Locked dates | Yes | Essential for context |
| Traveler count | Yes (number only) | Social proof without PII |
| Itinerary content | Yes | Primary shareable value |
| Idea titles | Yes | Inspiration |
| Participant names/IDs | **No** | PII |
| Chat messages | **No** | Private communication |
| Accommodation details | **No** | Security (door codes, addresses) |
| Expenses | **No** | Financial privacy |
| Prep items | **No** | Personal |
| Internal IDs | **No** | Security |

### Privacy Blocking

Sharing is blocked (toggle disabled) if:
- Any active traveler has `privacy.tripsVisibility === 'private'`
- Trip is canceled

Sharing is auto-disabled if:
- Leader revokes (sets `shareVisibility: 'private'`)
- Existing shareId is kept (re-enabling restores same URL)

### Abuse Prevention

- Rate limit public endpoint: 60 req/min per IP (can use Vercel Edge middleware later)
- No write operations on public endpoints
- shareId rotation: leader can regenerate shareId (old links break)

---

## Implementation Order

| Week | Work | Dependencies |
|------|------|-------------|
| **Week 1** | Schema changes + public API endpoint + sanitization logic + share settings API | None |
| **Week 1** | Public preview page (`/p/[shareId]`) + basic layout | Public API |
| **Week 1** | OG image generation (`@vercel/og`) + metadata | Preview page |
| **Week 2** | TripInfoOverlay share toggle + privacy modal + nativeShare integration | Share settings API |
| **Week 2** | Signup context preservation (remix param passthrough) | Preview page |
| **Week 2** | Testing: privacy edge cases, redaction, OG rendering, mobile | All above |

### Testing Checklist

- [ ] Leader can enable/disable sharing in TripInfoOverlay
- [ ] Share toggle is disabled when any traveler has private visibility
- [ ] Public preview page loads without auth
- [ ] Public preview shows itinerary content correctly
- [ ] Public preview hides all PII (names, chat, expenses, accommodation)
- [ ] OG image renders correctly (check with og-image debugger tools)
- [ ] Shared link shows rich preview in iMessage/WhatsApp
- [ ] "Plan a trip like this" CTA goes to signup with context preserved
- [ ] "Join this group" CTA goes to existing join flow
- [ ] Non-existent or private shareId returns 404 (not 403)
- [ ] Revoking share returns 404 for existing shareId
- [ ] Pages have `noindex` robots meta
- [ ] Mobile layout is usable (44px touch targets, single column)

---

## Metrics to Track

| Metric | How |
|--------|-----|
| Share enable rate | % of locked trips that enable sharing |
| Preview page views | Analytics on `/p/[shareId]` |
| Preview → signup conversion | Track `ref=share` on signup |
| Preview → join conversion | Track `ref=share` on `/join/` |
| OG click-through rate | UTM params on shared URLs |
| Remix rate | (Tier 1) Trips created via remix / preview views |
