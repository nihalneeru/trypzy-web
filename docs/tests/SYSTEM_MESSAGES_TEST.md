# System Messages Test Checklist

This document provides a manual test checklist for verifying that system messages appear in the correct chat scope and are created automatically for important events.

## Test Environment Setup

1. Have at least 2 user accounts ready
2. Create a test circle
3. Create test trips (both collaborative and hosted)

---

## Circle System Messages (Circle Chat Only)

### ✅ Circle Created
**Expected:** System message appears in Circle Chat when a new circle is created.

**Steps:**
1. Create a new circle
2. Navigate to Circle Chat tab
3. Verify system message appears: `✨ Circle "[name]" was created by [user name]`

**Pass Criteria:**
- [ ] Message appears immediately after circle creation
- [ ] Message is marked as system message (gray background, centered)
- [ ] Message does NOT appear in any Trip Chat
- [ ] Message format is consistent

---

### ✅ Member Joins Circle
**Expected:** System message appears in Circle Chat when a member joins.

**Steps:**
1. User A: Create a circle, copy invite code
2. User B: Join circle using invite code
3. User A: Navigate to Circle Chat tab
4. Verify system message appears: `👋 [user B name] joined the circle`

**Pass Criteria:**
- [ ] Message appears immediately after join
- [ ] Message is marked as system message
- [ ] Message does NOT appear in any Trip Chat
- [ ] Message format is consistent

---

### ⚠️ Member Leaves Circle
**Status:** Not currently implemented (no leave circle endpoint exists)

**Note:** If a leave circle feature is added in the future, a system message should be created in Circle Chat with format: `👋 [user name] left the circle`

---

## Trip System Messages (Trip Chat Only)

### ✅ Trip Created
**Expected:** System message appears in Trip Chat when a new trip is created.

**Steps:**
1. Create a new trip (collaborative or hosted)
2. Navigate to Trip Chat tab
3. Verify system message appears: `✈️ Trip "[name]" was created by [user name]`

**Pass Criteria:**
- [ ] Message appears immediately after trip creation
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Works for both collaborative and hosted trips

---

### ✅ Enter Scheduling Phase
**Expected:** System message appears in Trip Chat when trip transitions from "proposed" to "scheduling".

**Steps:**
1. Create a collaborative trip (starts in "proposed" status)
2. Submit availability for the first time (any user)
3. Navigate to Trip Chat tab
4. Verify system message appears: `📅 Scheduling has started! Mark your availability to help find the best dates.`

**Pass Criteria:**
- [ ] Message appears when first availability is submitted
- [ ] Message appears only once (not for subsequent availability submissions)
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Does NOT appear for hosted trips (they start as "locked")

---

### ✅ Enter Voting Phase
**Expected:** System message appears in Trip Chat when Trip Leader opens voting.

**Steps:**
1. Create a collaborative trip
2. Submit availability (move to "scheduling" phase)
3. Trip Leader: Open voting
4. Navigate to Trip Chat tab
5. Verify system message appears: `🗳️ Voting is now open! Choose your preferred dates from the top options.`

**Pass Criteria:**
- [ ] Message appears when voting is opened
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Only appears when Trip Leader opens voting

---

### ✅ Dates Locked
**Expected:** System message appears in Trip Chat when trip dates are locked.

**Steps:**
1. Create a collaborative trip
2. Go through scheduling and voting phases
3. Trip Leader: Lock the dates
4. Navigate to Trip Chat tab
5. Verify system message appears: `🔒 Trip dates locked! [start date] to [end date]. Planning can now begin! 🎉`

**Pass Criteria:**
- [ ] Message appears when dates are locked
- [ ] Message includes correct date range
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Works for both collaborative and hosted trips (hosted trips start locked)

---

### ✅ Hosted Trip: Participant Joins
**Expected:** System message appears in Trip Chat when someone joins a hosted trip.

**Steps:**
1. User A: Create a hosted trip (dates already locked)
2. User B: Join the trip
3. User A or B: Navigate to Trip Chat tab
4. Verify system message appears: `👋 [user B name] joined the trip!`

**Pass Criteria:**
- [ ] Message appears when participant joins
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Only for hosted trips (collaborative trips don't have join/leave)

---

### ✅ Hosted Trip: Participant Leaves
**Expected:** System message appears in Trip Chat when someone leaves a hosted trip.

**Steps:**
1. User A: Create a hosted trip
2. User B: Join the trip
3. User B: Leave the trip
4. Navigate to Trip Chat tab
5. Verify system message appears: `👋 [user B name] left the trip`

**Pass Criteria:**
- [ ] Message appears when participant leaves
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Only for hosted trips

---

### ✅ Itinerary Selected
**Expected:** System message appears in Trip Chat when Trip Leader selects final itinerary.

**Steps:**
1. Create a trip and lock dates
2. Generate an itinerary (with ideas/feedback)
3. Trip Leader: Select an itinerary as final
4. Navigate to Trip Chat tab
5. Verify system message appears: `✅ "[itinerary title]" itinerary selected as the final plan`

**Pass Criteria:**
- [ ] Message appears when itinerary is selected
- [ ] Message includes itinerary title
- [ ] Message is marked as system message
- [ ] Message does NOT appear in Circle Chat
- [ ] Only Trip Leader can select itinerary

---

## Cross-Scope Verification

### Scope Isolation Test
**Purpose:** Verify that system messages never appear in the wrong chat.

**Steps:**
1. Perform all events listed above
2. Check Circle Chat - should only contain:
   - Circle created
   - Member joins
3. Check Trip Chat - should only contain:
   - Trip created
   - Scheduling started
   - Voting opened
   - Dates locked
   - Participant joins/leaves (hosted only)
   - Itinerary selected

**Pass Criteria:**
- [ ] No circle system messages appear in Trip Chat
- [ ] No trip system messages appear in Circle Chat
- [ ] All messages are in the correct scope

---

## Message Format Consistency

**Check all system messages for:**
- [ ] Consistent emoji usage (one emoji per message)
- [ ] Consistent capitalization
- [ ] Consistent punctuation
- [ ] Messages are concise and clear
- [ ] All messages marked with `isSystem: true`
- [ ] All messages have `userId: null`
- [ ] All messages have proper `createdAt` timestamp

---

## Notes

- System messages are created server-side automatically (no user action required)
- System messages use `circle_messages` collection for Circle Chat
- System messages use `trip_messages` collection for Trip Chat
- System messages are distinguished by `isSystem: true` flag and `userId: null`
- Member leaving circle is not currently implemented (no leave endpoint exists)
