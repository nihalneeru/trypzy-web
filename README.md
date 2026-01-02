# Trypzy — Web MVP Specification

## Product Overview
Trypzy is a private, trust-based web app that helps friend groups plan trips together and keep shared travel memories.  
The core unit is a **Circle** (a real-world group). Trips and posts live inside circles.

This MVP focuses on one outcome:
> A circle successfully locks a trip date.

---

## Target Platform
- Web app (desktop + mobile web)
- No native apps in v1

---

## Core Concepts (Must Understand)

### Circle
- A private group of users
- All trips and posts are scoped to a circle
- Users must be circle members to participate

### Trip
- Created inside a circle
- Two types:
  - **Collaborative**: group submits availability → consensus → vote → lock
  - **Hosted**: creator sets fixed dates → others opt in

### Post
- Photo + caption
- Belongs to a circle
- Optional `discoverable = true` for public read-only feed

---

## User Roles
- **User**: authenticated account
- **Circle Owner**: creator of a circle
- **Circle Member**: invited participant

No moderators, admins, or public profiles in MVP.

---

## Core User Flows (Critical Path)

### Flow 1: Create Circle
1. User signs up / logs in
2. User creates a circle (name required)
3. System generates invite link
4. Other users join via link

Success: multiple users appear in the same circle

---

### Flow 2: Create Trip (Collaborative)
1. User selects a circle
2. Clicks “Create Trip”
3. Enters:
   - Destination (text)
   - Date range (earliest start, latest end)
   - Trip type = Collaborative
   - Optional notes
4. Trip enters `Scheduling` state

---

### Flow 3: Submit Availability
1. Circle members open the trip
2. Each member submits availability:
   - Available / Maybe / Unavailable per day
3. Availability can be edited until trip is locked

UX constraint:
- Availability submission should take <30 seconds

---

### Flow 4: Consensus + Lock
1. System computes best date options based on overlap
2. Show top 3 options with attendance count
3. Members vote on options
4. Owner (or majority) locks final dates
5. Trip state becomes `Locked`

Success: trip has fixed start and end dates

---

### Flow 5: Hosted Trip (Joinable)
1. User creates trip with:
   - Fixed dates
   - Trip type = Hosted
2. Other circle members click “Join”
3. Joined users are listed as participants
4. No availability or voting

---

### Flow 6: Post Memories
1. User opens circle or trip
2. Uploads photo(s) + caption
3. Post visibility:
   - Circle-only (default)
   - Optional: discoverable

---

### Flow 7: Discover Feed (Read-Only)
1. User opens Discover tab
2. Sees posts marked `discoverable`
3. No comments, no likes, no joining trips
4. CTA: “Create a similar trip”

---

## Data Models (Minimum Required)

### User
- id
- name
- email
- created_at

### Circle
- id
- name
- owner_id
- created_at

### Membership
- user_id
- circle_id
- role (owner | member)

### Trip
- id
- circle_id
- created_by
- destination
- start_date (nullable until locked)
- end_date (nullable until locked)
- trip_type (collaborative | hosted)
- status (proposed | scheduling | locked)

### Availability
- id
- trip_id
- user_id
- date
- status (available | maybe | unavailable)

### Vote
- id
- trip_id
- user_id
- option_id

### Post
- id
- circle_id
- trip_id (nullable)
- user_id
- media_urls
- caption
- discoverable (boolean)
- created_at

---

## Consensus Logic (Simple MVP)
- For each possible date window:
  - Count available = +1
  - Maybe = +0.5
  - Unavailable = 0
- Rank windows by total score
- Return top 3 options

No AI, no NLP in v1.

---

## MVP Constraints (Important)

### What NOT to Build
- Followers
- DMs
- Comments
- Likes
- Payments
- Bookings
- Global trip joining
- Notifications beyond basic email (optional)

---

## UX Principles
- Private by default
- Minimal steps
- No empty states without guidance
- Always show “what happens next”

---

## Success Criteria (MVP)
- At least one circle successfully locks a trip date
- Users complete availability without assistance
- One trip results in at least one post

---

## Tech Freedom
Implementation choices (framework, DB, auth, hosting) are flexible.
Focus on:
- Fast iteration
- Simple data model
- Clear separation of circles

---

## Product Philosophy (Non-Negotiable)
Trypzy is not a social network.
It is a **trip-planning tool with memory preservation**, scoped to real-world trust.

If a feature does not support:
> “Let’s just use Trypzy to plan this”
it does not belong in v1.