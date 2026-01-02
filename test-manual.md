# Manual Testing Guide - 3-User Collaborative Trip Scenario

Since full automated testing requires session management, here's a manual testing checklist.

## Prerequisites
1. Start the dev server: `npm run dev`
2. Open browser in incognito/private mode
3. You'll need 3 browser windows or tabs (or use different browsers)

## Test 1: Collaborative Trip Flow

### Setup Phase
- [ ] **Window 1 (User A)**: Sign up at http://localhost:3000/auth/signup
  - Email: user-a@test.com
  - Name: User A
  - Password: password123
  - Verify: Redirected to /circles

- [ ] **Window 1**: Create a circle
  - Click "Create Circle"
  - Name: "Test Circle"
  - Verify: Circle created, invite link shown

- [ ] **Window 1**: Copy invite link

- [ ] **Window 2 (User B)**: Open invite link in new window
  - Verify: Automatically joins circle
  - Verify: Redirected to circle page

- [ ] **Window 3 (User C)**: Open invite link in new window
  - Verify: Automatically joins circle
  - Verify: Redirected to circle page

### Trip Creation Phase
- [ ] **Window 1 (User A)**: Create collaborative trip
  - Click "Create Trip"
  - Destination: "Paris, France"
  - Trip Type: Collaborative
  - Earliest Start: 2024-07-01
  - Latest End: 2024-07-14
  - Verify: Trip created, status = "scheduling"

### Availability Submission Phase
- [ ] **Window 2 (User B)**: Submit availability
  - Open trip detail page
  - Click "Submit Availability"
  - Set some days as available (✓), some as maybe (?), some as unavailable (✗)
  - Submit
  - Verify: Availability saved, can see "You've submitted your availability"

- [ ] **Window 3 (User C)**: Submit availability
  - Open trip detail page
  - Click "Submit Availability"
  - Set availability (different from User B)
  - Submit
  - Verify: Availability saved

- [ ] **Window 1 (User A)**: Check if options appear
  - Refresh trip page
  - Verify: Top 3 date options appear
  - Verify: Options show attendee count and scores
  - Verify: OptionKeys are in format "YYYY-MM-DD_YYYY-MM-DD"

### Voting Phase
- [ ] **Window 2 (User B)**: Vote on option 1
  - Click "Vote" on first option
  - Verify: Button changes to "Voted"
  - Verify: Option highlighted

- [ ] **Window 3 (User C)**: Vote on option 2
  - Click "Vote" on second option
  - Verify: Button changes to "Voted"
  - Verify: Option highlighted

### Locking Phase
- [ ] **Window 1 (User A)**: Lock trip dates
  - Click "Lock Dates" on option 1
  - Verify: Trip status changes to "locked"
  - Verify: Dates displayed at top

### Verification Phase
- [ ] **Window 2 (User B)**: Try to edit availability
  - Verify: Cannot edit (trip is locked)
  - Verify: Availability form not shown or disabled

- [ ] **Window 3 (User C)**: Try to re-vote
  - Verify: Cannot change vote (trip is locked)
  - Verify: Vote buttons disabled or not shown

- [ ] **All Windows**: Refresh trip page
  - Verify: Trip dates persist
  - Verify: Status remains "locked"
  - Verify: Locked dates shown at top

## Test 2: Hosted Trip Flow

### Setup (Use same circle from Test 1)

### Trip Creation
- [ ] **Window 1 (User A)**: Create hosted trip
  - Click "Create Trip"
  - Destination: "New York, USA"
  - Trip Type: Hosted
  - Start Date: 2024-08-15
  - End Date: 2024-08-20
  - Verify: Trip created, status = "locked"
  - Verify: Participants section shows User A as creator

### Join/Leave Flow
- [ ] **Window 2 (User B)**: Join trip
  - Open trip detail page
  - Click "Join Trip"
  - Verify: Button changes or disappears
  - Verify: User B appears in participants list

- [ ] **Window 3 (User C)**: Join trip
  - Open trip detail page
  - Click "Join Trip"
  - Verify: User C appears in participants list

- [ ] **Window 2 (User B)**: Leave trip
  - Click "Leave Trip"
  - Verify: User B removed from participants list
  - Verify: "Join Trip" button appears again

### Verification
- [ ] **All Windows**: Verify no availability routes
  - Verify: No availability submission form shown
  - Verify: No voting UI shown
  - Verify: Only participants list visible

- [ ] **Window 2**: Verify join button state
  - When not joined: "Join Trip" button visible
  - When joined: "Leave Trip" button visible
  - Creator (User A): No join/leave button shown

## Expected Issues to Check

1. **Consensus calculation**:
   - Are optionKeys deterministic? (Same inputs = same outputs)
   - Do optionKeys match exactly between refreshes?

2. **State management**:
   - Do votes persist on refresh?
   - Do availabilities persist on refresh?
   - Do participant lists update in real-time?

3. **Edge cases**:
   - What happens if User B tries to vote after trip is locked?
   - What happens if User A tries to leave a hosted trip they created?
   - What happens if consensus can't be calculated (no availabilities)?

