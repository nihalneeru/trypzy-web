'use client'

import Link from 'next/link'
import { AppHeader } from '@/components/common/AppHeader'
import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function TermsOfUsePage() {
  const [userName, setUserName] = useState(null)

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('tripti_user')
      if (storedUser) setUserName(JSON.parse(storedUser).name)
    } catch {}
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader userName={userName} />
      <main id="main-content" className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-6 w-6 text-brand-blue" aria-hidden="true" />
          <h1 className="text-3xl font-bold text-brand-carbon">Terms of Use</h1>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8 prose prose-gray max-w-none">
          <p className="text-sm text-gray-500">Last updated: February 23, 2026</p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">About These Terms</h2>
          <p>
            Tripti.ai is a group travel coordination platform designed to help friend groups plan
            trips together with less friction and more clarity. These Terms of Use (&ldquo;Terms&rdquo;)
            explain the ground rules for using the Tripti.ai website, mobile applications, and related
            services (collectively, the &ldquo;Service&rdquo;), operated by Trypzy, Inc., a Delaware
            corporation (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;).
          </p>
          <p>
            By creating an account or using the Service, you agree to be bound by these Terms. If
            any of these terms don&apos;t work for you, you&apos;re welcome to close your account
            at any time.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">1. Eligibility</h2>
          <p>
            You must be at least 13 years old to use the Service. If you are under 18, you represent
            that your parent or legal guardian has reviewed and agreed to these Terms on your behalf.
            By using the Service, you represent and warrant that you meet these requirements.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">2. Account Registration</h2>
          <p>
            To use the Service, you must create an account using a supported authentication method,
            which may include third-party providers such as Google. You are responsible for:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Maintaining the security of your account credentials</li>
            <li>All activity that occurs under your account</li>
            <li>Notifying us promptly if you suspect unauthorized use of your account</li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">3. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Violate any applicable law or regulation</li>
            <li>Harass, threaten, or intimidate other users</li>
            <li>Post content that is defamatory, obscene, or promotes illegal activity</li>
            <li>Impersonate any person or entity</li>
            <li>Distribute spam, malware, or unauthorized advertising</li>
            <li>Attempt to gain unauthorized access to the Service or its systems</li>
            <li>Interfere with or disrupt the Service or its infrastructure</li>
            <li>Scrape, crawl, or collect data from the Service by automated means without our consent</li>
          </ul>
          <p>
            We may investigate and take action (including account suspension or termination)
            against users who violate this section. You can report content that you believe
            violates these Terms using the in-app reporting feature.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">4. User Content</h2>
          <p>
            &ldquo;User Content&rdquo; means any text, images, photos, messages, itineraries, lists,
            or other materials you create, upload, or share through the Service.
          </p>
          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Ownership</h3>
          <p>
            You retain ownership of the User Content you create. By submitting User Content to the
            Service, you grant Trypzy, Inc. a worldwide, non-exclusive, royalty-free license &mdash;
            and the right to sublicense only to our infrastructure and service providers operating
            on our behalf &mdash; to use, store, display, reproduce, modify, adapt, and distribute
            your User Content solely for the purpose of operating, improving, and providing the
            Service, including use in automated and AI-assisted features as described in these Terms.
          </p>
          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Responsibility</h3>
          <p>
            You are solely responsible for your User Content. We do not endorse or guarantee the
            accuracy of any User Content. We reserve the right to remove User Content that violates
            these Terms.
          </p>
          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Shared Content</h3>
          <p>
            Content shared within a trip or circle is visible to members of that group. Deleting
            a message or item removes it from the Service, but group members may have already
            seen it. Itineraries and trip posts that you or your trip leader mark
            as &ldquo;discoverable&rdquo; may be visible to other Tripti users outside your group
            through the Discover feature.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">5. Trips, Circles &amp; Group Coordination</h2>
          <p>
            The Service provides tools for group trip coordination, including scheduling, voting,
            itinerary planning, expense tracking, and chat. You understand and agree that:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Trip leaders have additional permissions within trips they create, including the ability to lock dates, generate itineraries, and manage participation</li>
            <li>Participation in a trip or circle does not create any legal obligation to travel or incur expenses</li>
            <li>Expense tracking tools within the Service are for informational coordination only. Trypzy, Inc. does not process payments or hold funds on your behalf</li>
            <li>The Company is not a party to any travel arrangements, accommodations, or financial agreements between users</li>
            <li>You are solely responsible for your own travel decisions, safety, and expenses</li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">6. AI-Generated Content</h2>
          <p>
            Certain features of the Service (such as itinerary suggestions and travel recommendations)
            use artificial intelligence to generate content. You acknowledge that:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>AI-generated content is provided for informational and inspirational purposes only</li>
            <li>AI-generated content may contain inaccuracies and should not be relied upon as professional travel advice</li>
            <li>You are responsible for independently verifying any information before making travel decisions</li>
            <li>The Company is not liable for any actions taken based on AI-generated content</li>
            <li>We do not use your User Content to train AI models. Trip content shared with third-party AI services is used solely to generate your requested content and is subject to those providers&apos; data handling policies</li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">7. Intellectual Property</h2>
          <p>
            The Service, including its design, features, code, branding, and documentation, is owned
            by Trypzy, Inc. and protected by copyright, trademark, and other intellectual property
            laws. You may not copy, modify, distribute, sell, or lease any part of the Service
            without our prior written consent.
          </p>
          <p>
            &ldquo;Tripti,&rdquo; &ldquo;Tripti.ai,&rdquo; the Tripti logo, and &ldquo;Nifty plans.
            Happy circles.&rdquo; are trademarks of Trypzy, Inc. You may not use these marks without
            our prior written permission.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">8. Third-Party Services</h2>
          <p>
            The Service may integrate with or link to third-party services (such as authentication
            providers, cloud storage services, and push notification infrastructure). Your use of
            third-party services is governed by their respective terms and privacy policies. We are
            not responsible for the content, accuracy, or practices of any third-party service. By
            enabling push notifications, you authorize the use of device push tokens to deliver
            notifications to you.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">9. Copyright Infringement (DMCA)</h2>
          <p>
            If you believe that content on the Service infringes your copyright, you may submit a
            notice to our designated copyright agent:
          </p>
          <p>
            DMCA Agent: Legal Department<br />
            Trypzy, Inc.<br />
            1007 N Orange St. 4th Floor, Suite #1382, Wilmington, DE 19801<br />
            <a href="mailto:legal@tripti.ai" className="text-brand-blue hover:underline">
              legal@tripti.ai
            </a>
          </p>
          <p>Your notice must include:</p>
          <ol className="list-decimal pl-6 space-y-1">
            <li>Identification of the copyrighted work claimed to be infringed</li>
            <li>Identification of the allegedly infringing material and its location on the Service</li>
            <li>Your contact information</li>
            <li>A statement that you have a good-faith belief the use is not authorized</li>
            <li>A statement under penalty of perjury that the information is accurate and you are the copyright owner or authorized to act on their behalf</li>
            <li>Your physical or electronic signature</li>
          </ol>
          <p>
            We will respond to valid notices in accordance with applicable law and may remove or
            disable access to infringing content. Repeat infringers may have their accounts
            terminated.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">10. Account Termination</h2>
          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Voluntary Deletion</h3>
          <p>
            You may delete your account at any time from the account menu within the app or by
            visiting{' '}
            <Link href="/delete-account" className="text-brand-blue hover:underline">
              tripti.ai/delete-account
            </Link>
            . Upon deletion:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your personal identifiers (name, email, profile) are removed</li>
            <li>Your contributions to trips and circles are anonymized and attributed to &ldquo;Deleted member&rdquo;</li>
            <li>We may retain certain records as required by law, including safety-related logs and information needed to enforce these Terms against prior violations. Any such retained records will be deleted within 24 months after account deletion unless a longer period is required by law</li>
          </ul>
          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Suspension or Termination by Us</h3>
          <p>
            For violations involving illegal activity, harassment, or security threats, we may
            suspend or terminate your account immediately. For other violations, we will attempt
            to provide notice and an opportunity to address the issue within 10 days before taking
            action. If your account is suspended, you may contact{' '}
            <a href="mailto:legal@tripti.ai" className="text-brand-blue hover:underline">
              legal@tripti.ai
            </a>
            {' '}to dispute the suspension. We will respond within 5 business days.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">11. Disclaimers</h2>
          <p className="font-semibold">
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
            warranties of any kind, either express or implied, including but not limited to
            implied warranties of merchantability, fitness for a particular purpose, and
            non-infringement.
          </p>
          <p>
            We do not warrant that the Service will be uninterrupted, error-free, or secure.
            We do not warrant the accuracy or completeness of any information provided through
            the Service, including AI-generated content, user-submitted content, or travel
            information.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">12. Limitation of Liability</h2>
          <p className="font-semibold">
            To the maximum extent permitted by applicable law, Trypzy, Inc. and its officers,
            directors, employees, and agents shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or any loss of profits, data, use, or
            goodwill, arising out of or in connection with your use of the Service, whether based
            on warranty, contract, tort (including negligence), or any other legal theory, even if
            we have been advised of the possibility of such damages.
          </p>
          <p className="font-semibold">
            Our total aggregate liability for all claims arising out of or relating to these
            Terms or the Service shall not exceed the greater of (a) the amounts you have paid
            to us in the twelve (12) months preceding the claim, or (b) one hundred U.S. dollars
            ($100.00).
          </p>
          <p>
            Nothing in this section limits our liability for our own gross negligence, fraud,
            or intentional misconduct.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">13. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless (meaning you agree to cover our
            legal costs and damages) Trypzy, Inc. and its officers, directors, employees, and
            agents from any claims, damages, losses, liabilities, and expenses (including
            reasonable attorneys&apos; fees) arising out of or related to:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Your User Content</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any rights of another person or entity</li>
          </ul>
          <p>
            This indemnification obligation applies only to claims arising from your own intentional
            misconduct, gross negligence, or willful violation of these Terms. To the extent that
            applicable law limits the enforceability of indemnification obligations (including for
            users under 18), the foregoing shall be enforceable only to the extent permitted by law.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">14. Dispute Resolution</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, without regard to
            its conflict of law principles.
          </p>
          <p>
            Any dispute arising out of or relating to these Terms or the Service shall first be
            attempted to be resolved through good-faith informal negotiation. If the dispute
            cannot be resolved informally within thirty (30) days, either party may initiate
            binding arbitration under the Consumer Arbitration Rules of the American Arbitration
            Association. Arbitration shall be conducted remotely (by video or telephone) unless
            the parties mutually agree otherwise. For consumer claims, the Company will pay all
            AAA filing fees and arbitrator fees. Each party is responsible for its own
            attorneys&apos; fees unless the arbitrator determines otherwise.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Class Action Waiver</h3>
          <p className="font-semibold">
            You agree that any dispute resolution proceedings will be conducted on an individual
            basis and not as a class action, class arbitration, or other representative proceeding.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Small Claims &amp; Opt-Out</h3>
          <p>
            Notwithstanding the above, either party may bring an individual claim in a small
            claims court of competent jurisdiction. You may opt out of binding arbitration within
            30 days of first creating your account by sending a written notice
            to{' '}
            <a href="mailto:legal@tripti.ai" className="text-brand-blue hover:underline">
              legal@tripti.ai
            </a>
            {' '}with the subject line &ldquo;Arbitration Opt-Out.&rdquo; If you opt out, disputes
            will be resolved in the state and federal courts located in New Castle County, Delaware.
          </p>

          <h3 className="text-lg font-semibold text-brand-carbon mt-6 mb-2">Fallback Venue</h3>
          <p>
            For disputes that are not subject to arbitration under these Terms (including claims
            for injunctive relief or intellectual property disputes), you and the Company consent
            to exclusive jurisdiction and venue in the state and federal courts located in New
            Castle County, Delaware.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">15. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. For material changes, we will provide at
            least 14 days&apos; notice via email or prominent in-app notification before the
            changes take effect. For material changes to arbitration terms or liability limitations,
            we will provide at least 30 days&apos; advance notice.
          </p>
          <p>
            Your continued use of the Service after the effective date constitutes acceptance
            of the revised Terms. If the revised Terms don&apos;t work for you, you&apos;re
            welcome to close your account at any time from Settings.
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">16. Miscellaneous</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Entire Agreement:</strong> These Terms, together with our{' '}
              <Link href="/privacy" className="text-brand-blue hover:underline">
                Privacy Policy
              </Link>
              , constitute the entire agreement between you and the Company regarding the Service.
            </li>
            <li>
              <strong>Severability:</strong> If any provision of these Terms is found to be
              unenforceable, the remaining provisions will continue in full force and effect.
            </li>
            <li>
              <strong>Waiver:</strong> Our failure to enforce any provision of these Terms does
              not constitute a waiver of that provision.
            </li>
            <li>
              <strong>Assignment:</strong> You may not assign your rights under these Terms
              without our consent. We may assign our rights without restriction.
            </li>
            <li>
              <strong>Electronic Communications:</strong> By creating an account, you consent to
              receive communications from us electronically, including by email and in-app
              notifications. You agree that all notices, agreements, and disclosures we provide
              electronically satisfy any legal requirements that such communications be in writing,
              to the extent permitted by applicable law.
            </li>
            <li>
              <strong>Force Majeure:</strong> We will not be liable for any failure or delay in
              performance resulting from causes beyond our reasonable control, including but not
              limited to natural disasters, third-party service outages, government orders, or
              internet infrastructure failures.
            </li>
            <li>
              <strong>Survival:</strong> Sections 4 (User Content), 7 (Intellectual Property),
              9 (Copyright Infringement), 12 (Limitation of Liability), 13 (Indemnification),
              14 (Dispute Resolution), and 16 (Miscellaneous) shall survive any termination or
              expiration of these Terms.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">17. Mobile App Store Terms</h2>
          <p>
            If you download or access the Service through the Apple App Store or Google Play Store,
            the following additional terms apply:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>These Terms are between you and Trypzy, Inc., not Apple Inc. or Google LLC. Apple and Google are not responsible for the Service or its content.</li>
            <li>Apple and Google have no obligation to provide maintenance, support, or warranty services for the Service.</li>
            <li>In the event of any failure of the Service to conform to any applicable warranty, you may notify Apple, and Apple will refund the purchase price (if any). To the maximum extent permitted by law, Apple and Google have no other warranty obligation with respect to the Service.</li>
            <li>Apple and Google are not responsible for addressing any claims by you or any third party relating to the Service, including product liability claims, consumer protection claims, or intellectual property claims.</li>
            <li>In the event of any third-party claim that the Service infringes a third party&apos;s intellectual property rights, Trypzy, Inc. (not Apple or Google) will be solely responsible for investigation, defense, and resolution.</li>
            <li>You represent that you are not located in a country subject to a U.S. government embargo or designated as a &ldquo;terrorist supporting&rdquo; country, and you are not listed on any U.S. government prohibited or restricted parties list.</li>
            <li>Apple and its subsidiaries are third-party beneficiaries of these Terms and, upon your acceptance, will have the right to enforce these Terms against you.</li>
          </ul>
          <p>
            You must also comply with all applicable third-party terms of service when using the Service
            (for example, your wireless data provider&apos;s terms).
          </p>

          <h2 className="text-xl font-semibold text-brand-carbon mt-8 mb-3">18. Contact Information</h2>
          <p>
            If you have questions about these Terms, contact:
          </p>
          <p>
            Trypzy, Inc.<br />
            1007 N Orange St. 4th Floor, Suite #1382, Wilmington, DE 19801<br />
            <a href="mailto:legal@tripti.ai" className="text-brand-blue hover:underline">
              legal@tripti.ai
            </a>
          </p>
          <p className="text-sm text-gray-500 mt-6">
            Tripti.ai is a product of Trypzy, Inc.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/privacy" className="text-sm text-brand-blue hover:underline">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  )
}
