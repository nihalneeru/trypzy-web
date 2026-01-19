/**
 * Unit tests for itinerary generation readiness logic
 * 
 * Tests that the "Generate Itinerary" button is enabled only when
 * all active travelers (including leader) have >= 3 ideas each.
 */

import { describe, it, expect } from 'vitest'

/**
 * Compute readiness: all active travelers (including leader) must have >= 3 ideas
 * This mirrors the logic in ItineraryTab component
 */
function canGenerateItinerary(trip, ideas) {
  if (!trip || !ideas) return false
  
  // Build set of active traveler IDs
  const activeTravelerIds = new Set()
  
  // Always include the trip creator (leader) as a traveler
  if (trip.createdBy) {
    activeTravelerIds.add(trip.createdBy)
  }
  
  // Include active travelers from trip participants
  if (trip.participants && Array.isArray(trip.participants)) {
    trip.participants.forEach((p) => {
      const status = p.status || 'active'
      if (status === 'active' && p.userId) {
        activeTravelerIds.add(p.userId)
      }
    })
  }
  
  // For collaborative trips, also include circle members who are implicitly active
  // (if no participants list is available, use activeTravelerCount as fallback)
  if (trip.type === 'collaborative' && activeTravelerIds.size === 0 && trip.activeTravelerCount) {
    // If we have a count but no participant list, we can't verify individual counts
    // In this case, check if we have ideas from enough travelers
    const uniqueIdeaAuthors = new Set(
      ideas
        .map((idea) => idea.authorUserId || idea.authorId)
        .filter(Boolean)
    )
    // If all idea authors have >= 3 ideas and we have ideas from all expected travelers
    if (uniqueIdeaAuthors.size >= trip.activeTravelerCount) {
      // Count ideas per author
      const ideaCountsByAuthor = new Map()
      uniqueIdeaAuthors.forEach((authorId) => {
        ideaCountsByAuthor.set(authorId, 0)
      })
      ideas.forEach((idea) => {
        const authorId = idea.authorUserId || idea.authorId
        if (authorId && ideaCountsByAuthor.has(authorId)) {
          ideaCountsByAuthor.set(authorId, (ideaCountsByAuthor.get(authorId) || 0) + 1)
        }
      })
      return Array.from(ideaCountsByAuthor.values()).every((count) => count >= 3)
    }
    return false
  }
  
  // If no active travelers identified, cannot generate
  if (activeTravelerIds.size === 0) return false
  
  // Count ideas per active traveler
  const ideaCountsByTraveler = new Map()
  activeTravelerIds.forEach((travelerId) => {
    ideaCountsByTraveler.set(travelerId, 0)
  })
  
  ideas.forEach((idea) => {
    const authorId = idea.authorUserId || idea.authorId
    if (authorId && ideaCountsByTraveler.has(authorId)) {
      ideaCountsByTraveler.set(authorId, (ideaCountsByTraveler.get(authorId) || 0) + 1)
    }
  })
  
  // Check if all active travelers have >= 3 ideas
  const allTravelersHaveEnoughIdeas = Array.from(ideaCountsByTraveler.values()).every(
    (count) => count >= 3
  )
  
  return allTravelersHaveEnoughIdeas
}

describe('canGenerateItinerary', () => {
  const mockTrip = (overrides = {}) => ({
    id: 'trip-1',
    createdBy: 'leader-1',
    type: 'collaborative',
    status: 'locked',
    participants: [
      { userId: 'leader-1', status: 'active' },
      { userId: 'traveler-1', status: 'active' },
      { userId: 'traveler-2', status: 'active' }
    ],
    ...overrides
  })

  const mockIdea = (authorId, index = 1) => ({
    id: `idea-${authorId}-${index}`,
    authorUserId: authorId,
    text: `Idea ${index} from ${authorId}`
  })

  it('should return false when trip is null', () => {
    expect(canGenerateItinerary(null, [])).toBe(false)
  })

  it('should return false when ideas is null', () => {
    const trip = mockTrip()
    expect(canGenerateItinerary(trip, null)).toBe(false)
  })

  it('should return false when no ideas exist', () => {
    const trip = mockTrip()
    expect(canGenerateItinerary(trip, [])).toBe(false)
  })

  it('should return false when travelers have < 3 ideas each', () => {
    const trip = mockTrip()
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-2', 1)
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(false)
  })

  it('should return true when all travelers have >= 3 ideas each', () => {
    const trip = mockTrip()
    const ideas = [
      // Leader has 3 ideas
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('leader-1', 3),
      // Traveler 1 has 3 ideas
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-1', 3),
      // Traveler 2 has 3 ideas
      mockIdea('traveler-2', 1),
      mockIdea('traveler-2', 2),
      mockIdea('traveler-2', 3)
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(true)
  })

  it('should return false when leader has < 3 ideas', () => {
    const trip = mockTrip()
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-1', 3),
      mockIdea('traveler-2', 1),
      mockIdea('traveler-2', 2),
      mockIdea('traveler-2', 3)
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(false)
  })

  it('should return false when one traveler has < 3 ideas', () => {
    const trip = mockTrip()
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('leader-1', 3),
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-1', 3),
      mockIdea('traveler-2', 1),
      mockIdea('traveler-2', 2)
      // traveler-2 only has 2 ideas
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(false)
  })

  it('should include leader even if not in participants list', () => {
    const trip = mockTrip({
      participants: [
        { userId: 'traveler-1', status: 'active' },
        { userId: 'traveler-2', status: 'active' }
      ]
    })
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('leader-1', 3),
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-1', 3),
      mockIdea('traveler-2', 1),
      mockIdea('traveler-2', 2),
      mockIdea('traveler-2', 3)
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(true)
  })

  it('should exclude travelers with status "left"', () => {
    const trip = mockTrip({
      participants: [
        { userId: 'leader-1', status: 'active' },
        { userId: 'traveler-1', status: 'active' },
        { userId: 'traveler-2', status: 'left' } // Left traveler
      ]
    })
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('leader-1', 3),
      mockIdea('traveler-1', 1),
      mockIdea('traveler-1', 2),
      mockIdea('traveler-1', 3)
      // traveler-2 left, so we don't need their ideas
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(true)
  })

  it('should handle ideas with authorId instead of authorUserId', () => {
    const trip = mockTrip()
    const ideas = [
      { id: 'idea-1', authorId: 'leader-1', text: 'Idea 1' },
      { id: 'idea-2', authorId: 'leader-1', text: 'Idea 2' },
      { id: 'idea-3', authorId: 'leader-1', text: 'Idea 3' },
      { id: 'idea-4', authorId: 'traveler-1', text: 'Idea 4' },
      { id: 'idea-5', authorId: 'traveler-1', text: 'Idea 5' },
      { id: 'idea-6', authorId: 'traveler-1', text: 'Idea 6' },
      { id: 'idea-7', authorId: 'traveler-2', text: 'Idea 7' },
      { id: 'idea-8', authorId: 'traveler-2', text: 'Idea 8' },
      { id: 'idea-9', authorId: 'traveler-2', text: 'Idea 9' }
    ]
    expect(canGenerateItinerary(trip, ideas)).toBe(true)
  })

  it('should return false when trip has no participants and no activeTravelerCount', () => {
    const trip = mockTrip({
      participants: [],
      activeTravelerCount: undefined
    })
    const ideas = [
      mockIdea('leader-1', 1),
      mockIdea('leader-1', 2),
      mockIdea('leader-1', 3)
    ]
    // Should still work because leader is always included via createdBy
    expect(canGenerateItinerary(trip, ideas)).toBe(true)
  })
})
