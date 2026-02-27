'use client'

import { useEffect } from 'react'
import mixpanel from 'mixpanel-browser'
import { identifyUser } from '@/lib/analytics/track'

export function MixpanelProvider() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
    if (!token) return

    mixpanel.init(token, {
      autocapture: false,
      record_sessions_percent: 0,
      track_pageview: 'url-with-path',
    })

    // Auto-identify returning users from localStorage
    try {
      const stored = localStorage.getItem('tripti_user')
      if (stored) {
        const user = JSON.parse(stored)
        if (user?.id) {
          identifyUser(user.id, { email: user.email, name: user.name })
        }
      }
    } catch {}
  }, [])

  return null
}
