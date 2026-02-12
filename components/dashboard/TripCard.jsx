'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Calendar, Clock, Info } from 'lucide-react'
import Link from 'next/link'
import { tripHref } from '@/lib/navigation/routes'
import { TripProgressMini } from './TripProgressMini'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { getTripCountdownLabel } from '@/lib/trips/getTripCountdownLabel'
import { formatTripDateRange } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * @typedef {Object} TripData
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {string|null} startDate
 * @property {string|null} endDate
 * @property {number} travelerCount
 * @property {Object|null} latestActivity
 * @property {Array} pendingActions
 */

/**
 * Format date range for display
 * @param {string|null} startDate
 * @param {string|null} endDate
 * @returns {string}
 */
function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return 'Dates not locked'
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  return `${startFormatted} - ${endFormatted}`
}

/**
 * Format relative time
 * @param {string} timestamp
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60))
      return mins <= 1 ? 'Just now' : `${mins} min ago`
    }
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


/**
 * @param {Object} props
 * @param {TripData} props.trip
 * @param {string} [props.circleId] - Optional circle ID for returnTo parameter
 */
export function TripCard({ trip, circleId = null }) {
  const [navigating, setNavigating] = useState(false)

  // Ensure pendingActions exists (default to empty array)
  const pendingActions = trip.pendingActions || []
  
  // Use tripHref without tab query - always land on Chat tab by default
  // Deep-links should be explicit via ?tab= query, not inferred from pending actions
  const tripUrl = tripHref(trip.id)
  
  // CTA semantics: Use actionRequired as source of truth
  // If actionRequired = true: show red CTA with action-specific text
  // If actionRequired = false: show neutral "View trip"
  const actionRequired = trip.actionRequired === true
  
  // Get CTA text based on actionRequired and trip status
  let primaryLabel = 'View trip'
  if (actionRequired) {
    // Find the relevant action from pendingActions that matches the required action
    // For Dates Picking: "Pick your dates" or "Mark availability"
    // For Voting: "Vote on dates"
    const requiredAction = pendingActions.find(action => {
      if (trip.status === 'proposed' || trip.status === 'scheduling') {
        return action.type === 'scheduling_required'
      }
      if (trip.status === 'voting') {
        return action.type === 'date_vote' && action.label !== 'Finalize dates'
      }
      return false
    })
    
    if (requiredAction) {
      primaryLabel = requiredAction.label
    } else {
      // Fallback: use generic action text based on status
      if (trip.status === 'proposed' || trip.status === 'scheduling') {
        primaryLabel = trip.schedulingMode === 'top3_heatmap' ? 'Pick your dates' : 'Mark availability'
      } else if (trip.status === 'voting') {
        primaryLabel = 'Vote on dates'
      }
    }
  }
  
  // Get countdown label if dates are locked
  const countdownLabel = getTripCountdownLabel(trip, trip.name)
  
  return (
    <Link href={tripUrl} className="block h-full min-w-0" data-testid={`trip-card-${trip.id}`} onClick={() => setNavigating(true)}>
      <Card className="cursor-pointer hover:shadow-lg transition-shadow flex flex-col h-full min-w-0 relative">
        {navigating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-lg">
            <BrandedSpinner size="md" />
          </div>
        )}
        <CardContent className="p-4 flex flex-col h-full min-w-0 flex-1">
          {/* Header with info icon */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1 line-clamp-2">{trip.name}</h3>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 ml-2">
                    <Info className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to open trip</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* Progress indicator */}
          <div className="mb-3">
            <TripProgressMini trip={trip} />
          </div>
          
          {/* Traveler count */}
          <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
            <Users className="h-3 w-3" aria-hidden="true" />
            <span>{trip.travelerCount} {trip.travelerCount === 1 ? 'traveler' : 'travelers'}</span>
          </div>
          
          {/* Date range */}
          <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span className="line-clamp-1">
              {trip.startDate && trip.endDate 
                ? formatTripDateRange(trip.startDate, trip.endDate)
                : 'Dates not locked'}
            </span>
          </div>
          
          {/* Countdown - shown when dates are locked */}
          {countdownLabel && (
            <div className="text-xs text-gray-500 mb-3">
              {countdownLabel}
            </div>
          )}
          
          {/* Latest activity */}
          {trip.latestActivity && (
            <div className="flex items-start gap-1 text-xs text-gray-500 mb-3 min-w-0">
              <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2">{trip.latestActivity.text}</p>
                {trip.latestActivity.createdAt && (
                  <p className="text-xs text-gray-500 mt-1">
                    {formatRelativeTime(trip.latestActivity.createdAt)}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Spacer to push CTA to bottom */}
          <div className="flex-1" />
          
          {/* Primary CTA - Use span styled as button since card is already a Link */}
          <div className="pt-2 space-y-2">
            {/* "Waiting on you" badge - shown when action required */}
            {trip.actionRequired && (
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center rounded-md bg-brand-sand px-2 py-1 text-xs font-medium text-brand-red border border-brand-red/20">
                  Waiting on you
                </span>
              </div>
            )}
            <div
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors w-full h-10 md:h-8 px-3 ${
                actionRequired
                  ? 'bg-primary text-primary-foreground shadow hover:bg-primary/90'
                  : 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {primaryLabel}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
