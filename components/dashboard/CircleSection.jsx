'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TripCard } from './TripCard'
import { Button } from '@/components/ui/button'
import { CreateTripDialog } from './CreateTripDialog'
import { Plus, Users } from 'lucide-react'
import Link from 'next/link'

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
 */

/**
 * @param {Object} props
 * @param {CircleData} props.circle
 * @param {string} props.token - Auth token
 * @param {Function} [props.onTripCreated] - Callback when trip is created
 */
export function CircleSection({ circle, token, onTripCreated }) {
  const [showCreateTrip, setShowCreateTrip] = useState(false)

  return (
    <>
      <Card id={`circle-${circle.id}`} className="mb-6 scroll-mt-4">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-600" />
              <h2 className="text-xl font-semibold">
                <Link href={`/?circleId=${circle.id}`} className="hover:underline">
                  {circle.name}
                </Link>
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateTrip(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create trip
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 w-full">
          {circle.trips.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm mb-4">No trips yet in this circle</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateTrip(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create trip
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
              {circle.trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} circleId={circle.id} />
              ))}
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
