# Dashboard Test Steps

This document outlines manual test cases for the new role-aware, action-first dashboard.

## Test Environment Setup

1. Ensure you have a test user account
2. Create or join at least 2 circles
3. Create trips with various states (proposed, scheduling, voting, locked)
4. Create trips with different types (collaborative, hosted)
5. Set up different user roles (trip leader, trip member, circle member)

## Test Cases

### 1. Global Notifications

#### 1.1 Empty State
- **Setup**: User has no pending actions
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check the notifications area at the top
- **Expected**: Shows "All caught up ✅" message

#### 1.2 Pending Actions Notifications
- **Setup**: User has trips with pending actions
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check the notifications area
- **Expected**:
  - Notifications displayed for trips with pending actions
  - Each notification shows:
    - Trip name (title)
    - Action context (e.g., "Pick your dates")
    - CTA button with action label
    - Priority-based styling (high priority = red/orange, lower = blue)
  - Notifications sorted by priority → recency

#### 1.3 Notification Click
- **Steps**:
  1. Click on a notification CTA link (in banner or "View all" sheet)
- **Expected**: 
  - Navigates to `/trips/[tripId]` (trip detail page)
  - Link uses Next.js `<Link>` component for client-side navigation
  - Navigation works from both banner and "View all" sheet

### 2. Circle Sections

#### 2.1 Circle Display
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check circle sections
- **Expected**:
  - Each circle appears as a rectangular "board container"
  - Circle name displayed top-left
  - Circles sorted by:
    1. Circles with blocking/high pending actions
    2. Circles with any pending actions
    3. Circles with recent activity
    4. Circles with upcoming trips
    5. Alphabetical (A–Z)

#### 2.2 Empty Circle
- **Setup**: Circle with no trips
- **Steps**:
  1. Navigate to `/dashboard`
  2. Find a circle with no trips
- **Expected**:
  - Shows empty state message
  - Shows "Create trip" CTA button
  - CTA links to circle detail page

### 3. Trip Cards

#### 3.1 Card Layout
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check trip cards
- **Expected**:
  - Cards are square (aspect-square)
  - Cards display:
    - Trip name
    - Status badge (proposed, scheduling, voting, locked)
    - Traveler count
    - Date range OR "Dates not locked"
    - Latest activity (1 line)
    - Pending action indicator (if applicable)
    - Primary CTA button

#### 3.2 Card Information Density
- **Steps**:
  1. Check various trip cards
- **Expected**:
  - Cards are information-dense (not minimal tiles)
  - All required information is visible
  - Text is appropriately truncated with line-clamp where needed

#### 3.3 Trip Sorting
- **Setup**: Circle with multiple trips in different states
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check trip order within a circle
- **Expected**: Trips sorted in this order:
  1. **Bucket 1**: Trips with pending actions
     - Sort by pending-action priority desc
     - Then by recency
  2. **Bucket 2**: Upcoming trips (startDate >= today)
     - Sort by startDate asc
  3. **Bucket 3**: Planning/in-progress trips (no locked dates)
     - Sort by status progression
     - Then latestActivity desc
  4. **Bucket 4**: Past trips (endDate < today)
     - Sort by endDate desc
  - Final tie-breaker: tripName A–Z

### 4. Click / CTA Logic

#### 4.1 Pending Action Routing
- **Setup**: Trip with pending actions
- **Steps**:
  1. Click anywhere on a trip card with pending actions
  2. Verify the CTA button/label shows the highest-priority action
  3. Click the CTA button (or anywhere on the card)
- **Expected**: 
  - Routes to `/trips/[tripId]` (trip detail page)
  - The CTA label matches the highest-priority pending action
  - Both card click and CTA click navigate correctly

#### 4.2 No Pending Actions Routing
- **Setup**: Trip with no pending actions
- **Steps**:
  1. Click anywhere on a trip card without pending actions
  2. Verify the CTA button shows "View Trip"
- **Expected**: 
  - Routes to `/trips/[tripId]` (trip detail page)
  - Both card click and CTA click navigate correctly

#### 4.3 Pending Action Priority Order
- **Expected Priority Order**:
  1. Scheduling required (availability pick / date vote) - Priority 1
  2. Date voting - Priority 2
  3. Itinerary review / approval - Priority 3
  4. Budget / booking confirmation - Priority 4
  5. Other required inputs - Priority 5
  6. None → Trip Detail page (`/trips/[tripId]`)

#### 4.4 Notification CTA Navigation
- **Setup**: Dashboard with notifications
- **Steps**:
  1. Click a notification CTA link in the banner
  2. Open "View all" sheet and click a notification CTA link
- **Expected**: 
  - Both navigation paths route to the appropriate trip page
  - Navigation works from both banner and sheet views

### 5. Role Awareness

#### 5.1 Trip Leader Actions
- **Setup**: User is trip leader (created the trip)
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check trips where user is leader
- **Expected**: Sees leadership actions:
  - Finalize dates
  - Generate itinerary
  - Lock itinerary
  - (Appears in pending actions when applicable)

#### 5.2 Trip Member Actions
- **Setup**: User is trip member (not leader)
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check trips where user is member
- **Expected**: Sees participation actions:
  - Pick availability
  - Vote on dates
  - Review itinerary
  - (Appears in pending actions when applicable)

#### 5.3 Circle Member with No Trips
- **Setup**: User is circle member but circle has no trips
- **Steps**:
  1. Navigate to `/dashboard`
  2. Check empty circle
- **Expected**: Sees empty-state CTA inside circle section

#### 5.4 Guest (Unauthenticated)
- **Setup**: User not logged in
- **Steps**:
  1. Navigate to `/dashboard` without authentication
- **Expected**: Redirects to login/home page

### 6. Responsive Design

#### 6.1 Desktop View
- **Steps**:
  1. Open dashboard on desktop (> 1024px)
- **Expected**:
  - Trip cards in grid (4 columns on large screens)
  - Full layout visible
  - All information readable

#### 6.2 Tablet View
- **Steps**:
  1. Open dashboard on tablet (768px - 1024px)
- **Expected**:
  - Trip cards in grid (3 columns)
  - Layout adapts appropriately
  - All information accessible

#### 6.3 Mobile View
- **Steps**:
  1. Open dashboard on mobile (< 768px)
- **Expected**:
  - Trip cards in grid (1-2 columns)
  - Layout stacks vertically
  - Touch-friendly interactions
  - All information accessible with scrolling

### 7. Status Badges

#### 7.1 Status Display
- **Steps**:
  1. Check trip cards with different statuses
- **Expected**:
  - **Proposed**: Gray badge
  - **Scheduling**: Yellow badge
  - **Voting**: Blue badge
  - **Locked**: Green badge

### 8. Date Display

#### 8.1 Locked Dates
- **Setup**: Trip with locked dates
- **Steps**:
  1. Check trip card
- **Expected**: Shows date range (e.g., "Jan 15 - Jan 20, 2024")

#### 8.2 Unlocked Dates
- **Setup**: Trip without locked dates
- **Steps**:
  1. Check trip card
- **Expected**: Shows "Dates not locked"

### 9. Latest Activity

#### 9.1 Activity Display
- **Setup**: Trip with recent messages/activity
- **Steps**:
  1. Check trip card
- **Expected**:
  - Shows latest activity text (1 line, truncated if long)
  - Shows relative timestamp (e.g., "2 hours ago", "Yesterday")
  - Clock icon displayed

#### 9.2 No Activity
- **Setup**: Trip with no messages
- **Steps**:
  1. Check trip card
- **Expected**: Activity section not shown or shows appropriate empty state

### 10. Edge Cases

#### 10.1 User with No Circles
- **Setup**: New user with no circles
- **Steps**:
  1. Navigate to `/dashboard`
- **Expected**: Shows empty state with message about joining/creating circles

#### 10.2 Multiple Circles with Many Trips
- **Setup**: User with 5+ circles, each with 10+ trips
- **Steps**:
  1. Navigate to `/dashboard`
  2. Scroll through all circles
- **Expected**:
  - All circles load correctly
  - Trips sorted correctly within each circle
  - Performance is acceptable (no lag)

#### 10.3 Very Long Trip Names
- **Setup**: Trip with very long name
- **Steps**:
  1. Check trip card
- **Expected**: Trip name truncated with line-clamp (2 lines max)

#### 10.4 Very Long Activity Text
- **Setup**: Trip with very long latest activity message
- **Steps**:
  1. Check trip card
- **Expected**: Activity text truncated with line-clamp (2 lines max)

## Performance Tests

### 11. Load Time
- **Steps**:
  1. Navigate to `/dashboard`
  2. Measure time to first render
- **Expected**: Dashboard loads in < 2 seconds

### 12. Data Fetching
- **Steps**:
  1. Open browser DevTools Network tab
  2. Navigate to `/dashboard`
- **Expected**:
  - Single API call to `/api/dashboard`
  - No N+1 queries
  - Response time < 1 second

## Integration Tests

### 13. API Integration
- **Steps**:
  1. Check browser console for errors
  2. Verify API calls are successful
- **Expected**:
  - No console errors
  - API returns data in expected format
  - All data displays correctly

### 14. Navigation Integration
- **Steps**:
  1. Click various trip cards (both on the card body and the CTA button area)
  2. Click notification CTAs (in banner and "View all" sheet)
  3. Verify navigation works
  4. Test browser back button
- **Expected**:
  - All trip card clicks navigate to `/trips/[tripId]`
  - Notification CTAs navigate to the appropriate trip page
  - Browser history updates correctly (Next.js client-side navigation)
  - Back button returns to dashboard
  - Trip detail page loads and displays trip information
  - No navigation errors or console warnings

## Accessibility Tests

### 15. Keyboard Navigation
- **Steps**:
  1. Use Tab key to navigate through dashboard
  2. Use Enter/Space to activate links
- **Expected**:
  - All interactive elements are focusable
  - Focus indicators are visible
  - Keyboard navigation works smoothly

### 16. Screen Reader
- **Steps**:
  1. Use screen reader to navigate dashboard
- **Expected**:
  - All content is announced correctly
  - Links have descriptive text
  - Status information is conveyed
