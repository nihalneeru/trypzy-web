'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CommandCenterV3 } from '@/components/trip/command-center-v2'
import { AppHeader } from '@/components/common/AppHeader'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { TripDetailSkeleton } from '@/components/trip/TripDetailSkeleton'
import { deriveTripPrimaryStage, getPrimaryTabForStage, computeProgressFlags } from '@/lib/trips/stage'

/**
 * Enrich a raw trip object with computed stage fields.
 */
function enrichTrip(trip) {
  const stage = deriveTripPrimaryStage(trip)
  trip._computedStage = stage
  trip._primaryTab = getPrimaryTabForStage(stage)
  trip._progressFlags = computeProgressFlags(trip)
  return trip
}

export default function TripDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tripId = params?.tripId

  const [trip, setTrip] = useState(null)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const tripRef = useRef(null)

  // Keep ref in sync with state
  useEffect(() => {
    tripRef.current = trip
  }, [trip])

  // Auth check + initial fetch
  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('tripti_user') : null

    if (!storedToken || !storedUser) {
      router.replace('/')
      return
    }

    let parsed
    try {
      parsed = JSON.parse(storedUser)
    } catch {
      router.replace('/')
      return
    }

    setToken(storedToken)
    setUser(parsed)
  }, [router])

  const fetchTrip = useCallback(async () => {
    if (!token || !tripId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.status === 401) {
        localStorage.removeItem('tripti_token')
        localStorage.removeItem('tripti_user')
        router.replace('/')
        return
      }

      if (res.status === 404) {
        setError('Trip not found')
        setLoading(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to load trip')
        setLoading(false)
        return
      }

      const data = await res.json()
      setTrip(enrichTrip(data))
      setLoading(false)
    } catch (err) {
      setError('Network error. Please check your connection.')
      setLoading(false)
    }
  }, [token, tripId, router])

  // Fetch trip once auth is ready
  useEffect(() => {
    if (token && tripId) {
      fetchTrip()
    }
  }, [token, tripId, fetchTrip])

  const handleRefresh = useCallback((updatedTrip) => {
    if (updatedTrip) {
      const current = tripRef.current
      const merged = {
        ...current,
        ...updatedTrip,
        circle: current.circle || updatedTrip.circle,
        participantsWithStatus: current.participantsWithStatus || updatedTrip.participantsWithStatus,
        viewer: current.viewer || updatedTrip.viewer,
      }
      setTrip(enrichTrip(merged))
    } else {
      fetchTrip()
    }
  }, [fetchTrip])

  // Loading state
  if (loading || !trip) {
    return <TripDetailSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-sm px-4">
          <p className="text-brand-carbon text-lg font-medium mb-2">{error}</p>
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-brand-blue hover:underline"
            >
              Back to Dashboard
            </button>
            {error !== 'Trip not found' && (
              <button
                onClick={fetchTrip}
                className="px-4 py-2 text-sm font-medium bg-brand-red text-white rounded-lg hover:opacity-90"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      <AppHeader userName={user?.name} />

      {/* Command Center V3 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CommandCenterV3
          trip={trip}
          token={token}
          user={user}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  )
}
