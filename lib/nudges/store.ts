/**
 * Nudge Event Store
 *
 * Handles persistence and deduplication of nudge events.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  Nudge,
  NudgeEventRecord,
  NudgeStatus,
  NudgeType,
  NudgeChannel,
} from './types'
import { recordTripEvent } from '../events/store'
import { TripEventTypes } from '../events/types'

// ============ Types ============

interface WasNudgeSuppressedInput {
  tripId: string
  userId: string
  dedupeKey: string
  cooldownHours: number
}

interface RecordNudgeEventInput {
  tripId: string
  userId: string
  nudge: Nudge
  status: NudgeStatus
}

// ============ Dedupe / Cooldown ============

/**
 * Check if a nudge should be suppressed due to recent show/dismiss.
 *
 * @returns true if the nudge should be suppressed (not shown)
 */
export async function wasNudgeSuppressed(
  db: any,
  input: WasNudgeSuppressedInput
): Promise<boolean> {
  const { tripId, userId, dedupeKey, cooldownHours } = input

  // Calculate cooldown cutoff
  const cooldownMs = cooldownHours * 60 * 60 * 1000
  const cutoff = new Date(Date.now() - cooldownMs).toISOString()

  // Check for any recent nudge event with this dedupe key
  const recentEvent = await db.collection('nudge_events').findOne({
    tripId,
    userId: userId,
    dedupeKey,
    createdAt: { $gte: cutoff },
    status: { $in: ['shown', 'dismissed'] },
  })

  return !!recentEvent
}

/**
 * Filter nudges by dedupe/cooldown.
 * Returns only nudges that should be shown.
 */
export async function filterSuppressedNudges(
  db: any,
  tripId: string,
  userId: string,
  nudges: Nudge[]
): Promise<Nudge[]> {
  const results: Nudge[] = []

  for (const nudge of nudges) {
    const suppressed = await wasNudgeSuppressed(db, {
      tripId,
      userId,
      dedupeKey: nudge.dedupeKey,
      cooldownHours: nudge.cooldownHours,
    })

    if (!suppressed) {
      results.push(nudge)
    }
  }

  return results
}

// ============ Recording ============

/**
 * Record a nudge event (shown, clicked, or dismissed).
 */
export async function recordNudgeEvent(
  db: any,
  input: RecordNudgeEventInput
): Promise<NudgeEventRecord> {
  const { tripId, userId, nudge, status } = input

  const now = new Date()
  const record: NudgeEventRecord & { displayedAt?: Date } = {
    id: uuidv4(),
    tripId,
    userId,
    nudgeId: nudge.id,
    nudgeType: nudge.type,
    dedupeKey: nudge.dedupeKey,
    status,
    channel: nudge.channel,
    createdAt: now.toISOString(),
    // Add displayedAt as Date type for TTL index (per EVENTS_SPEC.md)
    displayedAt: status === 'shown' ? now : undefined,
  }

  // Upsert to handle potential duplicates
  await db.collection('nudge_events').updateOne(
    {
      tripId,
      userId,
      dedupeKey: nudge.dedupeKey,
      status,
    },
    {
      $setOnInsert: record,
    },
    { upsert: true }
  )

  // Also record as a TripEvent for analytics
  await recordTripEvent(db, {
    tripId,
    actorUserId: userId,
    type:
      status === 'shown'
        ? TripEventTypes.NUDGE_SHOWN
        : status === 'clicked'
          ? TripEventTypes.NUDGE_CLICKED
          : TripEventTypes.NUDGE_DISMISSED,
    metadata: {
      nudgeType: nudge.type,
      channel: nudge.channel,
      dedupeKey: nudge.dedupeKey,
      audience: nudge.audience,
    },
  })

  return record
}

/**
 * Record multiple nudges as shown.
 */
export async function recordNudgesShown(
  db: any,
  tripId: string,
  userId: string,
  nudges: Nudge[]
): Promise<void> {
  for (const nudge of nudges) {
    await recordNudgeEvent(db, {
      tripId,
      userId,
      nudge,
      status: 'shown' as NudgeStatus,
    })
  }
}

/**
 * Record a nudge click.
 */
export async function recordNudgeClick(
  db: any,
  tripId: string,
  userId: string,
  nudgeId: string,
  nudgeType: NudgeType,
  dedupeKey: string,
  channel: NudgeChannel
): Promise<void> {
  const record: Partial<NudgeEventRecord> = {
    id: uuidv4(),
    tripId,
    userId,
    nudgeId,
    nudgeType,
    dedupeKey,
    status: 'clicked' as NudgeStatus,
    channel,
    createdAt: new Date().toISOString(),
  }

  await db.collection('nudge_events').insertOne(record)

  await recordTripEvent(db, {
    tripId,
    actorUserId: userId,
    type: TripEventTypes.NUDGE_CLICKED,
    metadata: {
      nudgeType,
      channel,
      dedupeKey,
      audience: 'unknown',
    },
  })
}

/**
 * Record a nudge dismissal.
 */
export async function recordNudgeDismiss(
  db: any,
  tripId: string,
  userId: string,
  nudgeId: string,
  nudgeType: NudgeType,
  dedupeKey: string,
  channel: NudgeChannel
): Promise<void> {
  const record: Partial<NudgeEventRecord> = {
    id: uuidv4(),
    tripId,
    userId,
    nudgeId,
    nudgeType,
    dedupeKey,
    status: 'dismissed' as NudgeStatus,
    channel,
    createdAt: new Date().toISOString(),
  }

  await db.collection('nudge_events').insertOne(record)

  await recordTripEvent(db, {
    tripId,
    actorUserId: userId,
    type: TripEventTypes.NUDGE_DISMISSED,
    metadata: {
      nudgeType,
      channel,
      dedupeKey,
      audience: 'unknown',
    },
  })
}

// ============ Chat Dedupe ============

/**
 * Check if a chat message with this eventKey already exists.
 * Used to prevent duplicate chat_card nudges.
 */
export async function hasChatMessageWithEventKey(
  db: any,
  tripId: string,
  eventKey: string
): Promise<boolean> {
  // Check trip_messages for a system message with this eventKey
  const existing = await db.collection('trip_messages').findOne({
    tripId,
    isSystem: true,
    'metadata.eventKey': eventKey,
  })

  if (existing) return true

  // Also check by scanning recent system messages for the dedupeKey pattern
  // This handles legacy messages that might not have eventKey
  const recentSystemMessages = await db
    .collection('trip_messages')
    .find({
      tripId,
      isSystem: true,
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()

  // Check if any message content matches known patterns
  for (const msg of recentSystemMessages) {
    if (msg.metadata?.eventKey === eventKey) return true
    if (msg.metadata?.dedupeKey === eventKey) return true
  }

  return false
}

/**
 * Create a chat message for a chat_card nudge.
 * Only creates if no duplicate exists.
 *
 * @returns true if message was created, false if duplicate found
 */
export async function createChatCardMessage(
  db: any,
  tripId: string,
  circleId: string,
  nudge: Nudge,
  messageText: string
): Promise<boolean> {
  // Check for duplicate
  const hasDuplicate = await hasChatMessageWithEventKey(db, tripId, nudge.dedupeKey)

  if (hasDuplicate) {
    return false
  }

  // Create the chat message
  const message = {
    id: uuidv4(),
    tripId,
    circleId,
    content: messageText,
    isSystem: true,
    subtype: 'nudge',
    metadata: {
      eventKey: nudge.dedupeKey,
      nudgeType: nudge.type,
      source: 'nudge_engine',
    },
    createdAt: new Date().toISOString(),
  }

  await db.collection('trip_messages').insertOne(message)

  return true
}

// ============ Index Creation ============

/**
 * Ensure indexes exist for efficient queries.
 * Call this during app initialization.
 */
export async function ensureNudgeIndexes(db: any): Promise<void> {
  // Nudge events: dedupe index
  await db.collection('nudge_events').createIndex(
    { tripId: 1, userId: 1, dedupeKey: 1, status: 1 },
    { background: true }
  )

  // Nudge events: time-based queries
  await db.collection('nudge_events').createIndex(
    { tripId: 1, createdAt: -1 },
    { background: true }
  )

  // Nudge events: TTL index for auto-expiry after 7 days (per EVENTS_SPEC.md)
  // Note: This requires a Date-typed field. If createdAt is string, add displayedAt as Date.
  try {
    await db.collection('nudge_events').createIndex(
      { displayedAt: 1 },
      { expireAfterSeconds: 604800, background: true, sparse: true }
    )
  } catch (err: unknown) {
    // Index might already exist with different options
    if (err && typeof err === 'object' && 'code' in err && err.code !== 85) {
      console.error('[nudges] Failed to create TTL index:', err)
    }
  }

  // Trip events: type queries
  await db.collection('trip_events').createIndex(
    { tripId: 1, type: 1, createdAt: -1 },
    { background: true }
  )

  // Trip messages: eventKey lookup
  await db.collection('trip_messages').createIndex(
    { tripId: 1, 'metadata.eventKey': 1 },
    { background: true, sparse: true }
  )
}
