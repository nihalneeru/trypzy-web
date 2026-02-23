# Documentation Index

> **Last updated:** 2026-02-23

## How to use this directory

These docs are reference material for developers and AI agents working on Tripti. The primary project context file is [`../CLAUDE.md`](../CLAUDE.md) — start there.

---

## Specs & System Docs

| Document | Purpose | Status |
|----------|---------|--------|
| [INTERNAL_SYSTEMS.md](./INTERNAL_SYSTEMS.md) | Nudge engine, event system, admin endpoints, itinerary LLM pipeline | Active |
| [EVENTS_SPEC.md](./EVENTS_SPEC.md) | Event logging schema, taxonomy, implementation details | Active |
| [ITINERARY_LLM_PIPELINE.md](./ITINERARY_LLM_PIPELINE.md) | LLM generation/revision pipeline, feature flags, token guards | Active |
| [NUDGE_ENGINE_SURFACING.md](./NUDGE_ENGINE_SURFACING.md) | Nudge architecture, discovery notes, surfacing strategy | Active |
| [PUSH_NOTIFICATIONS_SPEC.md](./PUSH_NOTIFICATIONS_SPEC.md) | Push notification spec (APNS + FCM + Web Push) | Active |
| [AI_COORDINATION_SPEC.md](./AI_COORDINATION_SPEC.md) | AI-assisted coordination roadmap (chat brief, destination consensus) | Planned |
| [REVENUE_MODEL_SPEC.md](./REVENUE_MODEL_SPEC.md) | Revenue model: Free Core + Trip Boost | Planned |
| [TRIP_BOOST_FEATURES_SPEC.md](./TRIP_BOOST_FEATURES_SPEC.md) | Trip Boost premium features (Decision Cards, Trip Brief, Settle Up) | Draft |
| [PERSONAS_AND_FLOWS.md](./PERSONAS_AND_FLOWS.md) | User personas, stage-by-stage flows, permission matrix | Active |
| [APP_STORE_CONNECT.md](./APP_STORE_CONNECT.md) | iOS/Android app store submission notes | Active |
| [IDEAS_SCHEDULING_LLM_ASSIST.md](./IDEAS_SCHEDULING_LLM_ASSIST.md) | LLM-assisted scheduling ideas (exploration) | Draft |
| [ITINERARY_LLM_ENHANCEMENT_IDEAS.md](./ITINERARY_LLM_ENHANCEMENT_IDEAS.md) | Itinerary pipeline enhancement ideas | Draft |
| [GROWTH_TIER0_SPEC.md](./GROWTH_TIER0_SPEC.md) | Viral sharing: public previews, OG images, conversion funnel | Spec |
| [OPEN_TRIPS_SPEC.md](./OPEN_TRIPS_SPEC.md) | Discoverable hosted trips for micro-influencers (join requests, system circles) | Spec |

## API Docs

| Document | Purpose |
|----------|---------|
| [api/AVAILABILITY_API_DOCS.md](./api/AVAILABILITY_API_DOCS.md) | Availability submission API (3 payload formats, validation rules) |

## Feature Implementation Docs

| Document | Purpose | Status |
|----------|---------|--------|
| [features/PROMISING_WINDOWS_DOCS.md](./features/PROMISING_WINDOWS_DOCS.md) | Promising Windows algorithm (legacy top3_heatmap mode) | Active |
| [features/PROMISING_WINDOWS_SUMMARY.md](./features/PROMISING_WINDOWS_SUMMARY.md) | Quick reference for Promising Windows | Active |
| [features/STAGE_AWARE_NAV_SUMMARY.md](./features/STAGE_AWARE_NAV_SUMMARY.md) | Stage-aware navigation (powers ProgressStrip chevrons) | Active |
| [features/TRIP_PROGRESS_UNIFICATION.md](./features/TRIP_PROGRESS_UNIFICATION.md) | Progress snapshot unification | Completed |
| [features/CIRCLE_ONBOARDING.md](./features/CIRCLE_ONBOARDING.md) | Circle onboarding flow | Active |

## Test Docs

| Document | Purpose |
|----------|---------|
| [tests/TRIP_NAV_TEST_STEPS.md](./tests/TRIP_NAV_TEST_STEPS.md) | Stage navigation manual test steps |
| [tests/PROMISING_WINDOWS_TEST.md](./tests/PROMISING_WINDOWS_TEST.md) | Promising Windows manual test steps |
| [tests/SYSTEM_MESSAGES_TEST.md](./tests/SYSTEM_MESSAGES_TEST.md) | System messages manual test checklist |
| [tests/AVAILABILITY_TEST_STEPS.md](./tests/AVAILABILITY_TEST_STEPS.md) | Availability feature test steps |
| [tests/DASHBOARD_TEST_STEPS.md](./tests/DASHBOARD_TEST_STEPS.md) | Dashboard test steps |
| [tests/ITINERARY_DATE_VALIDATION_TEST.md](./tests/ITINERARY_DATE_VALIDATION_TEST.md) | Itinerary date validation tests |
| [tests/TEST_STAY_DERIVATION.md](./tests/TEST_STAY_DERIVATION.md) | Stay stage derivation tests |
| [tests/test_result.md](./tests/test_result.md) | Test result tracking (agent communication) |

## Root-Level Docs

| Document | Purpose |
|----------|---------|
| [../CLAUDE.md](../CLAUDE.md) | Primary project context for AI agents |
| [../README.md](../README.md) | Project overview and quick start |
| [../SETUP.md](../SETUP.md) | Setup and installation guide |
| [../scheduling_mvp.md](../scheduling_mvp.md) | Scheduling MVP specification |
