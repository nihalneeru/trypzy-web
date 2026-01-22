'use client'

import { useState, useEffect, useCallback } from 'react'

interface BlockerInfo {
  type: 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'READY'
  confidence: number
  reasoning?: string
  recommendedAction?: string
  usedLLM: boolean
  cta?: string
}

interface NudgeInfo {
  type: 'waiting' | 'ready' | 'action' | 'complete'
  message: string
}

interface TripIntelligence {
  blocker: BlockerInfo | null
  nudge: NudgeInfo | null
  heuristicBlocker: BlockerInfo | null
  llmBlocker: BlockerInfo | null
}

interface UseTripIntelligenceOptions {
  tripId: string | null
  token: string
  enabled?: boolean
  refreshInterval?: number // ms, 0 = no auto-refresh
}

/**
 * Hook to fetch trip intelligence (LLM-powered blocker detection, nudges)
 * Phase 6 - Uses /api/trips/:id/intelligence endpoint
 */
export function useTripIntelligence({
  tripId,
  token,
  enabled = true,
  refreshInterval = 0 // Default: no auto-refresh (fetch once on mount/tripId change)
}: UseTripIntelligenceOptions) {
  const [intelligence, setIntelligence] = useState<TripIntelligence | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchIntelligence = useCallback(async () => {
    if (!tripId || !token || !enabled) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/trips/${tripId}/intelligence`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to fetch intelligence')
      }

      const data = await response.json()
      setIntelligence(data)
    } catch (err) {
      console.error('Error fetching trip intelligence:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [tripId, token, enabled])

  // Fetch on mount and when tripId changes
  useEffect(() => {
    fetchIntelligence()
  }, [fetchIntelligence])

  // Optional auto-refresh
  useEffect(() => {
    if (!refreshInterval || refreshInterval <= 0 || !enabled) return

    const interval = setInterval(fetchIntelligence, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchIntelligence, enabled])

  return {
    intelligence,
    blocker: intelligence?.blocker || null,
    nudge: intelligence?.nudge || null,
    llmBlocker: intelligence?.llmBlocker || null,
    heuristicBlocker: intelligence?.heuristicBlocker || null,
    loading,
    error,
    refresh: fetchIntelligence
  }
}

/**
 * Hook to fetch consensus summary
 */
export function useTripConsensus({
  tripId,
  token,
  enabled = true
}: Omit<UseTripIntelligenceOptions, 'refreshInterval'>) {
  const [consensus, setConsensus] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchConsensus = useCallback(async () => {
    if (!tripId || !token || !enabled) return

    setLoading(true)

    try {
      const response = await fetch(`/api/trips/${tripId}/consensus`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setConsensus(data.consensus)
      }
    } catch (err) {
      console.error('Error fetching consensus:', err)
    } finally {
      setLoading(false)
    }
  }, [tripId, token, enabled])

  useEffect(() => {
    fetchConsensus()
  }, [fetchConsensus])

  return { consensus, loading, refresh: fetchConsensus }
}

/**
 * Hook to fetch accommodation preferences
 */
export function useAccommodationPreferences({
  tripId,
  token,
  enabled = true
}: Omit<UseTripIntelligenceOptions, 'refreshInterval'>) {
  const [preferences, setPreferences] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchPreferences = useCallback(async () => {
    if (!tripId || !token || !enabled) return

    setLoading(true)

    try {
      const response = await fetch(`/api/trips/${tripId}/accommodation-preferences`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setPreferences(data.preferences)
      }
    } catch (err) {
      console.error('Error fetching accommodation preferences:', err)
    } finally {
      setLoading(false)
    }
  }, [tripId, token, enabled])

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  return { preferences, loading, refresh: fetchPreferences }
}
