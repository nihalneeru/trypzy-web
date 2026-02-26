'use client'

import { TRIP_PROGRESS_STEPS, computeProgressSteps, getFirstIncompleteStep } from '@/lib/trips/progress'
import { cn } from '@/lib/utils'

// Same 6 main stages shown in the command center ProgressStrip
const STAGE_KEYS = [
  'tripProposed',
  'datesLocked',
  'itineraryFinalized',
  'accommodationChosen',
  'prepStarted',
  'tripOngoing'
]

/**
 * Compact horizontal progress indicator for TripCard
 * Shows all 6 main stages as small filled circles with icons,
 * visually consistent with the command center ProgressStrip.
 *
 * @param {Object} props
 * @param {Object} props.trip - Trip data
 */
export function TripProgressMini({ trip }) {
  const steps = computeProgressSteps(trip)
  const firstIncompleteKey = getFirstIncompleteStep(steps)

  const mainSteps = TRIP_PROGRESS_STEPS.filter(s => STAGE_KEYS.includes(s.key))

  // Screen reader label
  const currentStep = mainSteps.find(s => s.key === firstIncompleteKey)
  const completedCount = mainSteps.filter(s => steps[s.key]).length
  const progressLabel = currentStep
    ? `Trip progress: Step ${completedCount + 1} of ${mainSteps.length} - ${currentStep.shortLabel}`
    : `Trip progress: All ${mainSteps.length} steps completed`

  return (
    <div
      className="flex items-center justify-between gap-0.5"
      role="progressbar"
      aria-valuenow={completedCount}
      aria-valuemin={0}
      aria-valuemax={mainSteps.length}
      aria-label={progressLabel}
    >
      {mainSteps.map((step) => {
        const isCompleted = steps[step.key]
        const isCurrent = step.key === firstIncompleteKey
        const Icon = step.icon

        return (
          <div
            key={step.key}
            className="flex flex-col items-center gap-0.5 min-w-0"
            aria-hidden="true"
          >
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center',
              isCurrent
                ? 'bg-brand-red'
                : isCompleted
                  ? 'bg-brand-blue'
                  : 'bg-brand-carbon/20'
            )}>
              <Icon className={cn(
                'w-2.5 h-2.5',
                (isCurrent || isCompleted) ? 'text-white' : 'text-brand-carbon/60'
              )} />
            </div>
            <span className={cn(
              'text-[11px] font-medium leading-tight text-center whitespace-nowrap',
              isCurrent && 'underline underline-offset-2',
              isCurrent
                ? 'text-brand-red'
                : isCompleted
                  ? 'text-brand-blue'
                  : 'text-brand-carbon/40'
            )}>
              {step.shortLabel}
            </span>
          </div>
        )
      })}
    </div>
  )
}
