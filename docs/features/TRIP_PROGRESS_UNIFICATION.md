# Trip Progress Unification Implementation

## Overview
Unified pending actions (chat CTA, dashboard notifications, progress pane) around a single computed "TripProgressSnapshot" for immediate UI updates after picks/lock/join approvals.

## Files Changed

### Core Computation
- **lib/trips/progressSnapshot.ts** (NEW)
  - `computeTripProgressSnapshot()` - Unified state computation
  - Returns flags: everyoneResponded, leaderNeedsToLock, datesLocked, itineraryPending, etc.

### Updated Files
- **lib/trips/nextAction.ts**
  - Updated to use `computeTripProgressSnapshot`
  - Added availability CTA lifecycle logic
  - Handles "lock dates" inline action for leaders
  - Handles "waiting for lock" state for non-leaders

- **lib/dashboard/getDashboardData.js**
  - Added join request notifications for trip leaders
  - Fetches pending join requests and creates notification items
  - Join requests have priority 1 (high priority)

- **app/HomeClient.jsx**
  - Removed participant list panel above trip tabs (line ~5050)
  - Panel removed per requirements; participant info still available in "Going" tab

## Implementation Status

### ✅ Completed
1. **Progress Snapshot** - Core computation function created
2. **Participant Panel Removal** - Panel above tabs removed
3. **Join Request Notifications** - Added to dashboard data
4. **NextAction Updates** - Uses progress snapshot, handles availability lifecycle

### 🔄 Partially Implemented / Needs Integration
1. **Availability CTA Lifecycle** - Logic added but needs ChatTab integration
2. **After Saving Picks Behavior** - Needs implementation in PlanningTab
3. **Progress Pane Auto-update** - Needs refetch/mutate hooks
4. **Join Request UI in Chat** - Needs inline card/panel in ChatTab

## Manual Test Steps

### A) Join Request Notifications
1. **Setup**: User A creates a trip, User B requests to join
2. **Test**: 
   - As User A (leader), go to Dashboard
   - Verify notification appears: "Trip Name - User B wants to join"
   - Click "Review request" → should open trip detail (chat tab)
   - Approve/deny request → notification should disappear

### B) Participant Panel Removal
1. **Test**: 
   - Open any trip detail page
   - Verify no participant list panel appears above tabs
   - Navigate to "Going" tab → verify participant list still shows there
   - Verify users who left trip don't appear in lists

### C) Availability CTA Lifecycle
1. **While responses pending**:
   - Open collaborative trip in chat
   - Verify CTA shows "Discuss dates" / "Go to Planning"
   
2. **After all respond (leader)**:
   - As trip leader, wait for all users to submit picks
   - Verify CTA changes to "Lock dates" (inline action)
   - Click "Lock dates" → should show confirm modal
   
3. **After all respond (non-leader)**:
   - As non-leader, after all respond
   - Verify CTA shows "Waiting for leader to lock dates"
   
4. **After lock**:
   - After leader locks dates
   - Verify CTA advances to "Go to Itinerary"
   - Verify progress pane updates immediately

### D) After Saving Picks
1. **Test**:
   - User saves availability picks
   - Should stay in Chat tab (not redirect)
   - Should show toast "Saved"
   - CTA should update to next step if applicable

### E) Progress Pane Auto-update
1. **Test scenarios**:
   - Save picks → progress pane updates immediately
   - Last user responds → progress pane shows "ready to lock"
   - Leader locks dates → progress pane shows dates locked
   - Approve join request → participant count updates

## Next Steps for Full Implementation

1. **ChatTab Integration**:
   - Wire up availability CTA lifecycle
   - Add "Lock dates" inline action handler
   - Add join request display in chat

2. **PlanningTab Updates**:
   - After saving picks, stay in chat
   - Show toast notification
   - Trigger trip refetch

3. **Progress Pane**:
   - Use `computeTripProgressSnapshot` for state
   - Add refetch after mutations (picks, lock, join approve)

4. **Join Request Chat UI**:
   - Display pending requests in chat for leaders
   - Inline approve/deny actions

## Notes

- Progress snapshot is the single source of truth
- All UI components should use snapshot for consistency
- Refetch trip data after mutations to keep UI in sync
- Filter out users with `participantStatus === 'left'` from all participant lists
