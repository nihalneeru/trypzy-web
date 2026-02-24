/**
 * Stripe Webhook Handler
 *
 * Standalone route (not in catch-all) because webhooks need raw body
 * access for signature verification.
 *
 * POST /api/webhooks/stripe
 */

import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { connectToMongo } from '@/lib/server/db'
import { ensureBoostIndexes } from '@/lib/server/ensureIndexes'

/** Lazy-init Stripe to avoid crashing at build time when env vars aren't set */
let _stripe
function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    })
  }
  return _stripe
}

export async function POST(request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const stripe = getStripe()
  const rawBody = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    )
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = await connectToMongo()
  await ensureBoostIndexes()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const { tripId, userId, circleId } = session.metadata || {}

        if (!tripId || !userId) {
          console.error('[Stripe Webhook] Missing metadata in checkout session:', session.id)
          break
        }

        const paymentIntent = session.payment_intent
        const now = new Date().toISOString()

        // Update trip boost status
        await db.collection('trips').updateOne(
          { id: tripId },
          {
            $set: {
              boostStatus: 'boosted',
              boostedBy: userId,
              boostedAt: now,
              stripePaymentId: paymentIntent,
            }
          }
        )

        // Update boost_purchases record
        await db.collection('boost_purchases').updateOne(
          { stripeSessionId: session.id },
          {
            $set: {
              status: 'completed',
              stripePaymentIntentId: paymentIntent,
            }
          }
        )

        // Post chat system message
        const trip = await db.collection('trips').findOne({ id: tripId })
        if (trip) {
          const isLeader = trip.createdBy === userId
          let chatText

          if (isLeader) {
            const user = await db.collection('users').findOne({ id: userId })
            const name = user?.name || 'The trip leader'
            chatText = `${name} boosted this trip!`
          } else {
            chatText = 'This trip just got an upgrade!'
          }

          const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: isLeader ? userId : null,
            subtype: 'milestone',
            text: chatText,
            metadata: { key: 'trip_boosted', boostedBy: userId },
            dedupeKey: `trip_boosted_${tripId}`,
          })
        }

        // Emit analytics event (non-critical)
        try {
          const { emitBoostPurchaseCompleted } = await import('@/lib/events/instrumentation.js')
          emitBoostPurchaseCompleted(
            tripId,
            circleId || trip?.circleId,
            userId,
            trip?.createdBy === userId ? 'leader' : 'traveler',
            trip?.createdAt ? new Date(trip.createdAt) : new Date()
          )
        } catch (e) {
          console.error('[Stripe Webhook] Event emission failed (non-critical):', e.message)
        }

        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        const paymentIntent = charge.payment_intent

        if (paymentIntent) {
          await db.collection('boost_purchases').updateOne(
            { stripePaymentIntentId: paymentIntent },
            { $set: { status: 'refunded' } }
          )
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object
        const paymentIntent = dispute.payment_intent

        if (paymentIntent) {
          await db.collection('boost_purchases').updateOne(
            { stripePaymentIntentId: paymentIntent },
            { $set: { status: 'disputed' } }
          )
        }
        break
      }

      default:
        // Unhandled event type — acknowledge receipt
        break
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, err)
    // Still return 200 to prevent Stripe retries for application errors
  }

  return NextResponse.json({ received: true })
}
