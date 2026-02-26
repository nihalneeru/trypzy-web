import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { OverlayType, OverlayParams } from '../types'

interface UseOverlayStateReturn {
  activeOverlay: OverlayType
  overlayParams: OverlayParams
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (has: boolean) => void
  openOverlay: (type: OverlayType, params?: OverlayParams) => void
  closeOverlay: () => void
}

export function useOverlayState(): UseOverlayStateReturn {
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
  const [overlayParams, setOverlayParams] = useState<OverlayParams>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Deep link: open overlay from ?overlay= URL param (push notification tap)
  const searchParams = useSearchParams()
  const deepLinkHandledRef = useRef(false)
  useEffect(() => {
    if (deepLinkHandledRef.current) return
    const overlayParam = searchParams?.get('overlay')
    if (!overlayParam) return
    const VALID_OVERLAYS: OverlayType[] = [
      'proposed', 'scheduling', 'itinerary', 'accommodation',
      'travelers', 'prep', 'expenses', 'memories', 'brief'
    ]
    if (VALID_OVERLAYS.includes(overlayParam as OverlayType)) {
      deepLinkHandledRef.current = true
      setActiveOverlay(overlayParam as OverlayType)
      // Clean URL without triggering navigation
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  const openOverlay = useCallback((type: OverlayType, params?: OverlayParams) => {
    if (type) {
      if (activeOverlay === type && !params?.memberId) {
        // Toggle off if clicking the same overlay (unless member overlay with different member)
        setActiveOverlay(null)
        setOverlayParams({})
        setHasUnsavedChanges(false)
      } else {
        setActiveOverlay(type)
        setOverlayParams(params || {})
      }
    }
  }, [activeOverlay])

  const closeOverlay = useCallback(() => {
    setActiveOverlay(null)
    setOverlayParams({})
    setHasUnsavedChanges(false)
  }, [])

  return {
    activeOverlay,
    overlayParams,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    openOverlay,
    closeOverlay
  }
}
