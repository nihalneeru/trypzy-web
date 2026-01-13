/**
 * Server-side function to fetch trip with computed stage
 * This ensures all pages use the same stage derivation logic
 */

import { connectToMongo } from '../server/db.js'
import { deriveTripPrimaryStage, computeProgressFlags } from './stage.js'

/**
 * Get trip with computed stage and progress flags
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID (for auth check)
 * @returns {Promise<{trip: Object, stage: string, progress: Object}>}
 */
export async function getTripWithStage(tripId, userId) {
  const db = await connectToMongo()
  
  // Fetch trip
  const trip = await db.collection('trips').findOne({ id: tripId })
  if (!trip) {
    throw new Error('Trip not found')
  }
  
  // Check membership
  const membership = await db.collection('memberships').findOne({
    userId,
    circleId: trip.circleId
  })
  
  if (!membership) {
    throw new Error('You are not a member of this circle')
  }
  
  // Fetch progress data if available
  try {
    const progressDoc = await db.collection('trip_progress').findOne({ tripId })
    if (progressDoc) {
      trip.progress = {
        steps: progressDoc.steps || {},
        canEdit: progressDoc.canEdit !== false
      }
    }
  } catch (error) {
    // Progress collection might not exist yet - that's okay
    trip.progress = null
  }
  
  // Derive stage
  const stage = deriveTripPrimaryStage(trip)
  const progressFlags = computeProgressFlags(trip)
  
  return {
    trip,
    stage,
    progress: progressFlags
  }
}
