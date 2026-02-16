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
  DollarSign,
  Camera,
  ThumbsUp,
  Check,
  ClipboardList,
  Clock,
  MessageCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeTripProgressSnapshot } from '@/lib/trips/progressSnapshot'

interface CTAConfig {
  label: string
  icon: React.ElementType
  overlayType: string
  priority: number
  /** Whether this CTA requires user action (blocking) vs just informational */
  isBlocking?: boolean
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

    // 0. Non-traveler: show join request CTA based on request status
    const viewer = trip.viewer || {}
    if (!viewer.isActiveParticipant && trip.status !== 'canceled') {
      if (viewer.joinRequestStatus === 'pending') {
        return {
          label: 'Request pending',
          icon: Clock,
          overlayType: 'travelers',
          priority: 0,
          isBlocking: false
        }
      }
      // 'approved' falls through to participant CTAs; otherwise show "Ask to join"
      if (viewer.joinRequestStatus !== 'approved') {
        return {
          label: 'Ask to join',
          icon: UserPlus,
          overlayType: 'travelers',
          priority: 0
        }
      }
    }

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
    const userIdeasCount = trip.ideaSummary?.userIdeaCount ?? 0
    const totalIdeasCount = trip.ideaSummary?.totalCount ?? 0
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
        priority: 1,
        isBlocking: true
      }
    }

    // 1b. PROPOSED phase: non-leader reactions (date_windows mode)
    if (!isLeader && trip.proposedWindowId && !datesLocked) {
      const userReacted = (trip.proposedWindowReactions || []).some(
        (r: any) => r.userId === userId
      )
      if (!userReacted) {
        return {
          label: 'Share your thoughts',
          icon: MessageCircle,
          overlayType: 'scheduling',
          priority: 1,
          isBlocking: true
        }
      }
      return {
        label: 'Awaiting lock',
        icon: Clock,
        overlayType: 'scheduling',
        priority: 1,
        isBlocking: false
      }
    }

    // 2. Vote on dates (if voting is open and user hasn't voted)
    // P1-5: Use inviting language - "Share your vote" instead of "Vote now"
    if (votingOpen && !userHasVoted && !datesLocked) {
      return {
        label: 'Share your vote',
        icon: Vote,
        overlayType: 'scheduling',
        priority: 2,
        isBlocking: true
      }
    }

    // 3. Pick your dates (if user hasn't submitted availability and dates not locked)
    if (!hasSubmittedAvailability && !datesLocked) {
      return {
        label: 'Pick your dates',
        icon: Calendar,
        overlayType: 'scheduling',
        priority: 3,
        isBlocking: true
      }
    }

    // 3b. Dates in progress (non-leader has submitted availability, dates not yet locked)
    if (hasSubmittedAvailability && !datesLocked) {
      return {
        label: 'Dates in progress',
        icon: Clock,
        overlayType: 'scheduling',
        priority: 3,
        isBlocking: false  // Informational - user has already acted
      }
    }

    // 4. Idea CTAs (only if itinerary not finalized and dates locked)
    if (!itineraryFinalized && !hasItinerary && datesLocked) {
      // 4a. User has < 2 ideas: encourage adding more
      if (userIdeasCount < 2) {
        return {
          label: 'Suggest an idea',
          icon: Lightbulb,
          overlayType: 'itinerary',
          priority: 4,
          isBlocking: false
        }
      }
      // 4b. Non-leader with 2+ ideas: review what others submitted
      if (!isLeader) {
        return {
          label: 'Review ideas',
          icon: Lightbulb,
          overlayType: 'itinerary',
          priority: 4,
          isBlocking: false
        }
      }
    }

    // 5. Build/generate itinerary (leader only, no itinerary yet)
    if (isLeader && !hasItinerary && datesLocked) {
      return {
        label: totalIdeasCount > 0 ? 'Build itinerary' : 'Generate itinerary',
        icon: Sparkles,
        overlayType: 'itinerary',
        priority: 5,
        isBlocking: false
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
          priority: 6,
          isBlocking: false  // Leader action
        }
      }
      // Traveler: Vote on accommodation (if hasn't voted yet)
      // P1-5: Use inviting language - "Share your pick" instead of "Vote now"
      if (!userHasVotedOnAccommodation) {
        return {
          label: 'Share your pick',
          icon: ThumbsUp,
          overlayType: 'accommodation',
          priority: 6,
          isBlocking: true  // User needs to vote
        }
      }
      // Traveler who has voted: View accommodation
      return {
        label: 'View stays',
        icon: Home,
        overlayType: 'accommodation',
        priority: 6,
        isBlocking: false  // Informational
      }
    }

    // 7. Prep phase (after accommodation selected)
    if (accommodationChosen && !prepStarted) {
      return {
        label: 'Start prep',
        icon: ClipboardList,
        overlayType: 'prep',
        priority: 7,
        isBlocking: false  // Optional
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
            'font-semibold shadow-md',
            // Responsive sizing: 44px min height on mobile (WCAG), smaller on desktop
            'h-11 md:h-9 px-3 md:px-4 min-w-[44px]',
            // Color based on whether action is blocking (requires user action)
            ctaConfig.isBlocking
              ? 'bg-white text-brand-red hover:bg-white/90'  // Urgent - white on red bar
              : 'bg-white/80 text-brand-blue hover:bg-white/70 border border-white/30'  // Informational - subtle
          )}
        >
          <ctaConfig.icon className="h-4 w-4 mr-1.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{ctaConfig.label}</span>
        </Button>
      )}
    </div>
  )
}
