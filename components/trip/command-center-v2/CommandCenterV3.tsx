'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

import type { OverlayType, OverlayParams } from './types'

// Shared components
import { OverlayContainer } from './OverlayContainer'
import { ProgressStrip } from './ProgressStrip'
import { ContextCTABar } from './ContextCTABar'

// Overlay components
import {
  SchedulingOverlay,
  ItineraryOverlay,
  AccommodationOverlay,
  TravelersOverlay,
  PrepOverlay,
  ExpensesOverlay,
  MemoriesOverlay,
  MemberProfileOverlay
} from './overlays'

// Chat component
import { ChatTab } from '@/components/trip/TripTabs/tabs/ChatTab'

// Error boundary
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Hooks
import { useTripChat } from '@/hooks/use-trip-chat'

// Helpers
import { computeProgressSteps } from '@/lib/trips/progress'
import { deriveTripPrimaryStage } from '@/lib/trips/stage'
import { computeTripProgressSnapshot, TripProgressSnapshot } from '@/lib/trips/progressSnapshot'

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

interface CommandCenterV3Props {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
}

type BlockerType = 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'PREP' | 'READY'

interface BlockerInfo {
  type: BlockerType
  stageKey: string | null
  overlayType: OverlayType
}

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

function deriveBlocker(trip: any, user: any, snap: TripProgressSnapshot): BlockerInfo {
  if (!trip) {
    return { type: 'DATES', stageKey: 'datesLocked', overlayType: 'scheduling' }
  }

  if (!snap.datesLocked) {
    return { type: 'DATES', stageKey: 'datesLocked', overlayType: 'scheduling' }
  }
  if (!snap.itineraryFinalized) {
    return { type: 'ITINERARY', stageKey: 'itineraryFinalized', overlayType: 'itinerary' }
  }
  if (!snap.accommodationChosen) {
    return { type: 'ACCOMMODATION', stageKey: 'accommodationChosen', overlayType: 'accommodation' }
  }
  if (!snap.prepStarted) {
    return { type: 'PREP', stageKey: 'prepStarted', overlayType: 'prep' }
  }
  return { type: 'READY', stageKey: null, overlayType: 'itinerary' }
}

function getOverlayTitle(overlayType: OverlayType): string {
  switch (overlayType) {
    case 'proposed':
      return 'Trip Proposal'
    case 'scheduling':
      return 'Scheduling'
    case 'itinerary':
      return 'Itinerary'
    case 'accommodation':
      return 'Accommodation'
    case 'travelers':
      return 'Travelers'
    case 'prep':
      return 'Trip Prep'
    case 'expenses':
      return 'Expenses'
    case 'memories':
      return 'Memories'
    case 'member':
      return 'Traveler Profile'
    default:
      return ''
  }
}

// ─────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────

export function CommandCenterV3({ trip, token, user, onRefresh }: CommandCenterV3Props) {
  // Overlay state
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
  const [overlayParams, setOverlayParams] = useState<OverlayParams>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripHeight, setStripHeight] = useState(0)

  // Measure ProgressStrip (+ cancelled banner) for overlay top offset
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const measure = () => setStripHeight(el.getBoundingClientRect().height)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [])

  // Chat hook
  const {
    messages,
    newMessage,
    setNewMessage,
    sendingMessage,
    sendMessage,
    loading: chatLoading
  } = useTripChat({
    tripId: trip?.id,
    token,
    enabled: !!trip?.id && !!token
  })

  // Nudge engine (fire-and-forget)
  const nudgesFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!trip?.id || !token) return
    if (process.env.NEXT_PUBLIC_NUDGES_ENABLED === 'false') return
    const fetchKey = `${trip.id}:${trip.status}`
    if (nudgesFetchedRef.current === fetchKey) return
    nudgesFetchedRef.current = fetchKey

    fetch(`/api/trips/${trip.id}/nudges`, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {})
  }, [trip?.id, trip?.status, token])

  // Derived state
  const progressSteps = useMemo(() => computeProgressSteps(trip), [trip])
  const currentStage = useMemo(() => deriveTripPrimaryStage(trip), [trip])

  const progressSnapshot = useMemo(() => {
    return computeTripProgressSnapshot(trip, user, {
      pickProgress: trip?.pickProgress
    })
  }, [trip, user])

  const blocker = useMemo(() => deriveBlocker(trip, user, progressSnapshot), [trip, user, progressSnapshot])

  // Travelers
  const travelers = useMemo(() => {
    const list = trip?.participantsWithStatus || trip?.travelers || []
    if (!list.length) return []
    return list
      .filter((p: any) => (p.status || 'active') === 'active')
      .map((p: any) => ({
        id: p.userId || p.user?.id || p.id,
        name: p.user?.name || p.name || 'Unknown',
        avatarUrl: p.user?.image || p.avatarUrl,
        status: p.status || 'active'
      }))
  }, [trip?.participantsWithStatus, trip?.travelers])

  // Participation meter for ProgressStrip
  const participationMeter = useMemo(() => {
    if (!trip) return null
    // During scheduling, show how many travelers have responded
    const pp = trip.pickProgress
    if (pp && pp.submitted !== undefined && pp.total !== undefined) {
      return { responded: pp.submitted, total: pp.total, label: 'responded' }
    }
    const vs = trip.votingStatus
    if (vs && vs.votedCount !== undefined && vs.totalTravelers !== undefined) {
      return { responded: vs.votedCount, total: vs.totalTravelers, label: 'voted' }
    }
    return null
  }, [trip])

  // Overlay callbacks
  const openOverlay = useCallback((type: OverlayType, params?: OverlayParams) => {
    if (type) {
      if (activeOverlay === type && !params?.memberId) {
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

  const handleStepClick = useCallback((overlayType: OverlayType) => {
    if (overlayType) openOverlay(overlayType)
  }, [openOverlay])

  const handleTravelerClick = useCallback((travelerId: string) => {
    openOverlay('member', { memberId: travelerId })
  }, [openOverlay])

  // Trip dates
  const startDate = trip?.lockedStartDate || trip?.startDate
  const endDate = trip?.lockedEndDate || trip?.endDate

  // Read-only
  const viewer = trip?.viewer || {}
  const isCancelled = trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || isCancelled

  // Check if any overlay is open
  const hasActiveOverlay = activeOverlay !== null

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Top section: Cancelled banner + ProgressStrip (measured for overlay offset) */}
      <div ref={stripRef} className="shrink-0 z-10">
        {isCancelled && (
          <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-2">
            <span className="text-gray-600 text-sm font-medium">This trip has been canceled</span>
            <span className="text-gray-500 text-xs">(read-only)</span>
            <Link
              href="/dashboard"
              className="ml-2 text-sm font-medium text-brand-blue hover:underline"
            >
              Back to dashboard
            </Link>
          </div>
        )}

        <ProgressStrip
          tripName={trip?.name || 'Untitled Trip'}
          startDate={startDate}
          endDate={endDate}
          lockedStartDate={trip?.lockedStartDate}
          lockedEndDate={trip?.lockedEndDate}
          progressSteps={progressSteps}
          blockerStageKey={blocker.stageKey}
          activeOverlay={activeOverlay}
          onStepClick={handleStepClick}
          participationMeter={participationMeter}
        />
      </div>

      {/* Main content area - chat + input + CTA bar */}
      {/* Uses min-h-0 for proper flex child scrolling, dvh for mobile keyboard handling */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Chat area with centered content and side whitespace */}
        <div className="flex-1 min-h-0 flex justify-center">
          <div className={cn(
            'w-full flex flex-col min-h-0',
            // Centered with max-width and responsive padding
            'max-w-3xl',
            'px-0 sm:px-4 md:px-8 lg:px-12'
          )}>
            <ChatTab
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              messages={messages}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              sendingMessage={sendingMessage}
              sendMessage={sendMessage}
              showTripChatHint={false}
              dismissTripChatHint={() => {}}
              stage={currentStage}
              setActiveTab={() => {}}
              isReadOnly={isReadOnly}
              mode="command-center"
              collapseSystemMessages={true}
            />
          </div>
        </div>

        {/* Bottom bar: CTA bar - sticky to viewport bottom for mobile keyboard handling */}
        {/* Uses pb-safe for iOS safe area */}
        <div className={cn(
          'shrink-0 sticky bottom-0 z-10',
          'pb-[env(safe-area-inset-bottom)]'
        )}>
          <ContextCTABar
            trip={trip}
            user={user}
            travelerCount={travelers.length}
            onOpenOverlay={openOverlay}
          />
        </div>
      </div>

      {/* Full-screen overlay (covers chat, input, and CTA bar - only Progress Strip visible) */}
      <OverlayContainer
        isOpen={hasActiveOverlay}
        onClose={closeOverlay}
        title={getOverlayTitle(activeOverlay)}
        hasUnsavedChanges={hasUnsavedChanges}
        topOffset={`${stripHeight}px`}
        bottomOffset="0px"
        rightOffset="0px"
        slideFrom="right"
        fullWidth={true}
      >
        <ErrorBoundary>
          {activeOverlay === 'scheduling' && (
            <SchedulingOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'itinerary' && (
            <ItineraryOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'accommodation' && (
            <AccommodationOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'prep' && (
            <PrepOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'travelers' && (
            <TravelersOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
              onMemberClick={(memberId: string) => openOverlay('member', { memberId })}
            />
          )}
          {activeOverlay === 'expenses' && (
            <ExpensesOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'memories' && (
            <MemoriesOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          {activeOverlay === 'member' && overlayParams.memberId && (
            <MemberProfileOverlay
              memberId={overlayParams.memberId}
              token={token}
              currentUserId={user?.id}
              onClose={closeOverlay}
            />
          )}
          {activeOverlay === 'proposed' && (
            <div className="p-4 text-center text-gray-500">
              Trip proposal details - view trip info and basic settings
            </div>
          )}
        </ErrorBoundary>
      </OverlayContainer>
    </div>
  )
}

export default CommandCenterV3
