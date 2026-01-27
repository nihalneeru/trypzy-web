# Navigation Architecture — Completed Migration

> **Status (2026-01)**: Migration complete. All 4 porting items done. Old dashboard removed.

## Summary

The Trypzy app now uses a fully route-based navigation architecture via Next.js App Router. The legacy monolithic `HomeClient.jsx` (~4,200 lines) has been removed. All authenticated views use dedicated standalone routes.

### Canonical Routes

| Route | Page File | Purpose |
|-------|-----------|---------|
| `/dashboard` | `app/dashboard/page.js` | Post-login landing, circles list |
| `/trips/[tripId]` | `app/trips/[tripId]/page.js` | Trip detail (Command Center V2) |
| `/circles/[circleId]` | `app/circles/[circleId]/page.js` | Circle detail with tabs |
| `/discover` | `app/discover/page.js` | Discover feed |
| `/members/[userId]` | `app/members/[userId]/page.js` | Member profile |
| `/settings/privacy` | `app/settings/privacy/page.js` | Privacy settings |
| `/login` | `app/login/page.jsx` | Login |
| `/signup` | `app/signup/page.jsx` | Signup |
| `/` | `app/page.js` → `WelcomePageWrapper` | Welcome page (unauthenticated) or redirect |

### Legacy URL Handling

`WelcomePageWrapper.jsx` redirects legacy URLs for backward compatibility:
- `/?tripId=X` → `/trips/X`
- `/?circleId=X` → `/circles/X`
- `/?view=discover` → `/discover`
- Authenticated with no params → `/dashboard`
- Unauthenticated → shows `WelcomePage`

---

## Migration History

### Porting Priority (all completed)

1. **Trip Detail** (PR #107) — Port `TripDetailView` to `/trips/[tripId]`, render `CommandCenterV2` directly
2. **Circle Detail Tabs** (PR #108) — Add Members, Memories, Circle Updates tabs to `/circles/[circleId]`
3. **Discover Feed** (PR #109) — Create standalone `/discover` route with extracted components
4. **Remove Old Dashboard** (PR #110) — Delete `HomeClient.jsx` monolith, extract `BrandedSpinner`, fix legacy URLs

### Parity Table (Final)

| Feature | Status |
|---------|--------|
| Dashboard Landing | ✅ `/dashboard` |
| Circle List | ✅ `CircleSection` components |
| Circle Detail (Members, Updates, Trips) | ✅ `/circles/[circleId]` with tabs |
| Trip Detail (Command Center V2) | ✅ `/trips/[tripId]` |
| Discover Feed | ✅ `/discover` |
| Create/Join Circle | ✅ Dialogs in `/dashboard` |
| Create Trip | ✅ Dialogs in circle section |
| Logout | ✅ All pages → `router.replace('/')` |
| Auth Gate | ✅ Per-page localStorage check |
| Legacy URL Backward Compat | ✅ WelcomePageWrapper redirects |

### What Was Removed

- `HomeClient.jsx` Dashboard, CirclesView, CircleDetailView, TripDetailView, DiscoverPage (~4,100 lines)
- `dashboardCircleHref()` from `lib/navigation/routes.js`
- All `/?tripId=`, `/?circleId=`, `/?view=discover` URL generation in app code

### What Was Extracted

- `BrandedSpinner` → `components/common/BrandedSpinner.jsx` (14 files updated)
- `HomeClient.jsx` retained as thin re-export shim for safety

---

## Architecture Notes

### Auth Flow
- Login/Signup stores `trypzy_token` and `trypzy_user` in `localStorage`
- OAuth (Google) stores session via NextAuth, synced to localStorage on dashboard load
- Each page checks `localStorage` for token; redirects to `/` if missing

### Navigation Helpers
- `tripHref(tripId)` → `/trips/{tripId}`
- `circlePageHref(circleId)` → `/circles/{circleId}`
- Both in `lib/navigation/routes.js`
