import { connectToMongo } from '../server/db.js'

/**
 * Get itinerary idea context for LLM generation
 * Fetches ideas and related chat events for a trip
 * 
 * @param {string} tripId - Trip ID
 * @returns {Promise<{ideas: Array, constraintsFromMilestones: Array}>}
 */
export async function getItineraryIdeaContext(tripId) {
  const db = await connectToMongo()
  
  // Fetch itinerary ideas
  const ideas = await db.collection('itinerary_ideas')
    .find({ tripId })
    .sort({ priority: -1, createdAt: -1 })
    .toArray()
  
  // Fetch relevant chat system messages (itinerary ideas and milestones)
  const chatEvents = await db.collection('trip_messages')
    .find({
      tripId,
      isSystem: true,
      $or: [
        { subtype: 'itinerary_idea' },
        { subtype: 'milestone', 'metadata.key': { $in: ['dates_locked', 'itinerary_generated', 'itinerary_finalized'] } }
      ]
    })
    .sort({ createdAt: 1 })
    .toArray()
  
  // Extract constraints from milestone events
  const constraintsFromMilestones = []
  chatEvents.forEach(event => {
    if (event.subtype === 'milestone') {
      const key = event.metadata?.key
      if (key === 'dates_locked' && event.metadata?.startDate && event.metadata?.endDate) {
        constraintsFromMilestones.push({
          type: 'date_range',
          startDate: event.metadata.startDate,
          endDate: event.metadata.endDate,
          source: 'dates_locked_milestone'
        })
      }
    }
  })
  
  return {
    ideas: ideas.map(idea => ({
      id: idea.id,
      title: idea.title,
      details: idea.details,
      category: idea.category,
      constraints: idea.constraints || [],
      location: idea.location,
      createdAt: idea.createdAt
    })),
    constraintsFromMilestones
  }
}
