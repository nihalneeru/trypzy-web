'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/common/AppHeader'
import { HelpCircle, Send, FileText, CheckCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const faqs = [
  {
    q: 'How do I invite friends to a trip?',
    a: 'Open your trip and tap the travelers icon at the bottom. You\u2019ll see a share link you can send to anyone \u2014 no app download required.',
  },
  {
    q: 'How do dates get locked?',
    a: 'Everyone suggests when they\u2019re free, and Tripti.ai finds the overlap. The trip leader proposes a window, travelers react, and the leader locks dates when the group is ready.',
  },
  {
    q: 'Do all travelers need to respond before the trip can move forward?',
    a: 'Nope. Tripti.ai is designed for partial participation \u2014 a few motivated planners can move things forward while others join in at their own pace.',
  },
  {
    q: 'Can I use Tripti.ai without downloading an app?',
    a: 'Absolutely. Tripti.ai works in any mobile or desktop browser. We also have native apps for iOS and Android.',
  },
  {
    q: 'Is Tripti.ai free?',
    a: 'Yes \u2014 creating circles, planning trips, and coordinating with your group is completely free. If you ever see a charge you don\u2019t recognize, please contact us right away.',
  },
  {
    q: 'I\u2019m having trouble logging in. What should I do?',
    a: 'Try signing in with the same method you used to create your account (Google or Apple). If you\u2019re still stuck, send us a message using the form above and we\u2019ll help sort it out.',
  },
  {
    q: 'My invite link isn\u2019t working. What\u2019s wrong?',
    a: 'Make sure you\u2019re using the full link (it starts with tripti.ai). If it still doesn\u2019t work, ask the trip leader to send a fresh invite from the travelers panel.',
  },
  {
    q: 'How do I delete my account?',
    a: null, // rendered with link below
  },
]

export default function HelpPage() {
  const [userName, setUserName] = useState(null)
  const [formState, setFormState] = useState({ name: '', email: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('tripti_user')
      if (storedUser) {
        const parsed = JSON.parse(storedUser)
        setUserName(parsed.name)
        setFormState(prev => ({
          ...prev,
          name: parsed.name || '',
          email: parsed.email || '',
        }))
      }
    } catch {}
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSending(true)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formState.name,
          email: formState.email,
          message: formState.message,
          website: e.target.elements.website?.value || '',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')

      setSent(true)
      setFormState(prev => ({ ...prev, message: '' }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-sand/30">
      <AppHeader userName={userName} />
      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-2">
          <HelpCircle className="h-6 w-6 text-brand-blue" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-brand-carbon">Help &amp; Support</h1>
        </div>
        <p className="text-brand-carbon/60 mb-6 ml-9">Find quick answers or get in touch.</p>

        <div className="bg-white rounded-lg border border-brand-carbon/10 p-6 sm:p-8 space-y-8">
          {/* Contact Form */}
          <section>
            <h2 className="text-xl font-semibold text-brand-carbon mb-3">Contact us</h2>
            <p className="text-brand-carbon/70 mb-2">
              Have a question, found a bug, or need help with your account? Send us a message and
              we&apos;ll get back to you as soon as we can.
            </p>
            <p className="text-sm text-brand-carbon/50 mb-4">
              We usually reply within 1&ndash;2 business days. Please don&apos;t include
              passwords or sensitive payment info in your message.
            </p>

            {sent ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-brand-sand/40 border border-brand-sand">
                <CheckCircle className="h-5 w-5 text-brand-green shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-brand-carbon">Message sent!</p>
                  <p className="text-sm text-brand-carbon/60">We&apos;ll get back to you at {formState.email}.</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-brand-blue"
                  onClick={() => setSent(false)}
                >
                  Send another
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Honeypot — hidden from real users */}
                <div className="absolute opacity-0 h-0 overflow-hidden" aria-hidden="true" tabIndex={-1}>
                  <label htmlFor="website">Website</label>
                  <input type="text" id="website" name="website" autoComplete="off" tabIndex={-1} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-brand-carbon mb-1">
                      Name
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      maxLength={200}
                      value={formState.name}
                      onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-md border border-brand-carbon/20 px-3 py-2 text-sm text-brand-carbon placeholder:text-brand-carbon/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-brand-carbon mb-1">
                      Email
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      maxLength={320}
                      value={formState.email}
                      onChange={e => setFormState(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-md border border-brand-carbon/20 px-3 py-2 text-sm text-brand-carbon placeholder:text-brand-carbon/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-brand-carbon mb-1">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    maxLength={5000}
                    minLength={10}
                    value={formState.message}
                    onChange={e => setFormState(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full rounded-md border border-brand-carbon/20 px-3 py-2 text-sm text-brand-carbon placeholder:text-brand-carbon/40 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue resize-y"
                    placeholder="Tell us how we can help..."
                  />
                </div>

                {error && (
                  <p className="text-sm text-brand-red">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={sending}
                  className="bg-brand-blue hover:bg-brand-blue/90 text-white"
                >
                  {sending ? (
                    'Sending...'
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                      Send message
                    </>
                  )}
                </Button>
              </form>
            )}
          </section>

          {/* FAQ */}
          <section>
            <h2 className="text-xl font-semibold text-brand-carbon mb-4">Common questions</h2>
            <dl className="divide-y divide-brand-carbon/10">
              {faqs.map((faq, i) => (
                <div key={i} className="py-4 first:pt-0 last:pb-0">
                  <dt className="font-medium text-brand-carbon">{faq.q}</dt>
                  <dd className="text-sm text-brand-carbon/70 mt-1">
                    {faq.a ? faq.a : (
                      <>
                        Go to <Link href="/settings" className="text-brand-blue underline">Settings</Link> and
                        scroll to the bottom to find the account deletion option.
                        If you can&apos;t access your account, use the contact form above
                        and we&apos;ll take care of it.
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Legal */}
          <section>
            <h2 className="text-xl font-semibold text-brand-carbon mb-3">Legal &amp; Privacy</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/terms">
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                  Terms of Use
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/privacy">
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                  Privacy Policy
                </Link>
              </Button>
            </div>
          </section>
        </div>

        {/* Business address */}
        <p className="text-xs text-brand-carbon/40 text-center mt-8">
          Trypzy, Inc. &middot; 701 Tillery Street Unit 12-3518, Austin, Texas 78702, United States
        </p>
      </main>
    </div>
  )
}
