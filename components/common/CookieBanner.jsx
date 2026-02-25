'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Cookie consent banner — only shows for EU/EEA visitors.
 *
 * - Vercel Analytics: cookieless, no consent needed
 * - Mixpanel: uses localStorage, needs consent under GDPR
 *
 * Accept -> Mixpanel tracks normally
 * Decline -> Mixpanel opt-out (stops tracking)
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Only show if: EU user (geo cookie set by middleware) AND no consent decision yet
    const isEU = document.cookie.includes('tripti_geo_eu=1')
    const hasConsent = document.cookie.includes('tripti_cookie_consent=')

    if (isEU && !hasConsent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const setConsent = (accepted) => {
    // Set cookie for 1 year
    const maxAge = 60 * 60 * 24 * 365
    document.cookie = `tripti_cookie_consent=${accepted ? 'accepted' : 'declined'}; path=/; max-age=${maxAge}; SameSite=Lax`

    if (!accepted) {
      // Opt out of Mixpanel tracking
      try {
        const mixpanel = require('mixpanel-browser')
        if (mixpanel.__loaded) {
          mixpanel.opt_out_tracking()
        }
      } catch {
        // Mixpanel not loaded — nothing to opt out of
      }
    }

    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-bottom">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <p className="text-sm text-brand-carbon mb-3">
          We use cookies to understand how you use Tripti and improve your experience.
          You can decline without affecting functionality.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setConsent(true)}
            className="flex-1 bg-brand-blue hover:bg-brand-blue/90 text-white text-sm"
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConsent(false)}
            className="flex-1 text-sm"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  )
}
