'use client'

import { CheckCircle2, Circle } from 'lucide-react'
import { TRIP_PROGRESS_STEPS, computeProgressSteps, getFirstIncompleteStep } from '@/lib/trips/progress'

/**
 * Compact horizontal progress indicator for TripCard
 * Shows the same milestones as TripDetailView's TripProgress component
 * 
 * @param {Object} props
 * @param {Object} props.trip - Trip data
 */
export function TripProgressMini({ trip }) {
  const steps = computeProgressSteps(trip)
  const firstIncompleteKey = getFirstIncompleteStep(steps)
  
  // Find index of current (first incomplete) step
  const currentIndex = firstIncompleteKey 
    ? TRIP_PROGRESS_STEPS.findIndex(s => s.key === firstIncompleteKey)
    : TRIP_PROGRESS_STEPS.length // All complete
  
  // Determine what to show
  const completedCount = currentIndex
  const showCurrent = currentIndex < TRIP_PROGRESS_STEPS.length
  const showNext = currentIndex < TRIP_PROGRESS_STEPS.length - 1
  const remainingFuture = TRIP_PROGRESS_STEPS.length - completedCount - (showCurrent ? 1 : 0) - (showNext ? 1 : 0)
  
  // Calculate progress label for screen readers
  const progressLabel = showCurrent
    ? `Trip progress: Step ${completedCount + 1} of ${TRIP_PROGRESS_STEPS.length} - ${TRIP_PROGRESS_STEPS[currentIndex].shortLabel}`
    : `Trip progress: All ${TRIP_PROGRESS_STEPS.length} steps completed`

  return (
    <div
      className="flex flex-col gap-1"
      role="progressbar"
      aria-valuenow={completedCount + (showCurrent ? 1 : 0)}
      aria-valuemin={0}
      aria-valuemax={TRIP_PROGRESS_STEPS.length}
      aria-label={progressLabel}
    >
      {/* Node row */}
      <div className="flex items-center gap-1.5 overflow-hidden" aria-hidden="true">
        {/* Completed steps as small dots (show up to 2, then connector) */}
        {completedCount > 0 && (
          <>
            {Array.from({ length: Math.min(completedCount, 2) }).map((_, i) => (
              <div key={`completed-${i}`} className="flex items-center flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-brand-blue flex-shrink-0" />
                {i < Math.min(completedCount, 2) - 1 && (
                  <div className="h-0.5 w-2 mx-0.5 bg-brand-blue flex-shrink-0" />
                )}
              </div>
            ))}
            {completedCount > 2 && (
              <div className="h-0.5 w-2 mx-0.5 bg-brand-blue flex-shrink-0" />
            )}
          </>
        )}
        
        {/* Current step */}
        {showCurrent && (
          <div className="flex items-center flex-shrink-0">
            <div className="relative">
              <Circle className="h-3.5 w-3.5 text-brand-red flex-shrink-0" strokeWidth={2} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              </div>
            </div>
            {showNext && (
              <div className="h-0.5 w-2 mx-0.5 bg-brand-carbon/20 flex-shrink-0" />
            )}
          </div>
        )}

        {/* Next step */}
        {showNext && (
          <div className="flex items-center flex-shrink-0">
            <Circle className="h-3.5 w-3.5 text-brand-carbon/30 flex-shrink-0" strokeWidth={1.5} />
            {remainingFuture > 0 && (
              <div className="h-0.5 w-2 mx-0.5 bg-brand-carbon/20 flex-shrink-0" />
            )}
          </div>
        )}
        
        {/* Remaining future steps indicator */}
        {remainingFuture > 0 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <span className="text-xs text-gray-500">···</span>
          </div>
        )}
      </div>
      
      {/* Labels row */}
      <div className="flex items-center gap-2 overflow-hidden min-h-[16px]" aria-hidden="true">
        {/* Current step label */}
        {showCurrent && (
          <span className="text-xs font-medium text-brand-red truncate max-w-[90px]">
            {TRIP_PROGRESS_STEPS[currentIndex].shortLabel}
          </span>
        )}
        
        {/* Next step label */}
        {showNext && (
          <span className="text-xs text-gray-500 truncate max-w-[90px]">
            {TRIP_PROGRESS_STEPS[currentIndex + 1].shortLabel}
          </span>
        )}
      </div>
    </div>
  )
}
