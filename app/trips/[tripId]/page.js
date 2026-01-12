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
import { useParams, useRouter } from 'next/navigation'
import { Compass } from 'lucide-react'

export default function TripDetailRoute() {
  const params = useParams()
  const router = useRouter()
  const tripId = params?.tripId

  useEffect(() => {
    if (!tripId) return

    // Redirect to / with tripId query param so the old system can handle it
    router.push(`/?tripId=${tripId}`)
  }, [tripId, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Compass className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading trip...</p>
      </div>
    </div>
  )
}
