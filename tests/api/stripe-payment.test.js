/**
 * Integration tests for Stripe payment flow
 *
 * Endpoints tested:
 * 1. POST /api/trips/:id/boost — Checkout session creation
 * 2. POST /api/webhooks/stripe — Webhook handler (checkout.session.completed, charge.refunded, charge.dispute.created)
 *
 * Covers:
 * - Checkout session creation (auth, permissions, guard rails)
 * - Webhook signature verification
 * - Happy path: boost purchase → trip status update
 * - Idempotency (replaying the same webhook event)
 * - Refund and dispute status updates
 * - Feature gating unlock after boost
 */

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { vi } from 'vitest'
import { setupTestDatabase, teardownTestDatabase, JWT_SECRET } from '../testUtils/dbTestHarness.js'
import { isFeatureGated } from '../../lib/trips/isFeatureGated.js'

function createToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET)
}

// --- Stripe mocks ---

// Mock stripe module globally — the checkout session creation (catch-all route)
// dynamically imports stripe, so we mock the default export.
const mockCheckoutSessionsCreate = vi.fn()
const mockWebhooksConstructEvent = vi.fn()

vi.mock('stripe', () => {
  const StripeMock = function () {
    return {
      checkout: {
        sessions: {
          create: mockCheckoutSessionsCreate,
        },
      },
      webhooks: {
        constructEvent: mockWebhooksConstructEvent,
      },
    }
  }
  StripeMock.default = StripeMock
  return { default: StripeMock }
})

// Mock emitTripChatEvent to prevent side effects
vi.mock('@/lib/chat/emitTripChatEvent.js', () => ({
  emitTripChatEvent: vi.fn().mockResolvedValue({}),
}))

// Mock event instrumentation to prevent side effects
vi.mock('@/lib/events/instrumentation.js', () => ({
  emitBoostPurchaseInitiated: vi.fn(),
  emitBoostPurchaseCompleted: vi.fn(),
  emitCriticalEvent: vi.fn(),
  emitNonCriticalEvent: vi.fn(),
}))

let POST_catchall, POST_webhook

describe('Stripe Payment Flow', () => {
  let client
  let db

  // Shared test data
  const leaderId = 'test-stripe-leader'
  const travelerId = 'test-stripe-traveler'
  const outsiderId = 'test-stripe-outsider'
  const circleId = 'circle-stripe-test'
  const tripId = 'trip-stripe-test'

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client

    // Set Stripe env vars for the boost endpoint
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake_secret'

    // Import route handlers after env vars are set
    const catchall = await import('@/app/api/[[...path]]/route.js')
    POST_catchall = catchall.POST

    const webhook = await import('@/app/api/webhooks/stripe/route.js')
    POST_webhook = webhook.POST
  })

  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    await teardownTestDatabase(client)
  })

  beforeEach(async () => {
    // Clean test data
    await db.collection('users').deleteMany({ id: { $in: [leaderId, travelerId, outsiderId] } })
    await db.collection('trips').deleteMany({ id: tripId })
    await db.collection('circles').deleteMany({ id: circleId })
    await db.collection('memberships').deleteMany({ circleId })
    await db.collection('trip_participants').deleteMany({ tripId })
    await db.collection('boost_purchases').deleteMany({ tripId })
    await db.collection('trip_messages').deleteMany({ tripId })

    // Seed common test data
    await db.collection('users').insertOne({
      id: leaderId,
      name: 'Stripe Leader',
      email: 'stripe-leader@test.com',
      createdAt: new Date().toISOString(),
    })
    await db.collection('users').insertOne({
      id: travelerId,
      name: 'Stripe Traveler',
      email: 'stripe-traveler@test.com',
      createdAt: new Date().toISOString(),
    })
    await db.collection('users').insertOne({
      id: outsiderId,
      name: 'Outsider',
      email: 'outsider@test.com',
      createdAt: new Date().toISOString(),
    })

    await db.collection('circles').insertOne({
      id: circleId,
      name: 'Stripe Test Circle',
      ownerId: leaderId,
      inviteCode: 'STRIPE-TEST',
      createdAt: new Date().toISOString(),
    })

    await db.collection('memberships').insertOne({
      userId: leaderId,
      circleId,
      role: 'owner',
      joinedAt: new Date().toISOString(),
    })
    await db.collection('memberships').insertOne({
      userId: travelerId,
      circleId,
      role: 'member',
      joinedAt: new Date().toISOString(),
    })

    await db.collection('trips').insertOne({
      id: tripId,
      circleId,
      name: 'Stripe Test Trip',
      type: 'collaborative',
      tripStatus: 'ACTIVE',
      status: 'proposed',
      createdBy: leaderId,
      createdAt: new Date().toISOString(),
    })

    // Reset mocks
    mockCheckoutSessionsCreate.mockReset()
    mockWebhooksConstructEvent.mockReset()

    // Default: checkout.sessions.create returns a session
    mockCheckoutSessionsCreate.mockResolvedValue({
      id: 'cs_test_session_123',
      url: 'https://checkout.stripe.com/pay/cs_test_session_123',
    })
  })

  // Helper to make a POST to the catch-all route
  function boostRequest(tripIdParam, token) {
    const req = new NextRequest(`http://localhost:3000/api/trips/${tripIdParam}/boost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    return POST_catchall(req, { params: { path: ['trips', tripIdParam, 'boost'] } })
  }

  // Helper to make a webhook POST
  function webhookRequest(rawBody, signature = 'sig_test') {
    const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': signature,
      },
      body: rawBody,
    })
    return POST_webhook(req)
  }

  // ─── CHECKOUT SESSION CREATION ───

  describe('POST /api/trips/:id/boost — Checkout Session', () => {
    it('requires authentication', async () => {
      const res = await boostRequest(tripId, null)
      expect(res.status).toBe(401)
    })

    it('returns 404 for nonexistent trip', async () => {
      const token = createToken(leaderId)
      const res = await boostRequest('trip-does-not-exist', token)
      expect(res.status).toBe(404)
    })

    it('returns 403 for non-traveler', async () => {
      const token = createToken(outsiderId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(403)
    })

    it('returns 400 for canceled trip', async () => {
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { status: 'canceled', tripStatus: 'CANCELLED' } }
      )

      const token = createToken(leaderId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toMatch(/canceled/i)
    })

    it('returns 400 for already boosted trip', async () => {
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { boostStatus: 'boosted' } }
      )

      const token = createToken(leaderId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toMatch(/already boosted/i)
    })

    it('creates checkout session for leader', async () => {
      const token = createToken(leaderId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.sessionUrl).toBe('https://checkout.stripe.com/pay/cs_test_session_123')

      // Verify boost_purchases record was created
      const purchase = await db.collection('boost_purchases').findOne({ tripId })
      expect(purchase).toBeTruthy()
      expect(purchase.userId).toBe(leaderId)
      expect(purchase.status).toBe('pending')
      expect(purchase.amount).toBe(499)
      expect(purchase.currency).toBe('usd')
      expect(purchase.stripeSessionId).toBe('cs_test_session_123')
    })

    it('creates checkout session for non-leader traveler', async () => {
      const token = createToken(travelerId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.sessionUrl).toBeDefined()

      const purchase = await db.collection('boost_purchases').findOne({ tripId, userId: travelerId })
      expect(purchase).toBeTruthy()
      expect(purchase.userId).toBe(travelerId)
    })

    it('passes correct metadata to Stripe', async () => {
      const token = createToken(leaderId)
      await boostRequest(tripId, token)

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1)
      const args = mockCheckoutSessionsCreate.mock.calls[0][0]

      expect(args.metadata.tripId).toBe(tripId)
      expect(args.metadata.userId).toBe(leaderId)
      expect(args.metadata.circleId).toBe(circleId)
      expect(args.mode).toBe('payment')
      expect(args.line_items[0].price_data.unit_amount).toBe(499)
      expect(args.line_items[0].price_data.currency).toBe('usd')
    })

    it('returns 500 when Stripe API errors', async () => {
      mockCheckoutSessionsCreate.mockRejectedValue(new Error('Stripe API error'))

      const token = createToken(leaderId)
      const res = await boostRequest(tripId, token)
      expect(res.status).toBe(500)

      const body = await res.json()
      expect(body.error).toMatch(/checkout session/i)
    })
  })

  // ─── WEBHOOK HANDLER ───

  describe('POST /api/webhooks/stripe — Webhook Handler', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const res = await POST_webhook(req)
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toMatch(/missing.*signature/i)
    })

    it('returns 400 when signature verification fails', async () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature')
      })

      const res = await webhookRequest('{"type":"test"}', 'bad_sig')
      expect(res.status).toBe(400)

      const body = await res.json()
      expect(body.error).toMatch(/invalid signature/i)
    })

    describe('checkout.session.completed', () => {
      const stripeSessionId = 'cs_test_completed_123'
      const paymentIntentId = 'pi_test_abc123'

      beforeEach(async () => {
        // Insert a pending boost purchase (simulating what /boost created)
        await db.collection('boost_purchases').insertOne({
          id: 'bp-test-1',
          tripId,
          userId: leaderId,
          amount: 499,
          currency: 'usd',
          stripeSessionId,
          stripePaymentIntentId: null,
          status: 'pending',
          createdAt: new Date().toISOString(),
        })

        // Configure mock to return a valid event
        mockWebhooksConstructEvent.mockReturnValue({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: stripeSessionId,
              payment_intent: paymentIntentId,
              metadata: {
                tripId,
                userId: leaderId,
                circleId,
              },
            },
          },
        })
      })

      it('updates trip boostStatus to boosted', async () => {
        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        const trip = await db.collection('trips').findOne({ id: tripId })
        expect(trip.boostStatus).toBe('boosted')
        expect(trip.boostedBy).toBe(leaderId)
        expect(trip.boostedAt).toBeDefined()
        expect(trip.stripePaymentId).toBe(paymentIntentId)
      })

      it('updates boost_purchases record to completed', async () => {
        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        const purchase = await db.collection('boost_purchases').findOne({ stripeSessionId })
        expect(purchase.status).toBe('completed')
        expect(purchase.stripePaymentIntentId).toBe(paymentIntentId)
      })

      it('unlocks gated features after boost', async () => {
        // Before webhook: features are gated
        const tripBefore = await db.collection('trips').findOne({ id: tripId })
        expect(isFeatureGated(tripBefore, 'settle_up')).toBe(true)
        expect(isFeatureGated(tripBefore, 'decision_deadline')).toBe(true)

        await webhookRequest('{}')

        // After webhook: features are unlocked
        const tripAfter = await db.collection('trips').findOne({ id: tripId })
        expect(isFeatureGated(tripAfter, 'settle_up')).toBe(false)
        expect(isFeatureGated(tripAfter, 'decision_deadline')).toBe(false)
        expect(isFeatureGated(tripAfter, 'brief_export')).toBe(false)
      })

      it('is idempotent — replaying the same event does not error', async () => {
        // First call
        const res1 = await webhookRequest('{}')
        expect(res1.status).toBe(200)

        // Second call (same event replayed by Stripe)
        const res2 = await webhookRequest('{}')
        expect(res2.status).toBe(200)

        // Trip is still boosted (not errored)
        const trip = await db.collection('trips').findOne({ id: tripId })
        expect(trip.boostStatus).toBe('boosted')
      })

      it('handles missing metadata gracefully', async () => {
        mockWebhooksConstructEvent.mockReturnValue({
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_no_metadata',
              payment_intent: 'pi_no_metadata',
              metadata: {},
            },
          },
        })

        // Should return 200 (acknowledge receipt) but not update any trip
        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        // Trip should remain unchanged
        const trip = await db.collection('trips').findOne({ id: tripId })
        expect(trip.boostStatus).toBeUndefined()
      })
    })

    describe('charge.refunded', () => {
      const paymentIntentId = 'pi_refund_test'

      beforeEach(async () => {
        await db.collection('boost_purchases').insertOne({
          id: 'bp-refund-1',
          tripId,
          userId: leaderId,
          amount: 499,
          currency: 'usd',
          stripeSessionId: 'cs_refund_test',
          stripePaymentIntentId: paymentIntentId,
          status: 'completed',
          createdAt: new Date().toISOString(),
        })

        mockWebhooksConstructEvent.mockReturnValue({
          type: 'charge.refunded',
          data: {
            object: {
              payment_intent: paymentIntentId,
            },
          },
        })
      })

      it('updates boost_purchases status to refunded', async () => {
        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        const purchase = await db.collection('boost_purchases').findOne({
          stripePaymentIntentId: paymentIntentId,
        })
        expect(purchase.status).toBe('refunded')
      })
    })

    describe('charge.dispute.created', () => {
      const paymentIntentId = 'pi_dispute_test'

      beforeEach(async () => {
        await db.collection('boost_purchases').insertOne({
          id: 'bp-dispute-1',
          tripId,
          userId: leaderId,
          amount: 499,
          currency: 'usd',
          stripeSessionId: 'cs_dispute_test',
          stripePaymentIntentId: paymentIntentId,
          status: 'completed',
          createdAt: new Date().toISOString(),
        })

        mockWebhooksConstructEvent.mockReturnValue({
          type: 'charge.dispute.created',
          data: {
            object: {
              payment_intent: paymentIntentId,
            },
          },
        })
      })

      it('updates boost_purchases status to disputed', async () => {
        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        const purchase = await db.collection('boost_purchases').findOne({
          stripePaymentIntentId: paymentIntentId,
        })
        expect(purchase.status).toBe('disputed')
      })
    })

    describe('unhandled event types', () => {
      it('acknowledges unhandled event types with 200', async () => {
        mockWebhooksConstructEvent.mockReturnValue({
          type: 'payment_intent.created',
          data: { object: {} },
        })

        const res = await webhookRequest('{}')
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.received).toBe(true)
      })
    })
  })

  // ─── FULL HAPPY PATH ───

  describe('Full happy path: boost → webhook → feature unlock', () => {
    it('completes end-to-end boost purchase flow', async () => {
      const stripeSessionId = 'cs_e2e_session'
      const paymentIntentId = 'pi_e2e_payment'

      mockCheckoutSessionsCreate.mockResolvedValue({
        id: stripeSessionId,
        url: 'https://checkout.stripe.com/pay/' + stripeSessionId,
      })

      // Step 1: Leader initiates boost
      const token = createToken(leaderId)
      const boostRes = await boostRequest(tripId, token)
      expect(boostRes.status).toBe(200)

      const boostBody = await boostRes.json()
      expect(boostBody.sessionUrl).toContain(stripeSessionId)

      // Verify pending purchase record
      const pendingPurchase = await db.collection('boost_purchases').findOne({ tripId })
      expect(pendingPurchase.status).toBe('pending')
      expect(pendingPurchase.stripeSessionId).toBe(stripeSessionId)

      // Verify trip is NOT yet boosted
      let trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.boostStatus).toBeUndefined()
      expect(isFeatureGated(trip, 'settle_up')).toBe(true)

      // Step 2: Stripe sends webhook after payment
      mockWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: stripeSessionId,
            payment_intent: paymentIntentId,
            metadata: { tripId, userId: leaderId, circleId },
          },
        },
      })

      const webhookRes = await webhookRequest('{}')
      expect(webhookRes.status).toBe(200)

      // Step 3: Verify trip is now boosted
      trip = await db.collection('trips').findOne({ id: tripId })
      expect(trip.boostStatus).toBe('boosted')
      expect(trip.boostedBy).toBe(leaderId)
      expect(trip.stripePaymentId).toBe(paymentIntentId)

      // Step 4: Verify all gated features are now unlocked
      expect(isFeatureGated(trip, 'settle_up')).toBe(false)
      expect(isFeatureGated(trip, 'decision_deadline')).toBe(false)
      expect(isFeatureGated(trip, 'decision_auto_close')).toBe(false)
      expect(isFeatureGated(trip, 'brief_export')).toBe(false)
      expect(isFeatureGated(trip, 'settle_reminder')).toBe(false)
      expect(isFeatureGated(trip, 'settle_mark')).toBe(false)

      // Step 5: Verify purchase record updated
      const completedPurchase = await db.collection('boost_purchases').findOne({ tripId })
      expect(completedPurchase.status).toBe('completed')
      expect(completedPurchase.stripePaymentIntentId).toBe(paymentIntentId)
    })
  })
})
