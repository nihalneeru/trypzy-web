'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WelcomePage } from '@/components/marketing/WelcomePage'
import HomeClient from './HomeClient'

export default function WelcomePageWrapper() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [shouldRenderHomeClient, setShouldRenderHomeClient] = useState(false)

  // Check for legacy deep-link query params
  const tripId = searchParams.get('tripId')
  const circleId = searchParams.get('circleId')
  const view = searchParams.get('view')
  const hasDeepLinkParams = !!(tripId || circleId || view === 'discover')

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('trypzy_token')
    
    if (token) {
      // Authenticated: check if we have deep-link params
      if (hasDeepLinkParams) {
        // Has deep-link params: render HomeClient instead of redirecting
        setShouldRenderHomeClient(true)
        setLoading(false)
      } else {
        // No deep-link params: redirect to dashboard
        router.replace('/dashboard')
      }
    } else {
      // Not authenticated: show welcome page
      setShouldRenderHomeClient(false)
      setLoading(false)
    }
  }, [router, hasDeepLinkParams])

  // Show nothing while checking auth (prevents flash of welcome page for authenticated users)
  if (loading) {
    return null
  }

  // If authenticated with deep-link params, render HomeClient
  if (shouldRenderHomeClient) {
    return <HomeClient />
  }

  // Otherwise show welcome page
  return <WelcomePage />
}
