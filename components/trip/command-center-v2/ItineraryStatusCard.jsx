'use client'

import { Map, ChevronRight } from 'lucide-react'
import { isTripCompleted } from '@/lib/trips/isTripCompleted'

/**
 * ItineraryStatusCard — pinned above chat, shows itinerary progress.
 * Reads trip.itineraryStatus and trip.ideaSummary (already on trip response).
 * Only shows after dates are locked. Returns null otherwise.
 */
export function ItineraryStatusCard({ trip, user, onOpenItinerary }) {
  const itineraryStatus = trip?.itineraryStatus
  const datesLocked = trip?.status === 'locked' || !!(trip?.lockedStartDate && trip?.lockedEndDate)

  // Only show after dates are locked and before trip is complete/canceled
  if (!datesLocked) return null
  if (trip?.status === 'completed' || trip?.status === 'canceled' || trip?.tripStatus === 'CANCELLED' || isTripCompleted(trip)) return null
  if (!itineraryStatus) return null

  const isLeader = trip?.createdBy === user?.id
  const ideaSummary = trip?.ideaSummary || { totalCount: 0, userIdeaCount: 0 }

  if (itineraryStatus === 'collecting_ideas') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenItinerary}
          className="w-full text-left rounded-lg border border-brand-sand bg-brand-sand/40 px-3 py-2.5 transition-colors hover:bg-brand-sand/60 active:bg-brand-sand/80"
        >
          <div className="flex items-start gap-2.5">
            <Map className="h-4 w-4 text-brand-carbon/60 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-carbon">
                  {ideaSummary.totalCount === 0
                    ? 'No ideas shared yet'
                    : `${ideaSummary.totalCount} idea${ideaSummary.totalCount === 1 ? '' : 's'} shared so far`}
                </p>
                <ChevronRight className="h-4 w-4 text-brand-carbon/40 shrink-0" />
              </div>

              {isLeader && ideaSummary.totalCount > 0 && (
                <p className="text-xs font-medium text-brand-blue mt-1">
                  You can generate the itinerary when ready
                </p>
              )}
            </div>
          </div>

          {/* CTA hint */}
          <div className="mt-2 flex justify-end">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              ideaSummary.userIdeaCount === 0
                ? 'bg-brand-red text-white'
                : 'bg-brand-blue/10 text-brand-blue'
            }`}>
              {ideaSummary.userIdeaCount === 0 ? 'Add an idea' : 'View ideas'}
            </span>
          </div>
        </button>
      </div>
    )
  }

  if (itineraryStatus === 'drafting') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Map className="h-4 w-4 text-amber-700 shrink-0" />
            <p className="text-sm font-medium text-brand-carbon">
              Itinerary is being generated...
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (itineraryStatus === 'published' || itineraryStatus === 'selected') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenItinerary}
          className="w-full text-left rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 transition-colors hover:bg-green-100 active:bg-green-200/60"
        >
          <div className="flex items-start gap-2.5">
            <Map className="h-4 w-4 text-green-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-carbon">
                  Itinerary is ready
                </p>
                <ChevronRight className="h-4 w-4 text-brand-carbon/40 shrink-0" />
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-blue/10 text-brand-blue">
              View itinerary
            </span>
          </div>
        </button>
      </div>
    )
  }

  if (itineraryStatus === 'revising') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Map className="h-4 w-4 text-amber-700 shrink-0" />
            <p className="text-sm font-medium text-brand-carbon">
              Itinerary is being revised...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
