'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/common/AppHeader'
import { Shield } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function PrivacyPolicyPage() {
  const [userName, setUserName] = useState(null)

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('trypzy_user')
      if (storedUser) setUserName(JSON.parse(storedUser).name)
    } catch {}
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userName={userName} />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-6 w-6 text-brand-blue" />
          <h1 className="text-3xl font-bold text-brand-carbon">Privacy Policy</h1>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 prose prose-gray max-w-none">
          <p className="text-sm text-gray-500">Last updated: February 9, 2026</p>

          <p>
            Trypzy (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the Trypzy application
            and website (including beta.trypzy.com). This Privacy Policy explains what information we collect,
            how we use it, and your rights.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">Our Privacy Philosophy</h2>
          <p>
            Trypzy is built for trusted circles, not public audiences.
          </p>
          <p>
            We believe planning trips works best in private spaces with people you know — without turning
            personal plans into public content.
          </p>
          <p>
            Trips, conversations, and decisions are private by default and shared only with the people you
            invite. Any smart or automated features are designed to support coordination within your group,
            not to work against your expectations.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">1. Information We Collect</h2>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Account Information</h3>
          <p>
            When you sign in using supported authentication providers, we receive basic account information
            such as your name and email address. This information is used to create and manage your Trypzy
            account and to display your identity to members of your circles and trips.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Collaboration Content</h3>
          <p>
            We collect the content you create or contribute within Trypzy, including:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Trip names, dates, destinations, and preferences</li>
            <li>Itinerary ideas, votes, and coordination inputs</li>
            <li>Chat messages, expenses, and packing lists</li>
          </ul>
          <p>This content is visible only to members of the relevant circle or trip.</p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Photos</h3>
          <p>
            Images you upload as trip memories are stored in cloud storage and are visible only to members
            of the associated trip.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Usage &amp; Event Data</h3>
          <p>
            We collect limited usage and event data (such as trips created or dates locked) to understand
            how groups coordinate and to improve the product. This data is analyzed in aggregate for internal
            purposes and is not combined with third-party data sources for profiling.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">2. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide, operate, and maintain the Trypzy service</li>
            <li>Enable coordination within trusted circles and trips</li>
            <li>Improve product reliability, performance, and usability</li>
            <li>Generate optional smart or AI-assisted features related to trip planning</li>
            <li>Send system-generated messages related to trip progress and coordination</li>
          </ul>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">AI-Assisted Features</h3>
          <p>
            Some optional features may use third-party processing services to generate suggestions
            (for example, itinerary or planning assistance). Only the minimum necessary trip context is
            shared for these features, and personal identifiers are not intentionally included.
          </p>
          <p>
            We do not submit private messages or photos to third-party AI services unless explicitly
            stated for a specific feature. Third-party service providers process data only to provide
            requested features and do not receive data for independent advertising or tracking purposes.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">3. Legal Bases for Processing (GDPR)</h2>
          <p>
            If you are located in the European Economic Area (EEA), the United Kingdom, or similar
            jurisdictions, we process personal data under the following legal bases:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Contractual necessity</strong> — to provide the Trypzy service</li>
            <li><strong>Legitimate interests</strong> — to improve reliability, security, and coordination features</li>
            <li><strong>Consent</strong> — where required for specific optional features</li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">4. Data Sharing</h2>
          <p>Your information is shared only in the following ways:</p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Within Trypzy</h3>
          <p>
            With members of your circles and trips, based on participation and privacy context.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Service Providers</h3>
          <p>
            We use trusted third-party service providers to operate and maintain Trypzy (such as
            authentication, hosting, storage, error monitoring, and optional smart features). These
            providers process data only on our behalf and under appropriate safeguards.
          </p>
          <p className="font-medium">We do not sell your personal data.</p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">5. Data Retention</h2>
          <p>
            Your account information and trip content are retained while your account is active.
          </p>
          <p>
            If you leave a trip or circle, your active participation ends, but content you previously
            contributed may remain visible to other participants as part of the trip&apos;s history.
          </p>
          <p>
            You may request deletion of your account and associated data by contacting{' '}
            <a href="mailto:privacy@trypzy.com" className="text-brand-blue hover:underline">
              privacy@trypzy.com
            </a>
            . Some limited information may be retained only as long as reasonably necessary for security,
            legal, or operational purposes.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">6. Your Rights</h2>
          <p>Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access your personal data</li>
            <li>Correct inaccurate or incomplete data</li>
            <li>Request deletion of your data</li>
            <li>Restrict or object to certain processing</li>
            <li>Request a copy of your data in a portable format</li>
          </ul>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">California Residents (CCPA)</h3>
          <p>
            California residents have the right to request information about the categories of personal
            data collected and to request deletion of personal data, subject to permitted exceptions.
          </p>
          <p>
            To exercise any rights, contact{' '}
            <a href="mailto:privacy@trypzy.com" className="text-brand-blue hover:underline">
              privacy@trypzy.com
            </a>
            .
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">7. Security</h2>
          <p>
            We use reasonable technical and organizational measures to protect personal data, including
            secure authentication, encrypted connections, and access controls around private trip data.
            No system is completely secure, and we cannot guarantee absolute security.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">8. Children&apos;s Privacy</h2>
          <p>
            Trypzy is not intended for children under the age of 13. We do not knowingly collect personal
            data from children. If we learn that we have collected personal information from a child
            under 13, we will take steps to delete it.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">9. International Data Transfers</h2>
          <p>
            Trypzy may process and store information in countries outside your country of residence.
            Where required, we use appropriate safeguards to protect personal data in accordance with
            applicable laws.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. If changes are material, we will notify
            users through the app or other appropriate means.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">11. Contact Us</h2>
          <p>
            For privacy questions or data requests, contact us at:
          </p>
          <p>
            <a href="mailto:privacy@trypzy.com" className="text-brand-blue hover:underline">
              privacy@trypzy.com
            </a>
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/settings/privacy" className="text-sm text-brand-blue hover:underline">
            Back to Privacy Settings
          </Link>
        </div>
      </div>
    </div>
  )
}
