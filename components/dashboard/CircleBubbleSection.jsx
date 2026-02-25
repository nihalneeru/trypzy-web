'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { CreateTripDialog } from './CreateTripDialog'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { tripHref, circlePageHref } from '@/lib/navigation/routes'
import { formatTripDateRange } from '@/lib/utils'
import { getTripCountdownLabel } from '@/lib/trips/getTripCountdownLabel'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function TripChip({ trip }) {
  const actionRequired = trip.actionRequired === true
  const pendingActions = trip.pendingActions || []

  let ctaLabel = 'View trip'
  if (actionRequired) {
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
      ctaLabel = requiredAction.label
    } else if (trip.status === 'proposed' || trip.status === 'scheduling') {
      ctaLabel = trip.schedulingMode === 'top3_heatmap' ? 'Pick your dates' : 'Add your dates'
    } else if (trip.status === 'voting') {
      ctaLabel = 'Vote on dates'
    }
  }

  const dateText = trip.startDate && trip.endDate
    ? formatTripDateRange(trip.startDate, trip.endDate)
    : 'Dates not set'

  const isStalled = (() => {
    const ts = trip.latestActivity?.createdAt
    if (!ts) return false
    return (Date.now() - new Date(ts).getTime()) > 7 * 24 * 60 * 60 * 1000
  })()

  // Active pulse: activity within last 24 hours
  const hasRecentActivity = (() => {
    const ts = trip.latestActivity?.createdAt
    if (!ts) return false
    return (Date.now() - new Date(ts).getTime()) < 24 * 60 * 60 * 1000
  })()

  return (
    <Link
      href={tripHref(trip.id)}
      className={`block rounded-xl bg-white shadow-sm p-3 hover:shadow-md transition-shadow ${isStalled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-brand-carbon truncate flex items-center gap-1.5">
          {trip.name}
          {hasRecentActivity && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-blue opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-blue" />
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
          {dateText}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {actionRequired && (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-brand-red flex-shrink-0" />
              <span className="text-xs text-brand-red font-medium truncate">Waiting on you</span>
            </>
          )}
          {!actionRequired && (
            <span className="text-xs text-gray-400 truncate">
              {trip.travelerCount} {trip.travelerCount === 1 ? 'traveler' : 'travelers'}
            </span>
          )}
        </div>
        <span className={`text-xs font-medium whitespace-nowrap ${actionRequired ? 'text-brand-red' : 'text-brand-blue'}`}>
          {ctaLabel} →
        </span>
      </div>
    </Link>
  )
}

export function CircleBubbleSection({ circle, token, currentUserId, onTripCreated }) {
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const allTrips = circle.trips || []
  const cancelledTrips = circle.cancelledTrips || []
  const preview = circle.memberPreview || []
  const memberCount = circle.memberCount || 0

  const now = new Date()
  const isCompleted = (trip) =>
    trip.status === 'completed' ||
    (trip.endDate && new Date(trip.endDate) < now)

  const completedTrips = allTrips.filter((t) => isCompleted(t))
  const activeTrips = allTrips.filter((t) => !isCompleted(t))

  const sortedActive = [...activeTrips].sort((a, b) => {
    if (a.actionRequired && !b.actionRequired) return -1
    if (!a.actionRequired && b.actionRequired) return 1
    return 0
  })

  const archivedCount = completedTrips.length + cancelledTrips.length

  return (
    <>
      <div className="rounded-[2.5rem] bg-brand-sand/20 border-2 border-brand-sand/60 p-6 w-full max-w-[420px]">
        <div className="text-center mb-4">
          <Link
            href={circlePageHref(circle.id)}
            className="text-lg font-bold text-brand-carbon hover:text-brand-blue transition-colors"
          >
            {circle.name}
          </Link>
          <div className="flex items-center justify-center gap-1 mt-2">
            {preview.slice(0, 4).map((member, i) => (
              <Avatar key={i} className="h-6 w-6 ring-1 ring-white">
                {member.image && <AvatarImage src={member.image} alt={member.name} />}
                <AvatarFallback className="text-[8px] bg-brand-blue text-white font-medium">
                  {getInitials(member.name)}
                </AvatarFallback>
              </Avatar>
            ))}
            {memberCount > 4 && (
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-brand-blue text-[8px] font-bold text-white ring-1 ring-white">
                +{memberCount - 4}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </p>
        </div>

        {sortedActive.length === 0 && archivedCount === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-400">No trips yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedActive.map((trip) => (
              <TripChip key={trip.id} trip={trip} />
            ))}
          </div>
        )}

        {archivedCount > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mx-auto"
            >
              {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>{archivedCount} {archivedCount === 1 ? 'past trip' : 'past trips'}</span>
            </button>
            {showArchived && (
              <div className="space-y-2 mt-2 opacity-50">
                {completedTrips.map((trip) => (
                  <TripChip key={trip.id} trip={trip} />
                ))}
                {cancelledTrips.map((trip) => (
                  <TripChip key={trip.id} trip={trip} />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="text-center mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreateTrip(true)}
            className="text-brand-blue hover:text-brand-blue/80 hover:bg-brand-sand/40"
          >
            <Plus className="h-4 w-4 mr-1" />
            Plan a trip
          </Button>
        </div>
      </div>

      {token && (
        <CreateTripDialog
          open={showCreateTrip}
          onOpenChange={setShowCreateTrip}
          onSuccess={onTripCreated}
          circleId={circle.id}
          token={token}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
