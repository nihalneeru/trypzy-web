'use client'

import { useState, useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import { Users, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Command Center components
import { ProgressChevrons, OverlayType } from './ProgressChevrons'
import { TravelerStrip } from './TravelerStrip'
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
import { useTripIntelligence } from '@/hooks/use-trip-intelligence'

// Helpers
import { TRIP_PROGRESS_STEPS, computeProgressSteps } from '@/lib/trips/progress'
import { deriveTripPrimaryStage, TripPrimaryStage } from '@/lib/trips/stage'

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
 * Get stage key from OverlayType for progress tracking
 */
function getStageKeyFromOverlay(overlayType: OverlayType): string | null {
  switch (overlayType) {
    case 'proposed':
      return 'tripProposed'
    case 'scheduling':
      return 'datesLocked'
    case 'itinerary':
      return 'itineraryFinalized'
    case 'accommodation':
      return 'accommodationChosen'
    case 'prep':
      return 'prepStarted'
    case 'memories':
      return 'memoriesShared'
    case 'expenses':
      return 'expensesSettled'
    default:
      return null
  }
}

/**
 * FocusBannerV2 - Trip name, dates, and blocker text
 */
function FocusBannerV2({
  tripName,
  startDate,
  endDate,
  blockerText,
  stage
}: {
  tripName: string
  startDate?: string
  endDate?: string
  blockerText?: string | null
  stage: string
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

  // Get stage badge color
  const stageBadgeClass = useMemo(() => {
    switch (stage) {
      case TripPrimaryStage.PROPOSED:
        return 'bg-yellow-100 text-yellow-800'
      case TripPrimaryStage.DATES_LOCKED:
        return 'bg-blue-100 text-blue-800'
      case TripPrimaryStage.ITINERARY:
        return 'bg-purple-100 text-purple-800'
      case TripPrimaryStage.STAY:
        return 'bg-indigo-100 text-indigo-800'
      case TripPrimaryStage.PREP:
        return 'bg-orange-100 text-orange-800'
      case TripPrimaryStage.ONGOING:
        return 'bg-green-100 text-green-800'
      case TripPrimaryStage.COMPLETED:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }, [stage])

  const stageLabel = useMemo(() => {
    switch (stage) {
      case TripPrimaryStage.PROPOSED:
        return 'Scheduling'
      case TripPrimaryStage.DATES_LOCKED:
        return 'Planning'
      case TripPrimaryStage.ITINERARY:
        return 'Booking'
      case TripPrimaryStage.STAY:
        return 'Prep'
      case TripPrimaryStage.PREP:
        return 'Ready'
      case TripPrimaryStage.ONGOING:
        return 'Ongoing'
      case TripPrimaryStage.COMPLETED:
        return 'Complete'
      default:
        return 'Active'
    }
  }, [stage])

  return (
    <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold truncate">{tripName}</h1>
            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', stageBadgeClass)}>
              {stageLabel}
            </span>
          </div>
          <p className="text-sm text-white/80">{dateDisplay}</p>
        </div>
      </div>

      {/* Blocker text */}
      {blockerText && (
        <div className="mt-2 flex items-center gap-2 text-sm bg-white/10 rounded-lg px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{blockerText}</span>
        </div>
      )}
    </div>
  )
}

/**
 * ContextCTABar - Travelers count and contextual CTA button
 */
function ContextCTABar({
  travelersCount,
  ctaLabel,
  ctaAction,
  onOpenTravelers
}: {
  travelersCount: number
  ctaLabel?: string
  ctaAction?: () => void
  onOpenTravelers: () => void
}) {
  return (
    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
      <button
        onClick={onOpenTravelers}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <Users className="h-4 w-4" />
        <span>{travelersCount} traveler{travelersCount !== 1 ? 's' : ''}</span>
        <ChevronRight className="h-4 w-4" />
      </button>

      {ctaLabel && ctaAction && (
        <Button size="sm" onClick={ctaAction}>
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}


/**
 * CommandCenterV2 - Main container orchestrating the chat-centric layout
 *
 * Layout (top to bottom):
 * 1. FocusBannerV2 (trip name + dates + blocker text)
 * 2. Main content area (chat + progress chevrons)
 * 3. TravelerStrip (horizontal avatar scroll)
 * 4. ContextCTABar (travelers count + CTA button)
 * 5. Chat input (handled by ChatTab)
 */
export function CommandCenterV2({ trip, token, user, onRefresh }: CommandCenterV2Props) {
  // Overlay state
  const [activeOverlay, setActiveOverlay] = useState<OverlayType>(null)
  const [overlayParams, setOverlayParams] = useState<OverlayParams>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

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

  // Intelligence hook for blocker detection
  const { blocker, loading: intelligenceLoading } = useTripIntelligence({
    tripId: trip?.id,
    token,
    enabled: !!trip?.id && !!token
  })

  // Compute derived state
  const progressSteps = useMemo(() => computeProgressSteps(trip), [trip])
  const currentStage = useMemo(() => deriveTripPrimaryStage(trip), [trip])

  // Find current stage key for progress chevrons
  const currentStageKey = useMemo(() => {
    switch (currentStage) {
      case TripPrimaryStage.PROPOSED:
        return 'tripProposed'
      case TripPrimaryStage.DATES_LOCKED:
        return 'datesLocked'
      case TripPrimaryStage.ITINERARY:
        return 'itineraryFinalized'
      case TripPrimaryStage.STAY:
        return 'accommodationChosen'
      case TripPrimaryStage.PREP:
        return 'prepStarted'
      case TripPrimaryStage.ONGOING:
        return 'tripOngoing'
      case TripPrimaryStage.COMPLETED:
        return 'expensesSettled'
      default:
        return 'tripProposed'
    }
  }, [currentStage])

  // Extract travelers from trip data
  const travelers = useMemo(() => {
    if (!trip?.travelers) return []
    return trip.travelers.map((t: any) => ({
      id: t.userId || t.id,
      name: t.name || t.user?.name || 'Unknown',
      avatarUrl: t.avatarUrl || t.user?.image,
      status: t.status || 'active'
    }))
  }, [trip?.travelers])

  // Get blocker text for banner
  const blockerText = useMemo(() => {
    if (!blocker) return null
    return blocker.recommendedAction || blocker.reasoning || null
  }, [blocker])

  // Overlay functions
  const openOverlay = useCallback((type: OverlayType, params?: OverlayParams) => {
    setActiveOverlay(type)
    setOverlayParams(params || {})
  }, [])

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

  // Handle open travelers overlay
  const handleOpenTravelers = useCallback(() => {
    openOverlay('travelers')
  }, [openOverlay])

  // Get trip dates
  const startDate = trip?.lockedStartDate || trip?.startDate
  const endDate = trip?.lockedEndDate || trip?.endDate

  // Determine if viewer is read-only
  const viewer = trip?.viewer || {}
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || trip?.status === 'canceled'

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 1. Focus Banner */}
      <FocusBannerV2
        tripName={trip?.name || 'Untitled Trip'}
        startDate={startDate}
        endDate={endDate}
        blockerText={blockerText}
        stage={currentStage}
      />

      {/* 2. Main content area - Chat + Progress Chevrons */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Chat feed (center, takes most space) */}
        <div className="flex-1 flex flex-col min-w-0">
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

        {/* Progress Chevrons (right side, vertical) - hidden on mobile */}
        <div className="hidden md:flex flex-col items-center border-l border-gray-200 bg-gray-50 px-2">
          <ProgressChevrons
            progressSteps={progressSteps}
            currentStageKey={currentStageKey}
            onChevronClick={handleChevronClick}
            activeOverlay={activeOverlay}
          />
        </div>
      </div>

      {/* 3. Traveler Strip */}
      <TravelerStrip
        travelers={travelers}
        currentUserId={user?.id}
        onTravelerClick={handleTravelerClick}
      />

      {/* 4. Context CTA Bar */}
      <ContextCTABar
        travelersCount={travelers.length}
        onOpenTravelers={handleOpenTravelers}
      />

      {/* Mobile Progress Chevrons - shown as horizontal strip on mobile */}
      <div className="md:hidden flex items-center justify-center gap-1 py-2 px-4 bg-gray-50 border-t border-gray-200 overflow-x-auto">
        <ProgressChevrons
          progressSteps={progressSteps}
          currentStageKey={currentStageKey}
          onChevronClick={handleChevronClick}
          activeOverlay={activeOverlay}
        />
      </div>

      {/* Overlay Container */}
      <OverlayContainer
        isOpen={activeOverlay !== null}
        onClose={closeOverlay}
        title={getOverlayTitle(activeOverlay)}
        hasUnsavedChanges={hasUnsavedChanges}
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
