'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { Calendar, ListTodo, Home, CheckCircle2 } from 'lucide-react'
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

// Hooks
import { useTripChat } from '@/hooks/use-trip-chat'

// Helpers
import { computeProgressSteps } from '@/lib/trips/progress'
import { deriveTripPrimaryStage, TripPrimaryStage } from '@/lib/trips/stage'

// Constants
const CHEVRON_BAR_WIDTH = 72 // Width of the chevron sidebar in pixels
const BOTTOM_BAR_HEIGHT = 56 // Height of the ContextCTABar in pixels

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
type BlockerType = 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'READY'

interface BlockerInfo {
  type: BlockerType
  title: string
  description: string
  ctaLabel: string
  icon: React.ComponentType<{ className?: string }>
  overlayType: OverlayType
}

/**
 * Derive the current blocker from trip data using deterministic heuristics
 */
function deriveBlocker(trip: any, user: any): BlockerInfo {
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

  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)

  // Blocker 1: Dates not locked
  if (!datesLocked) {
    const userHasPicked = trip.userDatePicks && trip.userDatePicks.length > 0
    const userHasVoted = !!trip.userVote
    const canLockDates = trip.canLockDates || trip.status === 'voting'

    if (trip.status === 'voting') {
      return {
        type: 'DATES',
        title: userHasVoted ? 'Waiting on votes' : 'Vote on dates',
        description: userHasVoted
          ? 'Waiting for others to vote before dates can be locked'
          : 'Choose your preferred date window',
        ctaLabel: userHasVoted ? 'View Votes' : 'Vote Now',
        icon: Calendar,
        overlayType: 'scheduling'
      }
    }

    // If everyone has picked and dates can be locked, show "Waiting on dates to be locked"
    if (canLockDates && userHasPicked) {
      return {
        type: 'DATES',
        title: 'Waiting on dates to be locked',
        description: 'Everyone has responded. Waiting for trip leader to lock dates',
        ctaLabel: 'View Dates',
        icon: Calendar,
        overlayType: 'scheduling'
      }
    }

    return {
      type: 'DATES',
      title: userHasPicked ? 'Waiting on dates' : 'Pick your dates',
      description: userHasPicked
        ? 'Waiting for others to respond before dates can be locked'
        : 'Share your date preferences to help coordinate the trip',
      ctaLabel: userHasPicked ? 'View Progress' : 'Pick Dates',
      icon: Calendar,
      overlayType: 'scheduling'
    }
  }

  // Blocker 2: Itinerary not finalized
  const itineraryStatus = trip.itineraryStatus
  const itineraryFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'

  if (!itineraryFinalized) {
    return {
      type: 'ITINERARY',
      title: 'Plan the itinerary',
      description: 'Add ideas and build a day-by-day plan together',
      ctaLabel: 'Plan Itinerary',
      icon: ListTodo,
      overlayType: 'itinerary'
    }
  }

  // Blocker 3: Accommodation not decided
  const accommodationChosen = trip.progress?.steps?.accommodationChosen || false

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

  // No blockers - trip is ready
  return {
    type: 'READY',
    title: 'Ready to go!',
    description: 'All decisions are made. Time to enjoy the trip!',
    ctaLabel: 'View Trip',
    icon: CheckCircle2,
    overlayType: null
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
  onAction
}: {
  tripName: string
  startDate?: string
  endDate?: string
  blocker: BlockerInfo
  onAction: (overlayType: OverlayType) => void
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

  // Color scheme based on blocker type
  const colorClasses = {
    DATES: 'border-blue-200 bg-blue-50',
    ITINERARY: 'border-purple-200 bg-purple-50',
    ACCOMMODATION: 'border-orange-200 bg-orange-50',
    READY: 'border-green-200 bg-green-50'
  }

  const buttonClasses = {
    DATES: 'bg-blue-600 hover:bg-blue-700',
    ITINERARY: 'bg-purple-600 hover:bg-purple-700',
    ACCOMMODATION: 'bg-orange-600 hover:bg-orange-700',
    READY: 'bg-green-600 hover:bg-green-700'
  }

  const iconClasses = {
    DATES: 'text-blue-600',
    ITINERARY: 'text-purple-600',
    ACCOMMODATION: 'text-orange-600',
    READY: 'text-green-600'
  }

  const Icon = blocker.icon

  return (
    <div className="border-b border-gray-200 shrink-0" style={{ marginRight: `${CHEVRON_BAR_WIDTH}px` }}>
      {/* Trip name and dates row */}
      <div className="px-4 py-2 bg-gray-50 flex items-center gap-2">
        <h1 className="text-base font-semibold text-gray-900 truncate">{tripName}</h1>
        <span className="text-gray-400">•</span>
        <span className="text-sm text-gray-600">{dateDisplay}</span>
      </div>

      {/* Blocker card */}
      <div className={cn('mx-3 my-2 rounded-lg border-2 p-3', colorClasses[blocker.type])}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn('p-2 rounded-full bg-white shrink-0', iconClasses[blocker.type])}>
              <Icon className="h-5 w-5" />
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
  const [focusBannerHeight, setFocusBannerHeight] = useState(0)

  // Measure focus banner height for overlay positioning
  useEffect(() => {
    if (focusBannerRef.current) {
      const height = focusBannerRef.current.getBoundingClientRect().height
      setFocusBannerHeight(height)
    }
  }, [trip]) // Re-measure when trip changes (affects banner content)

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

  // Compute derived state
  const progressSteps = useMemo(() => computeProgressSteps(trip), [trip])
  const currentStage = useMemo(() => deriveTripPrimaryStage(trip), [trip])
  const blocker = useMemo(() => deriveBlocker(trip, user), [trip, user])

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
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || trip?.status === 'canceled'

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Focus Banner with Blocker */}
      <div ref={focusBannerRef}>
        <FocusBanner
          tripName={trip?.name || 'Untitled Trip'}
          startDate={startDate}
          endDate={endDate}
          blocker={blocker}
          onAction={handleBlockerAction}
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
          <div className="shrink-0">
            <ContextCTABar
              trip={trip}
              user={user}
              travelerCount={travelers.length}
              onOpenOverlay={openOverlay}
            />
          </div>
        </div>

        {/* Progress Chevrons sidebar - always on right side */}
        <div
          ref={chevronBarRef}
          className="flex flex-col items-center justify-start border-l border-gray-200 bg-gray-50 shrink-0 overflow-y-auto py-2"
          style={{ width: CHEVRON_BAR_WIDTH }}
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
        rightOffset={`${CHEVRON_BAR_WIDTH}px`}
        topOffset={`${focusBannerHeight}px`}
        bottomOffset={`${BOTTOM_BAR_HEIGHT}px`}
        slideFrom={
          activeOverlay === 'travelers' || activeOverlay === 'expenses' || activeOverlay === 'memories'
            ? 'bottom'
            : 'right'
        }
      >
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
      </OverlayContainer>
    </div>
  )
}

export default CommandCenterV2
