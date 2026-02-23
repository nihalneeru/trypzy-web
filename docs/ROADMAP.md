# Tripti Product Roadmap

> **Status:** Active
> **Council reviewed:** 2026-02-23 (Gemini 3 Pro + GPT-5.2 + Claude Opus 4.6, 2 rounds with cross-review)
> **Last updated:** 2026-02-23

## Strategic Context

- **Stage:** Private beta (~50 users, ~20 circles)
- **Primary goal:** Prove PMF and grow user base before monetizing
- **Growth hypothesis:** Shareable content (trip previews, briefs) → viral acquisition
- **Revenue hypothesis:** Trip Boost ($4.99/trip) — deferred until growth proves out
- **Dev capacity:** Solo founder + AI agents

## Guiding Principles (Council Consensus)

1. **Growth before revenue.** No monetization work until user base is growing organically.
2. **Security before public pages.** API must be hardened before anything is publicly accessible.
3. **Build the share loop first.** Every trip should be a landing page for new users.
4. **Gate phases on data, not dates.** Move to next phase when metrics justify it, not on a calendar.
5. **Ship free value first, gate premium later.** Features like Trip Brief and Decision Cards have free tiers that drive retention and growth — don't hide them behind paywalls from day one.

---

## Phase 0 — Safe to Ship Public (~1 week)

**Goal:** Ensure the app doesn't leak data or buckle under load when public pages go live.

| # | Issue | Why |
|---|-------|-----|
| #187 | Participant status enforcement for remaining endpoints | Auth holes must close before public exposure |
| #183 | API rate limiting (Redis/Upstash) | Public endpoints invite scraping + shareId enumeration |

**Parallelizable:** Both issues are independent.

**Also during Phase 0:** Fix focus traps, keyboard nav, and color contrast on any pages that will become public (opportunistic a11y, not a separate sprint).

**Exit criteria:** All write endpoints enforce `isActiveTraveler()`. Public endpoints rate-limited. No PII leaks in sanitized trip responses.

---

## Phase 1 — The Viral Loop (~2-3 weeks)

**Goal:** Turn every locked trip into a shareable landing page that converts viewers into users.

| # | Issue | Why |
|---|-------|-----|
| #231 | Public trip preview page (`/p/[shareId]`) + sharing controls + privacy modal | The "hook" — the core shareable artifact. Absorbs #234. |
| #232 | Dynamic OG images for shared trip links | Rich previews in iMessage/WhatsApp/Slack drive click-through |
| #233 | Non-user conversion funnel (share → preview → signup) | Traffic is useless without a path to signup. Include Capacitor deep linking. |

**Key technical notes:**
- Create a strict `sanitizeForPublic()` DTO — allowlist fields only, never pass full Mongo document to client
- `generateMetadata()` must not fetch the full trip (prevents PII in Next.js hydration payload)
- Deep linking: handle `App.addListener('appUrlOpen', ...)` in Capacitor for share → install → open-to-trip flow

**Exit criteria:** A user can share a trip link → recipient sees rich OG card → taps → sees preview → signs up → lands in context. Track: preview views, signup rate, join/participate rate.

**Spec:** [`docs/GROWTH_TIER0_SPEC.md`](./GROWTH_TIER0_SPEC.md)

---

## Phase 2 — Retain & Delight (~2-3 weeks)

**Goal:** Give users reasons to come back and share more. Make the app useful beyond scheduling.

| # | Issue | Why |
|---|-------|-----|
| #207 | Unified Trip Status header card | "What do I do now?" clarity — reduces new user confusion |
| #250 | Trip Brief: aggregation endpoint + overlay | Living summary of the trip — the thing users forward to partners/parents |
| #251 | Trip Brief: shareable public link | Second viral vector — every shared brief shows Tripti branding |
| #236 | ICS calendar export for locked trips | High utility, low effort, drives word-of-mouth |
| #205 | Dashboard notifications (minimal) | "Since last visit" + "needs your input" — the heartbeat that brings users back |

**Scope guard on #205:** Implement as activity feed / dashboard cards only. No push, no email, no complex preference matrix. Keep it minimal.

**Trip Brief is free.** The shareable link is a growth engine — every public brief shows "Planned with Tripti" to non-users. Only export/print and address privacy toggle are Boosted (monetization phase).

**Exit criteria:** Users have a reason to open the app even when they're not actively scheduling. Shared briefs generate preview views.

**Spec:** [`docs/TRIP_BOOST_FEATURES_SPEC.md`](./TRIP_BOOST_FEATURES_SPEC.md) (Trip Brief section)

---

## Phase 3 — Growth Expansion (choose based on Phase 1 data, ~2-3 weeks)

**Gate:** Only start when Phase 1 metrics show the share loop is converting.

Choose the highest-leverage option based on what the data says:

### Option A: Open Trips (if demand signal exists)

Expand beyond friend circles into discoverable hosted trips.

| # | Issue | Why |
|---|-------|-----|
| #238 | Schema: visibility, joinPolicy, capacity + system circles | Foundation |
| #239 | System circle auto-creation for hosted trips | FK compatibility |
| #240 | Join request endpoint + approve/decline/bulk-approve | Core mechanic |
| #241 | Trip creation UI: "Who can join?" radio + capacity | Creator flow |
| #242 | Public landing page: join CTA + request states | Acquisition loop |
| #243 | TravelersOverlay: pending request management | Host ops |
| #244 | Host bio + event emission | Polish + tracking |

**Demand signals:** Users asking for public/joinable trips, host archetype observed in beta, or share-to-stranger behavior detected.

**Spec:** [`docs/OPEN_TRIPS_SPEC.md`](./OPEN_TRIPS_SPEC.md)

### Option B: Decision Cards free tier (if coordination pain observed)

Structured polls for post-lock group decisions.

| # | Issue | Why |
|---|-------|-----|
| #247 | Decision Cards: collection, CRUD, voting, chat integration | Retention tool — "we can't decide X" is a real pain point |

**Free tier only:** Unlimited polls, simple voting, manual close by leader. Deadline, auto-close, and nudge features deferred to monetization phase.

**Spec:** [`docs/TRIP_BOOST_FEATURES_SPEC.md`](./TRIP_BOOST_FEATURES_SPEC.md) (Decision Cards section)

### Option C: Push Notifications (if retention is the bottleneck)

| # | Issue | Why |
|---|-------|-----|
| #178 | Web Push for browsers | Biggest retention lever for coordination apps |

---

## Phase 4+ — Later Work (data-driven)

These are real features with clear specs, but they require validation data before committing engineering time.

### AI Coordination (only if users report scheduling convergence pain)

| # | Issue |
|---|-------|
| #208 | F3: Destination consensus phase |
| #210 | F2: Shared Notes from chat (constraint extraction) |
| #211 | F6: Smart Propose for leader |

**Spec:** [`docs/AI_COORDINATION_SPEC.md`](./AI_COORDINATION_SPEC.md)

### Monetization (only after 50+ locked trips from 20+ distinct circles)

| # | Issue |
|---|-------|
| #245 | Stripe integration: account setup, checkout session, webhook |
| #246 | Feature gating infrastructure (`isFeatureGated()` + inline gate card) |
| #247 | Decision Cards: Boosted features (deadlines, auto-close, nudge) |
| #252 | Settle Up: settlement computation + UI + reminders |
| #182 | Notification preferences UI (only after notifications exist) |

**Spec:** [`docs/REVENUE_MODEL_SPEC.md`](./REVENUE_MODEL_SPEC.md), [`docs/TRIP_BOOST_FEATURES_SPEC.md`](./TRIP_BOOST_FEATURES_SPEC.md)

### Growth Extensions

| # | Issue |
|---|-------|
| #235 | "Remix this trip" — create trip from shared itinerary |

---

## Icebox (revisit when data justifies)

| # | Issue | Reason |
|---|-------|--------|
| #209 | F4: Least Misery leader decision support | Advanced AI — premature |
| #254 | Affiliate experiment | Needs traffic volume first |
| #255 | Trip Boost bundle + PPP pricing | No single-boost data yet |

---

## Ongoing (not phased)

These don't block features. Work them in opportunistically.

| # | Issue | Notes |
|---|-------|-------|
| #184 | Replace generic Tailwind colors with brand tokens | Polish — do during UI work |
| #185 | Accessibility polish | Fix as you touch files, especially public pages |
| #188 | Figma: Auth, onboarding & welcome page | Design reference |
| #189 | Figma: Dashboard & circle pages | Design reference |
| #190 | Figma: Trip Command Center + chat | Design reference |
| #191 | Figma: Trip overlays | Design reference |
| #192 | Figma: Push notifications + Trip Boost | Design reference |
| #193 | Figma: Logo animation | Design reference |

---

## Issue Changelog

| Action | Issues | Reason |
|--------|--------|--------|
| **Closed** | #234 | Merged into #231 (sharing controls are part of public preview) |
| **Closed** | #248, #249 | Merged into #247 (Decision Cards is one feature) |
| **Closed** | #253 | Merged into #252 (Settle Up is one feature) |
| **Closed** | #237 | Premature — Discover not active enough |
| **Closed** (prev) | #179, #180, #181 | Superseded by detailed revenue issues |
| **Iceboxed** | #209, #254, #255 | Premature — need data first |

---

## Metrics That Gate Phase Transitions

| Transition | Metric | Threshold |
|------------|--------|-----------|
| Phase 0 → 1 | API security audit pass | All write endpoints enforce `isActiveTraveler()` |
| Phase 1 → 2 | Public preview deployed | At least 1 user shares a trip link successfully |
| Phase 2 → 3 | Share loop conversion | Measurable preview → signup → join funnel |
| Phase 3 → 4+ | Engagement depth | Repeat trip creation, post-lock feature usage |
| → Monetization | Locked trips from distinct circles | 50+ locked trips from 20+ circles |
