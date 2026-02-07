import crypto from 'crypto'

const MAX_CHAT_MESSAGES = 50
const CHAT_LOOKBACK_DAYS = 14

/**
 * Build a normalized snapshot of scheduling-relevant data for LLM insight generation.
 * The snapshot is used both as LLM input and to compute a stable inputHash for caching.
 *
 * @param {Object} db - MongoDB database instance
 * @param {Object} trip - Trip document
 * @returns {Promise<{ snapshot: Object, inputHash: string }>}
 */
export async function buildSchedulingInsightSnapshot(db, trip) {
  const tripId = trip.id

  // 1. Fetch active travelers with names
  let travelerIds = []
  if (trip.type === 'collaborative') {
    const memberships = await db.collection('memberships')
      .find({ circleId: trip.circleId, status: { $ne: 'left' } })
      .toArray()
    const participants = await db.collection('trip_participants')
      .find({ tripId })
      .toArray()
    const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))

    travelerIds = memberships
      .filter(m => {
        const status = statusMap.get(m.userId)
        return !status || status === 'active'
      })
      .map(m => m.userId)
  } else {
    const participants = await db.collection('trip_participants')
      .find({ tripId, status: 'active' })
      .toArray()
    travelerIds = participants.map(p => p.userId)
  }

  // Fetch user names
  const users = travelerIds.length > 0
    ? await db.collection('users')
      .find({ id: { $in: travelerIds } })
      .project({ id: 1, name: 1 })
      .toArray()
    : []
  const userMap = new Map(users.map(u => [u.id, u.name || 'Unknown']))

  // 2. Fetch date windows + supports
  const windows = await db.collection('date_windows')
    .find({ tripId })
    .sort({ createdAt: 1 })
    .toArray()

  const supports = await db.collection('window_supports')
    .find({ tripId })
    .toArray()

  // Build a set of users who have responded (supported any window or proposed one)
  const respondedUserIds = new Set()
  for (const w of windows) {
    if (w.proposedBy) respondedUserIds.add(w.proposedBy)
  }
  for (const s of supports) {
    respondedUserIds.add(s.userId)
  }

  // 3. Build participants list
  const participants = travelerIds.map(uid => ({
    userId: uid,
    name: userMap.get(uid) || 'Unknown',
    role: uid === trip.createdBy ? 'leader' : 'traveler',
    responded: respondedUserIds.has(uid)
  }))

  // 4. Build windows with support summaries
  const enrichedWindows = windows.map(w => {
    const windowSupports = supports.filter(s => s.windowId === w.id)
    return {
      windowId: w.id,
      start: w.startDate || w.normalizedStart,
      end: w.endDate || w.normalizedEnd,
      sourceText: w.sourceText || null,
      proposedByName: userMap.get(w.proposedBy) || 'Unknown',
      supportCount: windowSupports.length,
      supporterNames: windowSupports.map(s => userMap.get(s.userId) || 'Unknown')
    }
  })

  // 5. Fetch scheduling-relevant chat messages
  const lookbackDate = new Date()
  lookbackDate.setDate(lookbackDate.getDate() - CHAT_LOOKBACK_DAYS)

  const chatMessages = await db.collection('trip_messages')
    .find({
      tripId,
      isSystem: { $ne: true },
      createdAt: { $gte: lookbackDate.toISOString() }
    })
    .sort({ createdAt: -1 })
    .limit(MAX_CHAT_MESSAGES)
    .toArray()

  // Reverse to chronological order and trim content
  const chat = chatMessages.reverse().map(m => ({
    messageId: m.id,
    createdAt: m.createdAt,
    authorName: userMap.get(m.userId) || 'Unknown',
    text: (m.content || '').substring(0, 300)
  }))

  // 6. Build snapshot
  const snapshot = {
    trip: {
      id: tripId,
      name: trip.name || 'Untitled Trip',
      status: trip.status,
      destinationHint: trip.destinationHint || null
    },
    participants,
    windows: enrichedWindows,
    chat
  }

  // 7. Compute inputHash from deterministic snapshot content
  // Hash is based on windows + supports + participant response status + chat message IDs
  // (not full chat text, to avoid hash churn from minor edits)
  const hashPayload = JSON.stringify({
    windowIds: enrichedWindows.map(w => w.windowId).sort(),
    supportCounts: enrichedWindows.map(w => `${w.windowId}:${w.supportCount}`).sort(),
    respondedIds: participants.filter(p => p.responded).map(p => p.userId).sort(),
    chatIds: chat.map(c => c.messageId).sort()
  })

  const inputHash = crypto.createHash('sha256').update(hashPayload).digest('hex').substring(0, 16)

  return { snapshot, inputHash }
}
