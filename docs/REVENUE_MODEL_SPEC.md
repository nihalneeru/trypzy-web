# Tripti Revenue Model Spec

> Status: REVISED (AI Council review 2026-02-20 — Gemini 2.5 Pro + GPT-5.2, 2 rounds)
> Target: March 2026 public launch from private beta
> Last updated: 2026-02-20

## Executive Summary

**Model**: Free Core + Trip Boost (per-trip premium) + Affiliate Experiment

**Philosophy**: Tripti's core coordination flow (scheduling, chat, locking dates) stays free. Revenue comes from premium planning tools purchased per-trip. No subscriptions at launch. No per-seat pricing ever. Travelers never pay to participate.

**Key numbers**:
- Trip Boost: $4.99/trip (one-time, any traveler can purchase)
- Phase 1 revenue: $0 (intentional — prove the funnel first)
- Break-even: ~15-20 boost purchases/month ($50-80/mo infrastructure costs)
- LLM cost per trip: $0.05-0.30 (gpt-4o-mini)

---

## Phase 1 — Launch (March 2026): Free + Affiliate Experiment

### Everything is free

All trip creation, scheduling (date windows, reactions, locking), chat, itinerary (1 LLM-generated version), basic prep lists, push notifications, expenses tracking. Zero paywalls.

### Affiliate experiment (background, $0 revenue expected)

- Add contextual affiliate links in AccommodationOverlay (Booking.com partner program, application pending) and ItineraryOverlay (Viator/GetYourGuide for bookable activities)
- Track click-through rates and conversion. Goal: learn whether users engage, not generate revenue
- If Booking.com affiliate application is rejected, skip entirely. Don't block launch on this
- **No affiliate revenue in any projections** — Airbnb's affiliate program is closed to small publishers, Booking.com requires traffic proof

### Trip Boost: built but soft-launched

- Stripe Checkout integration (web-only)
- Trip-level `boostStatus: 'free' | 'boosted'` field in the `trips` collection
- Feature gating infrastructure in place
- **Soft-launched means**: available if users find it (e.g., trip settings), not aggressively promoted. No upsell modals, no banners, no "premium" badges on free features. Only way to discover it is trip settings or if we point specific beta testers at it.

---

## Phase 2 — Post-Launch: Trip Boost Goes Active ($4.99/trip)

### Activation trigger

Trip Boost upsells go active once we see:
- **50 trips reach "locked" status** from **at least 20 distinct circles**
- This ensures breadth (not just 3 power-user circles)
- Query: count distinct `circleId` on `trip_events` where `eventType = 'scheduling.dates.locked'`

### Trip Boost ($4.99, one-time per trip)

**Who can buy**: Any traveler in the trip (not just the leader). Framed as a gift/contribution, not a leader tax.

**What it unlocks** (the "Leader's Sanity Kit" — see `TRIP_BOOST_FEATURES_SPEC.md` for full details):
| Feature | Free | Boosted |
|---------|------|---------|
| Decision Cards | Unlimited simple polls | + Deadlines, auto-close, tie-break, nudge non-voters |
| Trip Brief | Full in-app brief + shareable link (growth) | + Export/print, address privacy toggle |
| Settle Up | Basic expense tracking + balances | + Minimum payment plan, send reminders, mark settled |

**Where upsells surface (friction-point triggers)**:
- User creates a decision and adds a deadline → inline card: "Deadlines are part of Trip Boost"
- Leader taps "Share" on the trip brief → inline card explaining shareable link + boost CTA
- Any user taps "Settle Up" in expenses → inline card explaining the feature + boost CTA
- Creditor taps "Send Reminder" in Settle Up → same pattern

**Where upsells NEVER surface (protected moments)**:
- Right after dates lock (celebration moment)
- Right after someone joins (welcome moment)
- During active scheduling (coordination moment)
- In the chat feed (sacred space)

This is a **hard rule**, not a guideline.

### Feature-gate UX pattern (define once, reuse everywhere)

The gate should feel like discovery, not a blocker:
- Show the feature visibly (not hidden/grayed out)
- When user taps, show an **inline card** (not a modal/popup) within the overlay
- Card contains: feature description + "Boost this trip — $4.99" button + "Boosting also unlocks [other features]"
- Non-boosted users see the feature name but can't use it — they learn what's available through natural exploration
- No "premium" badges, lock icons, or crown emojis. Keep it understated.

### Social notification on boost

- **Leader boosts**: "🎉 [Name] boosted this trip!" in trip chat
- **Non-leader boosts**: "🎉 This trip just got an upgrade!" (anonymous, avoids social awkwardness)
- Notification is a system message in chat, same styling as nudge messages (`bg-brand-sand`)

### Payment infrastructure

- **Web-only via Stripe Checkout** — no Apple/Google IAP in Phase 2
- Native apps (iOS/Android via Capacitor): "Boost your trip at tripti.ai" deep link
  - Avoid explicit "cheaper on web" language in native UI (Apple anti-steering rules)
  - Keep neutral: "Manage your trip at tripti.ai"
- Stripe webhook confirms payment → sets `trip.boostStatus = 'boosted'` + `trip.boostedBy` + `trip.boostedAt`
- No Stripe subscription products needed — one-time payments only

### Refund policy

**Generally non-refundable.** Stated clearly at checkout: "Purchases are generally non-refundable. If something went wrong, contact support." At $4.99, routine refunds aren't economical — but we need minimal infrastructure to handle Stripe disputes/chargebacks (which cost $15-20 each and threaten account health). Admin-only refund endpoint for exceptional cases. `boost_purchases.status` tracks `completed | refunded | disputed | chargeback`.

### Cost-sharing option (opt-in)

After a successful boost purchase, the success screen shows an **unchecked checkbox**:
```
[ ] Split cost with the group (adds $4.99 to trip expenses)
```
- **Default OFF** — the boost is framed as a gift. Splitting is the exception, not the rule.
- If checked → fires a standard `POST /api/trips/:tripId/expenses` with `{ title: "Trip Boost", amountCents: 499, paidByUserId, splitBetweenUserIds: allActiveTravelerIds }`
- Appears as a regular expense line item — no special badge or "boost" icon
- **Hidden when `travelerCount <= 1`** (splitting with yourself is nonsensical)
- Purchaser can also add it manually later through the normal expense flow
- No auto-recalculation when travelers join/leave (standard expense behavior)
- No coupling between payment status and expense system (independent systems)

---

## Phase 3 — Month 4-6: Boost Bundle + Expansion

### 3 Trip Boost Bundle: $12.99 (save $2)

- For repeat planners who plan 2-4 trips/year
- Effective price: $4.33/trip (13% discount)
- Consumable purchase (IAP-friendly, avoids Apple subscription rules)
- Web purchase only initially

### International pricing (PPP)

| Market | Trip Boost | 3-Pack |
|--------|-----------|--------|
| US/Canada/UK/AU | $4.99 | $12.99 |
| EU | €4.49 | €11.99 |
| India | ₹199 | ₹499 |
| Brazil | R$14.99 | R$39.99 |
| Southeast Asia | ~$2.99 equiv | ~$7.99 equiv |

Implement via Stripe pricing tables when volume justifies the engineering.

### Evaluate subscription tier

Only if we see users purchasing 3+ individual boosts organically. If that pattern emerges, consider Tripti Plus ($5.99/mo) with genuinely differentiated features:
- Cross-trip features (persistent packing lists, trip history insights, "your travel year in review")
- Circle-level features (circle analytics, shared preferences)
- Not just "unlimited Trip Boost" — needs unique value

If that pattern doesn't emerge, stick with per-trip pricing. Don't build a subscription for hypothetical users.

### IAP integration (if needed)

- Only if native app boost purchases are a significant demand signal
- Apple takes 30% year 1, 15% year 2; Google takes 15-30%
- Effective revenue per boost via IAP: $3.49 (vs $4.99 via web Stripe)
- Decision: only build IAP if >30% of boost-eligible users are on native AND attempting to buy

### Expanded affiliate integration

If Phase 1 affiliate experiment showed meaningful click-through (>5% of users reaching Stay stage), expand:
- Activity bookings during itinerary planning (Viator/GetYourGuide)
- Flight deal suggestions (Skyscanner affiliate, if applicable)
- Travel insurance recommendations

If click-through was negligible, deprioritize affiliate permanently.

---

## Revenue Projections (honest)

| Phase | Timeline | Trips/month | Boost conversion | Revenue/month |
|-------|----------|-------------|------------------|---------------|
| 1 | Month 1-2 | 50-100 | 0% (soft-launched) | $0 |
| 2 | Month 3-4 | 150-200 | 10-15% | $75-150 |
| 2+ | Month 5-6 | 300-500 | 15-20% | $225-500 |
| 3 | Month 6+ | 500+ | 15-20% + bundles | $375-600 |

**Infrastructure costs**:
- Vercel Pro: $20/month
- MongoDB Atlas (shared): $0-10/month (free tier may suffice initially)
- OpenAI API (LLM): $10-50/month (scales with trip volume)
- Stripe fees: 2.9% + $0.30 per transaction
- Domain + misc: $5/month
- **Total**: ~$50-80/month

**Net revenue per boost** (after Stripe 2.9% + $0.30): ~$4.55
**Break-even**: 11-18 boost purchases/month (at $4.55 net) → achievable in Phase 2.

---

## What Stays Free (non-negotiable internally, "included in free plan" externally)

1. Trip creation and circle management
2. Date window scheduling (suggest, support, react, lock)
3. Trip chat (all messages, system nudges)
4. Basic itinerary (1 LLM-generated version)
5. Basic prep lists (manual items)
6. Push notifications
7. Joining trips (travelers NEVER pay to participate)
8. Basic expense tracking (add, view, balances)

**Why this is non-negotiable internally**: The scheduling flow is the viral growth loop. Every traveler who joins a trip is a potential future leader who creates their own trip. Gating any part of this loop kills growth. This is not generosity — it's strategic.

**Why we don't say "free forever" externally**: We have zero paying users and no unit economics data. "Included in the free plan" leaves room to adjust if LLM costs spike 5x or a feature becomes the primary value driver. But the internal intent is: these features stay free.

---

## Implementation Timeline

| Phase | Task | Effort | Dependency |
|-------|------|--------|-----------|
| 1a | Stripe account setup + API keys in env | 1 day | — |
| 1b | `POST /api/trips/:id/boost` endpoint (Stripe Checkout session) | 2 days | 1a |
| 1c | Stripe webhook handler (payment confirmation → update trip) | 1 day | 1b |
| 1d | Trip `boostStatus` field + feature gating helpers | 1 day | — |
| 1e | Soft gate UI pattern (inline card component) | 1 day | 1d |
| 1f | Affiliate link components (Accommodation + Itinerary overlays) | 2 days | Partner applications |
| 2a | Decision Cards (collection, CRUD, voting, chat card) | 5 days | 1e |
| 2b | Trip Brief (aggregation endpoint, overlay, public page) | 5 days | 1e |
| 2c | Settle Up (server-side computation, UI, reminders) | 4 days | 1e |
| 2d | Gating + polish (gate helper, inline cards, Stripe) | 2 days | 2a-2c |
| 2e | Boost social notification in chat | 0.5 day | 1c |
| 2f | "Boost at tripti.ai" deep link in native apps | 0.5 day | 1b |
| 3a | 3-pack bundle (Stripe product + redemption logic) | 2 days | Phase 2 |
| 3b | PPP pricing tiers (Stripe pricing tables) | 1-2 days | Phase 2 |
| 3c | IAP integration (if needed) | 2-3 weeks | Volume justification |
| 3d | Admin dashboard: boost metrics, revenue tracking | 2 days | Phase 2 |

**Total Phase 1+2**: ~20-22 days of engineering (16 days for Boost features + 4-6 days for Stripe/gating infra)
**Total Phase 3 (excluding IAP)**: ~5-6 days
**IAP (if ever)**: 2-3 weeks (Apple/Google review process adds calendar time)

---

## Database Changes

### Modified collections

**`trips`** — add fields:
```javascript
{
  boostStatus: 'free' | 'boosted',    // default: 'free'
  boostedBy: ObjectId | null,          // userId who purchased
  boostedAt: Date | null,              // purchase timestamp
  stripePaymentId: String | null,      // Stripe reference for audit
}
```

### New collections

**`boost_purchases`** — payment audit trail:
```javascript
{
  id: String,
  tripId: String,
  userId: String,               // purchaser
  amount: Number,               // in cents (499)
  currency: String,             // 'usd'
  stripeSessionId: String,
  stripePaymentIntentId: String,
  status: 'completed' | 'refunded' | 'disputed' | 'chargeback',
  createdAt: Date,
}
```

**Indexes**:
- `boost_purchases`: `{ tripId: 1 }`, `{ userId: 1 }`, `{ stripePaymentIntentId: 1 }` (unique)

---

## Rejected Alternatives

| Alternative | Why rejected |
|------------|-------------|
| Per-traveler pricing | Kills virality. Leader won't invite people if it costs more per head. |
| Gating scheduling features | Core value prop must be free. Can't prove PMF behind a paywall. |
| Ad-supported | Too few users, degrades premium feel, brand-inconsistent. |
| Subscription from Day 1 | Insufficient value differentiation from Trip Boost. Bundle is simpler. |
| Enterprise/Teams as Phase 1 | Wrong audience for consumer launch. Revisit at $5K+ MRR. |
| Leader-only purchasing | Taxes the organizer. Any traveler should be able to contribute. |
| Freemium with aggressive upsells | Contradicts brand philosophy ("helpful organizer, not a manager"). |
| Tipping mechanic | Interesting but adds social complexity. Revisit post-launch. |
| Auto-add boost as group expense | Creates uninvited financial obligation; contradicts "low-pressure" brand. Opt-in checkbox instead. |

---

## Decision Log

| Decision | Rationale | Source |
|----------|-----------|--------|
| Web-only Stripe, no IAP v1 | Avoids Apple 30%, simpler, "manage at tripti.ai" pattern | Codex R1 |
| Any traveler can boost | Avoids "leader tax," enables gift dynamic | Codex R1 |
| No subscription tier initially | Insufficient differentiation; bundle is simpler | Codex R1, Claude |
| $0 affiliate revenue projections | Airbnb affiliate closed, Booking.com requires traffic proof | Codex R1 |
| Soft-launch Trip Boost at launch | Infrastructure ready but not promoted. Retrofitting later is harder. | Claude (Codex concurred R2) |
| No upsell at celebration moments | Protects trust and brand feel. Hard rule. | Codex R1 |
| All sales final, no refunds | $5 purchase — refund infra cost exceeds revenue; stated at checkout | Founder directive |
| Boost cost-sharing is opt-in (default OFF) | Preserves gift framing; auto-add creates uninvited obligations | Codex R3, Claude |
| "50 trips locked, 20+ circles" activation | Ensures funnel breadth before monetizing | Codex R2 |
| Inline soft-gate (not modal) | Brand-consistent, discovery-driven, not coercive | Codex R2 |
| 3-pack bundle (not 5-pack) | Maps to 2-4 trips/year reality | Codex R2 |
| Anonymous boost notification for non-leaders | Avoids social awkwardness | Codex R2 |
| Replace vitamin features with painkiller bundle | Original features (extra itineraries, AI packing, photo export) are "vitamins" not worth $5 | AI Council (Gemini 2.5 Pro + GPT-5.2), 2026-02-20 |
| Decision Cards + Trip Brief + Settle Up bundle | Solves arguments, repetitive questions, and money — the 3 biggest post-lock pains | AI Council brainstorm + stress test |
| Kill ranked-choice voting | High complexity, low usage, confusing UX; simple majority + deadline/closure is the real value | AI Council unanimous |
| Kill task assignments | PM vibes, social friction of "assigning" friends, violates brand; groups aren't projects | AI Council (Gemini strong, GPT concurred) |
| Gate shareability not freshness | Stale data is trust poison; free brief must always be correct | AI Council (GPT strong, Gemini concurred R2) |
| Add dispute/chargeback states | "All sales final" creates Stripe account risk; need minimal dispute handling | AI Council (GPT MF-3, Gemini concurred R2) |
| Net revenue in projections | Break-even math must use $4.55 net (after Stripe fees), not gross $4.99 | AI Council (GPT MF-2) |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Trips die at scheduling (never reach locked) | No Trip Boost market | Phase 1 is free — focus on funnel, not revenue |
| Users move to WhatsApp after locking dates | Post-lock features unused, no boost demand | Make itinerary + prep genuinely useful |
| LLM costs spike | Free tier becomes expensive | Monitor per-trip LLM cost; can reduce free version quality |
| Apple rejects "boost at tripti.ai" pattern | Can't sell to native users without IAP | Build IAP as fallback; many apps use this pattern successfully |
| $4.99 too high for international markets | Low conversion outside US/UK | PPP pricing in Phase 3 |
| Stripe Checkout friction (redirect to web) | Lower conversion than in-app | Optimize checkout page; consider Stripe embedded checkout |

---

## Metrics to Track

### Phase 1 (pre-monetization)
- % of trips reaching "locked" (primary health metric)
- Trips per circle (engagement depth)
- Affiliate click-through rate (if implemented)
- Post-lock feature usage (itinerary, prep, expenses — future boost demand signals)

### Phase 2 (Trip Boost active)
- Boost conversion rate (purchases / trips reaching locked)
- Revenue per trip (RPT)
- Boost purchaser role (leader vs traveler)
- Feature usage delta (boosted vs free trips)
- Refund rate

### Phase 3 (bundle + expansion)
- Bundle vs individual purchase ratio
- Repeat purchase rate (same user, different trips)
- Subscription evaluation trigger: users with 3+ individual purchases
- MRR and growth rate
