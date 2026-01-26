# Docs Refresh: Post-Hardening + Nudge Surfacing

## Summary

Docs-only PR refreshing markdown documentation to accurately reflect the current product state after the MVP hardening and nudge surfacing PRs were merged. **No code, config, or JSON changes.**

## Files Touched

### README.md
- Updated overview to describe Command Center V2 and chat-first coordination
- Updated trip flow to full pipeline (Proposed through Completed)
- Added "How Trypzy keeps trips moving" section (nudges in chat)
- Added "Beta Notes" section (no email/push, discover empty for new users, dates are final)
- Updated Documentation links to point to date_locking_funnel.md as primary scheduling doc

### SETUP.md
- Added missing env vars: OPENAI_API_URL, OPENAI_MODEL, ITINERARY_MAX_VERSIONS, NEXT_PUBLIC_NUDGES_ENABLED
- Added Scripts section with all npm commands
- Added Troubleshooting section (MongoDB, Node version, ESLint, JWT_SECRET)

### date_locking_funnel.md
- Made explicit this is the DEFAULT scheduling flow (`schedulingMode: 'date_windows'`)
- Added "Legacy scheduling modes" section documenting older approaches

### scheduling_mvp.md
- Added LEGACY banner at top pointing to date_locking_funnel.md as current source of truth

### CLAUDE.md
- Fixed `schedulingMode` default from `top3_heatmap` to `date_windows`
- Fixed `ContextCTABar` props to match actual TypeScript interface (`onOpenOverlay` not separate callbacks)
- Added FocusBanner blocker indicator note
- Added missing env vars to section 8
- Added new section 10.5: Nudge Engine (active, system messages in chat, feature-flagged)
- Added nudge files to key file map and tests directory listing

### NAV_PARITY.md
- Added note about Command Center V2 as current trip experience
- Confirmed discover deep-link status (`/?view=discover`)

### REPO_SUMMARY.md
- Updated core flows to mention Command Center V2 and nudges
- Fixed `schedulingMode` default to `date_windows`
- Added `lib/nudges/` and `tests/nudges/` to directory structure
- Added Nudge Engine to key components section
- Updated scheduling logic description to reflect SchedulingOverlay

### MVP_HARDENING_PLAN.md & MVP_HARDENING_PLAN_V2.md
- Added HISTORICAL PLANNING DOCUMENT banner to both

## Verification Checklist

- [x] Nudges are surfaced as system messages in chat (confirmed: CommandCenterV2 calls GET /api/trips/:id/nudges)
- [x] Default scheduling mode is `date_windows` (confirmed: route.js line 789)
- [x] ContextCTABar actual props match documentation (confirmed: `onOpenOverlay`, `travelerCount`)
- [x] NEXT_PUBLIC_NUDGES_ENABLED feature flag is implemented (confirmed: CommandCenterV2.tsx line 380)
- [x] No email/push notification features exist (confirmed: no sendgrid/nodemailer/push in codebase)
- [x] Discover deep-link works via `/?view=discover` (confirmed: HomeClient.jsx)
- [x] FocusBannerV2 has inline blocker text (confirmed: lines 131-141)
- [x] No code, config, or JSON files were modified
- [x] No documents were deleted
