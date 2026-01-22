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
  /** Orientation - vertical for desktop sidebar, horizontal for mobile */
  orientation?: 'vertical' | 'horizontal'
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
 * Single chevron/arrow shape component
 */
function ChevronShape({
  isCompleted,
  isCurrent,
  isActiveOverlay,
  isClickable,
  icon: Icon,
  label
}: {
  isCompleted: boolean
  isCurrent: boolean
  isActiveOverlay: boolean
  isClickable: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  // Determine colors based on state
  const getBgColor = () => {
    if (isActiveOverlay) return 'bg-blue-500'
    if (isCurrent) return 'bg-orange-500'
    if (isCompleted) return 'bg-green-500'
    return 'bg-gray-200'
  }

  const getTextColor = () => {
    if (isActiveOverlay || isCurrent || isCompleted) return 'text-white'
    return 'text-gray-500'
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        'w-10 h-10 rounded-lg',
        'transition-all duration-200',
        getBgColor(),
        isClickable && 'cursor-pointer hover:scale-110 hover:shadow-md',
        !isClickable && 'cursor-default opacity-60'
      )}
    >
      <Icon className={cn('w-5 h-5', getTextColor())} />

      {/* Chevron arrow indicator pointing right/down */}
      <div
        className={cn(
          'absolute -right-1 top-1/2 -translate-y-1/2',
          'w-0 h-0',
          'border-t-[6px] border-t-transparent',
          'border-b-[6px] border-b-transparent',
          'border-l-[6px]',
          isActiveOverlay && 'border-l-blue-500',
          isCurrent && !isActiveOverlay && 'border-l-orange-500',
          isCompleted && !isCurrent && !isActiveOverlay && 'border-l-green-500',
          !isCompleted && !isCurrent && !isActiveOverlay && 'border-l-gray-200'
        )}
      />
    </div>
  )
}

/**
 * Progress chevrons displayed on the right side of the chat
 *
 * Each chevron represents a trip stage:
 * - Green filled: Completed
 * - Orange filled: Current/active stage
 * - Gray: Future/incomplete
 * - Blue: Currently viewing this overlay
 */
export function ProgressChevrons({
  progressSteps,
  currentStageKey,
  onChevronClick,
  activeOverlay,
  orientation = 'vertical'
}: ProgressChevronsProps) {
  const isVertical = orientation === 'vertical'

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex items-center gap-2 p-2',
          isVertical ? 'flex-col' : 'flex-row'
        )}
      >
        {TRIP_PROGRESS_STEPS.map((step, index) => {
          const isCompleted = progressSteps[step.key]
          const isCurrent = step.key === currentStageKey
          const overlayType = STEP_TO_OVERLAY[step.key]
          const isActiveOverlay = overlayType && activeOverlay === overlayType
          const isClickable = overlayType !== null

          return (
            <Tooltip key={step.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => isClickable && onChevronClick(overlayType)}
                  disabled={!isClickable}
                  className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
                  aria-label={`${step.label}${isCompleted ? ' (completed)' : ''}${isCurrent ? ' (current)' : ''}`}
                >
                  <ChevronShape
                    isCompleted={isCompleted}
                    isCurrent={isCurrent}
                    isActiveOverlay={!!isActiveOverlay}
                    isClickable={isClickable}
                    icon={step.icon}
                    label={step.label}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side={isVertical ? 'left' : 'top'} className="max-w-[200px]">
                <div className="text-sm">
                  <p className="font-medium">{step.label}</p>
                  <p className="text-gray-500 text-xs mt-1">{step.tooltip}</p>
                  {isCompleted && <p className="text-green-600 text-xs mt-1">✓ Completed</p>}
                  {isCurrent && !isCompleted && <p className="text-orange-600 text-xs mt-1">● Current focus</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
