# Testing Checklist - 3-User Scenario

## Quick Start
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Use 3 browser windows/tabs or different browsers

---

## Test 1: Collaborative Trip Flow ✅

### Setup (5 min)
- [ ] **Window 1 - User A**: Sign up (user-a@test.com / password123)
- [ ] **Window 1**: Create circle "Test Circle"
- [ ] **Window 1**: Copy invite link
- [ ] **Window 2 - User B**: Open invite link → auto-joins
- [ ] **Window 3 - User C**: Open invite link → auto-joins

### Trip Creation (2 min)
- [ ] **Window 1 - User A**: Create collaborative trip
  - Destination: "Paris, France"
  - Type: Collaborative
  - Earliest: 2024-07-01
  - Latest: 2024-07-14
  - ✅ Verify: Status = "scheduling"

### Availability Submission (5 min)
- [ ] **Window 2 - User B**: Submit availability
  - Click "Submit Availability"
  - Set mix: some ✓ (available), some ? (maybe), some ✗ (unavailable)
  - Submit
  - ✅ Verify: "You've submitted your availability" message

- [ ] **Window 3 - User C**: Submit availability
  - Different pattern from User B
  - Submit
  - ✅ Verify: Availability saved

### Consensus Check (2 min)
- [ ] **Window 1 - User A**: Refresh trip page
  - ✅ Verify: Top 3 options appear
  - ✅ Verify: Options show attendee count & scores
  - ✅ Verify: OptionKeys format = "YYYY-MM-DD_YYYY-MM-DD"
  - ✅ **CRITICAL**: Refresh again → OptionKeys should be IDENTICAL (deterministic)

### Voting (3 min)
- [ ] **Window 2 - User B**: Vote on option 1
  - Click "Vote" on first option
  - ✅ Verify: Button → "Voted", option highlighted
  - ✅ Verify: Refresh page → vote persists

- [ ] **Window 3 - User C**: Vote on option 2
  - Click "Vote" on second option
  - ✅ Verify: Button → "Voted", option highlighted
  - ✅ Verify: Refresh page → vote persists

### Locking (2 min)
- [ ] **Window 1 - User A**: Lock trip
  - Click "Lock Dates" on option 1
  - ✅ Verify: Status → "locked"
  - ✅ Verify: Dates displayed at top
  - ✅ Verify: Voting UI disappears

### Post-Lock Verification (5 min)
- [ ] **Window 2 - User B**: Try to edit availability
  - ✅ Verify: Availability form NOT shown (trip locked)
  - ✅ Verify: No "Update Availability" button

- [ ] **Window 3 - User C**: Try to re-vote
  - ✅ Verify: Voting UI NOT shown (trip locked)
  - ✅ Verify: Cannot see vote buttons

- [ ] **All Windows**: Refresh trip page
  - ✅ Verify: Dates persist
  - ✅ Verify: Status = "locked"
  - ✅ Verify: Locked dates banner shows

---

## Test 2: Hosted Trip Flow ✅

### Setup (use same circle from Test 1)

### Trip Creation (2 min)
- [ ] **Window 1 - User A**: Create hosted trip
  - Destination: "New York, USA"
  - Type: Hosted
  - Start: 2024-08-15
  - End: 2024-08-20
  - ✅ Verify: Status = "locked" immediately
  - ✅ Verify: Participants section shows User A as creator

### Join/Leave Flow (5 min)
- [ ] **Window 2 - User B**: Join trip
  - Click "Join Trip"
  - ✅ Verify: Button disappears / changes
  - ✅ Verify: User B in participants list
  - ✅ Verify: Refresh → User B still in list

- [ ] **Window 3 - User C**: Join trip
  - Click "Join Trip"
  - ✅ Verify: User C in participants list
  - ✅ Verify: Both B & C visible

- [ ] **Window 2 - User B**: Leave trip
  - Click "Leave Trip"
  - ✅ Verify: User B removed from list
  - ✅ Verify: "Join Trip" button appears again
  - ✅ Verify: Refresh → User B not in list

### Verification (3 min)
- [ ] **All Windows**: Check for availability/voting UI
  - ✅ Verify: NO availability form
  - ✅ Verify: NO voting UI
  - ✅ Verify: Only participants list visible

- [ ] **Window 1 - User A (Creator)**:
  - ✅ Verify: No "Join Trip" button shown
  - ✅ Verify: No "Leave Trip" button shown
  - ✅ Verify: Shows "Creator" label

- [ ] **Window 2 - User B (Not joined)**:
  - ✅ Verify: "Join Trip" button visible

- [ ] **Window 3 - User C (Joined)**:
  - ✅ Verify: "Leave Trip" button visible

---

## Edge Cases to Verify

### Consensus Determinism
- [ ] Submit same availability twice → OptionKeys should match exactly
- [ ] Refresh options multiple times → Order and keys should be identical

### Error Handling
- [ ] Try to vote on locked trip → Error message shown
- [ ] Try to edit availability on locked trip → Form not shown
- [ ] Try to leave trip as creator → Error (API prevents this)

### State Persistence
- [ ] Votes persist after refresh
- [ ] Availabilities persist after refresh
- [ ] Participant lists update correctly
- [ ] Locked dates persist after refresh

---

## Expected Issues & Fixes

If you encounter issues, check:

1. **OptionKeys not deterministic**: Check consensus calculation sorting
2. **Votes not persisting**: Check vote API and database queries
3. **Participants not updating**: Check participant API and UI refresh
4. **Availability form shows when locked**: Check conditional rendering
5. **Voting UI shows when locked**: Check conditional rendering

---

## Success Criteria

✅ All checkboxes above completed
✅ No errors in browser console
✅ No errors in server logs
✅ All state persists correctly
✅ UI updates correctly after actions
✅ Error messages are clear and helpful

