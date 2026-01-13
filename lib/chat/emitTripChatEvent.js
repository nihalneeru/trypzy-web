import { connectToMongo } from '../server/db.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * @typedef {Object} EmitTripChatEventOptions
 * @property {string} tripId - Trip ID
 * @property {string} circleId - Circle ID (optional, will be fetched if not provided)
 * @property {string|null} [actorUserId] - User ID who triggered the event (null for system-only events)
 * @property {string} subtype - Event subtype (e.g., 'itinerary_idea', 'milestone', 'traveler_joined')
 * @property {string} text - Display text for the event
 * @property {Object} [metadata] - Additional metadata (ideaId, href, milestone key, etc.)
 * @property {string} [dedupeKey] - Optional deduplication key to prevent duplicate events
 */

/**
 * Emit a trip chat event (system message)
 * Central function for logging trip activity to chat
 * 
 * @param {EmitTripChatEventOptions} options
 * @returns {Promise<Object>} Created message object
 */
export async function emitTripChatEvent({
  tripId,
  circleId = null,
  actorUserId = null,
  subtype,
  text,
  metadata = {},
  dedupeKey = null
}) {
  const db = await connectToMongo()
  
  // Fetch circleId from trip if not provided
  if (!circleId) {
    const trip = await db.collection('trips').findOne({ id: tripId })
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`)
    }
    circleId = trip.circleId
  }
  
  // Check for duplicate if dedupeKey provided (prevent double-posting on retries)
  if (dedupeKey) {
    const existing = await db.collection('trip_messages').findOne({
      tripId,
      'metadata.dedupeKey': dedupeKey
    })
    if (existing) {
      // Return existing message instead of creating duplicate
      return existing
    }
  }
  
  // Get actor name if actorUserId provided
  let actorName = null
  if (actorUserId) {
    const actor = await db.collection('users').findOne({ id: actorUserId })
    actorName = actor?.name || null
  }
  
  const message = {
    id: uuidv4(),
    tripId,
    circleId,
    userId: actorUserId, // null for pure system events, userId for user-triggered system events
    content: text,
    isSystem: true,
    subtype, // e.g., 'itinerary_idea', 'milestone', 'traveler_joined'
    metadata: {
      ...metadata,
      ...(dedupeKey ? { dedupeKey } : {}),
      ...(actorName ? { actorName } : {})
    },
    createdAt: new Date().toISOString()
  }
  
  await db.collection('trip_messages').insertOne(message)
  
  return message
}

/**
 * Emit a user chat message (for symmetry, but not required)
 * This is kept separate from system events for clarity
 * 
 * @param {string} tripId - Trip ID
 * @param {string} userId - User ID
 * @param {string} content - Message content
 * @returns {Promise<Object>} Created message object
 */
export async function emitUserChatMessage(tripId, userId, content) {
  const db = await connectToMongo()
  
  const trip = await db.collection('trips').findOne({ id: tripId })
  if (!trip) {
    throw new Error(`Trip ${tripId} not found`)
  }
  
  const message = {
    id: uuidv4(),
    tripId,
    circleId: trip.circleId,
    userId,
    content: content.trim(),
    isSystem: false,
    createdAt: new Date().toISOString()
  }
  
  await db.collection('trip_messages').insertOne(message)
  
  return message
}
