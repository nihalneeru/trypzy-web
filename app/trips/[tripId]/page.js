'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { CommandCenterV2 } from '@/components/trip/command-center-v2'
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

function BrandedSpinner({ className = '', size = 'default' }) {
  const sizeClasses = { sm: 'h-4 w-4', default: 'h-5 w-5', md: 'h-6 w-6', lg: 'h-8 w-8' }
  const dimensions = { sm: 16, default: 20, md: 24, lg: 32 }
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <Image
        src="/brand/trypzy-icon.png"
        alt="Loading"
        width={dimensions[size]}
        height={dimensions[size]}
        className={`${sizeClasses[size]} animate-spin`}
        unoptimized
      />
    </div>
  )
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
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('trypzy_token') : null
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('trypzy_user') : null

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
        localStorage.removeItem('trypzy_token')
        localStorage.removeItem('trypzy_user')
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
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-brand-carbon/60">Loading trip...</p>
        </div>
      </div>
    )
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
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-2 -ml-2 rounded-lg hover:bg-gray-100 text-brand-carbon"
          aria-label="Back to dashboard"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <a href="/" className="flex items-center">
          <Image
            src="/brand/trypzy-logo.png"
            alt="Trypzy"
            width={80}
            height={24}
            className="h-6 w-auto"
            unoptimized
          />
        </a>
      </header>

      {/* CommandCenterV2 fills remaining space */}
      <div className="flex-1 min-h-0">
        <CommandCenterV2
          trip={trip}
          token={token}
          user={user}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  )
}
