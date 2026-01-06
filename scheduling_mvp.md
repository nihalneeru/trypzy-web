Trypzy – Scheduling MVP (Source of Truth)

Status: MVP-locked
Owner: Product / Engineering
Applies to: Collaborative Trips (default)
Principle: Scheduling mirrors how friends actually decide dates — broad intent → narrowing → commitment.

⸻

1. What Scheduling Is (and Is Not)

Scheduling IS
	•	A progressive narrowing funnel
	•	A way to reduce ambiguity over time
	•	A social signal that builds momentum
	•	A system that tolerates flakiness

Scheduling IS NOT
	•	A single-shot calendar exercise
	•	A requirement for unanimous participation
	•	A replacement for conversation
	•	A mechanism that forces commitment early

Key rule: Availability is never commitment.
Locking dates is the only commitment moment.

⸻

2. Progressive Narrowing Model (Core Concept)

Scheduling happens in three human-aligned phases.

⸻

Phase 1: Timeframe Intent (Broad)

Human behavior

“Let’s plan something in March / after exams / early summer.”

Product behavior
	•	Trip is created with a broad date window
	•	Example: March 1 – March 31
	•	No precision required
	•	Members may mark approximate availability
	•	No voting yet

Purpose
	•	Establish shared intent
	•	Avoid early pressure
	•	Create a visible anchor for the idea

Visibility
	•	Circle members see the trip as Proposed

⸻

Phase 2: Window Convergence (Narrowing)

Human behavior

“Looks like mid-March works for most people.”

Product behavior
	•	Members submit availability (Available / Maybe / Unavailable)
	•	Silent members are treated as not available by the system
	•	The system computes overlap patterns
	•	The consensus algorithm generates top 3 realistic date windows

Important rules
	•	Members do not propose arbitrary ranges
	•	Only system-generated options are considered
	•	Availability expresses openness, not obligation

Visibility
	•	Trip shows as Scheduling
	•	Momentum builds without forcing action

⸻

Phase 3: Commitment (Locking)

Human behavior

“Okay, let’s lock these dates.”

Product behavior
	•	Members vote on the system-generated options
	•	Voting expresses preference, not veto power
	•	Trip creator or circle leader selects one option
	•	Dates are locked permanently (MVP)

This moment means
	•	The trip is now real
	•	Scheduling ends
	•	Planning begins

Everything in Trypzy flows downstream of this moment.

⸻

3. Trip States (Scheduling-Focused)
State
Meaning
Draft
Private intent (creator-only)
Proposed
Broad timeframe shared
Scheduling
Availability being collected
Voting
Choosing between realistic options
Locked
Dates finalized
Completed
Trip in the past

4. Voting Rules (MVP)
	•	Voting is lightweight preference signaling
	•	One vote per member
	•	No comments or debates
	•	No quorum required

Voting helps leaders decide — it does not block progress.

⸻

5. Authority & Anti-Hostage Design

To prevent stalls and indecision:
	•	Only the trip creator or circle leader can:
	•	Open voting
	•	Lock dates
	•	Leaders may proceed even if:
	•	Some members don’t respond
	•	Votes are split
	•	Participation is partial

Trypzy favors progress over perfection.

⸻

6. Social Visibility (Scheduling as Signal)

Scheduling stages also act as social cues.
Stage
What It Signals
Proposed
“We’re thinking about this”
Scheduling
“This is taking shape”
Voting
“Decision soon”
Locked
“Dates are real — join or follow”

Visibility does not imply obligation or editing rights.

⸻

7. Follow vs Join (MVP Interpretation)

Follow
	•	Passive visibility
	•	Receive updates
	•	No obligation
	•	No impact on scheduling

Join
	•	Explicit participation
	•	Meaningful only after dates are locked
	•	Required for hosted trips

MVP note: Follow may be implemented as read-only visibility.

⸻

8. Large & Small Group Behavior (Designed-for Reality)

Large / Flaky Groups (20–30 people)
	•	Partial participation is expected
	•	Silent members do not block progress
	•	Scheduling converges naturally toward the engaged core
	•	Leader authority resolves ambiguity

Small Groups (4 people)
	•	Everyone’s input matters
	•	The system reduces emotional friction
	•	The algorithm externalizes disagreement
	•	Locking creates clarity instead of tension

⸻

9. MVP Constraints (Intentional)

The following are explicitly out of scope for MVP:
	•	Month-only polls
	•	Re-locking or rescheduling
	•	Partial attendance tracking
	•	Calendar sync
	•	Auto-lock timers
	•	Multi-round voting
	•	Quorum requirements

These features can be layered later without breaking the model.

⸻

10. UX Truths (Must Be Communicated)

The UI must repeatedly reinforce:
	•	“Approximate availability is okay early.”
	•	“If you don’t respond, we’ll assume you’re unavailable.”
	•	“Voting is preference, not obligation.”
	•	“Locking dates is final.”

⸻

11. Non-Negotiable Rule

In Trypzy, scheduling narrows intent until a single moment of commitment — and everything else flows from that.