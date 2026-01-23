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
  Camera
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
 */
export function ContextCTABar({
  trip,
  user,
  travelerCount,
  onOpenOverlay
}: ContextCTABarProps) {
  // Determine the current CTA based on trip state and user context
  const ctaConfig = useMemo((): CTAConfig | null => {
    if (!trip || !user) return null

    const isLeader = trip.leaderId === user.id || trip.createdBy === user.id
    const userId = user.id

    // Check user's availability submission status
    const userAvailability = trip.availability?.find(
      (a: any) => a.userId === userId
    )
    const hasSubmittedAvailability = !!userAvailability?.dates?.length

    // Check voting status
    const votingOpen = trip.votingStatus === 'open' || trip.dateVotingOpen
    const userHasVoted = trip.dateVotes?.some(
      (v: any) => v.userId === userId
    )

    // Check if dates are locked
    const datesLocked = trip.datesLocked || trip.lockedDates

    // Check user's ideas count
    const userIdeasCount = trip.ideas?.filter(
      (i: any) => i.userId === userId || i.createdBy === userId
    )?.length || 0

    // Check if itinerary exists
    const hasItinerary = trip.itinerary?.days?.length > 0 || trip.itineraryFinalized

    // Check accommodation status
    const accommodationSelected = trip.accommodationSelected || trip.accommodation?.selected

    // Priority-based CTA selection (lower priority number = higher importance)

    // 1. Pick your dates (if user hasn't submitted availability and dates not locked)
    if (!hasSubmittedAvailability && !datesLocked) {
      return {
        label: 'Pick your dates',
        icon: Calendar,
        overlayType: 'scheduling',
        priority: 1
      }
    }

    // 2. Vote on dates (if voting is open and user hasn't voted)
    if (votingOpen && !userHasVoted && !datesLocked) {
      return {
        label: 'Vote on dates',
        icon: Vote,
        overlayType: 'scheduling',
        priority: 2
      }
    }

    // 3. Lock dates (if leader and can lock - voting complete but not locked)
    if (isLeader && !datesLocked && hasSubmittedAvailability) {
      const allMembersSubmitted = trip.members?.every(
        (m: any) => trip.availability?.some((a: any) => a.userId === m.userId)
      )
      if (allMembersSubmitted || trip.canLockDates) {
        return {
          label: 'Lock dates',
          icon: Lock,
          overlayType: 'scheduling',
          priority: 3
        }
      }
    }

    // 4. Add ideas (if user has fewer than 3 ideas)
    if (userIdeasCount < 3) {
      return {
        label: 'Add ideas',
        icon: Lightbulb,
        overlayType: 'proposed',
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

    // 6. Choose stay (if accommodation not selected and dates locked)
    if (!accommodationSelected && datesLocked) {
      return {
        label: 'Choose stay',
        icon: Home,
        overlayType: 'accommodation',
        priority: 6
      }
    }

    // No action needed
    return null
  }, [trip, user])

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-brand-red">
      {/* Left section: Travelers, Expenses, Memories buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => onOpenOverlay('travelers')}
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none'
          )}
          aria-label={`View ${travelerCount} travelers`}
        >
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">
            {travelerCount} going
          </span>
        </Button>

        <Button
          onClick={() => onOpenOverlay('expenses')}
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none'
          )}
          aria-label="View expenses"
        >
          <DollarSign className="h-4 w-4" />
          <span className="text-sm font-medium">Expenses</span>
        </Button>

        <Button
          onClick={() => onOpenOverlay('memories')}
          variant="ghost"
          size="sm"
          className={cn(
            'flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white',
            'border-0 shadow-none'
          )}
          aria-label="View memories"
        >
          <Camera className="h-4 w-4" />
          <span className="text-sm font-medium">Memories</span>
        </Button>
      </div>

      {/* Right section: Primary focus CTA button */}
      {ctaConfig && (
        <Button
          onClick={() => onOpenOverlay(ctaConfig.overlayType)}
          className={cn(
            'bg-white text-brand-red hover:bg-white/90',
            'font-semibold shadow-md'
          )}
          size="sm"
        >
          <ctaConfig.icon className="h-4 w-4 mr-1.5" />
          {ctaConfig.label}
        </Button>
      )}
    </div>
  )
}
