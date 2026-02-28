import { NextResponse } from 'next/server'
import { Resend } from 'resend'

// Simple in-memory rate limit: 1 submission per IP per 60 seconds
const rateMap = new Map()
const RATE_LIMIT_MS = 60_000

function isRateLimited(ip) {
  const now = Date.now()
  const last = rateMap.get(ip)
  if (last && now - last < RATE_LIMIT_MS) return true
  rateMap.set(ip, now)
  // Prune old entries every 100 requests
  if (rateMap.size > 500) {
    for (const [key, ts] of rateMap) {
      if (now - ts > RATE_LIMIT_MS) rateMap.delete(key)
    }
  }
  return false
}

export async function POST(request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Please wait a minute before sending another message.' }, { status: 429 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { name, email, message, website } = body

  // Honeypot — if "website" field is filled, it's a bot
  if (website) {
    // Return success to not tip off the bot
    return NextResponse.json({ ok: true })
  }

  // Validate
  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 200) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!message || typeof message !== 'string' || message.trim().length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'Please enter a message (at least 10 characters).' }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    await resend.emails.send({
      from: 'Tripti.ai Support <noreply@send.tripti.ai>',
      to: 'contact@tripti.ai',
      replyTo: email.trim(),
      subject: `Support: ${name.trim()}`,
      text: [
        `Name: ${name.trim()}`,
        `Email: ${email.trim()}`,
        '',
        message.trim(),
      ].join('\n'),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Contact Form] Send failed:', err?.message || err)
    return NextResponse.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }
}
