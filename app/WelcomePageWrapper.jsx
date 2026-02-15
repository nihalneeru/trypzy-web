'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WelcomePage } from '@/components/marketing/WelcomePage'

export default function WelcomePageWrapper() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('tripti_token')

    if (token) {
      // Redirect legacy deep-link URLs to new standalone routes
      const tripId = searchParams.get('tripId')
      const circleId = searchParams.get('circleId')
      const view = searchParams.get('view')

      if (tripId) {
        router.replace(`/trips/${encodeURIComponent(tripId)}`)
      } else if (circleId) {
        router.replace(`/circles/${encodeURIComponent(circleId)}`)
      } else if (view === 'discover') {
        router.replace('/discover')
      } else {
        router.replace('/dashboard')
      }
    } else {
      setLoading(false)
    }
  }, [router, searchParams])

  if (loading) return null

  return <WelcomePage />
}
