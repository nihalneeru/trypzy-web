'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TripCard } from './TripCard'
import { Button } from '@/components/ui/button'
import { CreateTripDialog } from './CreateTripDialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Plus, Users, ChevronDown, ChevronRight, XCircle, Crown, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { dashboardCircleHref } from '@/lib/navigation/routes'

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
 * @property {boolean} [isCurrentUserTraveler]
 */

/**
 * @typedef {Object} CircleData
 * @property {string} id
 * @property {string} name
 * @property {'owner'|'member'} role
 * @property {TripData[]} trips
 * @property {TripData[]} cancelledTrips
 */

/**
 * @param {Object} props
 * @param {CircleData} props.circle
 * @param {string} props.token - Auth token
 * @param {string} [props.currentUserId] - Current user's ID
 * @param {Function} [props.onTripCreated] - Callback when trip is created
 */
export function CircleSection({ circle, token, currentUserId, onTripCreated }) {
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [showLeading, setShowLeading] = useState(true)
  const [showTraveler, setShowTraveler] = useState(true)
  const [showCompleted, setShowCompleted] = useState(true)
  const [showOther, setShowOther] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const allTrips = circle.trips || []
  const cancelledTrips = circle.cancelledTrips || []

  // Deterministic, non-overlapping classification (priority order):
  // 1. canceled (already separated by backend)
  // 2. completed
  // 3. isLeader (createdBy === currentUserId)
  // 4. isTraveler (active participant, not leader)
  // 5. other (circle member, not leader, not traveler)
  const now = new Date()
  const isCompleted = (trip) =>
    trip.status === 'completed' ||
    (trip.endDate && new Date(trip.endDate) < now)

  const completedTrips = allTrips.filter((t) => isCompleted(t))
  const leaderTrips = allTrips.filter(
    (t) => !isCompleted(t) && t.createdBy === currentUserId
  )
  const travelerTrips = allTrips.filter(
    (t) => !isCompleted(t) && t.createdBy !== currentUserId && t.isCurrentUserTraveler
  )
  const otherTrips = allTrips.filter(
    (t) => !isCompleted(t) && t.createdBy !== currentUserId && !t.isCurrentUserTraveler
  )

  return (
    <>
      <Card id={`circle-${circle.id}`} className="mb-6 scroll-mt-4">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-600" aria-hidden="true" />
              <h2 className="text-xl font-semibold">
                <Link href={dashboardCircleHref(circle.id)} className="hover:underline">
                  {circle.name}
                </Link>
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateTrip(true)}
            >
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Create trip
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 w-full">
          {allTrips.length === 0 && cancelledTrips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm mb-4">No trips yet in this circle</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateTrip(true)}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Create trip
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Trips you are leading (expanded by default, collapsible) */}
              {leaderTrips.length > 0 && (
                <Collapsible open={showLeading} onOpenChange={setShowLeading}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showLeading ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Crown className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    <span className="font-semibold text-gray-600 uppercase tracking-wide">Trips you are leading ({leaderTrips.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch mt-2">
                      {leaderTrips.map((trip) => (
                        <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Trips you are a traveler on (expanded by default, collapsible) */}
              {travelerTrips.length > 0 && (
                <Collapsible open={showTraveler} onOpenChange={setShowTraveler}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showTraveler ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <Users className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    <span className="font-semibold text-gray-600 uppercase tracking-wide">Trips you are a traveler on ({travelerTrips.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch mt-2">
                      {travelerTrips.map((trip) => (
                        <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Completed Trips (expanded by default, collapsible) */}
              {completedTrips.length > 0 && (
                <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showCompleted ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Completed ({completedTrips.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch mt-2 opacity-60">
                      {completedTrips.map((trip) => (
                        <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Other trips in this circle (collapsed by default) */}
              {otherTrips.length > 0 && (
                <Collapsible open={showOther} onOpenChange={setShowOther}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showOther ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span>Other trips in this circle ({otherTrips.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch mt-2">
                      {otherTrips.map((trip) => (
                        <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Canceled Trips (collapsed by default, at bottom) */}
              {cancelledTrips.length > 0 && (
                <Collapsible open={showCancelled} onOpenChange={setShowCancelled}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showCancelled ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <XCircle className="h-4 w-4" />
                    <span>Canceled ({cancelledTrips.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch mt-2 opacity-60">
                      {cancelledTrips.map((trip) => (
                        <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
