> **HISTORICAL PLANNING DOCUMENT**: Current behavior may differ from what is described here. Refer to merged PRs and current docs (CLAUDE.md, date_locking_funnel.md) for the source of truth.
>
> **Note (2026-01-29)**: CommandCenterV2, ProgressChevrons, FocusBannerV2, and TravelerStrip have been removed. The current implementation uses CommandCenterV3 with ProgressStrip. Items referencing deleted files are no longer applicable.

# Trypzy MVP Hardening Plan V2

> Updated 2026-01-29 (Round 3 - feat/enhancements-round3 branch)
> Previous work: Round 1 (feat/mvp-hardening), Round 2 (2026-01-23)

---

## Executive Summary

Round 2 audit reveals **critical security gaps** and **remaining polish items** that weren't caught in round 1. The previous hardening addressed chat-first compliance and state refresh, but security, error handling, and deeper UI polish gaps remain.

**Overall readiness after round 1**: 80-85%
**Gaps found in round 2**: Security (critical), Error handling (high), UI polish (medium)

| Area | Previous | Now | New Gaps Found |
|------|----------|-----|----------------|
| Security | 95% | **60%** | Rate limiting, CORS, JWT defaults |
| Error handling | 70% | **50%** | No error boundary, generic 500s, race conditions |
| Chat-first compliance | 60% → 85% | **85%** | Join request actor wrong, minor gaps |
| UI/brand consistency | 70% → 90% | **75%** | 30+ files still have generic colors |
| Accessibility | 65% → 80% | **70%** | Color contrast, aria-hidden, aria-live |
| API completeness | 93% → 97% | **85%** | Missing DELETE for votes, availability, circles |

---

## CRITICAL: Security Issues (P0-S)

### P0-S1: Rate Limiting (CRITICAL)
**Risk**: API vulnerable to brute force, DDoS, abuse
**Impact**: Service outage, account compromise

**Tasks**:
- [ ] Install rate limiting middleware (express-rate-limit or similar)
- [ ] Auth endpoints: 5-10 req/min
- [ ] General endpoints: 100 req/min
- [ ] Upload endpoint: 10 req/min

**Files**:
- `app/api/[[...path]]/route.js` (add middleware)
- `package.json` (add dependency)

---

### P0-S2: Fix CORS Configuration (CRITICAL) ✅ COMPLETED (Round 3)
**Risk**: CSRF attacks, data leakage from any origin
**Status**: Fixed in feat/enhancements-round3 branch (2026-01-29)

**Fix applied**: Removed `|| '*'` fallback. Now logs error in production if CORS_ORIGINS not set and falls back to localhost for development only.

**Files updated**:
- `app/api/[[...path]]/route.js` - Fixed
- `lib/server/cors.js` - Fixed

---

### P0-S3: Fix JWT Secret Default (CRITICAL)
**Risk**: Anyone knowing default can forge tokens
**Current**: `JWT_SECRET || 'trypzy-secret-key-change-in-production'`

**Files**:
- `app/api/[[...path]]/route.js:11` - Fail if not set
- `lib/server/auth.js:4` - Same fix

**Fix**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in production')
```

---

### P0-S4: Add Error Boundary (HIGH)
**Risk**: Any component error crashes entire page
**Current**: No React Error Boundary exists

**Tasks**:
- [ ] Create `components/common/ErrorBoundary.tsx`
- [ ] Wrap CommandCenterV2, TripTabs, Dashboard
- [ ] Log errors to console/monitoring

---

## HIGH: Error Handling Gaps (P1-E)

### P1-E1: Add Error States to Overlay Data Loads
**Issue**: Overlays show spinner forever if fetch fails

**Files with missing error states**:
- `ItineraryOverlay.tsx:504-515` - loadIdeas/loadVersions/loadFeedback have no error UI
- `ExpensesOverlay.tsx:135-180` - Loading but no error state
- `PrepOverlay.tsx:114-135` - Loading but no error state
- `MemoriesOverlay.tsx:78-100` - Loading but no error state

**Fix**: Add `error` state + error UI for each overlay

---

### P1-E2: Fix Race Condition in Expense Deletion
**Issue**: `findIndex` + `splice` is non-atomic

**File**: `app/api/trips/[tripId]/expenses/route.js:296-309`

**Fix**: Use MongoDB `$pull` operator instead:
```javascript
await db.collection('trips').updateOne(
  { _id: tripId },
  { $pull: { expenses: { _id: ObjectId(expenseId) } } }
)
```

---

### P1-E3: Fix Division by Zero in Expenses
**Issue**: `perPersonShare = amountDollars / splitCount` crashes if splitCount is 0

**Files**:
- `app/api/trips/[tripId]/expenses/route.js:274`
- `ExpensesOverlay.tsx:274` (frontend duplicate)

**Fix**: Add validation: `if (splitCount === 0) return error`

---

### P1-E4: Add Error State to useTripChat Hook
**Issue**: Hook has no `error` state; components can't know if fetch failed

**File**: `hooks/use-trip-chat.ts:74-79`

**Fix**: Add `const [error, setError] = useState(null)` and expose in return

---

### P1-E5: Sanitize Regex in Search ✅ COMPLETED (Round 3)
**Issue**: User input goes directly into MongoDB regex (ReDoS risk)
**Status**: Fixed in feat/enhancements-round3 branch (2026-01-29)

**Fix applied**: Added `escapeRegex()` function to escape special regex characters before using in MongoDB query.

**File updated**: `app/api/discover/posts/route.js`

---

## HIGH: Remaining Brand/UI Polish (P1-U)

### P1-U1: Generic Colors Still in Use (30+ files) 🔄 PARTIALLY COMPLETED (Round 3)
Previous hardening missed many files. **Round 3 fixed**: `PostCard.tsx` (replaced `text-red-600` with `brand-red`).

Remaining files (deferred - low priority for private beta):

**Red colors** (replace with `brand-red` or `destructive`):
- `MemoriesOverlay.tsx:372,383` - `bg-red-500`
- `ActionCard.tsx:200` - `bg-red-600 hover:bg-red-700`
- `TravelersOverlay.tsx:309,319` - `text-red-600`
- `ExpensesOverlay.tsx:557` - `text-red-600`
- `HomeClient.jsx:1340,1360` - `bg-red-500`

**Green colors** (replace with `brand-blue` for success states):
- `SchedulingOverlay.tsx:857,882,908` - `bg-green-600`
- `AccommodationOverlay.tsx:423,453` - `bg-green-600`
- `ItineraryOverlay.tsx:877` - `text-green-600`
- `ChatTab.tsx:368,372,373` - `bg-green-600`
- `HomeClient.jsx:1307` - `text-green-600`

**Blue colors** (replace with `brand-blue`):
- `GlobalNotifications.jsx:72,115` - `text-blue-600`
- `SchedulingOverlay.tsx:514,562,775` - `text-blue-800 bg-blue-100`
- `ChatTab.tsx:290` - `bg-blue-50 border-blue-200 text-blue-700`
- `HomeClient.jsx:1319` - `bg-blue-50 text-blue-700`

**Yellow colors** (create semantic token or use brand-sand):
- `SchedulingOverlay.tsx:858,860,862,890` - `ring-yellow-400`, `bg-yellow-200`
- `ItineraryOverlay.tsx:745,879` - `text-yellow-500`, `text-yellow-600`

**Avatar palette** (needs brand-consistent version):
- `TravelersOverlay.tsx:88-97` - Generic color palette
- `MemberProfileOverlay.tsx:117-127` - Same
- `AccommodationOverlay.tsx:374-382` - Same

---

### P1-U2: Missing Skeleton Loaders
**Issue**: Overlays show blank white during initial load

**Files needing skeletons**:
- `ExpensesOverlay.tsx` - Initial load
- `ItineraryOverlay.tsx` - Versions/feedback load
- `PrepOverlay.tsx` - Initial load
- `MemoriesOverlay.tsx` - Initial load

---

### P1-U3: Typography - Inter vs Geist
**Issue**: Code uses Inter but branding specifies Geist Sans

**Files**:
- `app/layout.js:5-10` - Import Geist Sans/Mono from next/font/google
- `tailwind.config.js:21` - Update to reference Geist

---

### P1-U4: Z-Index Layering Cleanup
**Issue**: Arbitrary z-index values throughout

**Current state**:
- `toast.jsx:2` - `z-[100]`
- `OverlayContainer.tsx:211` - `z-[60]`
- `navigation-menu.jsx:1` - `z-[1]`
- `sidebar.jsx:1` - `z-20`
- `drawer.jsx:1` - `z-50`

**Fix**: Define z-index scale in tailwind.config.js

---

## MEDIUM: Accessibility Gaps (P2-A)

### P2-A1: Color Contrast Fixes (WCAG 1.4.3) 🔄 PARTIALLY COMPLETED (Round 3)
**Issue**: `text-gray-400` and `text-gray-500` fail contrast on light backgrounds

**Round 3 fixed**:
- `ChatTab.tsx` - Improved contrast for rank number (gray-400 → gray-500)
- `PrepOverlay.tsx` - Improved contrast for helper text (gray-400 → gray-500)

**Remaining files** (deferred - icons with gray-400 are acceptable):
- `ExpensesOverlay.tsx` - Icons
- `MemberProfileOverlay.tsx` - Icons
- `WelcomePage.tsx` - Icons

---

### P2-A2: Missing aria-hidden on Decorative Icons
**Files**:
- `ActionCard.tsx:50` - X close icon
- `CircleSection.jsx:47,59,69` - Users, Plus icons
- `TripCard.jsx:136,153,159,177` - Info, Users, Calendar, Clock
- `GlobalNotifications.jsx:67` - Bell icon

---

### P2-A3: Add aria-live Regions for Dynamic Content
**Files**:
- `ChatTab.tsx` - Message additions not announced
- `CommandCenterV2.tsx:362-368` - Chat loading needs aria-busy

---

### P2-A4: Verify Destructive Action Confirmations
**Need to verify these have AlertDialog**:
- `PrepOverlay.tsx` - Delete prep items
- `MemoriesOverlay.tsx` - Delete photos
- `ExpensesOverlay.tsx` - Delete expenses

---

## MEDIUM: Chat-First Remaining Gaps (P2-C)

### P2-C1: Fix Join Request Event Actor
**Issue**: Approval event uses requester as actor, not leader

**File**: `app/api/[[...path]]/route.js:2886-2894`

**Current**:
```javascript
await emitTripChatEvent({
  actorUserId: joinRequest.requesterId, // WRONG
  text: `${requesterName} joined the trip`
})
```

**Fix**:
```javascript
await emitTripChatEvent({
  actorUserId: auth.user.id, // Leader who approved
  text: `${leaderName} approved ${requesterName}'s request to join`
})
```

---

### P2-C2: Add Missing Stage Transition Messages
**Missing events**:
- "Itinerary finalized" when leader publishes
- "Accommodation confirmed. Next step: prep" when stay selected
- "Prep phase started" when first prep item added

---

## LOW: Missing API Operations (P3-API)

### P3-API1: Missing DELETE Operations
- [ ] `DELETE /api/trips/:tripId/vote` - Remove user's date vote
- [ ] `DELETE /api/trips/:tripId/accommodations/:optionId/vote` - Remove accommodation vote
- [ ] `DELETE /api/trips/:tripId/availability` - Remove user's availability
- [ ] `DELETE /api/circles/:id` - Delete circle
- [ ] `PUT /api/circles/:id` - Update circle name/description
- [ ] `DELETE /api/circles/:id/members/:userId` - Remove member

### P3-API2: Missing User Account Deletion (GDPR)
- [ ] `DELETE /api/users/me` or `/api/auth/delete-account`

### P3-API3: Standardize Error Response Format
**Issue**: API returns varying formats:
- `{ error: 'message' }`
- `{ error: 'message', details: error.message }`

**Fix**: Create consistent error schema

---

## Implementation Priority Order

```
CRITICAL (Block launch):
├── P0-S1: Rate limiting
├── P0-S2: Fix CORS defaults
├── P0-S3: Fix JWT secret defaults
└── P0-S4: Add Error Boundary

HIGH (Should fix before launch):
├── P1-E1: Overlay error states
├── P1-E2: Fix expense race condition
├── P1-E3: Fix division by zero
├── P1-E4: useTripChat error state
├── P1-E5: Sanitize regex search
├── P1-U1: Remaining generic colors
├── P1-U2: Skeleton loaders
├── P1-U3: Typography (Geist)
└── P1-U4: Z-index cleanup

MEDIUM (Polish):
├── P2-A1: Color contrast fixes
├── P2-A2: aria-hidden on icons
├── P2-A3: aria-live regions
├── P2-A4: Verify delete confirmations
├── P2-C1: Fix join request actor
└── P2-C2: Stage transition messages

LOW (Post-launch):
├── P3-API1: Missing DELETE operations
├── P3-API2: User account deletion
└── P3-API3: Standardize error format
```

---

## Files Changed Summary (Round 2)

| Priority | File | Changes |
|----------|------|---------|
| P0-S | `route.js` | Rate limiting middleware, CORS fix, JWT fix |
| P0-S | `lib/server/auth.js` | JWT secret validation |
| P0-S | `lib/server/cors.js` | Remove wildcard default |
| P0-S | `ErrorBoundary.tsx` | New file |
| P1-E | `expenses/route.js` | Race condition fix, division by zero |
| P1-E | `use-trip-chat.ts` | Error state |
| P1-E | `discover/posts/route.js` | Regex sanitization |
| P1-E | All overlays | Error states |
| P1-U | 30+ component files | Brand colors |
| P1-U | Overlays | Skeleton loaders |
| P1-U | `layout.js`, `tailwind.config.js` | Geist fonts |
| P2-A | 10+ files | Color contrast, aria attributes |
| P2-C | `route.js` | Fix join request actor |

---

## Success Criteria (Round 2)

1. **Security**: No hardcoded secrets, rate limiting active, CORS restricted
2. **Error handling**: All overlays have error states, no race conditions
3. **Brand compliance**: Zero generic Tailwind colors in trip UI
4. **Accessibility**: WCAG AA compliance for contrast, proper ARIA
5. **Chat-first**: All system messages use correct actor

---

*Round 2 audit completed 2026-01-23*
