/**
 * Central push notification dispatcher.
 *
 * Every push notification (except legacy nudge-triggered pushes) goes
 * through this function. It orchestrates: copy → audience → dedupe →
 * deepLink → sendPush.
 *
 * Push failures never crash API endpoints — all errors are caught and logged.
 */

import { PUSH_COPY } from './pushCopy.js'
import { resolveTargetUsers } from './pushAudience.js'
import { tryRecordPush, isDailyCapped, isP0Type } from './pushDedupe.js'
import { buildDeepLink } from './pushDeepLink.js'
import { sendPush } from './sendPush.js'

/**
 * Build a dedupe key for a push notification.
 * Keys follow patterns defined in the spec (Section 6).
 */
function buildDedupeKey(type, tripId, context, userId) {
  switch (type) {
    case 'trip_created_notify':
      return `trip_created:${tripId}:${userId}`
    case 'trip_canceled':
      return `trip_canceled:${tripId}:${userId}`
    case 'first_dates_suggested':
      return `first_dates:${tripId}:${userId}`
    case 'dates_proposed_by_leader':
      return `dates_proposed:${tripId}:${context.windowId || 'unknown'}`
    case 'dates_locked':
      return `dates_locked:${tripId}`
    case 'itinerary_generated':
      return `itinerary_generated:${tripId}:v${context.version || 1}`
    case 'join_request_received':
      return `join_request:${tripId}:${context.requesterId || userId}`
    case 'join_request_approved':
      return `join_approved:${tripId}:${context.requesterId || userId}`
    case 'leader_transferred':
      return `leader_transferred:${tripId}:${context.newLeaderId || userId}`
    case 'window_supported_author':
      return `window_supported:${context.windowId || 'unknown'}:${context.authorUserId || userId}`
    case 'expense_added':
      return `expense_added:${tripId}:${context.expenseId || userId}`
    case 'accommodation_selected':
      return `accommodation_selected:${tripId}`
    case 'leader_ready_to_propose':
      return `leader_ready:${tripId}`
    case 'first_idea_contributed':
      return `first_idea:${tripId}`
    case 'prep_reminder_7d':
      return `prep_7d:${tripId}:${userId}`
    case 'trip_started':
      return `trip_started:${tripId}:${userId}`
    default:
      return `${type}:${tripId}:${userId}`
  }
}

/**
 * Route a push notification through the pipeline.
 *
 * @param {object} db - MongoDB instance
 * @param {object} opts
 * @param {string} opts.type - Push type (e.g., 'trip_created_notify')
 * @param {string} opts.tripId
 * @param {object} opts.trip - Full trip object
 * @param {object} [opts.context] - Type-specific context (actorName, dates, etc.)
 * @returns {Promise<{ sent: number, suppressed: number, failed: number }>}
 */
export async function pushRouter(db, { type, tripId, trip, context = {} }) {
  const stats = { sent: 0, suppressed: 0, failed: 0 }

  try {
    // 1. Look up copy function
    const copyFn = PUSH_COPY[type]
    if (!copyFn) {
      console.warn(`[push:${type}] No copy function registered`)
      return stats
    }

    // 2. Resolve target users
    const targetUserIds = await resolveTargetUsers(db, type, trip, context)
    if (targetUserIds.length === 0) return stats

    // 3. Per-user: daily cap check (before dedupe to avoid permanently losing pushes) + dedupe
    const eligibleUserIds = []

    for (const userId of targetUserIds) {
      // Daily cap (P0 exempt) — check BEFORE dedupe record to avoid
      // permanently suppressing a push that was never sent
      if (!isP0Type(type)) {
        const capped = await isDailyCapped(db, userId)
        if (capped) {
          stats.suppressed++
          continue
        }
      }

      // Atomic dedupe
      const dedupeKey = buildDedupeKey(type, tripId, context, userId)
      const isNew = await tryRecordPush(db, { userId, dedupeKey, pushType: type, tripId })
      if (!isNew) {
        stats.suppressed++
        continue
      }

      eligibleUserIds.push(userId)
    }

    if (eligibleUserIds.length === 0) return stats

    // 4. Build deep link data
    const data = buildDeepLink(type, tripId)

    // 5. Send to each eligible user (per-user copy for role-aware variants)
    const sendPromises = eligibleUserIds.map(async (userId) => {
      try {
        const { title, body } = copyFn(context, { userId, trip })
        await sendPush(db, [userId], { title, body, data })
        stats.sent++
      } catch (err) {
        console.error(`[push:${type}] send failed for userId=${userId}:`, err.message)
        stats.failed++
      }
    })

    await Promise.allSettled(sendPromises)
    return stats
  } catch (err) {
    console.error(`[push:${type}] router failed for tripId=${tripId}:`, err.message)
    return stats
  }
}
