'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Users, Calendar, Clock, Info } from 'lucide-react'
import Link from 'next/link'
import { tripHref } from '@/lib/navigation/routes'
import { TripProgressMini } from './TripProgressMini'
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
  // Ensure pendingActions exists (default to empty array)
  const pendingActions = trip.pendingActions || []
  
  // Use tripHref without tab query - always land on Chat tab by default
  // Deep-links should be explicit via ?tab= query, not inferred from pending actions
  const tripUrl = tripHref(trip.id)
  
  // Get primary label from pending actions if available, otherwise default
  const primaryLabel = pendingActions.length > 0 
    ? pendingActions[0].label 
    : 'View Trip'
  
  return (
    <Link href={tripUrl} className="block h-full min-w-0" data-testid={`trip-card-${trip.id}`}>
      <Card className="cursor-pointer hover:shadow-lg transition-shadow aspect-square flex flex-col h-full min-w-0">
        <CardContent className="p-4 flex flex-col h-full min-w-0">
          {/* Header with info icon */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1 line-clamp-2">{trip.name}</h3>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-shrink-0 ml-2 pointer-events-auto">
                    <Info className="h-4 w-4 text-gray-400" />
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
            <Users className="h-3 w-3" />
            <span>{trip.travelerCount} {trip.travelerCount === 1 ? 'traveler' : 'travelers'}</span>
          </div>
          
          {/* Date range */}
          <div className="flex items-center gap-1 text-sm text-gray-600 mb-3">
            <Calendar className="h-3 w-3" />
            <span className="line-clamp-1">{formatDateRange(trip.startDate, trip.endDate)}</span>
          </div>
          
          {/* Latest activity */}
          {trip.latestActivity && (
            <div className="flex items-start gap-1 text-xs text-gray-500 mb-3 flex-1">
              <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2">{trip.latestActivity.text}</p>
                {trip.latestActivity.createdAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    {formatRelativeTime(trip.latestActivity.createdAt)}
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Primary CTA - Use span styled as button since card is already a Link */}
          <div className="mt-auto pt-2">
            <div 
              className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors w-full h-8 px-3 ${
                pendingActions.length > 0
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
