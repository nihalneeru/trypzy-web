'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

import type { OverlayType, OverlayParams } from './types'

// Shared components
import { OverlayContainer } from './OverlayContainer'
import { ProgressStrip } from './ProgressStrip'
import { ContextCTABar } from './ContextCTABar'

// Lazy-loaded overlay components (code-split per overlay)
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

const overlayLoadingFallback = <div className="flex items-center justify-center py-12"><BrandedSpinner size="lg" /></div>

const SchedulingOverlay = dynamic(
  () => import('./overlays/SchedulingOverlay').then(m => ({ default: m.SchedulingOverlay })),
  { loading: () => overlayLoadingFallback }
)
const ItineraryOverlay = dynamic(
  () => import('./overlays/ItineraryOverlay').then(m => ({ default: m.ItineraryOverlay })),
  { loading: () => overlayLoadingFallback }
)
const AccommodationOverlay = dynamic(
  () => import('./overlays/AccommodationOverlay').then(m => ({ default: m.AccommodationOverlay })),
  { loading: () => overlayLoadingFallback }
)
const TravelersOverlay = dynamic(
  () => import('./overlays/TravelersOverlay').then(m => ({ default: m.TravelersOverlay })),
  { loading: () => overlayLoadingFallback }
)
const PrepOverlay = dynamic(
  () => import('./overlays/PrepOverlay').then(m => ({ default: m.PrepOverlay })),
  { loading: () => overlayLoadingFallback }
)
const ExpensesOverlay = dynamic(
  () => import('./overlays/ExpensesOverlay').then(m => ({ default: m.ExpensesOverlay })),
  { loading: () => overlayLoadingFallback }
)
const MemoriesOverlay = dynamic(
  () => import('./overlays/MemoriesOverlay').then(m => ({ default: m.MemoriesOverlay })),
  { loading: () => overlayLoadingFallback }
)
const MemberProfileOverlay = dynamic(
  () => import('./overlays/MemberProfileOverlay').then(m => ({ default: m.MemberProfileOverlay })),
  { loading: () => overlayLoadingFallback }
)
const TripInfoOverlay = dynamic(
  () => import('./overlays/TripInfoOverlay').then(m => ({ default: m.TripInfoOverlay })),
  { loading: () => overlayLoadingFallback }
)
const BriefOverlay = dynamic(
  () => import('./overlays/BriefOverlay').then(m => ({ default: m.BriefOverlay })),
  { loading: () => overlayLoadingFallback }
)

// Status cards (pinned above chat)
import { SchedulingStatusCard } from './SchedulingStatusCard'
import { ItineraryStatusCard } from './ItineraryStatusCard'
import { TripStatusCard } from '@/components/trip/TripStatusCard'

// Status summary
import { computeTripStatusSummary } from '@/lib/trips/computeTripStatusSummary'

// Chat component
import { ChatTab } from '@/components/trip/TripTabs/tabs/ChatTab'

// Error boundary
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Onboarding & nudge
import { OnboardingTooltips } from '@/components/trip/OnboardingTooltips'
import { NudgeCard } from '@/components/trip/chat/NudgeCard'

// Hooks
import { useTripChat } from '@/hooks/use-trip-chat'

// Helpers
import { computeProgressSteps } from '@/lib/trips/progress'
import { deriveTripPrimaryStage } from '@/lib/trips/stage'
import { computeTripProgressSnapshot, TripProgressSnapshot } from '@/lib/trips/progressSnapshot'
import { isTripCompleted } from '@/lib/trips/isTripCompleted'

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
    case 'brief':
      return 'Trip Brief'
    default:
      return ''
  }
}

// ─────────────────────────────────────────────────
// Priority Status Card — renders max 1 card above chat
// Priority: scheduling (COLLECTING/PROPOSED) > itinerary > general trip status
// ─────────────────────────────────────────────────

function PriorityStatusCard({
  trip,
  user,
  statusSummary,
  blocker,
  onOpenOverlay
}: {
  trip: any
  user: any
  statusSummary: any
  blocker: BlockerInfo
  onOpenOverlay: (type: OverlayType, params?: OverlayParams) => void
}) {
  // 1. Scheduling card — highest priority when dates aren't locked
  const schedulingSummary = trip?.schedulingSummary
  const showScheduling = schedulingSummary && schedulingSummary.phase !== 'LOCKED'
  if (showScheduling) {
    return (
      <SchedulingStatusCard
        trip={trip}
        user={user}
        onOpenScheduling={() => onOpenOverlay('scheduling')}
      />
    )
  }

  // 2. Itinerary card — shows after dates locked, while itinerary is in progress
  const datesLocked = trip?.status === 'locked' || !!(trip?.lockedStartDate && trip?.lockedEndDate)
  const itineraryStatus = trip?.itineraryStatus
  const showItinerary = datesLocked && itineraryStatus &&
    trip?.status !== 'completed' && trip?.status !== 'canceled'
  if (showItinerary) {
    return (
      <ItineraryStatusCard
        trip={trip}
        user={user}
        onOpenItinerary={() => onOpenOverlay('itinerary')}
      />
    )
  }

  // 3. General trip status card — fallback (lowest priority)
  return (
    <TripStatusCard
      tripId={trip?.id}
      summary={statusSummary}
      isLeader={trip?.createdBy === user?.id}
      onActionClick={() => onOpenOverlay(blocker.overlayType)}
    />
  )
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

  // Visit tracking — record visit and get delta data
  const [sinceLastVisit, setSinceLastVisit] = useState<any>(null)
  const visitFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!trip?.id || !token) return
    if (visitFetchedRef.current === trip.id) return
    visitFetchedRef.current = trip.id

    fetch(`/api/trips/${trip.id}/visit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sinceLastVisit) {
          setSinceLastVisit(data.sinceLastVisit)
        }
      })
      .catch(() => {})
  }, [trip?.id, token])

  // Quote-to-chat: close overlay and pre-fill chat input with quoted context
  const handleQuoteToChat = useCallback((quote: string) => {
    setActiveOverlay(null)
    setOverlayParams({})
    setHasUnsavedChanges(false)
    setNewMessage(quote)
  }, [setNewMessage])

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

  // Status summary for TripStatusCard
  const statusSummary = useMemo(() => {
    return computeTripStatusSummary(trip, travelers, sinceLastVisit, user?.id)
  }, [trip, travelers, sinceLastVisit, user?.id])

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

  // Overlay accent color — matches chevron color in ProgressStrip
  const OVERLAY_TO_STEP: Record<string, string> = {
    proposed: 'tripProposed',
    scheduling: 'datesLocked',
    itinerary: 'itineraryFinalized',
    accommodation: 'accommodationChosen',
    prep: 'prepStarted',
  }

  const overlayAccentColor = useMemo(() => {
    if (!activeOverlay) return '#09173D'
    const stepKey = OVERLAY_TO_STEP[activeOverlay]
    if (!stepKey) return '#09173D' // non-stage overlays (travelers, expenses, memories, member)
    if (stepKey === blocker.stageKey) return '#FA3823' // brand-red for blocker
    return '#09173D' // brand-blue for completed/active/future
  }, [activeOverlay, blocker.stageKey, progressSteps])

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
  const isCompleted = isTripCompleted(trip)
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || isCancelled || isCompleted

  // Check if any overlay is open
  const hasActiveOverlay = activeOverlay !== null

  return (
    <div className="flex flex-col h-full bg-brand-sand/50 overflow-x-hidden">
      {/* Centered column container - constrains all content to max-w-5xl */}
      <div className="flex-1 flex flex-col h-full w-full max-w-5xl mx-auto bg-white relative shadow-sm overflow-x-hidden">
        {/* Top section: Cancelled/removed banner + ProgressStrip (measured for overlay offset) */}
        <div ref={stripRef} className="shrink-0 z-10">
          {isCancelled && (
            <div className="bg-brand-sand/50 border-b border-brand-carbon/10 px-4 py-3 flex items-center justify-center gap-2">
              <span className="text-brand-carbon/70 text-sm font-medium">This trip has been canceled</span>
              <span className="text-brand-carbon/60 text-xs">(read-only)</span>
              <Link
                href="/dashboard"
                className="ml-2 text-sm font-medium text-brand-blue hover:underline"
              >
                Back to dashboard
              </Link>
            </div>
          )}

          {!isCancelled && viewer.isRemovedTraveler && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-center gap-2">
              <span className="text-amber-800 text-sm font-medium">You left this trip</span>
              <span className="text-amber-600 text-xs">(view only)</span>
              <Link
                href="/dashboard"
                className="ml-2 text-sm font-medium text-brand-blue hover:underline"
              >
                Back to dashboard
              </Link>
            </div>
          )}

          {!isCancelled && !viewer.isRemovedTraveler && isCompleted && (
            <div className="bg-brand-sand/30 border-b border-brand-blue/20 px-4 py-3 flex items-center justify-center gap-2">
              <span className="text-brand-blue text-sm font-medium">This trip has ended</span>
              <span className="text-brand-blue/60 text-xs">(view only)</span>
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
            isLeader={trip?.createdBy === user?.id}
            circleId={trip?.circleId}
          />
        </div>

        {/* Main content area - chat + input + CTA bar */}
        {/* Uses min-h-0 for proper flex child scrolling, dvh for mobile keyboard handling */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Status card — max 1 pinned above chat, priority: scheduling > itinerary > general */}
          {!isCancelled && !isCompleted && !isReadOnly && (
            <div className="shrink-0">
              <PriorityStatusCard
                trip={trip}
                user={user}
                statusSummary={statusSummary}
                blocker={blocker}
                onOpenOverlay={openOverlay}
              />
            </div>
          )}

          {/* Gentle nudge card — max 1, dismissible, shown above chat when user has a pending action */}
          {!isCancelled && !isCompleted && !isReadOnly && (
            <NudgeCard
              trip={trip}
              userRole={trip?.createdBy === user?.id ? 'leader' : 'traveler'}
              onOpenOverlay={openOverlay}
            />
          )}

          {/* Chat area - now constrained by outer max-w-3xl container */}
          <div className="flex-1 min-h-0 flex flex-col px-0 sm:px-4">
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
              collapseSystemMessages={true}
              onOpenOverlay={openOverlay}
            />
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

        {/* Overlay (covers chat and CTA bar, constrained within centered container) */}
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
          useAbsolutePosition={true}
          accentColor={overlayAccentColor}
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
                onQuoteToChat={handleQuoteToChat}
                prefillStart={overlayParams?.prefillStart}
                prefillEnd={overlayParams?.prefillEnd}
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
              onQuoteToChat={handleQuoteToChat}
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
              onOpenOverlay={(overlay) => setActiveOverlay(overlay)}
              onQuoteToChat={handleQuoteToChat}
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
            <TripInfoOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
            />
          )}
          </ErrorBoundary>
        </OverlayContainer>

        {/* First-visit onboarding tooltips (fixed overlay, max 2 tips) */}
        <OnboardingTooltips />
      </div>
    </div>
  )
}

export default CommandCenterV3
