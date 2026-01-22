'use client'

import { TRIP_PROGRESS_STEPS } from '@/lib/trips/progress'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Users } from 'lucide-react'

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
  /** Blocker stage key - the chevron that needs attention (points left) */
  blockerStageKey: string | null
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
 * Single chevron arrow shape
 * - Points DOWN by default (progress flow)
 * - Points LEFT when it's the current stage (indicates where overlay opens)
 */
function ChevronArrow({
  isCompleted,
  isCurrent,
  isActiveOverlay,
  isClickable,
  icon: Icon,
  size = 'normal',
  pointDirection = 'down'
}: {
  isCompleted: boolean
  isCurrent: boolean
  isActiveOverlay: boolean
  isClickable: boolean
  icon: React.ComponentType<{ className?: string }>
  size?: 'normal' | 'small'
  pointDirection?: 'down' | 'left'
}) {
  // Determine fill color based on state
  const getFillColor = () => {
    if (isActiveOverlay) return '#3b82f6' // blue-500
    if (isCurrent) return '#f97316' // orange-500
    if (isCompleted) return '#22c55e' // green-500
    return '#e5e7eb' // gray-200
  }

  const getIconColor = () => {
    if (isActiveOverlay || isCurrent || isCompleted) return 'text-white'
    return 'text-gray-500'
  }

  const dimensions = size === 'small' ? { width: 32, height: 36 } : { width: 48, height: 40 }
  const iconSize = size === 'small' ? 'w-3.5 h-3.5' : 'w-5 h-5'

  // SVG paths for different directions
  // Down-pointing chevron (like ▼ with flat top)
  const downPath = `M0,0 L${dimensions.width},0 L${dimensions.width},${dimensions.height - 12} L${dimensions.width / 2},${dimensions.height} L0,${dimensions.height - 12} Z`

  // Left-pointing chevron (like ◀ with flat right edge)
  const leftPath = `M12,0 L${dimensions.width},0 L${dimensions.width},${dimensions.height} L12,${dimensions.height} L0,${dimensions.height / 2} Z`

  const path = pointDirection === 'left' ? leftPath : downPath

  return (
    <div
      className={cn(
        'relative transition-all duration-200',
        isClickable && 'cursor-pointer hover:scale-105',
        !isClickable && 'cursor-default opacity-60'
      )}
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {/* Chevron/Arrow shape using SVG */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="absolute inset-0"
      >
        <path
          d={path}
          fill={getFillColor()}
          className="transition-colors duration-200"
        />
      </svg>

      {/* Icon centered on the chevron */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          // Adjust icon position based on chevron direction
          marginBottom: pointDirection === 'down' ? '4px' : '0',
          marginLeft: pointDirection === 'left' ? '4px' : '0'
        }}
      >
        <Icon className={cn(iconSize, getIconColor())} />
      </div>
    </div>
  )
}

/**
 * Progress chevrons displayed on the right side of the chat
 *
 * Each chevron represents a trip stage:
 * - Green: Completed (points down)
 * - Orange: Blocker stage that needs attention (points LEFT toward overlay)
 * - Gray: Future/incomplete (points down)
 * - Blue: Currently viewing this overlay
 *
 * Also includes a "Travelers" button at the bottom
 */
export function ProgressChevrons({
  progressSteps,
  blockerStageKey,
  onChevronClick,
  activeOverlay,
  orientation = 'vertical'
}: ProgressChevronsProps) {
  const isVertical = orientation === 'vertical'

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex items-center p-1',
          isVertical ? 'flex-col gap-0.5' : 'flex-row gap-1'
        )}
      >
        {/* Progress step chevrons */}
        {TRIP_PROGRESS_STEPS.map((step) => {
          const isCompleted = progressSteps[step.key]
          const isBlocker = step.key === blockerStageKey
          const overlayType = STEP_TO_OVERLAY[step.key]
          const isActiveOverlay = overlayType && activeOverlay === overlayType
          const isClickable = overlayType !== null

          // Blocker stage points left (toward overlay), others point down
          const pointDirection = (isBlocker || isActiveOverlay) ? 'left' : 'down'

          return (
            <Tooltip key={step.key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => isClickable && onChevronClick(overlayType)}
                  disabled={!isClickable}
                  className={cn(
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded',
                    'flex flex-col items-center gap-0.5'
                  )}
                  aria-label={`${step.label}${isCompleted ? ' (completed)' : ''}${isBlocker ? ' (needs attention)' : ''}`}
                >
                  <ChevronArrow
                    isCompleted={isCompleted}
                    isCurrent={isBlocker}
                    isActiveOverlay={!!isActiveOverlay}
                    isClickable={isClickable}
                    icon={step.icon}
                    size={isVertical ? 'normal' : 'small'}
                    pointDirection={isVertical ? pointDirection : 'down'}
                  />
                  {/* Text label below chevron */}
                  {isVertical && (
                    <span className={cn(
                      'text-[8px] font-medium leading-tight text-center w-16',
                      isActiveOverlay ? 'text-blue-600' : isBlocker ? 'text-orange-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                    )}>
                      {step.shortLabel}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side={isVertical ? 'left' : 'top'} className="max-w-[200px]">
                <div className="text-sm">
                  <p className="font-medium">{step.label}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{step.tooltip}</p>
                  {isCompleted && <p className="text-green-600 text-xs mt-0.5">✓ Completed</p>}
                  {isBlocker && !isCompleted && <p className="text-orange-600 text-xs mt-0.5">● Needs attention</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* Divider */}
        <div className={cn(
          'bg-gray-300',
          isVertical ? 'w-12 h-px my-2' : 'h-6 w-px mx-1'
        )} />

        {/* Travelers button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onChevronClick('travelers')}
              className={cn(
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded',
                'flex flex-col items-center gap-0.5'
              )}
              aria-label="View travelers"
            >
              <ChevronArrow
                isCompleted={false}
                isCurrent={false}
                isActiveOverlay={activeOverlay === 'travelers'}
                isClickable={true}
                icon={Users}
                size={isVertical ? 'normal' : 'small'}
                pointDirection={activeOverlay === 'travelers' ? 'left' : 'down'}
              />
              {/* Text label below chevron */}
              {isVertical && (
                <span className={cn(
                  'text-[8px] font-medium leading-tight text-center w-16',
                  activeOverlay === 'travelers' ? 'text-blue-600' : 'text-gray-400'
                )}>
                  Travelers
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side={isVertical ? 'left' : 'top'}>
            <p className="text-sm font-medium">Travelers</p>
            <p className="text-gray-500 text-xs">View and manage trip members</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
