'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { Calendar, ListTodo, Home, CheckCircle2, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Command Center components
import { ProgressChevrons, OverlayType } from './ProgressChevrons'
import { ContextCTABar } from './ContextCTABar'
import { OverlayContainer } from './OverlayContainer'

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
import { deriveTripPrimaryStage, TripPrimaryStage } from '@/lib/trips/stage'
import { computeTripProgressSnapshot, TripProgressSnapshot } from '@/lib/trips/progressSnapshot'

// Constants
// Chevron bar: 56px on mobile (compact for touch), 72px on desktop
const CHEVRON_BAR_WIDTH_MOBILE = 56 // Compact width for mobile
const CHEVRON_BAR_WIDTH_DESKTOP = 72 // Standard width for desktop

// Types
interface CommandCenterV2Props {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
}

interface OverlayParams {
  memberId?: string
  [key: string]: any
}

/**
 * Blocker types that determine what's blocking a trip
 */
type BlockerType = 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'PREP' | 'READY'

interface BlockerInfo {
  type: BlockerType
  title: string
  description: string
  ctaLabel: string
  icon: React.ComponentType<{ className?: string }>
  overlayType: OverlayType
}

/**
 * Derive the current blocker from trip data using progress snapshot (P0-4)
 * Uses computeTripProgressSnapshot() as single source of truth for consistency
 */
function deriveBlocker(trip: any, user: any, progressSnapshot: TripProgressSnapshot): BlockerInfo {
  if (!trip) {
    return {
      type: 'DATES',
      title: 'Pick your dates',
      description: 'Start by finding dates that work for everyone',
      ctaLabel: 'Pick Dates',
      icon: Calendar,
      overlayType: 'scheduling'
    }
  }

  // Use progress snapshot for core state decisions (P0-4)
  const { datesLocked, everyoneResponded, itineraryFinalized, accommodationChosen, prepStarted } = progressSnapshot

  // User-specific state (not in snapshot)
  const userHasPicked = trip.userDatePicks && trip.userDatePicks.length > 0
  const userHasVoted = !!trip.userVote

  // Blocker 1: Dates not locked
  if (!datesLocked) {
    // P1-5: Use inviting language - "Share your vote" not "Vote Now"
    if (trip.status === 'voting') {
      return {
        type: 'DATES',
        title: userHasVoted ? 'Votes in progress' : 'Share your vote',
        description: userHasVoted
          ? 'Others are still voting on dates'
          : 'Choose your preferred date window',
        ctaLabel: userHasVoted ? 'View Votes' : 'Share Vote',
        icon: Calendar,
        overlayType: 'scheduling'
      }
    }

    // If everyone has responded (from snapshot), show encouraging message
    // P1-5: Remove "waiting on you" pressure language
    if (everyoneResponded && userHasPicked) {
      return {
        type: 'DATES',
        title: 'Ready to lock dates',
        description: 'Everyone has responded. The trip leader can now lock in the dates',
        ctaLabel: 'View Dates',
        icon: Calendar,
        overlayType: 'scheduling'
      }
    }

    // P1-5: Use inviting language, avoid pressure
    return {
      type: 'DATES',
      title: userHasPicked ? 'Dates in progress' : 'Pick your dates',
      description: userHasPicked
        ? 'Others are still sharing their availability'
        : 'Share your date preferences to help coordinate the trip',
      ctaLabel: userHasPicked ? 'View Progress' : 'Pick Dates',
      icon: Calendar,
      overlayType: 'scheduling'
    }
  }

  // Blocker 2: Itinerary not finalized (from snapshot)
  if (!itineraryFinalized) {
    return {
      type: 'ITINERARY',
      title: 'Suggest ideas for the trip',
      description: 'Share your activity ideas and build the itinerary together',
      ctaLabel: 'Suggest Ideas',
      icon: ListTodo,
      overlayType: 'itinerary'
    }
  }

  // Blocker 3: Accommodation not chosen (from snapshot)
  if (!accommodationChosen) {
    return {
      type: 'ACCOMMODATION',
      title: 'Choose where to stay',
      description: 'Find and decide on accommodation for the trip',
      ctaLabel: 'Find Stays',
      icon: Home,
      overlayType: 'accommodation'
    }
  }

  // Blocker 4: Prep not started (from snapshot)
  if (!prepStarted) {
    return {
      type: 'PREP',
      title: 'Prepare for the trip',
      description: 'Add transport, packing lists, and documents',
      ctaLabel: 'Start Prep',
      icon: ClipboardList,
      overlayType: 'prep'
    }
  }

  // No blockers - trip is ready
  return {
    type: 'READY',
    title: 'Ready to go!',
    description: 'All decisions are made. Time to enjoy the trip!',
    ctaLabel: 'View Itinerary',
    icon: CheckCircle2,
    overlayType: 'itinerary'
  }
}

/**
 * Get overlay title for display
 */
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

/**
 * FocusBanner - Shows trip name, dates, and current blocker with CTA
 */
function FocusBanner({
  tripName,
  startDate,
  endDate,
  blocker,
  onAction,
  chevronBarWidth
}: {
  tripName: string
  startDate?: string
  endDate?: string
  blocker: BlockerInfo
  onAction: (overlayType: OverlayType) => void
  chevronBarWidth: number
}) {
  // Format dates for display
  const dateDisplay = useMemo(() => {
    if (!startDate || !endDate) return 'Dates not set'
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
    } catch {
      return 'Dates not set'
    }
  }, [startDate, endDate])

  // Color scheme based on blocker type (using brand colors)
  // brand-red: CTAs, blockers, errors, current action
  // brand-blue: completed states, secondary actions
  // brand-carbon: text, dark UI elements
  // brand-sand: highlights, backgrounds
  const colorClasses: Record<BlockerType, string> = {
    DATES: 'border-brand-red/30 bg-brand-red/5',
    ITINERARY: 'border-brand-red/30 bg-brand-red/5',
    ACCOMMODATION: 'border-brand-red/30 bg-brand-red/5',
    PREP: 'border-brand-red/30 bg-brand-red/5',
    READY: 'border-brand-blue/30 bg-brand-blue/5'
  }

  const buttonClasses: Record<BlockerType, string> = {
    DATES: 'bg-brand-red hover:bg-brand-red/90',
    ITINERARY: 'bg-brand-red hover:bg-brand-red/90',
    ACCOMMODATION: 'bg-brand-red hover:bg-brand-red/90',
    PREP: 'bg-brand-red hover:bg-brand-red/90',
    READY: 'bg-brand-blue hover:bg-brand-blue/90'
  }

  const iconClasses: Record<BlockerType, string> = {
    DATES: 'text-brand-red',
    ITINERARY: 'text-brand-red',
    ACCOMMODATION: 'text-brand-red',
    PREP: 'text-brand-red',
    READY: 'text-brand-blue'
  }

  const Icon = blocker.icon

  return (
    <div className="border-b border-gray-200 shrink-0" style={{ marginRight: `${chevronBarWidth}px` }}>
      {/* Trip name and dates row */}
      <div className="px-3 md:px-4 py-2 bg-gray-50 flex items-center gap-2">
        <h1 className="text-sm md:text-base font-semibold text-gray-900 truncate">{tripName}</h1>
        <span className="text-gray-500 hidden sm:inline" aria-hidden="true">•</span>
        <span className="text-xs md:text-sm text-gray-600 hidden sm:inline">{dateDisplay}</span>
      </div>

      {/* Blocker card */}
      <div className={cn('mx-3 my-2 rounded-lg border-2 p-3', colorClasses[blocker.type])}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn('p-2 rounded-full bg-white shrink-0', iconClasses[blocker.type])}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm">{blocker.title}</h3>
              <p className="text-xs text-gray-600 truncate">{blocker.description}</p>
            </div>
          </div>
          {blocker.type !== 'READY' && blocker.overlayType && (
            <Button
              size="sm"
              className={cn('shrink-0 text-white', buttonClasses[blocker.type])}
              onClick={() => onAction(blocker.overlayType)}
            >
              {blocker.ctaLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}


/**
 * CommandCenterV2 - Main container orchestrating the chat-centric layout
 *
 * Layout:
 * - FocusBanner (top) - trip name, dates, blocker card
 * - Main area split into:
 *   - Chat column (flex-1) containing:
 *     - Chat messages (scrollable)
 *     - ContextCTABar (bottom bar with travelers/expenses/memories + focus CTA)
 *     - Chat input
 *   - Chevron sidebar (fixed width, desktop only)
 * - Mobile chevrons (horizontal, mobile only)
 * - Overlay slides in from right, stops at chevron bar
 */
export function CommandCenterV2({ trip, token, user, onRefresh }: CommandCenterV2Props) {
  // Overlay state
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
  const [overlayParams, setOverlayParams] = useState<OverlayParams>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const chevronBarRef = useRef<HTMLDivElement>(null)
  const focusBannerRef = useRef<HTMLDivElement>(null)
  const ctaBarRef = useRef<HTMLDivElement>(null)
  const [focusBannerHeight, setFocusBannerHeight] = useState(0)
  const [ctaBarHeight, setCtaBarHeight] = useState(0)
  const [chevronBarWidth, setChevronBarWidth] = useState(CHEVRON_BAR_WIDTH_DESKTOP)

  // Measure focus banner height for overlay positioning
  useEffect(() => {
    if (focusBannerRef.current) {
      const height = focusBannerRef.current.getBoundingClientRect().height
      setFocusBannerHeight(height)
    }
  }, [trip]) // Re-measure when trip changes (affects banner content)

  // Measure CTA bar height for overlay positioning
  useEffect(() => {
    const el = ctaBarRef.current
    if (!el) return
    const measure = () => setCtaBarHeight(el.getBoundingClientRect().height)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [])

  // Handle responsive chevron bar width
  useEffect(() => {
    const handleResize = () => {
      // Use mobile width for screens < 768px (md breakpoint)
      const isMobile = window.innerWidth < 768
      setChevronBarWidth(isMobile ? CHEVRON_BAR_WIDTH_MOBILE : CHEVRON_BAR_WIDTH_DESKTOP)
    }

    // Set initial value
    handleResize()

    // Listen for resize events
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
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

  // Nudge engine: fetch nudges on load and on status changes
  // Fire-and-forget: chat_card nudges appear via normal chat polling
  const nudgesFetchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!trip?.id || !token) return
    // Skip if nudges disabled via env var
    if (process.env.NEXT_PUBLIC_NUDGES_ENABLED === 'false') return
    // Dedupe key: tripId + status (re-fetch when status changes, e.g. after locking dates)
    const fetchKey = `${trip.id}:${trip.status}`
    if (nudgesFetchedRef.current === fetchKey) return
    nudgesFetchedRef.current = fetchKey

    fetch(`/api/trips/${trip.id}/nudges`, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {
      // Silently fail — nudges are non-critical
    })
  }, [trip?.id, trip?.status, token])

  // Compute derived state
  const progressSteps = useMemo(() => computeProgressSteps(trip), [trip])
  const currentStage = useMemo(() => deriveTripPrimaryStage(trip), [trip])

  // Compute progress snapshot as single source of truth (P0-4)
  const progressSnapshot = useMemo(() => {
    return computeTripProgressSnapshot(trip, user, {
      pickProgress: trip?.pickProgress
    })
  }, [trip, user])

  const blocker = useMemo(() => deriveBlocker(trip, user, progressSnapshot), [trip, user, progressSnapshot])

  // Find blocker stage key for progress chevrons - the chevron that points left matches the focus banner
  // This is based on the blocker (what needs attention), not the current stage
  const blockerStageKey = useMemo(() => {
    switch (blocker.type) {
      case 'DATES':
        return 'datesLocked'
      case 'ITINERARY':
        return 'itineraryFinalized'
      case 'ACCOMMODATION':
        return 'accommodationChosen'
      case 'PREP':
        return 'prepStarted'
      case 'READY':
        return null // No chevron points left when ready
      default:
        return 'datesLocked' // Default to dates if unknown
    }
  }, [blocker])

  // Extract travelers from trip data (use participantsWithStatus if available, fallback to travelers)
  const travelers = useMemo(() => {
    const participantList = trip?.participantsWithStatus || trip?.travelers || []
    if (!participantList.length) return []
    return participantList
      .filter((p: any) => (p.status || 'active') === 'active')
      .map((p: any) => ({
        id: p.userId || p.user?.id || p.id,
        name: p.user?.name || p.name || 'Unknown',
        avatarUrl: p.user?.image || p.avatarUrl,
        status: p.status || 'active'
      }))
  }, [trip?.participantsWithStatus, trip?.travelers])

  // Overlay functions - toggle behavior: clicking same overlay closes it
  const openOverlay = useCallback((type: OverlayType, params?: OverlayParams) => {
    if (type) {
      // Toggle: if clicking the same overlay (without different params), close it
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

  // Handle chevron click
  const handleChevronClick = useCallback((overlayType: OverlayType) => {
    if (overlayType) {
      openOverlay(overlayType)
    }
  }, [openOverlay])

  // Handle traveler click
  const handleTravelerClick = useCallback((travelerId: string) => {
    openOverlay('member', { memberId: travelerId })
  }, [openOverlay])

  // Handle blocker action
  const handleBlockerAction = useCallback((overlayType: OverlayType) => {
    if (overlayType) {
      openOverlay(overlayType)
    }
  }, [openOverlay])

  // Get trip dates
  const startDate = trip?.lockedStartDate || trip?.startDate
  const endDate = trip?.lockedEndDate || trip?.endDate

  // Determine if viewer is read-only
  const viewer = trip?.viewer || {}
  const isCancelled = trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || isCancelled

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Cancelled Trip Banner */}
      {isCancelled && (
        <div className="bg-gray-100 border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-2">
          <span className="text-gray-600 text-sm font-medium">🚫 This trip has been canceled</span>
          <span className="text-gray-500 text-xs">(read-only)</span>
          <Link
            href="/dashboard"
            className="ml-2 text-sm font-medium text-brand-blue hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      )}

      {/* Focus Banner with Blocker */}
      <div ref={focusBannerRef}>
        <FocusBanner
          tripName={trip?.name || 'Untitled Trip'}
          startDate={startDate}
          endDate={endDate}
          blocker={blocker}
          onAction={handleBlockerAction}
          chevronBarWidth={chevronBarWidth}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Chat column - contains chat, traveler strip, CTA, and input */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Chat messages area */}
          <div className="flex-1 min-h-0">
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
            />
          </div>

          {/* Bottom section: Context CTA Bar (inside chat area, above input) */}
          <div ref={ctaBarRef} className="shrink-0">
            <ContextCTABar
              trip={trip}
              user={user}
              travelerCount={travelers.length}
              onOpenOverlay={openOverlay}
            />
          </div>
        </div>

        {/* Progress Chevrons sidebar - always on right side */}
        {/* Responsive width: 56px on mobile, 72px on desktop */}
        <div
          ref={chevronBarRef}
          className="flex flex-col items-center justify-start border-l border-gray-200 bg-gray-50 shrink-0 overflow-y-auto py-2 w-14 md:w-[72px]"
        >
          <ProgressChevrons
            progressSteps={progressSteps}
            blockerStageKey={blockerStageKey}
            onChevronClick={handleChevronClick}
            activeOverlay={activeOverlay}
            orientation="vertical"
          />
        </div>
      </div>

      {/* Overlay Container - slides in from right (sidebar) or bottom (bottom bar) */}
      <OverlayContainer
        isOpen={activeOverlay !== null}
        onClose={closeOverlay}
        title={getOverlayTitle(activeOverlay)}
        hasUnsavedChanges={hasUnsavedChanges}
        rightOffset={`${chevronBarWidth}px`}
        topOffset={`${focusBannerHeight}px`}
        bottomOffset={`${ctaBarHeight}px`}
        slideFrom={
          activeOverlay === 'travelers' || activeOverlay === 'expenses' || activeOverlay === 'memories'
            ? 'bottom'
            : 'right'
        }
      >
        <ErrorBoundary>
          {/* Render appropriate overlay based on activeOverlay type */}
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
          {activeOverlay === 'travelers' && (
            <TravelersOverlay
              trip={trip}
              token={token}
              user={user}
              onRefresh={onRefresh}
              onClose={closeOverlay}
              setHasUnsavedChanges={setHasUnsavedChanges}
              onMemberClick={(memberId) => openOverlay('member', { memberId })}
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

export default CommandCenterV2
