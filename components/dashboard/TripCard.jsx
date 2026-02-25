'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'
import { tripHref } from '@/lib/navigation/routes'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { getTripCountdownLabel } from '@/lib/trips/getTripCountdownLabel'
import { formatTripDateRange } from '@/lib/utils'

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
 * Get status display info (dot color + label)
 * @param {string} status
 * @returns {{ dotClass: string, label: string }}
 */
function getStatusDisplay(status) {
  switch (status) {
    case 'proposed':
    case 'scheduling':
      return { dotClass: 'bg-brand-red', label: 'Picking dates' }
    case 'voting':
      return { dotClass: 'bg-brand-red', label: 'Voting on dates' }
    case 'locked':
      return { dotClass: 'bg-brand-blue', label: 'Dates locked' }
    case 'completed':
      return { dotClass: 'bg-gray-400', label: 'Completed' }
    case 'canceled':
      return { dotClass: 'bg-gray-400', label: 'Canceled' }
    default:
      return { dotClass: 'bg-gray-400', label: status || 'Unknown' }
  }
}

/**
 * @param {Object} props
 * @param {TripData} props.trip
 * @param {string} [props.circleId] - Optional circle ID for returnTo parameter
 */
export function TripCard({ trip, circleId = null }) {
  const [navigating, setNavigating] = useState(false)
  const [expanded, setExpanded] = useState(false)

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
        primaryLabel = trip.schedulingMode === 'top3_heatmap' ? 'Pick your dates' : 'Add your dates'
      } else if (trip.status === 'voting') {
        primaryLabel = 'Vote on dates'
      }
    }
  }
  
  // Get countdown label if dates are locked
  const countdownLabel = getTripCountdownLabel(trip, trip.name)

  // Stalled trip: no activity for 7+ days — subtle warmth tint (#296)
  const isStalled = (() => {
    const ts = trip.latestActivity?.createdAt
    if (!ts) return false
    return (Date.now() - new Date(ts).getTime()) > 7 * 24 * 60 * 60 * 1000
  })()

  const { dotClass, label: statusLabel } = getStatusDisplay(trip.status)

  return (
    <Link href={tripUrl} className="block h-full min-w-0" data-testid={`trip-card-${trip.id}`} onClick={() => setNavigating(true)}>
      <Card className={`cursor-pointer hover:shadow-lg transition-shadow flex flex-col h-full min-w-0 relative ${isStalled ? 'bg-brand-sand/20' : ''}`}>
        {navigating && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-lg">
            <BrandedSpinner size="md" />
          </div>
        )}
        <CardContent className="p-4 flex flex-col h-full min-w-0 flex-1">
          {/* Header with expand/collapse toggle */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base line-clamp-1">{trip.name}</h3>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="flex-shrink-0 ml-2 p-1 text-gray-400 hover:text-gray-600"
              aria-label={expanded ? 'Show less' : 'Show more'}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Status dot + label + traveler count */}
          <div className="flex items-center gap-1.5 text-sm text-gray-600 mb-2">
            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden="true" />
            <span>{statusLabel}</span>
            <span className="text-gray-400">&middot;</span>
            <span>{trip.travelerCount} {trip.travelerCount === 1 ? 'traveler' : 'travelers'}</span>
          </div>

          {/* Date range (always visible) */}
          <div className="flex items-center gap-1 text-sm text-gray-600 mb-2">
            <Calendar className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="line-clamp-1">
              {trip.startDate && trip.endDate
                ? formatTripDateRange(trip.startDate, trip.endDate)
                : 'Dates not set'}
            </span>
          </div>

          {/* Expanded section: countdown, activity, waiting badge */}
          {expanded && (
            <div className="space-y-2 mb-2">
              {/* Countdown - shown when dates are locked */}
              {countdownLabel && (
                <div className="text-xs text-gray-500">
                  {countdownLabel}
                </div>
              )}

              {/* Latest activity */}
              {trip.latestActivity && (
                <div className="flex items-start gap-1 text-xs text-gray-500 min-w-0">
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

              {/* "Waiting on you" badge */}
              {trip.actionRequired && (
                <div className="flex items-center">
                  <span className="inline-flex items-center rounded-md bg-brand-sand px-2 py-1 text-xs font-medium text-brand-red border border-brand-red/20">
                    Waiting on you
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Spacer to push CTA to bottom */}
          <div className="flex-1" />

          {/* Primary CTA - Use span styled as button since card is already a Link */}
          <div className="pt-2">
            <div
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors w-full h-11 md:h-9 px-3 ${
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
