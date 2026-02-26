'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/common/AppHeader'
import { HelpCircle, Mail, FileText } from 'lucide-react'
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
    a: 'Try signing in with the same method you used to create your account (Google or Apple). If you\u2019re still stuck, email us and we\u2019ll help sort it out.',
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

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('tripti_user')
      if (storedUser) setUserName(JSON.parse(storedUser).name)
    } catch {}
  }, [])

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
          {/* Contact */}
          <section>
            <h2 className="text-xl font-semibold text-brand-carbon mb-3">Contact us</h2>
            <p className="text-brand-carbon/70 mb-2">
              Have a question, found a bug, or need help with your account? Reach out and
              we&apos;ll get back to you as soon as we can.
            </p>
            <p className="text-sm text-brand-carbon/50 mb-4">
              We usually reply within 1&ndash;2 business days. Please don&apos;t include
              passwords or sensitive payment info in your message.
            </p>
            <Button asChild className="bg-brand-blue hover:bg-brand-blue/90 text-white">
              <a href="mailto:contact@tripti.ai?subject=Tripti%20Support">
                <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
                contact@tripti.ai
              </a>
            </Button>
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
                        If you can&apos;t access your account, email us at{' '}
                        <a href="mailto:contact@tripti.ai?subject=Account%20Deletion%20Request" className="text-brand-blue underline">
                          contact@tripti.ai
                        </a>{' '}
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
