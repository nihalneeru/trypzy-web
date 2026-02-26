'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CreateTripDialog } from './CreateTripDialog'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { tripHref, circlePageHref } from '@/lib/navigation/routes'
import { formatTripDateRange } from '@/lib/utils'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Arrange avatars in a circular/arc pattern using absolute positioning.
 * Returns an array of { x, y } offsets (percentage-based) for each avatar.
 */
function getAvatarRingPositions(count, maxVisible = 6) {
  const n = Math.min(count, maxVisible)
  if (n <= 0) return []
  // For 1-2 members, just center them
  if (n === 1) return [{ x: 50, y: 50 }]
  if (n === 2) return [{ x: 32, y: 50 }, { x: 68, y: 50 }]

  const positions = []
  // Start from top (-90deg) and distribute evenly
  for (let i = 0; i < n; i++) {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180)
    const radius = 38 // percentage from center
    positions.push({
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
    })
  }
  return positions
}

function TripChip({ trip }) {
  const actionRequired = trip.actionRequired === true
  const pendingActions = trip.pendingActions || []

  let ctaLabel = 'View'
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
      ctaLabel = 'Add dates'
    } else if (trip.status === 'voting') {
      ctaLabel = 'Vote'
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

  const hasRecentActivity = (() => {
    if (trip.status === 'completed' || trip.status === 'canceled') return false
    const ts = trip.latestActivity?.createdAt
    if (!ts) return false
    return (Date.now() - new Date(ts).getTime()) < 24 * 60 * 60 * 1000
  })()

  return (
    <Link
      href={tripHref(trip.id)}
      className={`block rounded-xl bg-white shadow-sm px-3 py-2.5 hover:shadow-md transition-shadow ${isStalled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm text-brand-carbon truncate flex items-center gap-1.5">
          {actionRequired && (
            <span className="inline-block w-2 h-2 rounded-full bg-brand-red flex-shrink-0" />
          )}
          {trip.name}
          {hasRecentActivity && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-blue opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-blue" />
            </span>
          )}
        </span>
        <span className="text-xs text-brand-carbon/40 whitespace-nowrap flex-shrink-0">
          {dateText}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-xs text-brand-carbon/60 truncate">
          {actionRequired ? 'Waiting on you' : `${trip.travelerCount} ${trip.travelerCount === 1 ? 'traveler' : 'travelers'}`}
        </span>
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
  const visibleTrips = sortedActive.slice(0, 3)
  const overflowCount = sortedActive.length - visibleTrips.length

  // Avatar ring layout
  const maxRingAvatars = 6
  const ringMembers = preview.slice(0, maxRingAvatars)
  const ringPositions = getAvatarRingPositions(ringMembers.length, maxRingAvatars)
  const hasOverflow = memberCount > maxRingAvatars

  return (
    <>
      <div className="rounded-3xl bg-white shadow-sm border border-brand-sand/60 w-full max-w-[460px] overflow-hidden">
        {/* Avatar ring hero */}
        <div className="bg-brand-sand/30 pt-6 pb-4 px-6">
          <div className="relative w-28 h-28 mx-auto mb-3">
            {ringMembers.map((member, i) => {
              const pos = ringPositions[i]
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <Avatar className="h-9 w-9 ring-2 ring-white shadow-sm">
                    {member.image && <AvatarImage src={member.image} alt={member.name} />}
                    <AvatarFallback className="text-xs bg-brand-blue text-white font-medium">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )
            })}
            {hasOverflow && (
              <div
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <span className="flex items-center justify-center h-8 w-8 rounded-full bg-brand-sand text-xs font-bold text-brand-carbon ring-2 ring-white shadow-sm">
                  +{memberCount - maxRingAvatars}
                </span>
              </div>
            )}
          </div>

          <Link
            href={circlePageHref(circle.id)}
            className="block text-center"
          >
            <h3 className="text-lg font-bold text-brand-carbon hover:text-brand-blue transition-colors">
              {circle.name}
            </h3>
          </Link>
          <p className="text-xs text-brand-carbon/60 text-center mt-0.5">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
            {sortedActive.length > 0 && (
              <> · {sortedActive.length} active {sortedActive.length === 1 ? 'trip' : 'trips'}</>
            )}
          </p>
        </div>

        {/* Trip list */}
        <div className="px-4 py-4">
          {visibleTrips.length === 0 && archivedCount === 0 ? (
            <p className="text-sm text-brand-carbon/40 text-center py-2">No trips yet</p>
          ) : (
            <div className="space-y-2">
              {visibleTrips.map((trip) => (
                <TripChip key={trip.id} trip={trip} />
              ))}
            </div>
          )}

          {overflowCount > 0 && (
            <Link
              href={circlePageHref(circle.id)}
              className="block text-center text-xs text-brand-blue hover:underline mt-2"
            >
              +{overflowCount} more {overflowCount === 1 ? 'trip' : 'trips'}
            </Link>
          )}

          {/* Archived toggle */}
          {archivedCount > 0 && (
            <div className="mt-3 pt-3 border-t border-brand-sand/50">
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="flex items-center gap-1 text-xs text-brand-carbon/40 hover:text-brand-carbon/70 mx-auto"
              >
                {showArchived ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>{archivedCount} past {archivedCount === 1 ? 'trip' : 'trips'}</span>
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

          {/* Plan a trip */}
          <div className="mt-3 pt-3 border-t border-brand-sand/50 text-center">
            <button
              onClick={() => setShowCreateTrip(true)}
              className="inline-flex items-center gap-1 text-sm text-brand-blue hover:text-brand-blue/80 font-medium"
            >
              <Plus className="h-4 w-4" />
              Plan a trip
            </button>
          </div>
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
