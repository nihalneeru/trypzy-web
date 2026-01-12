# Trip Navigation Test Steps

This document outlines manual test cases for verifying that dashboard navigation correctly routes to the original trip experience (chat, schedule, itinerary with LLM).

## Test Environment Setup

1. Ensure you have a test user account with access to trips
2. Create or access trips with various states:
   - Trips with pending scheduling actions
   - Trips with pending itinerary review
   - Trips with no pending actions
   - Locked trips with itinerary

## Test Cases

### 1. Dashboard Trip Card Navigation

#### 1.1 Trip Card with Pending Actions
- **Setup**: Trip with pending scheduling action (e.g., "Pick your dates")
- **Steps**:
  1. Navigate to `/dashboard`
  2. Find a trip card with a pending action indicator
  3. Click anywhere on the trip card
- **Expected**:
  - Routes to `/trips/[tripId]`
  - Redirects to `/` with `?tripId=[tripId]` query param
  - Old Dashboard system loads and shows TripDetailView
  - TripDetailView displays with the "Planning" tab active (for scheduling)
  - Full trip functionality is available (schedule, chat, itinerary)

#### 1.2 Trip Card without Pending Actions
- **Setup**: Trip with no pending actions
- **Steps**:
  1. Navigate to `/dashboard`
  2. Find a trip card without pending actions (shows "View Trip" CTA)
  3. Click anywhere on the trip card
- **Expected**:
  - Routes to `/trips/[tripId]`
  - Old Dashboard system loads and shows TripDetailView
  - TripDetailView displays with full functionality

### 2. Dashboard Notification CTA Navigation

#### 2.1 Notification Banner CTA
- **Setup**: Dashboard with notifications in the banner
- **Steps**:
  1. Navigate to `/dashboard`
  2. Click a notification CTA link in the banner (e.g., "Pick your dates")
- **Expected**:
  - Routes to `/trips/[tripId]`
  - Old Dashboard system loads and shows TripDetailView
  - TripDetailView displays the appropriate section based on the action

#### 2.2 Notification "View All" Sheet CTA
- **Setup**: Dashboard with multiple notifications
- **Steps**:
  1. Navigate to `/dashboard`
  2. Click "View all" in the notifications banner
  3. Click a notification CTA link in the sheet
- **Expected**:
  - Routes to `/trips/[tripId]`
  - Old Dashboard system loads and shows TripDetailView

### 3. Trip Detail View Functionality

#### 3.1 Planning Tab (Scheduling)
- **Steps**:
  1. Navigate to a trip via dashboard card or notification
  2. Verify the "Planning" tab is visible and accessible
- **Expected**:
  - Planning tab shows scheduling interface
  - For collaborative trips: availability calendar, date picks, or voting interface
  - For hosted trips: participant management
  - All scheduling features are functional

#### 3.2 Itinerary Tab (LLM Integration)
- **Setup**: Locked trip with itinerary
- **Steps**:
  1. Navigate to a locked trip
  2. Click the "Itinerary" tab
- **Expected**:
  - Itinerary tab is enabled and accessible
  - Shows itinerary generation/review interface
  - LLM integration is functional (generate, revise, feedback)
  - All itinerary features work as expected

#### 3.3 Chat Tab
- **Steps**:
  1. Navigate to any trip
  2. Click the "Chat" tab
- **Expected**:
  - Chat tab is visible and accessible
  - Trip messages display correctly
  - Can send new messages
  - Real-time updates work (if implemented)

#### 3.4 Memories Tab
- **Steps**:
  1. Navigate to any trip
  2. Click the "Memories" tab
- **Expected**:
  - Memories tab is visible and accessible
  - Trip posts/memories display correctly
  - Can create new posts (if user has permission)

### 4. Pending Action Routing

#### 4.1 "Pick your dates" Action
- **Setup**: Trip in scheduling phase requiring date picks
- **Steps**:
  1. Click trip card or notification with "Pick your dates" action
- **Expected**:
  - Routes to trip detail page
  - Planning tab is active
  - Scheduling interface is shown (date picker, availability, etc.)

#### 4.2 "Review itinerary" Action
- **Setup**: Locked trip with itinerary requiring review
- **Steps**:
  1. Click trip card or notification with "Review itinerary" action
- **Expected**:
  - Routes to trip detail page
  - Itinerary tab is accessible
  - Itinerary review interface is shown

#### 4.3 "Generate itinerary" Action (Trip Leader)
- **Setup**: Locked trip in "collecting_ideas" phase (trip leader)
- **Steps**:
  1. Click trip card or notification with "Generate itinerary" action
- **Expected**:
  - Routes to trip detail page
  - Itinerary tab is accessible
  - Itinerary generation interface is shown

### 5. Route Behavior

#### 5.1 Direct URL Access
- **Steps**:
  1. Manually navigate to `/trips/[tripId]` (replace with actual trip ID)
- **Expected**:
  - Redirects to `/` with `?tripId=[tripId]` query param
  - Old Dashboard system loads
  - TripDetailView displays correctly
  - Full trip functionality is available

#### 5.2 Back Navigation
- **Steps**:
  1. Navigate to trip from dashboard
  2. Use browser back button
- **Expected**:
  - Returns to `/dashboard`
  - Dashboard state is preserved (if applicable)

#### 5.3 No Placeholder Page
- **Steps**:
  1. Navigate to any active trip via dashboard
- **Expected**:
  - NO "Coming soon" placeholder appears
  - Full TripDetailView with all features is shown
  - All tabs (Planning, Itinerary, Chat, Memories) are functional

### 6. Edge Cases

#### 6.1 Invalid Trip ID
- **Steps**:
  1. Manually navigate to `/trips/invalid-id`
- **Expected**:
  - Redirects to `/` with query param
  - Old Dashboard handles error gracefully
  - Shows appropriate error message or redirects

#### 6.2 Unauthorized Access
- **Setup**: Trip ID that user doesn't have access to
- **Steps**:
  1. Navigate to `/trips/[unauthorized-trip-id]`
- **Expected**:
  - API returns 403/404 error
  - Error is handled gracefully
  - User is redirected or shown error message

## Regression Checks

### ✅ No "Coming Soon" Placeholders
- Verify that no trip page shows "Coming soon" buttons or disabled sections
- All trip features (chat, schedule, itinerary, LLM) are fully accessible

### ✅ Navigation Consistency
- All navigation paths (dashboard cards, notifications, direct URLs) route correctly
- No broken links or 404 errors
- Browser back/forward buttons work correctly

### ✅ Feature Completeness
- TripDetailView displays with all original features
- LLM itinerary generation/revision works
- Scheduling features work (availability, date picks, voting)
- Chat and memories features work
- All tabs are accessible and functional
