'use client'

/**
 * Trip Detail Page Route
 * 
 * This route provides access to the full trip experience (chat, schedule, itinerary with LLM, etc.)
 * The original TripDetailView component exists in app/page.js but uses client-side routing in the old Dashboard.
 * 
 * This route redirects to / with a tripId query parameter so the old Dashboard system can handle it.
 * The old Dashboard in app/page.js checks for the tripId query param and automatically loads the trip.
 */

import { useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { BrandedSpinner } from '@/app/HomeClient'

export default function TripDetailRoute() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const tripId = params?.tripId

  // Dev-only navigation tracing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] trip page mounted', { pathname, tripId })
    }
  }, [pathname, tripId])

  useEffect(() => {
    if (!tripId) return

    // Auth gate: redirect to login if not authenticated
    const tokenValue = typeof window !== 'undefined' ? localStorage.getItem('trypzy_token') : null
    if (!tokenValue) {
      router.replace('/')
      return
    }

    // Get query params from URL to preserve returnTo and circleId
    const searchParams = new URLSearchParams(window.location.search)
    const returnTo = searchParams.get('returnTo')
    const circleId = searchParams.get('circleId')
    
    // Build query string with tripId and preserve other params
    const queryParams = new URLSearchParams()
    queryParams.set('tripId', tripId)
    if (returnTo) queryParams.set('returnTo', returnTo)
    if (circleId) queryParams.set('circleId', circleId)

    // Redirect to / with tripId query param so the old system can handle it
    // Use replace instead of push so back button returns to previous page (dashboard) instead of /trips/[tripId]
    router.replace(`/?${queryParams.toString()}`)
  }, [tripId, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <BrandedSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600">Loading trip...</p>
      </div>
    </div>
  )
}
