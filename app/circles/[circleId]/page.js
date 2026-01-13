'use client'

/**
 * Circle Detail Page Route
 * 
 * This route provides access to the Circle Detail view.
 * The original CircleDetailView component exists in app/page.js but uses client-side routing in the old Dashboard.
 * 
 * This route redirects to / with a circleId query parameter so the old Dashboard system can handle it.
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Compass } from 'lucide-react'

export default function CircleDetailRoute() {
  const params = useParams()
  const router = useRouter()
  const circleId = params?.circleId

  useEffect(() => {
    if (!circleId) return

    // Redirect to / with circleId query param so the old system can handle it
    // Use replace instead of push so back button returns to previous page (dashboard) instead of /circles/[circleId]
    router.replace(`/?circleId=${circleId}`)
  }, [circleId, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Compass className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading circle...</p>
      </div>
    </div>
  )
}
