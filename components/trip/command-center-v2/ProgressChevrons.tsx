'use client'

import { TRIP_PROGRESS_STEPS } from '@/lib/trips/progress'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type OverlayType =
  | 'proposed'
  | 'scheduling'
  | 'itinerary'
  | 'accommodation'
  | 'travelers'
  | 'prep'
  | 'expenses'
  | 'memories'
  | 'member'
  | null

interface ProgressChevronsProps {
  /** Progress steps completion status */
  progressSteps: Record<string, boolean>
  /** Currently active/focused stage key */
  currentStageKey: string | null
  /** Callback when a chevron is clicked */
  onChevronClick: (overlayType: OverlayType) => void
  /** Currently open overlay (for highlighting) */
  activeOverlay: OverlayType
}

// Map progress step keys to overlay types
const STEP_TO_OVERLAY: Record<string, OverlayType> = {
  tripProposed: 'proposed',
  datesLocked: 'scheduling',
  itineraryFinalized: 'itinerary',
  accommodationChosen: 'accommodation',
  prepStarted: 'prep',
  tripOngoing: null, // No overlay for ongoing - it's a state, not an action
  memoriesShared: 'memories',
  expensesSettled: 'expenses'
}

/**
 * Progress chevrons displayed on the right side of the chat
 *
 * Each chevron represents a trip stage:
 * - Gray filled: Completed
 * - Orange filled: Current/active stage
 * - Gray outline: Future/incomplete
 * - Blue border: Currently viewing this overlay
 */
export function ProgressChevrons({
  progressSteps,
  currentStageKey,
  onChevronClick,
  activeOverlay
}: ProgressChevronsProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-1 py-2">
        {TRIP_PROGRESS_STEPS.map((step, index) => {
          const isCompleted = progressSteps[step.key]
          const isCurrent = step.key === currentStageKey
          const overlayType = STEP_TO_OVERLAY[step.key]
          const isActiveOverlay = overlayType && activeOverlay === overlayType
          const isClickable = overlayType !== null

          // Determine chevron style
          const chevronClasses = cn(
            'w-6 h-6 transition-all duration-200 cursor-pointer',
            // Completed: filled gray
            isCompleted && !isCurrent && 'text-gray-400',
            // Current: filled orange
            isCurrent && 'text-orange-500',
            // Incomplete: outline gray
            !isCompleted && !isCurrent && 'text-gray-300',
            // Active overlay: blue ring
            isActiveOverlay && 'ring-2 ring-blue-500 ring-offset-1 rounded',
            // Hover effect
            isClickable && 'hover:scale-110 hover:text-blue-500',
            // Not clickable
            !isClickable && 'cursor-default opacity-60'
          )

          const Icon = step.icon

          return (
            <Tooltip key={step.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => isClickable && onChevronClick(overlayType)}
                  disabled={!isClickable}
                  className={cn(
                    'p-1 rounded transition-colors',
                    isClickable && 'hover:bg-gray-100',
                    isActiveOverlay && 'bg-blue-50'
                  )}
                  aria-label={`${step.label}${isCompleted ? ' (completed)' : ''}${isCurrent ? ' (current)' : ''}`}
                >
                  {/* Chevron shape using the step icon */}
                  <div className={chevronClasses}>
                    <Icon className="w-full h-full" strokeWidth={isCompleted || isCurrent ? 2.5 : 1.5} />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px]">
                <div className="text-sm">
                  <p className="font-medium">{step.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{step.tooltip}</p>
                  {isCompleted && <p className="text-green-600 text-xs mt-1">Completed</p>}
                  {isCurrent && !isCompleted && <p className="text-orange-600 text-xs mt-1">Current focus</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
