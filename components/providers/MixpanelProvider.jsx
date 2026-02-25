'use client'

import { useEffect } from 'react'
import mixpanel from 'mixpanel-browser'

export function MixpanelProvider() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN
    if (!token) return

    mixpanel.init(token, {
      autocapture: false,
      record_sessions_percent: 0,
      track_pageview: 'url-with-path',
    })
  }, [])

  return null
}
