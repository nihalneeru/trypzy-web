'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Users,
  Calendar,
  Vote,
  Lock,
  Lightbulb,
  Sparkles,
  Home,
  DollarSign,
  Camera,
  ThumbsUp,
  Check,
  ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeTripProgressSnapshot } from '@/lib/trips/progressSnapshot'

interface CTAConfig {
  label: string
  icon: React.ElementType
  overlayType: string
  priority: number
}

interface ContextCTABarProps {
  /** Trip data */
  trip: any
  /** Current user */
  user: any
  /** Number of travelers going */
  travelerCount: number
  /** Callback when overlay is opened */
  onOpenOverlay: (overlayType: string) => void
}

/**
 * Context-sensitive action bar for Command Center V2
 *
 * Shows:
 * - Left section: Travelers, Expenses, and Memories buttons
 * - Right section: Primary focus CTA button based on user's next recommended action
 *
 * Uses computeTripProgressSnapshot() as single source of truth for CTA decisions (P0-4)
 */
export function ContextCTABar({
  trip,
  user,
  travelerCount,
  onOpenOverlay
}: ContextCTABarProps) {
  // Compute progress snapshot as single source of truth for CTA decisions (P0-4)
  const progressSnapshot = useMemo(() => {
    return computeTripProgressSnapshot(trip, user, {
      pickProgress: trip?.pickProgress
    })
  }, [trip, user])

  // Determine the current CTA based on progress snapshot and user context
  const ctaConfig = useMemo((): CTAConfig | null => {
    if (!trip || !user) return null

    const isLeader = progressSnapshot.isTripLeader
    const userId = user.id

    // Use progress snapshot for core state decisions
    const datesLocked = progressSnapshot.datesLocked
    const leaderNeedsToLock = progressSnapshot.leaderNeedsToLock
    const itineraryFinalized = progressSnapshot.itineraryFinalized
    const accommodationChosen = progressSnapshot.accommodationChosen
    const prepStarted = progressSnapshot.prepStarted

    // User-specific state (not in snapshot, requires user context)
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

    // Priority-based CTA selection (lower priority number = higher importance)

    // 1. Lock dates (if leader and can lock - highest priority for leader)
    if (isLeader && !datesLocked && leaderNeedsToLock) {
      return {
        label: 'Lock dates',
        icon: Lock,
        overlayType: 'scheduling',
        priority: 1
      }
    }

    // 2. Vote on dates (if voting is open and user hasn't voted)
    // P1-5: Use inviting language - "Share your vote" instead of "Vote now"
    if (votingOpen && !userHasVoted && !datesLocked) {
      return {
        label: 'Share your vote',
        icon: Vote,
        overlayType: 'scheduling',
        priority: 2
      }
    }

    // 3. Pick your dates (if user hasn't submitted availability and dates not locked)
    if (!hasSubmittedAvailability && !datesLocked) {
      return {
        label: 'Pick your dates',
        icon: Calendar,
        overlayType: 'scheduling',
        priority: 3
      }
    }

    // 4. Add ideas (only if itinerary not finalized and user has fewer than 3 ideas)
    // P1-5: Use inviting language - "Add your ideas" instead of "Submit ideas"
    if (!itineraryFinalized && userIdeasCount < 2 && datesLocked) {
      return {
        label: 'Suggest an idea',
        icon: Lightbulb,
        overlayType: 'itinerary',
        priority: 4
      }
    }

    // 5. Generate itinerary (if leader and no itinerary)
    if (isLeader && !hasItinerary && datesLocked) {
      return {
        label: 'Generate itinerary',
        icon: Sparkles,
        overlayType: 'itinerary',
        priority: 5
      }
    }

    // 6. Accommodation actions (after itinerary is finalized)
    if (itineraryFinalized && !accommodationChosen && datesLocked) {
      // Leader: Select accommodation
      if (isLeader) {
        return {
          label: 'Select stay',
          icon: Check,
          overlayType: 'accommodation',
          priority: 6
        }
      }
      // Traveler: Vote on accommodation (if hasn't voted yet)
      // P1-5: Use inviting language - "Share your pick" instead of "Vote now"
      if (!userHasVotedOnAccommodation) {
        return {
          label: 'Share your pick',
          icon: ThumbsUp,
          overlayType: 'accommodation',
          priority: 6
        }
      }
      // Traveler who has voted: View accommodation
      return {
        label: 'View stays',
        icon: Home,
        overlayType: 'accommodation',
        priority: 6
      }
    }

    // 7. Prep phase (after accommodation selected)
    if (accommodationChosen && !prepStarted) {
      return {
        label: 'Start prep',
        icon: ClipboardList,
        overlayType: 'prep',
        priority: 7
      }
    }

    // No action needed
    return null
  }, [trip, user, progressSnapshot])

  return (
    <div className="flex items-center justify-between px-2 md:px-4 py-2" style={{ backgroundColor: 'var(--brand-red)' }}>
      {/* Left section: Travelers, Expenses, Memories buttons */}
      <div className="flex items-center gap-1 md:gap-2">
        <Button
          onClick={() => onOpenOverlay('travelers')}
          variant="ghost"
          className={cn(
            'flex items-center gap-1 md:gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none',
            // Responsive sizing: 44px min height on mobile (WCAG), smaller on desktop
            'h-11 md:h-9 px-2.5 md:px-3 min-w-[44px]'
          )}
          aria-label={`View ${travelerCount} travelers`}
        >
          <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium hidden sm:inline">
            {travelerCount} going
          </span>
          <span className="text-sm font-medium sm:hidden">
            {travelerCount}
          </span>
        </Button>

        <Button
          onClick={() => onOpenOverlay('expenses')}
          variant="ghost"
          className={cn(
            'flex items-center gap-1 md:gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none',
            // Responsive sizing: 44px min height on mobile (WCAG), smaller on desktop
            'h-11 md:h-9 px-2.5 md:px-3 min-w-[44px]'
          )}
          aria-label="View expenses"
        >
          <DollarSign className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium hidden sm:inline">Expenses</span>
        </Button>

        <Button
          onClick={() => onOpenOverlay('memories')}
          variant="ghost"
          className={cn(
            'flex items-center gap-1 md:gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none',
            // Responsive sizing: 44px min height on mobile (WCAG), smaller on desktop
            'h-11 md:h-9 px-2.5 md:px-3 min-w-[44px]'
          )}
          aria-label="View memories"
        >
          <Camera className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium hidden sm:inline">Memories</span>
        </Button>
      </div>

      {/* Right section: Primary focus CTA button */}
      {ctaConfig && (
        <Button
          onClick={() => onOpenOverlay(ctaConfig.overlayType)}
          className={cn(
            'bg-white text-brand-red hover:bg-white/90',
            'font-semibold shadow-md',
            // Responsive sizing: 44px min height on mobile (WCAG), smaller on desktop
            'h-11 md:h-9 px-3 md:px-4 min-w-[44px]'
          )}
        >
          <ctaConfig.icon className="h-4 w-4 mr-1.5 shrink-0" aria-hidden="true" />
          <span className="hidden xs:inline">{ctaConfig.label}</span>
          <span className="xs:hidden">{ctaConfig.label.split(' ')[0]}</span>
        </Button>
      )}
    </div>
  )
}
