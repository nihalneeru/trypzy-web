/**
 * Push notification delivery via APNS (Apple Push Notification Service).
 *
 * Uses the `apn` npm package for token-based APNS delivery.
 * Falls back silently if APNS env vars are not configured.
 */

import apn from 'apn'

// ============ Push Copy ============

const PUSH_COPY = {
  leader_can_lock_dates: (tripName) => ({
    title: 'Tripti.ai',
    body: `Ready to lock dates for "${tripName}"? Your group has weighed in.`,
  }),
  leader_ready_to_propose: (tripName) => ({
    title: 'Tripti.ai',
    body: `"${tripName}" has a promising date range. Suggest it when you're ready.`,
  }),
  dates_locked: (tripName) => ({
    title: 'Tripti.ai',
    body: `"${tripName}" dates are confirmed! Time to plan the fun stuff.`,
  }),
}

// ============ APNS Provider (lazy singleton) ============

let _provider = null

function getProvider() {
  if (_provider) return _provider

  const keyBase64 = process.env.APNS_KEY_BASE64
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID

  if (!keyBase64 || !keyId || !teamId) {
    return null // Push not configured — skip silently
  }

  _provider = new apn.Provider({
    token: {
      key: Buffer.from(keyBase64, 'base64'),
      keyId,
      teamId,
    },
    production: true,
  })

  return _provider
}

// ============ Send Push ============

/**
 * Send a push notification for a nudge.
 * Resolves the target user(s) from the nudge audience,
 * fetches their push tokens, and delivers via APNS.
 *
 * @param {object} db - MongoDB database instance
 * @param {object} nudge - The nudge object from computeNudges()
 * @param {object} trip - The trip object
 */
export async function sendPushForNudge(db, nudge, trip) {
  const provider = getProvider()
  if (!provider) return // APNS not configured

  const copyFn = PUSH_COPY[nudge.type]
  if (!copyFn) return // No copy for this type

  const { title, body } = copyFn(trip.name)
  const bundleId = process.env.APNS_BUNDLE_ID || 'ai.tripti.app'

  // Determine target users
  let targetUserIds = []

  if (nudge.audience === 'leader') {
    targetUserIds = [trip.createdBy]
  } else if (nudge.audience === 'all') {
    // Get all active participants
    const participants = trip.type === 'hosted'
      ? await db.collection('trip_participants').find({ tripId: trip.id, status: 'active' }).toArray()
      : await db.collection('memberships').find({ circleId: trip.circleId, status: { $ne: 'left' } }).toArray()
    targetUserIds = participants.map(p => p.userId || p.id)
  }

  if (targetUserIds.length === 0) return

  // Fetch push tokens
  const tokens = await db.collection('push_tokens')
    .find({ userId: { $in: targetUserIds } })
    .toArray()

  if (tokens.length === 0) return

  // Build and send notification
  for (const tokenDoc of tokens) {
    const notification = new apn.Notification()
    notification.alert = { title, body }
    notification.topic = bundleId
    notification.sound = 'default'
    notification.badge = 1

    try {
      const result = await provider.send(notification, tokenDoc.token)
      // Remove invalid tokens
      if (result.failed && result.failed.length > 0) {
        for (const failure of result.failed) {
          if (failure.status === '410' || failure.response?.reason === 'Unregistered') {
            await db.collection('push_tokens').deleteOne({ token: failure.device })
          }
        }
      }
    } catch (err) {
      console.error('[push] Failed to send notification:', err)
    }
  }
}
