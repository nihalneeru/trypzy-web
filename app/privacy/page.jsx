'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/common/AppHeader'
import { Shield } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function PrivacyPolicyPage() {
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
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-brand-blue" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-brand-carbon">Privacy Policy</h1>
        </div>

        <div className="bg-white rounded-lg border border-brand-carbon/10 p-6 sm:p-8 prose prose-gray max-w-none">
          <p className="text-sm text-brand-carbon/60">Last updated: February 9, 2026</p>

          <p>
            Tripti.ai (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by Trypzy, Inc.,
            a Delaware corporation (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
            This Privacy Policy describes how we collect, use, share, and protect information when you use the
            Tripti.ai website, mobile applications, and related services (collectively, the &ldquo;Service&rdquo;).
          </p>
          <p>
            If you are located in the European Economic Area (&ldquo;EEA&rdquo;), United Kingdom, or other
            jurisdictions with data protection laws, additional provisions may apply as described below.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">Our Privacy Philosophy</h2>
          <p>
            Tripti.ai is designed for private group coordination within trusted circles. We prioritize
            collaboration and user trust over public social feeds or advertising-driven models.
          </p>
          <p>
            We do not sell personal data to third parties.
          </p>
          <p>
            Trip content is private to members of your selected group by default. If you or your
            trip leader choose to mark itineraries or posts as &ldquo;discoverable,&rdquo; that
            content may be visible to other Tripti users through the Discover feature. We aim to
            collect only the information necessary to operate and improve the Service.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">1. Information We Collect</h2>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Account Information</h3>
          <p>
            When you create or access an account, we collect basic information such as your name and
            email address. If you sign in using a third-party authentication provider (such as Google
            or Apple), we receive basic account information from that provider as permitted by your
            account settings.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">User Content</h3>
          <p>We collect content you create or upload within the Service, including:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Trip details (names, destinations, dates, preferences)</li>
            <li>Itineraries, votes, chat messages, lists</li>
            <li>Photos or other files shared with your group</li>
          </ul>
          <p>This content is visible only to members of your selected group.</p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Device &amp; Technical Information</h3>
          <p>We may collect technical data such as:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>IP address</li>
            <li>Device type</li>
            <li>Browser type</li>
            <li>App version</li>
            <li>Interaction data</li>
          </ul>
          <p>
            If you enable push notifications, we collect device push notification tokens to deliver
            notifications.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Cookies &amp; Similar Technologies</h3>
          <p>We use cookies and similar technologies, including local storage, to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Authenticate users</li>
            <li>Maintain sessions</li>
            <li>Store preferences</li>
            <li>Improve performance and reliability</li>
          </ul>
          <p>These technologies are used for functional and operational purposes.</p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">2. How We Use Information</h2>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide and operate the Service</li>
            <li>Maintain and secure accounts</li>
            <li>Enable collaboration features</li>
            <li>Deliver notifications</li>
            <li>Improve functionality, reliability, and performance</li>
            <li>Develop optional smart or automated features</li>
            <li>Respond to support inquiries</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p className="font-medium">We do not sell personal data to third parties.</p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">3. Data Sharing &amp; Third Parties</h2>
          <p>
            We may share information with trusted third-party service providers that help us operate
            the Service, such as hosting providers, authentication providers, analytics tools, storage
            providers, and infrastructure services.
          </p>
          <p>
            Certain optional smart features (such as itinerary suggestions) may involve processing trip
            context through third-party AI service providers. These providers process data on our behalf
            under contractual safeguards.
          </p>
          <p>We do not share personal data for third-party advertising purposes.</p>
          <p>
            We may disclose information if required by law or to protect the safety, rights, or integrity
            of the Service.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">4. Legal Bases for Processing (EEA/UK Users)</h2>
          <p>
            If you are located in the EEA or United Kingdom, we process personal data under one or more
            of the following legal bases:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Contractual Necessity:</strong> To provide the Service you request.</li>
            <li><strong>Legitimate Interests:</strong> To operate, secure, and improve the Service.</li>
            <li><strong>Consent:</strong> Where required, such as for optional features.</li>
            <li><strong>Legal Obligations:</strong> To comply with applicable laws.</li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">5. International Data Transfers</h2>
          <p>
            Tripti.ai is operated from the United States. If you access the Service from outside the United
            States, your information may be transferred to and processed in the United States or other
            countries.
          </p>
          <p>
            Where required by law, we implement appropriate safeguards for international transfers, which
            may include contractual protections with service providers.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">6. Data Retention &amp; Account Deletion</h2>
          <p>
            We retain account information and user content for as long as your account remains active.
          </p>
          <p>
            You can delete your account at any time from the account menu within the app, or by
            visiting{' '}
            <a href="/delete-account" className="text-brand-blue hover:underline">
              tripti.ai/delete-account
            </a>
            . When you delete your account:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your personal identifiers (name, email, profile) are removed immediately</li>
            <li>Your contributions to trips and circles are anonymized and attributed to &ldquo;Deleted member&rdquo;</li>
            <li>You will be logged out and unable to sign back in with the same email</li>
          </ul>
          <p>
            You may also contact{' '}
            <a href="mailto:privacy@tripti.ai" className="text-brand-blue hover:underline">
              privacy@tripti.ai
            </a>
            {' '}with any data deletion requests. We will respond within 30 days in accordance with
            applicable laws.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Restrict or object to certain processing</li>
            <li>Withdraw consent where processing is based on consent</li>
            <li>Request a copy of your data in a portable format</li>
            <li>Lodge a complaint with a supervisory authority</li>
          </ul>
          <p>
            To exercise these rights, contact{' '}
            <a href="mailto:privacy@tripti.ai" className="text-brand-blue hover:underline">
              privacy@tripti.ai
            </a>
            .
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">8. Security</h2>
          <p>
            We implement reasonable administrative, technical, and organizational safeguards designed to
            protect personal information. However, no system can be guaranteed to be completely secure.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">9. Children&apos;s Privacy</h2>
          <p>
            The Service is not intended for children under 13. We do not knowingly collect personal
            information from children under 13. If we become aware that we have done so, we will take
            appropriate steps to delete such information.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will
            update the &ldquo;Last updated&rdquo; date and provide notice where required by law.
          </p>
          <p>
            Continued use of the Service after updates indicates acceptance of the revised policy.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">11. Contact Information</h2>
          <p>
            If you have questions about this Privacy Policy or our data practices, contact:
          </p>
          <p>
            <a href="mailto:privacy@tripti.ai" className="text-brand-blue hover:underline">
              privacy@tripti.ai
            </a>
          </p>
          <p className="text-sm text-brand-carbon/60 mt-6">
            Tripti.ai is a product of Trypzy, Inc.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/settings/privacy" className="text-sm text-brand-blue hover:underline">
            Back to Privacy Settings
          </Link>
        </div>
      </main>
    </div>
  )
}
