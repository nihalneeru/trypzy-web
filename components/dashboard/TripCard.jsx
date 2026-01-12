'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Calendar, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { getTripPrimaryHref } from '@/lib/dashboard/getTripPrimaryHref'

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
 * Get status badge variant
 * @param {string} status
 * @returns {string}
 */
function getStatusBadgeVariant(status) {
  switch (status) {
    case 'locked':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'voting':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'scheduling':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'proposed':
      return 'bg-gray-100 text-gray-800 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
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
 */
export function TripCard({ trip }) {
  // Ensure pendingActions exists (default to empty array)
  const pendingActions = trip.pendingActions || []
  const { href: primaryHref, label: primaryLabel } = getTripPrimaryHref(trip, pendingActions)
  
  // Runtime check in dev mode
  if (process.env.NODE_ENV === 'development' && !primaryHref) {
    console.warn('TripCard: Missing primaryHref for trip', trip.id)
  }
  
  return (
    <Link href={primaryHref || `/trips/${trip.id}`} className="block h-full">
      <Card className="cursor-pointer hover:shadow-lg transition-shadow aspect-square flex flex-col h-full">
        <CardContent className="p-4 flex flex-col h-full">
          {/* Header with status and pending indicator */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base mb-1 line-clamp-2">{trip.name}</h3>
            </div>
            {pendingActions.length > 0 && (
              <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 ml-2" />
            )}
          </div>
          
          {/* Status badge */}
          <div className="mb-3">
            <Badge className={getStatusBadgeVariant(trip.status)}>
              {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
            </Badge>
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
