'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Home, Check } from 'lucide-react'
import { AccommodationShortlist } from '../AccommodationShortlist'
import { useAccommodationPreferences } from '@/hooks/use-trip-intelligence'

interface AccommodationDecisionModuleProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  isExpanded: boolean
  onToggle: () => void
  isPrimaryBlocker?: boolean
}

/**
 * AccommodationDecisionModule - Phase 7 Constrained MVP
 *
 * Renders AccommodationShortlist (max 3 options, vote/confirm/lock flow)
 * instead of full AccommodationTab browsing experience.
 * Fetches LLM-extracted preferences from chat to display context.
 */
export function AccommodationDecisionModule({
  trip,
  token,
  user,
  onRefresh,
  isExpanded,
  onToggle,
  isPrimaryBlocker = false
}: AccommodationDecisionModuleProps) {
  // Fetch LLM-extracted accommodation preferences from chat
  const { preferences, loading: preferencesLoading } = useAccommodationPreferences({
    tripId: trip?.id,
    token,
    enabled: !!trip?.id && trip.status === 'locked'
  })

  // Check if accommodation is the current blocker
  const datesLocked = trip?.status === 'locked'
  const itineraryFinalized = trip?.itineraryStatus === 'selected' || trip?.itineraryStatus === 'published'
  const accommodationChosen = trip?.progress?.steps?.accommodationChosen || false

  // Only show if dates are locked (accommodation requires locked dates)
  if (!datesLocked) {
    return null
  }

  // Determine status
  const isComplete = accommodationChosen
  const isActive = datesLocked && itineraryFinalized && !accommodationChosen

  // Phase 5: De-emphasize non-blocker modules visually
  const getCardClasses = () => {
    if (isComplete) return 'border-green-200'
    if (!isPrimaryBlocker) return 'border-gray-200 opacity-75'
    if (isActive) return 'border-orange-300 shadow-md'
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
            <div className={`p-2 rounded-full ${isComplete ? 'bg-green-100' : isActive && isPrimaryBlocker ? 'bg-orange-100' : 'bg-gray-100'}`}>
              {isComplete ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <Home className={`h-5 w-5 ${isActive && isPrimaryBlocker ? 'text-orange-600' : 'text-gray-400'}`} />
              )}
            </div>
            <div>
              <CardTitle className={`text-base flex items-center gap-2 ${!isPrimaryBlocker && !isComplete ? 'text-gray-500' : ''}`}>
                Accommodation
                {isComplete && (
                  <Badge className="bg-green-100 text-green-800 text-xs">Complete</Badge>
                )}
                {isActive && isPrimaryBlocker && (
                  <Badge className="bg-orange-100 text-orange-800 text-xs">Action Needed</Badge>
                )}
              </CardTitle>
              <p className="text-sm text-gray-500">
                {isComplete
                  ? 'Accommodation has been selected'
                  : 'Vote on where to stay'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 8: Quick-action CTA visible even when collapsed */}
            {!isExpanded && !isComplete && (
              <Button
                size="sm"
                variant={isPrimaryBlocker ? 'default' : 'outline'}
                className={isPrimaryBlocker ? 'bg-orange-600 hover:bg-orange-700' : 'text-gray-500 border-gray-300'}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
              >
                Vote
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
          <AccommodationShortlist
            trip={trip}
            token={token}
            user={user}
            onRefresh={onRefresh}
            preferences={preferences}
          />
        </CardContent>
      )}
    </Card>
  )
}
