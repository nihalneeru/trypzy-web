/**
 * Checking Reminder — lazy nudge for stale CAVEAT reactions.
 *
 * 48 hours after a CAVEAT reaction on a proposed window, surfaces a gentle
 * system chat message: "Still checking on Mar 10–15? No rush, just keeping
 * it on your radar."
 *
 * Runs lazily during GET /date-windows (no cron required).
 * Deduplicated via createChatCardMessage (built-in eventKey check).
 */

import { v4 as uuidv4 } from 'uuid'
import { createChatCardMessage } from './store'
import { formatDateRange } from './copy'

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48 hours

/**
 * Check for stale CAVEAT reactions on proposed windows and insert
 * gentle reminder chat messages.
 *
 * @param {object} db - MongoDB database handle
 * @param {object} trip - Trip document
 * @param {string[]} proposedWindowIds - IDs of proposed windows
 * @param {Array} windows - Enriched window objects (with startDate, endDate)
 */
export async function checkStaleCheckingReactions(db, trip, proposedWindowIds, windows) {
  const now = Date.now()
  const cutoff = new Date(now - STALE_THRESHOLD_MS).toISOString()
  const circleId = trip.circleId

  // Build a lookup of proposed windows by id
  const windowMap = new Map()
  for (const w of windows) {
    if (proposedWindowIds.includes(w.id)) {
      windowMap.set(w.id, w)
    }
  }

  // Find CAVEAT reactions on the trip's proposed windows that are > 48h old
  const reactions = trip.proposedWindowReactions || []
  const staleCaveats = reactions.filter(
    r => r.reactionType === 'CAVEAT' && r.createdAt && r.createdAt < cutoff
  )

  for (const reaction of staleCaveats) {
    // Find which proposed window this reaction is for
    // Reactions on the trip level apply to the primary proposed window
    const windowId = reaction.windowId || proposedWindowIds[0]
    const window = windowMap.get(windowId)
    if (!window) continue

    const dedupeKey = `checking_reminder:${trip._id || trip.id}:${reaction.userId}:${windowId}`
    const userName = reaction.userName || 'Someone'
    const dateLabel = formatDateRange(window.startDate, window.endDate)

    const nudge = {
      id: uuidv4(),
      type: 'checking_reminder',
      channel: 'chat_card',
      audience: 'all',
      priority: 4,
      payload: {
        message: `🔔 ${userName} — still checking on ${dateLabel}? No rush, just keeping it on your radar.`,
        travelerName: userName,
        dateRange: { start: window.startDate, end: window.endDate, label: dateLabel }
      },
      dedupeKey,
      cooldownHours: 168 // 7 days — effectively once per window per user
    }

    const messageText = `🔔 ${userName} — still checking on ${dateLabel}? No rush, just keeping it on your radar.`
    await createChatCardMessage(db, trip._id || trip.id, circleId, nudge, messageText)
  }
}
