'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, ChevronDown, ChevronUp, MessageCircle, ArrowLeft, MoreHorizontal } from 'lucide-react'
import { TripFocusBanner, BlockerType, deriveBlocker } from './TripFocusBanner'
import { ChatTab } from '@/components/trip/TripTabs/tabs/ChatTab'
import { useTripChat } from '@/hooks/use-trip-chat'
import { useTripIntelligence } from '@/hooks/use-trip-intelligence'
import { deriveTripPrimaryStage } from '@/lib/trips/stage'
import {
  SchedulingDecisionModule,
  ItineraryDecisionModule,
  AccommodationDecisionModule,
  TravelersModule,
  PrepModule,
  ExpensesModule
} from './decision-modules'

type DecisionModuleType = 'scheduling' | 'itinerary' | 'accommodation' | null
type SecondaryModuleType = 'travelers' | 'prep' | 'expenses' | null

interface TripCommandCenterProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
}

/**
 * TripCommandCenter - Chat-centric trip experience
 *
 * One Page, Three Zones:
 * 1. Trip Focus Banner (direction) - What's blocking this trip?
 * 2. Decision Cards (action) - Collapsible modules for each decision area
 * 3. Chat Feed (primary surface) - Command center for coordination
 *
 * Phase 4: Decision Cards with accordion behavior
 */
export function TripCommandCenter({ trip, token, user, onRefresh }: TripCommandCenterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Chat state via hook
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

  // Compute stage for ChatTab
  const stage = trip?._computedStage || deriveTripPrimaryStage(trip)

  // Phase 6: Fetch LLM-powered trip intelligence
  const {
    blocker: llmBlocker,
    nudge,
    loading: intelligenceLoading
  } = useTripIntelligence({
    tripId: trip?.id,
    token,
    enabled: !!trip?.id && !!token
  })

  // Derive current blocker for decision module emphasis
  // Use LLM blocker type if available and confident, otherwise use heuristic
  const heuristicBlocker = deriveBlocker(trip)
  const currentBlocker = llmBlocker?.usedLLM && llmBlocker?.confidence >= 0.7
    ? { ...heuristicBlocker, type: llmBlocker.type as BlockerType }
    : heuristicBlocker

  // Accordion state - only one decision module expanded at a time
  const [expandedModule, setExpandedModule] = useState<DecisionModuleType>(() => {
    // Auto-expand based on current blocker
    switch (currentBlocker.type) {
      case 'DATES':
        return 'scheduling'
      case 'ITINERARY':
        return 'itinerary'
      case 'ACCOMMODATION':
        return 'accommodation'
      default:
        return null
    }
  })

  // Toggle a decision module (accordion behavior)
  const toggleModule = useCallback((module: DecisionModuleType) => {
    setExpandedModule(prev => prev === module ? null : module)
  }, [])

  // Secondary modules state (independent accordion - not blockers)
  const [expandedSecondary, setExpandedSecondary] = useState<SecondaryModuleType>(null)
  // "+ More" collapsible state for secondary modules
  const [showSecondaryModules, setShowSecondaryModules] = useState(false)

  const toggleSecondary = useCallback((module: SecondaryModuleType) => {
    setExpandedSecondary(prev => prev === module ? null : module)
  }, [])

  // Get return navigation info
  const returnTo = searchParams.get('returnTo')
  const circleId = searchParams.get('circleId') || trip?.circleId

  const dashboardLink = returnTo && returnTo.startsWith('/circles/')
    ? '/dashboard'
    : (returnTo || '/dashboard')

  const circleLink = circleId
    ? `/dashboard?circleId=${circleId}`
    : dashboardLink

  // Handle opening legacy tab (for scheduling/itinerary actions)
  // Phase 9: Legacy is now opt-in via ?ui=legacy, so we must set it explicitly
  const openLegacyTab = useCallback((tab: string) => {
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set('ui', 'legacy')
    currentUrl.searchParams.set('tab', tab)
    router.push(currentUrl.toString())
  }, [router])

  // Handle blocker CTA action - navigates to appropriate action
  // Phase 9: Will show inline UI instead of navigating to legacy tabs
  const handleBlockerAction = useCallback((blockerType: BlockerType) => {
    switch (blockerType) {
      case 'DATES':
        // Navigate to legacy planning tab for date picking
        // Phase 9: Replace with inline scheduling UI
        openLegacyTab('planning')
        break
      case 'ITINERARY':
        // Navigate to legacy itinerary tab
        // Phase 9: Replace with inline itinerary UI
        openLegacyTab('itinerary')
        break
      case 'ACCOMMODATION':
        // Accommodation already works inline - just expand the module
        setExpandedModule('accommodation')
        break
      default:
        break
    }
  }, [openLegacyTab])

  // Switch back to legacy UX
  const switchToLegacy = () => {
    const currentUrl = new URL(window.location.href)
    currentUrl.searchParams.set('ui', 'legacy')
    router.push(currentUrl.toString())
  }

  // Status badge helper
  const getStatusBadge = () => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      proposed: { label: 'Proposed', className: 'bg-blue-100 text-blue-800' },
      scheduling: { label: 'Scheduling', className: 'bg-yellow-100 text-yellow-800' },
      voting: { label: 'Voting', className: 'bg-purple-100 text-purple-800' },
      locked: { label: 'Locked', className: 'bg-green-100 text-green-800' },
      completed: { label: 'Completed', className: 'bg-gray-100 text-gray-800' },
      canceled: { label: 'Canceled', className: 'bg-red-100 text-red-800' }
    }

    const config = statusConfig[trip?.status] || statusConfig.proposed
    return <Badge className={config.className}>{config.label}</Badge>
  }

  // Check if viewer is read-only
  const viewer = trip?.viewer || {}
  const isReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || trip?.status === 'canceled'

  return (
    <div className="max-w-4xl mx-auto px-4 py-2">
      {/* Breadcrumb Navigation */}
      <div className="mb-6">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link
            href={dashboardLink}
            className="hover:text-gray-900 hover:underline"
          >
            Dashboard
          </Link>
          {trip?.circle?.name && (
            <>
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <Link
                href={circleLink}
                prefetch={false}
                className="hover:text-gray-900 hover:underline"
              >
                {trip.circle.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <span className="text-gray-900 font-medium">{trip?.name}</span>
        </nav>
      </div>

      {/* Header - Phase 5: Calmer visual hierarchy */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900">{trip?.name}</h1>
          {getStatusBadge()}
        </div>
        {trip?.description && (
          <p className="text-gray-500 text-sm">{trip.description}</p>
        )}
      </div>

      {/* Zone 1: Trip Focus Banner - Phase 6: With LLM intelligence */}
      <div className="mb-8">
        <TripFocusBanner
          trip={trip}
          onAction={handleBlockerAction}
          llmBlocker={llmBlocker}
          nudge={nudge}
          showLLMIndicator={true}
        />
      </div>

      {/* Zone 2: Decision Cards (Accordion) - Phase 5: Only blocker has primary CTA */}
      <div className="space-y-2 mb-8">
        {/* Phase 5: Subtle microcopy explaining focus */}
        {currentBlocker.type !== 'READY' && (
          <p className="text-xs text-gray-400 px-1">
            Focus on one decision at a time. Other areas are accessible but de-emphasized.
          </p>
        )}
        <SchedulingDecisionModule
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          isExpanded={expandedModule === 'scheduling'}
          onToggle={() => toggleModule('scheduling')}
          onOpenLegacyTab={openLegacyTab}
          isPrimaryBlocker={currentBlocker.type === 'DATES'}
        />

        <ItineraryDecisionModule
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          isExpanded={expandedModule === 'itinerary'}
          onToggle={() => toggleModule('itinerary')}
          onOpenLegacyTab={openLegacyTab}
          isPrimaryBlocker={currentBlocker.type === 'ITINERARY'}
        />

        <AccommodationDecisionModule
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          isExpanded={expandedModule === 'accommodation'}
          onToggle={() => toggleModule('accommodation')}
          isPrimaryBlocker={currentBlocker.type === 'ACCOMMODATION'}
        />

        {/* Secondary Modules - Coordination/Tracking (not blockers) */}
        <div className="border-t border-gray-100 pt-3 mt-3">
          <button
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-1 mb-2 transition-colors"
            onClick={() => setShowSecondaryModules(!showSecondaryModules)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <span>More</span>
            {showSecondaryModules ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showSecondaryModules && (
            <div className="space-y-1">
              <TravelersModule
                trip={trip}
                token={token}
                user={user}
                onRefresh={onRefresh}
                isExpanded={expandedSecondary === 'travelers'}
                onToggle={() => toggleSecondary('travelers')}
                onOpenLegacyTab={openLegacyTab}
              />

              <PrepModule
                trip={trip}
                token={token}
                user={user}
                onRefresh={onRefresh}
                isExpanded={expandedSecondary === 'prep'}
                onToggle={() => toggleSecondary('prep')}
                onOpenLegacyTab={openLegacyTab}
              />

              <ExpensesModule
                trip={trip}
                token={token}
                user={user}
                onRefresh={onRefresh}
                isExpanded={expandedSecondary === 'expenses'}
                onToggle={() => toggleSecondary('expenses')}
                onOpenLegacyTab={openLegacyTab}
              />
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Chat Feed (Primary Surface) - Phase 5: Emphasized as main interaction area */}
      <Card className="mb-8 border-gray-200">
        <CardHeader className="pb-3 border-b border-gray-100">
          <CardTitle className="flex items-center gap-2 text-base font-medium text-gray-700">
            <MessageCircle className="h-4 w-4" />
            Trip Chat
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
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
            stage={stage}
            setActiveTab={() => {}}
            isReadOnly={isReadOnly}
            mode="command-center"
          />
        </CardContent>
      </Card>

      {/* Dev Tools - Phase 8 */}
      <div className="border-t border-gray-100 pt-4 mt-4">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-normal">DEV</Badge>
            <span>Command Center Mode (Phase 8 - Polish)</span>
            {intelligenceLoading && <span className="text-blue-400">Loading AI...</span>}
          </div>
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600" onClick={switchToLegacy}>
            <ArrowLeft className="h-3 w-3 mr-1" />
            Legacy UX
          </Button>
        </div>
      </div>
    </div>
  )
}
