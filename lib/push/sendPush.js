/**
 * Push notification delivery — Hybrid APNS (iOS) + FCM (Android).
 *
 * Uses @parse/node-apn for iOS APNS tokens and firebase-admin for Android FCM tokens.
 * Falls back silently if either provider is not configured.
 */

import apn from '@parse/node-apn'
import admin from 'firebase-admin'

// ============ Nudge-specific Copy (legacy path) ============

const NUDGE_PUSH_COPY = {
  leader_can_lock_dates: (tripName) => ({
    title: tripName,
    body: 'Your group has weighed in — confirm the dates when you\'re ready.',
  }),
  leader_ready_to_propose: (tripName) => ({
    title: tripName,
    body: 'Over half your group has weighed in. There\'s a date with strong support.',
  }),
}

// ============ APNS Provider (lazy singleton) ============

let _apnProvider = null

function getApnProvider() {
  if (_apnProvider) return _apnProvider

  const keyBase64 = process.env.APNS_KEY_BASE64
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID

  if (!keyBase64 || !keyId || !teamId) {
    return null // APNS not configured — skip silently
  }

  _apnProvider = new apn.Provider({
    token: {
      key: Buffer.from(keyBase64, 'base64'),
      keyId,
      teamId,
    },
    production: process.env.NODE_ENV === 'production',
  })

  return _apnProvider
}

// ============ Firebase App (lazy singleton) ============

function getFirebaseApp() {
  if (admin.apps.length) return admin.apps[0] // Hot-reload guard
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!encoded) return null // FCM not configured — skip silently
  try {
    const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString())
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  } catch (err) {
    console.error('[push] Failed to initialize Firebase:', err.message)
    return null
  }
}

// ============ APNS Send ============

async function sendApns(db, tokens, { title, body, data }) {
  if (tokens.length === 0) return
  const provider = getApnProvider()
  if (!provider) return

  const bundleId = process.env.APNS_BUNDLE_ID || 'ai.tripti.app'

  const results = await Promise.allSettled(tokens.map(t => {
    const note = new apn.Notification()
    note.alert = { title, body }
    note.sound = 'default'
    note.topic = bundleId
    note.threadId = data?.tripId || undefined // Group by trip in notification center
    if (data) note.payload = { ...data }
    return provider.send(note, t.token)
  }))

  // Prune invalid tokens
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.failed?.length > 0) {
      const failure = r.value.failed[0]
      if (failure.status === '410' || failure.response?.reason === 'Unregistered') {
        db.collection('push_tokens').deleteOne({ _id: tokens[i]._id }).catch(() => {})
      }
    }
  })
}

// ============ FCM Send ============

async function sendFcm(db, tokens, { title, body, data }) {
  if (tokens.length === 0) return
  const app = getFirebaseApp()
  if (!app) return

  const messages = tokens.map(t => ({
    token: t.token,
    notification: { title, body },
    data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {},
    android: { priority: 'high', notification: { sound: 'default' } },
  }))

  const results = await admin.messaging().sendEach(messages)

  // Prune invalid tokens
  results.responses.forEach((res, i) => {
    if (res.error?.code === 'messaging/registration-token-not-registered' ||
        res.error?.code === 'messaging/invalid-registration-token') {
      db.collection('push_tokens').deleteOne({ _id: tokens[i]._id }).catch(() => {})
    }
  })
}

// ============ Unified Send ============

/**
 * Send a push notification to one or more users.
 * Routes by `provider` field on push_tokens: 'apns' → APNS, 'fcm' → FCM.
 *
 * @param {object} db - MongoDB database instance
 * @param {string[]} userIds - Target user IDs
 * @param {object} opts
 * @param {string} opts.title - Notification title
 * @param {string} opts.body - Notification body
 * @param {object} [opts.data] - Deep link data (tripId, overlay)
 */
export async function sendPush(db, userIds, { title, body, data }) {
  const tokens = await db.collection('push_tokens')
    .find({ userId: { $in: userIds }, provider: { $in: ['apns', 'fcm'] } })
    .toArray()

  if (tokens.length === 0) return

  const apnsTokens = tokens.filter(t => t.provider === 'apns')
  const fcmTokens = tokens.filter(t => t.provider === 'fcm')

  const results = await Promise.allSettled([
    sendApns(db, apnsTokens, { title, body, data }),
    sendFcm(db, fcmTokens, { title, body, data }),
  ])

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[push] ${i === 0 ? 'APNS' : 'FCM'} batch failed:`, r.reason?.message)
    }
  })
}

// ============ Legacy Nudge Path ============

/**
 * Send a push notification for a nudge.
 * This path stays separate from pushRouter to avoid double-dedupe
 * (nudge engine already dedupes via nudge_events).
 *
 * @param {object} db - MongoDB database instance
 * @param {object} nudge - The nudge object from computeNudges()
 * @param {object} trip - The trip object
 */
export async function sendPushForNudge(db, nudge, trip) {
  const copyFn = NUDGE_PUSH_COPY[nudge.type]
  if (!copyFn) return

  const { title, body } = copyFn(trip.name)

  // Determine target users
  let targetUserIds = []

  if (nudge.audience === 'leader') {
    targetUserIds = [trip.createdBy]
  } else if (nudge.audience === 'all') {
    const participants = trip.type === 'hosted'
      ? await db.collection('trip_participants').find({ tripId: trip.id, status: 'active' }).toArray()
      : await db.collection('memberships').find({ circleId: trip.circleId, status: { $ne: 'left' } }).toArray()
    targetUserIds = participants.map(p => p.userId || p.id)
  }

  if (targetUserIds.length === 0) return

  await sendPush(db, targetUserIds, { title, body, data: { tripId: trip.id } })
}
