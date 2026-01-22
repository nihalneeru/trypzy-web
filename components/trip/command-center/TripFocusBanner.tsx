'use client'

import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, ListTodo, Home, CheckCircle2 } from 'lucide-react'

/**
 * Blocker types that determine what's blocking a trip from being locked
 */
export type BlockerType = 'DATES' | 'ITINERARY' | 'ACCOMMODATION' | 'READY'

export interface BlockerInfo {
  type: BlockerType
  title: string
  description: string
  ctaLabel: string
  icon: React.ComponentType<{ className?: string }>
}

/**
 * Derive the current blocker from trip data using deterministic heuristics
 * No LLM - pure rule-based logic
 */
export function deriveBlocker(trip: any): BlockerInfo {
  if (!trip) {
    return {
      type: 'DATES',
      title: 'Pick your dates',
      description: 'Start by finding dates that work for everyone',
      ctaLabel: 'Pick Dates',
      icon: Calendar
    }
  }

  const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)

  // Blocker 1: Dates not locked
  if (!datesLocked) {
    // Check if user has picked dates (for personalized message)
    const userHasPicked = trip.userDatePicks && trip.userDatePicks.length > 0
    const userHasVoted = !!trip.userVote

    if (trip.status === 'voting') {
      return {
        type: 'DATES',
        title: userHasVoted ? 'Waiting on votes' : 'Vote on dates',
        description: userHasVoted
          ? 'Waiting for others to vote before dates can be locked'
          : 'Choose your preferred date window',
        ctaLabel: userHasVoted ? 'View Votes' : 'Vote Now',
        icon: Calendar
      }
    }

    return {
      type: 'DATES',
      title: userHasPicked ? 'Waiting on dates' : 'Pick your dates',
      description: userHasPicked
        ? 'Waiting for others to respond before dates can be locked'
        : 'Share your date preferences to help coordinate the trip',
      ctaLabel: userHasPicked ? 'View Progress' : 'Pick Dates',
      icon: Calendar
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
      icon: ListTodo
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
      icon: Home
    }
  }

  // No blockers - trip is ready to lock
  return {
    type: 'READY',
    title: 'Ready to go!',
    description: 'All decisions are made. Time to enjoy the trip!',
    ctaLabel: 'View Trip',
    icon: CheckCircle2
  }
}

interface NudgeInfo {
  type: 'waiting' | 'ready' | 'action' | 'complete'
  message: string
}

interface LLMBlockerInfo {
  type: BlockerType
  confidence: number
  reasoning?: string
  recommendedAction?: string
  usedLLM: boolean
}

interface TripFocusBannerProps {
  trip: any
  onAction?: (blockerType: BlockerType) => void
  /** Optional LLM-derived blocker info (Phase 6) */
  llmBlocker?: LLMBlockerInfo | null
  /** Optional nudge message (Phase 6) */
  nudge?: NudgeInfo | null
  /** Show LLM indicator badge */
  showLLMIndicator?: boolean
}

/**
 * TripFocusBanner - Always answers "What's blocking this trip?"
 *
 * Displays the current primary blocker with:
 * - One-line explanation
 * - Primary CTA
 * - Optional nudge message (Phase 6)
 * - Optional LLM confidence indicator (Phase 6)
 */
export function TripFocusBanner({
  trip,
  onAction,
  llmBlocker,
  nudge,
  showLLMIndicator = false
}: TripFocusBannerProps) {
  // Use LLM blocker type if available, otherwise derive from trip
  const heuristicBlocker = useMemo(() => deriveBlocker(trip), [trip])

  // If LLM provided a blocker type, use it to get the display info but keep heuristic details
  const blocker = useMemo(() => {
    if (llmBlocker?.type && llmBlocker.type !== heuristicBlocker.type) {
      // LLM detected different blocker - rebuild with that type
      const blockerMap: Record<BlockerType, Partial<BlockerInfo>> = {
        DATES: { icon: Calendar },
        ITINERARY: { icon: ListTodo },
        ACCOMMODATION: { icon: Home },
        READY: { icon: CheckCircle2 }
      }
      return {
        ...heuristicBlocker,
        type: llmBlocker.type,
        icon: blockerMap[llmBlocker.type]?.icon || heuristicBlocker.icon,
        // Use LLM's recommended action if available
        description: llmBlocker.recommendedAction || heuristicBlocker.description
      }
    }
    return heuristicBlocker
  }, [heuristicBlocker, llmBlocker])

  const Icon = blocker.icon

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

  const nudgeClasses = {
    waiting: 'text-amber-700 bg-amber-50',
    ready: 'text-green-700 bg-green-50',
    action: 'text-blue-700 bg-blue-50',
    complete: 'text-green-700 bg-green-50'
  }

  return (
    <div className="space-y-2">
      <Card className={`${colorClasses[blocker.type]} border-2`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`p-2 rounded-full bg-white ${iconClasses[blocker.type]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{blocker.title}</h3>
                  {showLLMIndicator && llmBlocker?.usedLLM && (
                    <span className="text-xs px-1.5 py-0.5 bg-white/50 rounded text-gray-500">
                      AI ({Math.round((llmBlocker.confidence || 0) * 100)}%)
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 truncate">{blocker.description}</p>
              </div>
            </div>
            {/* Only show CTA button when there's an actionable blocker */}
            {blocker.type !== 'READY' && (
              <Button
                className={buttonClasses[blocker.type]}
                onClick={() => onAction?.(blocker.type)}
              >
                {blocker.ctaLabel}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phase 6: Nudge message */}
      {nudge && (
        <div className={`text-sm px-4 py-2 rounded-lg ${nudgeClasses[nudge.type] || 'text-gray-600 bg-gray-50'}`}>
          {nudge.message}
        </div>
      )}
    </div>
  )
}
