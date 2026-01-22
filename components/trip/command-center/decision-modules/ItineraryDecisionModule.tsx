'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, ListTodo, Check, Lightbulb } from 'lucide-react'

interface ItineraryDecisionModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  onOpenLegacyTab: (tab: string) => void
  isPrimaryBlocker?: boolean
}

/**
 * ItineraryDecisionModule - Wrapper for itinerary planning decisions
 *
 * Shows itinerary status summary with action button.
 * Full itinerary UI is complex - links to legacy tab for actions.
 */
export function ItineraryDecisionModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  onOpenLegacyTab,
  isPrimaryBlocker = false
}: ItineraryDecisionModuleProps) {
  // Itinerary status - available at any trip stage
  const itineraryStatus = trip?.itineraryStatus || 'not_started'
  const isFinalized = itineraryStatus === 'selected' || itineraryStatus === 'published'
  const isDraft = itineraryStatus === 'draft'
  const isNotStarted = itineraryStatus === 'not_started' || !itineraryStatus

  // Determine status - itinerary is available at any stage
  const isComplete = isFinalized
  const isActive = !isFinalized

  // Status message
  const getStatusMessage = () => {
    if (isFinalized) return 'Itinerary finalized and ready'
    if (isDraft) return 'Draft itinerary in progress'
    return 'Add ideas and generate your itinerary'
  }

  // Action message
  const getActionMessage = () => {
    if (isFinalized) return null
    if (isDraft) return 'Review and finalize the itinerary'
    return 'Start planning your activities'
  }

  // Phase 5: De-emphasize non-blocker modules visually
  const getCardClasses = () => {
    if (isComplete) return 'border-green-200'
    if (!isPrimaryBlocker) return 'border-gray-200 opacity-75'
    if (isActive) return 'border-purple-300 shadow-md'
    return 'border-gray-200'
  }

  return (
    <Card className={`transition-all ${getCardClasses()}`}>
      <CardHeader
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isComplete ? 'bg-green-100' : isActive && isPrimaryBlocker ? 'bg-purple-100' : 'bg-gray-100'}`}>
              {isComplete ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <ListTodo className={`h-5 w-5 ${isActive && isPrimaryBlocker ? 'text-purple-600' : 'text-gray-400'}`} />
              )}
            </div>
            <div>
              <CardTitle className={`text-base flex items-center gap-2 ${!isPrimaryBlocker && !isComplete ? 'text-gray-500' : ''}`}>
                Itinerary
                {isComplete && (
                  <Badge className="bg-green-100 text-green-800 text-xs">Complete</Badge>
                )}
                {isDraft && isPrimaryBlocker && (
                  <Badge className="bg-yellow-100 text-yellow-800 text-xs">Draft</Badge>
                )}
                {isNotStarted && isPrimaryBlocker && (
                  <Badge className="bg-purple-100 text-purple-800 text-xs">Action Needed</Badge>
                )}
              </CardTitle>
              <p className="text-sm text-gray-500">{getStatusMessage()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 8: Quick-action CTA visible even when collapsed
                Phase 9: Will expand module and show inline itinerary UI */}
            {!isExpanded && !isFinalized && (
              <Button
                size="sm"
                variant={isPrimaryBlocker ? 'default' : 'outline'}
                className={isPrimaryBlocker ? 'bg-purple-600 hover:bg-purple-700' : 'text-gray-500 border-gray-300'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle() // Expand first, show content
                }}
              >
                {isDraft ? 'Review' : 'Plan'}
              </Button>
            )}
            <Button variant="ghost" size="sm">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-4">
            {/* Completed state */}
            {isFinalized && (
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Itinerary is ready</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  Your day-by-day plan has been finalized.
                </p>
              </div>
            )}

            {/* Action prompt - Phase 8: Always show CTA for visibility
                Phase 9: Replace onOpenLegacyTab with inline itinerary UI */}
            {getActionMessage() && (
              <div className={`flex items-center justify-between rounded-lg p-4 ${isPrimaryBlocker ? 'bg-purple-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <Lightbulb className={`h-5 w-5 ${isPrimaryBlocker ? 'text-purple-600' : 'text-gray-400'}`} />
                  <span className={isPrimaryBlocker ? 'text-purple-800' : 'text-gray-600'}>{getActionMessage()}</span>
                </div>
                <Button
                  size="sm"
                  className={isPrimaryBlocker
                    ? 'bg-purple-600 hover:bg-purple-700 text-white font-medium'
                    : 'bg-gray-600 hover:bg-gray-700 text-white font-medium'}
                  onClick={(e) => {
                    e.stopPropagation()
                    // Phase 9: Replace with inline itinerary component
                    onOpenLegacyTab('itinerary')
                  }}
                >
                  {isDraft ? 'Review Draft' : 'Plan Itinerary'}
                </Button>
              </div>
            )}

            {/* View button for completed - Phase 9: Show inline itinerary view */}
            {isFinalized && (
              <Button
                variant="outline"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation()
                  // Phase 9: Replace with inline itinerary view
                  onOpenLegacyTab('itinerary')
                }}
              >
                View Full Itinerary
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
