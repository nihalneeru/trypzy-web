'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Users,
  Calendar,
  Vote,
  Lock,
  Lightbulb,
  UserPlus,
  Sparkles,
  Home,
  ThumbsUp,
  Check,
  ClipboardList,
  Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeTripProgressSnapshot } from '@/lib/trips/progressSnapshot'

interface CTAConfig {
  label: string
  icon: React.ElementType
  overlayType: string
  priority: number
}

interface SimplifiedCTABarProps {
  trip: any
  user: any
  travelerCount: number
  onOpenOverlay: (overlayType: string) => void
}

/**
 * Simplified CTA bar for Command Center V3.
 *
 * Left: ghost Travelers button.
 * Right: single priority CTA (brand-red).
 * No Expenses/Memories buttons — those are accessible via ProgressStrip pills.
 */
export function SimplifiedCTABar({
  trip,
  user,
  travelerCount,
  onOpenOverlay
}: SimplifiedCTABarProps) {
  const progressSnapshot = useMemo(() => {
    return computeTripProgressSnapshot(trip, user, {
      pickProgress: trip?.pickProgress
    })
  }, [trip, user])

  const ctaConfig = useMemo((): CTAConfig | null => {
    if (!trip || !user) return null

    const isLeader = progressSnapshot.isTripLeader
    const userId = user.id

    // Non-traveler: "Ask to join"
    const viewer = trip.viewer || {}
    if (!viewer.isActiveParticipant && trip.status !== 'canceled') {
      return {
        label: 'Ask to join',
        icon: UserPlus,
        overlayType: 'travelers',
        priority: 0
      }
    }

    const datesLocked = progressSnapshot.datesLocked
    const leaderNeedsToLock = progressSnapshot.leaderNeedsToLock
    const itineraryFinalized = progressSnapshot.itineraryFinalized
    const accommodationChosen = progressSnapshot.accommodationChosen
    const prepStarted = progressSnapshot.prepStarted

    const hasSubmittedDatePicks = trip.userDatePicks && trip.userDatePicks.length > 0
    const userAvailability = trip.availability?.find((a: any) => a.userId === userId)
    const hasSubmittedAvailability = hasSubmittedDatePicks || !!userAvailability?.dates?.length
    const votingOpen = trip.votingStatus === 'open' || trip.dateVotingOpen || trip.status === 'voting'
    const userHasVoted = trip.dateVotes?.some((v: any) => v.userId === userId) || !!trip.userVote
    const userIdeasCount = trip.ideas?.filter(
      (i: any) => i.userId === userId || i.createdBy === userId
    )?.length || 0
    const hasItinerary = trip.itinerary?.days?.length > 0 || itineraryFinalized
    const userHasVotedOnAccommodation = trip.accommodationUserVoted ||
      trip.accommodations?.some((a: any) => a.userVoted)

    if (isLeader && !datesLocked && leaderNeedsToLock) {
      return { label: 'Lock dates', icon: Lock, overlayType: 'scheduling', priority: 1 }
    }
    if (votingOpen && !userHasVoted && !datesLocked) {
      return { label: 'Share your vote', icon: Vote, overlayType: 'scheduling', priority: 2 }
    }
    if (!hasSubmittedAvailability && !datesLocked) {
      return { label: 'Pick your dates', icon: Calendar, overlayType: 'scheduling', priority: 3 }
    }
    if (hasSubmittedAvailability && !datesLocked) {
      return { label: 'Dates in progress', icon: Clock, overlayType: 'scheduling', priority: 3 }
    }
    if (!itineraryFinalized && userIdeasCount < 2 && datesLocked) {
      return { label: 'Suggest an idea', icon: Lightbulb, overlayType: 'itinerary', priority: 4 }
    }
    if (isLeader && !hasItinerary && datesLocked) {
      return { label: 'Generate itinerary', icon: Sparkles, overlayType: 'itinerary', priority: 5 }
    }
    if (itineraryFinalized && !accommodationChosen && datesLocked) {
      if (isLeader) {
        return { label: 'Select stay', icon: Check, overlayType: 'accommodation', priority: 6 }
      }
      if (!userHasVotedOnAccommodation) {
        return { label: 'Share your pick', icon: ThumbsUp, overlayType: 'accommodation', priority: 6 }
      }
      return { label: 'View stays', icon: Home, overlayType: 'accommodation', priority: 6 }
    }
    if (accommodationChosen && !prepStarted) {
      return { label: 'Start prep', icon: ClipboardList, overlayType: 'prep', priority: 7 }
    }

    return null
  }, [trip, user, progressSnapshot])

  return (
    <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-white border-t border-gray-200">
      {/* Left: Travelers ghost button */}
      <Button
        onClick={() => onOpenOverlay('travelers')}
        variant="ghost"
        className={cn(
          'flex items-center gap-1.5 text-brand-carbon hover:bg-gray-100',
          'h-11 md:h-9 px-3 min-w-[44px]'
        )}
        aria-label={`View ${travelerCount} travelers`}
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">
          {travelerCount} going
        </span>
      </Button>

      {/* Right: Priority CTA */}
      {ctaConfig && (
        <Button
          onClick={() => onOpenOverlay(ctaConfig.overlayType)}
          className={cn(
            'bg-brand-red hover:bg-brand-red/90 text-white',
            'font-semibold shadow-sm',
            'h-11 md:h-9 px-4 min-w-[44px]'
          )}
        >
          <ctaConfig.icon className="h-4 w-4 mr-1.5 shrink-0" aria-hidden="true" />
          {ctaConfig.label}
        </Button>
      )}
    </div>
  )
}
