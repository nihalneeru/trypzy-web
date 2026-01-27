# Navigation Architecture — Migration Complete

> **Status (2026-01)**: All four porting items are complete. The old dashboard monolith (`HomeClient.jsx`) has been replaced with a thin re-export shim. All navigation now uses standalone Next.js App Router routes.

## Completed Migration

| # | Item | Route | PR |
|---|------|-------|----|
| 1 | Trip Detail | `/trips/[tripId]` | #107 |
| 2 | Circle Detail Tabs | `/circles/[circleId]` | #108 |
| 3 | Discover Feed | `/discover` | #109 |
| 4 | Remove Old Dashboard | N/A (cleanup) | #110 / v2 |

## Current Route Structure

| Route | Page | Description |
|-------|------|-------------|
| `/` | `app/page.js` → `WelcomePageWrapper` | Auth check: authenticated users redirect to `/dashboard` (or legacy deep-link redirect); unauthenticated see `WelcomePage` |
| `/dashboard` | `app/dashboard/page.js` | Primary authenticated landing page |
| `/trips/[tripId]` | `app/trips/[tripId]/page.js` | Trip detail with Command Center V2 |
| `/circles/[circleId]` | `app/circles/[circleId]/page.js` | Circle detail with tabs (Members, Trips, Updates) |
| `/discover` | `app/discover/page.js` | Discover feed |
| `/members/[userId]` | `app/members/[userId]/page.js` | Member profile |
| `/settings/privacy` | `app/settings/privacy/page.js` | Privacy settings |
| `/login` | `app/login/page.jsx` | Login |
| `/signup` | `app/signup/page.jsx` | Signup |

## Legacy URL Handling

`WelcomePageWrapper` redirects legacy deep-link URLs for authenticated users:

| Legacy URL | Redirects To |
|------------|-------------|
| `/?tripId=X` | `/trips/X` |
| `/?circleId=X` | `/circles/X` |
| `/?view=discover` | `/discover` |

## HomeClient.jsx

`HomeClient.jsx` is now a 2-line re-export shim. It only exports `BrandedSpinner` from `@/components/common/BrandedSpinner` for any remaining import references. The standalone `BrandedSpinner` file is the canonical import location.

## Navigation Helpers

| Helper | File | Returns |
|--------|------|---------|
| `tripHref(tripId)` | `lib/navigation/routes.js` | `/trips/{tripId}` |
| `circlePageHref(circleId)` | `lib/navigation/routes.js` | `/circles/{circleId}` |
