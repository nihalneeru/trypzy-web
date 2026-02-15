# Circle Onboarding Interstitial

## Overview
After successfully creating a circle, users see a lightweight onboarding interstitial that guides them to either create their first trip or invite members, instead of immediately dropping them into the generic circle page.

## Files Changed

### New Files
- **components/dashboard/CircleOnboardingInterstitial.jsx** (NEW)
  - Three-mode dialog: interstitial → create-trip → invite
  - Primary CTA: "Create first trip"
  - Secondary CTA: "Invite members"
  - Tertiary link: "Skip for now" (navigates to circle page)

### Updated Files
- **components/dashboard/CreateCircleDialog.jsx**
  - Updated `onSuccess` callback to pass circle data (for onboarding)
  
- **app/dashboard/page.js**
  - Added state for `newCircle` to track newly created circle
  - Updated `handleCreateCircleSuccess` to show interstitial instead of just reloading
  - Added `CircleOnboardingInterstitial` component

## Implementation Details

### Interstitial Flow
1. **Interstitial View**: Shows success message with three options
   - Primary: "Create first trip" → switches to create-trip mode
   - Secondary: "Invite members" → switches to invite mode
   - Tertiary: "Skip for now" → navigates to circle page

2. **Create Trip Mode**: 
   - Full trip creation form (reuses CreateTripDialog form fields)
   - After creation, navigates to trip detail page (chat-first)
   - Uses `tripHref()` for navigation (defaults to chat tab)

3. **Invite Members Mode**:
   - Shows invite code with copy button
   - Success feedback when copied
   - "Done" button returns to dashboard

### Navigation
- **Create Trip**: Navigates to `/trips/[tripId]` (defaults to chat tab)
- **Skip**: Navigates to `/circles/[circleId]` (circle detail page)
- **Invite Done**: Closes dialog, stays on dashboard

## Manual Test Steps

### Test 1: Create Circle → See Interstitial
1. Go to Dashboard
2. Click "Create Circle"
3. Enter circle name and description
4. Click "Create Circle"
5. **Expected**: 
   - Circle created toast appears
   - Create circle dialog closes
   - Onboarding interstitial appears with success message
   - Shows three options: "Create first trip", "Invite members", "Skip for now"

### Test 2: Create First Trip Flow
1. Complete Test 1 to see interstitial
2. Click "Create first trip"
3. **Expected**: Interstitial switches to trip creation form
4. Fill in trip details:
   - Trip name: "Test Trip"
   - Type: Collaborative
   - Start date: Future date
   - End date: Future date
   - Duration: 3 days
5. Click "Create Trip"
6. **Expected**:
   - Trip created toast appears
   - Interstitial closes
   - Navigates to `/trips/[tripId]`
   - Chat tab is active by default
   - NextAction CTA appears in chat (e.g., "Discuss dates" for collaborative trip)

### Test 3: Invite Members Flow
1. Complete Test 1 to see interstitial
2. Click "Invite members"
3. **Expected**: Interstitial switches to invite view
4. Verify invite code is displayed
5. Click copy button
6. **Expected**:
   - Toast: "Invite code copied!"
   - Copy button shows visual feedback
   - Code is in clipboard
7. Click "Done"
8. **Expected**: Interstitial closes, stays on dashboard

### Test 4: Skip Flow
1. Complete Test 1 to see interstitial
2. Click "Skip for now"
3. **Expected**:
   - Interstitial closes
   - Navigates to `/circles/[circleId]`
   - Circle detail page shows with circle name
   - Can see circle trips (empty initially)

## Notes

- Interstitial is modal/dialog-based (not a separate page)
- Consistent with existing Tripti UI patterns
- No backend schema changes needed
- Reuses existing trip creation API
- Reuses existing invite code system
- Chat-first navigation preserved (trip detail defaults to chat tab)
