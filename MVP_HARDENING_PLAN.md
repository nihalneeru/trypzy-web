> **HISTORICAL PLANNING DOCUMENT**: Current behavior may differ from what is described here. Refer to merged PRs and current docs (CLAUDE.md, date_locking_funnel.md) for the source of truth.
>
> **Note (2026-01-29)**: CommandCenterV2, ProgressChevrons, FocusBannerV2, and TravelerStrip have been removed. The current implementation uses CommandCenterV3 with ProgressStrip. Items referencing deleted files are no longer applicable.

# Trypzy MVP Readiness Audit & Hardening Plan

> Updated 2026-01-23
> Sources: PRODUCT_PHILOSOPHY.md, CLAUDE.md, AI_DEV_CONTEXT.md, docs/features/TRIP_PROGRESS_UNIFICATION.md, comprehensive code audit

---

## Executive Summary

The MVP is **feature-complete for core flows** but has gaps in **chat-first compliance**, **state consistency after mutations**, and **brand/accessibility polish**. The overlays are production-ready, but the glue between them (CTAs, progress tracking, refresh behavior) needs tightening.

**Overall readiness**: 70-80%

| Area | Status | Critical Gaps |
|------|--------|---------------|
| Core trip flow (create → lock) | 85% | Post-mutation refresh, CTA lifecycle |
| Chat-first compliance | 60% | Missing post-lock ActionCards, join request UI |
| Stage transitions (itinerary/stay/prep) | 75% | System messages exist but CTAs not in chat |
| Privacy / permissions | 95% | Strong server-side enforcement |
| API completeness | 93% | Missing prep DELETE, transfer-leadership |
| UI/brand consistency | 70% | 10+ files use generic colors |
| Mobile responsiveness | 65% | Fixed widths, small touch targets |
| Testing | 40% | Limited E2E, some unit gaps |

---

## Prioritized Task List

### P0: Must Fix Before MVP (Blocking)

#### P0-1: Chat Action Cards for Post-Lock Stages
**Why**: Per PRODUCT_PHILOSOPHY.md, "Chat is the primary interactive surface." Users shouldn't need to discover chevron sidebar to take actions.

**Tasks**:
- [ ] Add ActionCard for "Add your ideas" when `itineraryStatus === 'collecting_ideas'`
- [ ] Add ActionCard for "Vote on stays" when accommodation options exist but not selected
- [ ] Add ActionCard for "Add transport/packing" when prep phase active
- [ ] Add ActionCard for "View itinerary" when itinerary is published

**Files**:
- `components/trip/TripTabs/tabs/ChatTab.tsx` (add CTA logic ~lines 108-165)
- `components/trip/chat/ActionCard.tsx` (add new CTA types)

---

#### P0-2: Join Request UI in Chat (Leaders Only)
**Why**: Per TRIP_PROGRESS_UNIFICATION.md, leaders should see pending join requests in chat to approve/deny without hunting through UI.

**Tasks**:
- [ ] Show pending join request card in chat for trip leaders
- [ ] Include approve/deny buttons inline
- [ ] Emit system message when request approved/denied

**Files**:
- `components/trip/TripTabs/tabs/ChatTab.tsx`
- `lib/trips/progressSnapshot.ts` (ensure join requests included)

---

#### P0-3: Post-Mutation State Refresh
**Why**: After critical actions, UI shows stale CTA/progress state. Users may re-submit or miss that their action worked.

**Tasks**:
- [ ] After date picks submission → refresh trip + progress snapshot
- [ ] After vote submission → refresh trip + update voting status
- [ ] After lock dates → refresh trip + transition CTA to itinerary stage
- [ ] After join request approval → refresh travelers list + progress
- [ ] After accommodation selection → refresh trip + transition to prep CTA
- [ ] After prep item add → refresh prep list

**Files**:
- `hooks/use-trip-chat.ts` (add mutation callbacks)
- `app/HomeClient.jsx` (ensure `onRefresh` propagates correctly)
- `components/trip/command-center-v2/overlays/*.tsx` (call onRefresh after mutations)

---

#### P0-4: Progress Snapshot Wiring
**Why**: `computeTripProgressSnapshot()` exists but isn't consistently used for CTA decisions, causing mismatches.

**Tasks**:
- [ ] Use progress snapshot as single source of truth for CTA in ContextCTABar
- [ ] Ensure ChatTab uses same progress data for ActionCard visibility
- [ ] Verify `deriveBlocker()` in CommandCenterV2 aligns with progress snapshot

**Files**:
- `lib/trips/progressSnapshot.ts`
- `lib/trips/nextAction.ts`
- `components/trip/command-center-v2/ContextCTABar.tsx`
- `components/trip/TripTabs/tabs/ChatTab.tsx`

---

### P1: High Priority (Should Fix)

#### P1-1: Prep Item Delete Endpoints
**Why**: Users can create transport and checklist items but can't delete mistakes.

**Tasks**:
- [ ] Add `DELETE /api/trips/:id/prep/transport/:transportId`
- [ ] Add `DELETE /api/trips/:id/prep/checklist/:itemId`
- [ ] Validate ownership or leader permission
- [ ] Add delete buttons in PrepOverlay UI

**Files**:
- `app/api/[[...path]]/route.js` (~line 6400+)
- `components/trip/command-center-v2/overlays/PrepOverlay.tsx`

---

#### P1-2: Transfer Leadership Endpoint
**Why**: Leaders currently can only transfer as part of leaving. Should be standalone action.

**Tasks**:
- [ ] Add `POST /api/trips/:id/transfer-leadership`
- [ ] Accept `{ newLeaderId: string }`
- [ ] Validate new leader is active traveler
- [ ] Update `trip.createdBy`
- [ ] Emit system message: "[User] is now the trip organizer"
- [ ] Keep original leader as traveler (don't remove)

**Files**:
- `app/api/[[...path]]/route.js`
- `components/trip/command-center-v2/overlays/TravelersOverlay.tsx` (add standalone transfer button)

---

#### P1-3: Brand Color Enforcement
**Why**: 10+ components use generic Tailwind colors (blue-600, green-600, indigo-600) instead of brand tokens.

**Tasks**:
- [ ] `CommandCenterV2.tsx` lines 242-262: Replace `blue-600`, `purple-600`, `orange-600`, `green-600` with brand colors
- [ ] `ProgressChevrons.tsx` line 195: Replace `text-green-600` with brand color for completed state
- [ ] `FocusBannerV2.tsx` lines 71-81: Same fixes as CommandCenterV2
- [ ] `TripProgressMini.jsx` lines 37-67: Replace `green-600`, `blue-600`, `gray-300`
- [ ] `TripCard.jsx` line 197: Replace `text-indigo-600` with `text-brand-red`
- [ ] `CircleOnboardingInterstitial.jsx` lines 118-119, 277-278: Replace `green-*`, `indigo-*`
- [ ] `TravelerStrip.tsx` lines 64-72, 111-112: Replace avatar colors and `ring-blue-500`

**Brand tokens** (from globals.css):
```css
--brand-red: #FA3823;      /* CTAs, blockers, errors */
--brand-blue: #00334D;     /* Secondary CTAs, links, completed states */
--brand-carbon: #2E303B;   /* Text, dark elements */
--brand-sand: #F2EDDA;     /* Highlights, backgrounds */
```

---

#### P1-4: Mobile Responsiveness Fixes
**Why**: Fixed widths and small touch targets break mobile experience.

**Tasks**:
- [ ] `OverlayContainer.tsx` line 178: Change `width: '448px'` to `w-full md:w-[448px] max-w-[calc(100vw-20px)]`
- [ ] `ProgressChevrons.tsx` lines 78-79: Increase mobile size from `w-3.5 h-3.5` to minimum 44px touch target
- [ ] `ContextCTABar.tsx` lines 199-241: Increase button sizes to 44px minimum on mobile
- [ ] `CommandCenterV2.tsx` lines 37-38: Make chevron bar width responsive

---

#### P1-5: CTA Lifecycle Alignment
**Why**: CTA ordering in ContextCTABar should match product rules and not add pressure.

**Tasks**:
- [ ] Verify CTA priority order matches stage progression
- [ ] Ensure CTAs use inviting language ("Add your ideas" not "Submit ideas now")
- [ ] Remove any "waiting on you" pressure language from CTAs
- [ ] Verify leader-only CTAs properly guarded

**Files**:
- `components/trip/command-center-v2/ContextCTABar.tsx`
- `lib/trips/nextAction.ts`

---

### P2: Important but Not Blocking

#### P2-1: Accessibility Improvements
**Tasks**:
- [ ] Add `aria-hidden="true"` to decorative icons (CircleSection.jsx:47, TripCard.jsx:136)
- [ ] Add progress ARIA attributes to TripProgressMini.jsx (`role="progressbar"`, `aria-valuenow`)
- [ ] Fix color contrast: `text-gray-400` on light backgrounds needs darker shade
- [ ] Standardize focus rings to `focus:ring-brand-blue`

---

#### P2-2: Stage Transition System Messages
**Why**: Clear milestone messages help users understand progress without pressure.

**Tasks**:
- [ ] Verify "Dates locked" message mentions itinerary as next step
- [ ] Add "Accommodation confirmed" message when stay selected
- [ ] Add "Prep phase started" message when first prep item added
- [ ] Review all system message copy for calm, non-pressuring tone

**Files**:
- `app/api/[[...path]]/route.js` (search for `emitTripChatEvent`)

---

#### P2-3: Circle Updates Copy Review
**Why**: Per PRODUCT_PHILOSOPHY.md, "Circle updates are read-only digests" - ensure they don't pressure.

**Tasks**:
- [ ] Review event type names and copy
- [ ] Ensure updates inform without creating obligation
- [ ] Remove any "action required" language from digests

---

#### P2-4: E2E Test Coverage
**Tasks**:
- [ ] Add E2E test: Create trip → submit picks → open voting → lock dates
- [ ] Add E2E test: Lock dates → add idea → generate itinerary
- [ ] Add E2E test: Select accommodation → add prep items
- [ ] Add E2E test: Full happy path end-to-end

**Files**:
- `e2e/trip-flow.spec.ts` (new file)

---

#### P2-5: Unit Test Coverage
**Tasks**:
- [ ] Add tests for progress snapshot computation
- [ ] Add tests for CTA priority logic edge cases
- [ ] Add tests for new endpoints (prep delete, transfer-leadership)

---

## Implementation Order

### Week 1: Chat-First + State Consistency (P0)
| Day | Tasks |
|-----|-------|
| 1-2 | P0-1: Chat ActionCards for post-lock stages |
| 2-3 | P0-2: Join request UI in chat |
| 3-4 | P0-3: Post-mutation state refresh |
| 4-5 | P0-4: Progress snapshot wiring |

### Week 2: API + Brand Polish (P1)
| Day | Tasks |
|-----|-------|
| 1 | P1-1: Prep item delete endpoints |
| 1-2 | P1-2: Transfer leadership endpoint |
| 2-3 | P1-3: Brand color enforcement |
| 3-4 | P1-4: Mobile responsiveness fixes |
| 4-5 | P1-5: CTA lifecycle alignment |

### Week 3: Polish + Testing (P2)
| Day | Tasks |
|-----|-------|
| 1 | P2-1: Accessibility improvements |
| 2 | P2-2: Stage transition messages |
| 2 | P2-3: Circle updates copy review |
| 3-4 | P2-4: E2E test coverage |
| 4-5 | P2-5: Unit test coverage |

---

## Files Changed Summary

| Priority | File | Changes |
|----------|------|---------|
| P0 | `ChatTab.tsx` | ActionCards for post-lock, join request UI |
| P0 | `ActionCard.tsx` | New CTA types |
| P0 | `use-trip-chat.ts` | Mutation refresh callbacks |
| P0 | `HomeClient.jsx` | onRefresh propagation |
| P0 | `ContextCTABar.tsx` | Progress snapshot integration |
| P0 | Overlay components | Call onRefresh after mutations |
| P1 | `route.js` | Prep delete, transfer-leadership endpoints |
| P1 | `PrepOverlay.tsx` | Delete buttons |
| P1 | `TravelersOverlay.tsx` | Standalone transfer button |
| P1 | `CommandCenterV2.tsx` | Brand colors, responsiveness |
| P1 | `ProgressChevrons.tsx` | Brand colors, touch targets |
| P1 | `FocusBannerV2.tsx` | Brand colors |
| P1 | `OverlayContainer.tsx` | Responsive width |
| P1 | `TripProgressMini.jsx` | Brand colors |
| P1 | `TripCard.jsx` | Brand colors |
| P2 | `route.js` | System message improvements |
| P2 | `e2e/trip-flow.spec.ts` | New E2E tests |
| P2 | `tests/trips/*` | New unit tests |

---

## Success Criteria

MVP hardening is complete when:

1. **Chat-first**: All stages have CTAs available in chat without needing sidebar
2. **State consistency**: UI updates immediately after any mutation
3. **Progress alignment**: CTA, chevrons, and chat all show consistent state
4. **Brand compliance**: No generic Tailwind colors in trip UI components
5. **Mobile ready**: 44px minimum touch targets, responsive widths
6. **Non-pressuring**: All copy invites action without creating obligation
7. **Testable**: Core flow E2E test passes consistently

---

## Quick Reference: Priority Order

```
P0-1  Chat ActionCards for post-lock stages
P0-2  Join request UI in chat
P0-3  Post-mutation state refresh
P0-4  Progress snapshot wiring
─────────────────────────────────
P1-1  Prep item delete endpoints
P1-2  Transfer leadership endpoint
P1-3  Brand color enforcement
P1-4  Mobile responsiveness fixes
P1-5  CTA lifecycle alignment
─────────────────────────────────
P2-1  Accessibility improvements
P2-2  Stage transition messages
P2-3  Circle updates copy review
P2-4  E2E test coverage
P2-5  Unit test coverage
```

*Combined from original audit findings and product-aligned priorities*
