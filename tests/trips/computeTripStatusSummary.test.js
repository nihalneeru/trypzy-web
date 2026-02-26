import { describe, it, expect } from 'vitest'
import { computeTripStatusSummary } from '../../lib/trips/computeTripStatusSummary.js'

const USER_ID = 'user-1'
const LEADER_ID = 'leader-1'

const makeParticipants = (count) =>
  Array.from({ length: count }, (_, i) => ({ userId: `user-${i + 1}` }))

describe('computeTripStatusSummary', () => {
  // ── null / missing trip ───
  it('returns loading state for null trip', () => {
    const result = computeTripStatusSummary(null, [], null, USER_ID)
    expect(result.phase).toBe('Trip loading...')
    expect(result.nextAction).toBeNull()
  })

  // ── PROPOSED ───
  it('returns proposed phase for status=proposed', () => {
    const trip = { status: 'proposed', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toBe('Trip proposed')
    expect(result.stats).toContain('5 traveler')
    expect(result.nextAction).toBe('Suggest dates for the trip')
    expect(result.nextActionRole).toBe('traveler')
  })

  it('shows singular traveler for 1 participant', () => {
    const trip = { status: 'proposed', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(1), null, USER_ID)
    expect(result.stats).toBe('1 traveler in the group')
  })

  // ── SCHEDULING / COLLECTING ───
  it('returns collecting dates when status=scheduling, no proposal', () => {
    const trip = {
      status: 'scheduling',
      createdBy: LEADER_ID,
      schedulingSummary: {
        phase: 'COLLECTING',
        windowCount: 3,
        responderCount: 2,
        totalTravelers: 5,
        userHasResponded: false,
        proposalReady: false
      }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toBe('Collecting dates')
    expect(result.stats).toContain('2 of 5')
    expect(result.nextAction).toBe('Add your date preferences')
    expect(result.nextActionRole).toBe('traveler')
  })

  it('suggests leader propose when proposalReady and user is leader', () => {
    const trip = {
      status: 'scheduling',
      createdBy: LEADER_ID,
      schedulingSummary: {
        phase: 'COLLECTING',
        windowCount: 4,
        responderCount: 4,
        totalTravelers: 5,
        userHasResponded: true,
        proposalReady: true
      }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, LEADER_ID)

    expect(result.nextAction).toBe('Propose dates to the group')
    expect(result.nextActionRole).toBe('leader')
  })

  it('returns null nextAction when user responded and is not leader', () => {
    const trip = {
      status: 'scheduling',
      createdBy: LEADER_ID,
      schedulingSummary: {
        phase: 'COLLECTING',
        windowCount: 4,
        responderCount: 4,
        totalTravelers: 5,
        userHasResponded: true,
        proposalReady: true
      }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)
    expect(result.nextAction).toBeNull()
  })

  // ── SCHEDULING / PROPOSED ───
  it('returns proposed window phase when leader proposed dates', () => {
    const trip = {
      status: 'scheduling',
      createdBy: LEADER_ID,
      schedulingSummary: {
        phase: 'PROPOSED',
        proposedWindowText: 'Mar 7 – Mar 9',
        totalReactions: 3,
        userReaction: null
      }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(6), null, USER_ID)

    expect(result.phase).toBe('Leader proposed Mar 7 – Mar 9')
    expect(result.stats).toContain('3 of 6')
    expect(result.nextAction).toBe('React to the proposed dates')
    expect(result.nextActionRole).toBe('traveler')
  })

  it('shows lock action for leader who has reacted', () => {
    const trip = {
      status: 'scheduling',
      createdBy: LEADER_ID,
      schedulingSummary: {
        phase: 'PROPOSED',
        proposedWindowText: 'Mar 7 – Mar 9',
        totalReactions: 4,
        userReaction: 'WORKS'
      }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, LEADER_ID)

    expect(result.nextAction).toBe('Confirm dates when ready')
    expect(result.nextActionRole).toBe('leader')
  })

  // ── VOTING (legacy) ───
  it('returns voting phase for status=voting', () => {
    const trip = { status: 'voting', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(4), null, USER_ID)

    expect(result.phase).toBe('Voting on dates')
    expect(result.nextAction).toBe('Cast your vote')
  })

  // ── LOCKED — no itinerary ───
  it('returns locked with itinerary prompt', () => {
    const trip = {
      status: 'locked',
      createdBy: LEADER_ID,
      lockedStartDate: '2026-04-10',
      lockedEndDate: '2026-04-13',
      itineraryStatus: null,
      ideaSummary: { totalCount: 0 }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toContain('Dates locked')
    expect(result.phase).toContain('Apr 10')
    expect(result.stats).toContain('Time to plan the itinerary')
    expect(result.nextAction).toBe('Suggest destinations and activities')
    expect(result.nextActionRole).toBe('traveler')
  })

  it('shows build itinerary CTA for leader on locked trip', () => {
    const trip = {
      status: 'locked',
      createdBy: LEADER_ID,
      lockedStartDate: '2026-04-10',
      lockedEndDate: '2026-04-13',
      itineraryStatus: null,
      ideaSummary: { totalCount: 2 }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, LEADER_ID)

    expect(result.nextAction).toBe('Build the itinerary')
    expect(result.nextActionRole).toBe('leader')
  })

  // ── LOCKED — itinerary ready ───
  it('returns locked with itinerary ready', () => {
    const trip = {
      status: 'locked',
      createdBy: LEADER_ID,
      lockedStartDate: '2026-04-10',
      lockedEndDate: '2026-04-13',
      itineraryStatus: 'published'
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.stats).toContain('Itinerary ready')
    expect(result.nextAction).toBe('Explore accommodation options')
  })

  // ── LOCKED — accommodation chosen ───
  it('returns accommodation chosen state', () => {
    const trip = {
      status: 'locked',
      createdBy: LEADER_ID,
      lockedStartDate: '2026-04-10',
      lockedEndDate: '2026-04-13',
      itineraryStatus: 'published',
      progress: { steps: { accommodationChosen: true } }
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.stats).toContain('Accommodation chosen')
  })

  // ── COMPLETED ───
  it('returns completed phase', () => {
    const trip = { status: 'completed', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toBe('Trip completed!')
    expect(result.nextAction).toBeNull()
  })

  // ── CANCELED ───
  it('returns canceled phase', () => {
    const trip = { status: 'canceled', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toBe('Trip canceled')
    expect(result.nextAction).toBeNull()
    expect(result.sinceLastVisit).toBeNull()
  })

  it('returns canceled for tripStatus=CANCELLED', () => {
    const trip = { status: 'proposed', tripStatus: 'CANCELLED', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(3), null, USER_ID)

    expect(result.phase).toBe('Trip canceled')
  })

  // ── sinceLastVisit ───
  it('includes sinceLastVisit summary when delta data provided', () => {
    const trip = { status: 'proposed', createdBy: LEADER_ID }
    const sinceData = { newMessages: 3, newWindows: 1, newReactions: 0, lastVisitedAt: new Date() }
    const result = computeTripStatusSummary(trip, makeParticipants(5), sinceData, USER_ID)

    expect(result.sinceLastVisit).not.toBeNull()
    expect(result.sinceLastVisit.summary).toContain('3 new messages')
    expect(result.sinceLastVisit.summary).toContain('1 new date suggestion')
  })

  it('returns null sinceLastVisit when no new activity', () => {
    const trip = { status: 'proposed', createdBy: LEADER_ID }
    const sinceData = { newMessages: 0, newWindows: 0, newReactions: 0, lastVisitedAt: new Date() }
    const result = computeTripStatusSummary(trip, makeParticipants(5), sinceData, USER_ID)

    expect(result.sinceLastVisit).toBeNull()
  })

  it('returns null sinceLastVisit when sinceData is null', () => {
    const trip = { status: 'proposed', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.sinceLastVisit).toBeNull()
  })

  // ── LOCKED — itinerary drafting ───
  it('returns drafting state when itinerary is being generated', () => {
    const trip = {
      status: 'locked',
      createdBy: LEADER_ID,
      lockedStartDate: '2026-04-10',
      lockedEndDate: '2026-04-13',
      itineraryStatus: 'drafting'
    }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.stats).toContain('being worked on')
    expect(result.nextAction).toBeNull()
  })

  // ── SCHEDULING with empty schedulingSummary ───
  it('handles scheduling with no schedulingSummary gracefully', () => {
    const trip = { status: 'scheduling', createdBy: LEADER_ID }
    const result = computeTripStatusSummary(trip, makeParticipants(5), null, USER_ID)

    expect(result.phase).toBe('Collecting dates')
    expect(result.stats).toBe('Waiting for date suggestions')
    expect(result.nextAction).toBe('Add your date preferences')
  })
})
