'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TripCard } from './TripCard'
import { Button } from '@/components/ui/button'
import { CreateTripDialog } from './CreateTripDialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Plus, Users, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
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
 * @param {Function} [props.onTripCreated] - Callback when trip is created
 */
export function CircleSection({ circle, token, onTripCreated }) {
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const activeTrips = circle.trips || []
  const cancelledTrips = circle.cancelledTrips || []

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
          {activeTrips.length === 0 && cancelledTrips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm mb-4">No trips yet in this circle</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateTrip(true)}>
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                Create trip
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Trips */}
              {activeTrips.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full items-stretch">
                  {activeTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} circleId={circle.id} />
                  ))}
                </div>
              )}

              {activeTrips.length === 0 && cancelledTrips.length > 0 && (
                <div className="text-center py-4 text-gray-500">
                  <p className="text-sm mb-4">No active trips</p>
                  <Button variant="outline" size="sm" onClick={() => setShowCreateTrip(true)}>
                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                    Create trip
                  </Button>
                </div>
              )}

              {/* Cancelled Trips Section */}
              {cancelledTrips.length > 0 && (
                <Collapsible open={showCancelled} onOpenChange={setShowCancelled}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 py-2">
                    {showCancelled ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <XCircle className="h-4 w-4" />
                    <span>Cancelled ({cancelledTrips.length})</span>
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
        />
      )}
    </>
  )
}
