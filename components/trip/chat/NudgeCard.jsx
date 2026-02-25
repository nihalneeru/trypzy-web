'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * NudgeCard — contextual first-action prompt shown above chat.
 * Max 1 card. Dismissible. Never promotional.
 *
 * @param {{ trip: any, userRole: string, onOpenOverlay: (type: string) => void }} props
 */
export function NudgeCard({ trip, userRole, onOpenOverlay }) {
  const [dismissed, setDismissed] = useState(false)

  // Check if already dismissed for this trip
  useEffect(() => {
    const key = `tripti_nudge_dismissed_${trip.id}`
    if (localStorage.getItem(key)) setDismissed(true)
  }, [trip.id])

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem(`tripti_nudge_dismissed_${trip.id}`, '1')
  }

  if (dismissed) return null

  // Determine which nudge to show based on trip state and user role
  const nudge = getNudge(trip, userRole)
  if (!nudge) return null

  return (
    <div className="mx-3 mb-2 p-3 rounded-lg bg-brand-sand/50 border border-brand-sand relative">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-brand-carbon/40 hover:text-brand-carbon"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-sm text-brand-carbon pr-6 mb-2">{nudge.message}</p>
      {nudge.action && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7 border-brand-blue text-brand-blue hover:bg-brand-blue/10"
          onClick={(e) => {
            e.preventDefault()
            nudge.action(onOpenOverlay)
            dismiss()
          }}
        >
          {nudge.actionLabel}
        </Button>
      )}
    </div>
  )
}

function getNudge(trip, userRole) {
  const status = trip.status

  // Scheduling phase — traveler hasn't added dates
  if ((status === 'proposed' || status === 'scheduling') && userRole !== 'leader') {
    if (!trip.userHasSubmittedDates) {
      return {
        message: "Your circle is picking dates for this trip. Share when you're free so the circle can find the best time.",
        actionLabel: 'Add your dates',
        action: (openOverlay) => openOverlay('scheduling'),
      }
    }
  }

  // Scheduling phase — leader can propose
  if ((status === 'proposed' || status === 'scheduling') && userRole === 'leader') {
    if (trip.proposalReady) {
      return {
        message: 'Enough people have shared their dates. You can now propose a window for the circle to react to.',
        actionLabel: 'Review dates',
        action: (openOverlay) => openOverlay('scheduling'),
      }
    }
  }

  // Voting/proposed phase — traveler hasn't reacted
  if (status === 'voting' && userRole !== 'leader') {
    if (!trip.userHasVoted) {
      return {
        message: 'A date window has been proposed. Let your circle know if it works for you.',
        actionLabel: 'React to dates',
        action: (openOverlay) => openOverlay('scheduling'),
      }
    }
  }

  // Dates locked — leader hasn't started itinerary
  if (status === 'locked' && userRole === 'leader') {
    if (!trip.hasItinerary) {
      return {
        message: 'Dates are locked! You can now build an itinerary together with your circle.',
        actionLabel: 'Start itinerary',
        action: (openOverlay) => openOverlay('itinerary'),
      }
    }
  }

  return null
}
