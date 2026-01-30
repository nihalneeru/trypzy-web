'use client'

import { useMemo, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { TRIP_PROGRESS_STEPS } from '@/lib/trips/progress'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { OverlayType } from './types'

// Map progress step keys to overlay types
// NOTE: Memories and Expenses are NOT shown as chevrons - they're in the bottom CTA bar
const STEP_TO_OVERLAY: Record<string, OverlayType> = {
  tripProposed: 'proposed',
  datesLocked: 'scheduling',
  itineraryFinalized: 'itinerary',
  accommodationChosen: 'accommodation',
  prepStarted: 'prep',
  tripOngoing: null
}

// Only show main stage chevrons (exclude Memories and Expenses - those are in CTA bar)
const STAGE_CHEVRON_KEYS = [
  'tripProposed',
  'datesLocked',
  'itineraryFinalized',
  'accommodationChosen',
  'prepStarted',
  'tripOngoing'
]

// ─────────────────────────────────────────────────
// Chevron arrow (horizontal variant)
// ─────────────────────────────────────────────────

function StripChevron({
  isCompleted,
  isBlocker,
  isActiveOverlay,
  isClickable,
  icon: Icon,
  pointDirection = 'right'
}: {
  isCompleted: boolean
  isBlocker: boolean
  isActiveOverlay: boolean
  isClickable: boolean
  icon: React.ComponentType<{ className?: string }>
  pointDirection?: 'right' | 'down'
}) {
  const getFillColor = () => {
    if (isActiveOverlay) return '#00334D' // brand-blue
    if (isBlocker) return '#FA3823' // brand-red
    if (isCompleted) return '#00334D' // brand-blue
    return '#2E303B33' // brand-carbon at 20%
  }

  const getIconColor = () => {
    if (isActiveOverlay || isBlocker || isCompleted) return 'text-white'
    return 'text-gray-500'
  }

  // Shape dimensions (compact for horizontal row)
  const w = 32
  const h = 32

  // Right-pointing: arrow tip on right edge (mirror of V2's left path)
  const rightPath = `M0,0 L${w - 10},0 L${w},${h / 2} L${w - 10},${h} L0,${h} Z`

  // Down-pointing: arrow tip on bottom edge (same concept as V2)
  const downPath = `M0,0 L${w},0 L${w},${h - 10} L${w / 2},${h} L0,${h - 10} Z`

  const path = pointDirection === 'down' ? downPath : rightPath

  return (
    <div
      className={cn(
        'relative flex items-center justify-center transition-all duration-200',
        isClickable && 'cursor-pointer hover:scale-110',
        !isClickable && 'cursor-default opacity-60'
      )}
      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
    >
      <div className="relative" style={{ width: w, height: h }}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0"
        >
          <path
            d={path}
            fill={getFillColor()}
            className="transition-colors duration-200"
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            marginRight: pointDirection === 'right' ? '3px' : '0',
            marginBottom: pointDirection === 'down' ? '3px' : '0'
          }}
        >
          <Icon className={cn('w-4 h-4', getIconColor())} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────
// ProgressStrip
// ─────────────────────────────────────────────────

interface ProgressStripProps {
  tripName: string
  startDate?: string | null
  endDate?: string | null
  lockedStartDate?: string | null
  lockedEndDate?: string | null
  progressSteps: Record<string, boolean>
  blockerStageKey: string | null
  activeOverlay: OverlayType
  onStepClick: (overlayType: OverlayType) => void
  participationMeter?: { responded: number; total: number; label: string } | null
  /** Whether the current user is the trip leader */
  isLeader?: boolean
}

export function ProgressStrip({
  tripName,
  startDate,
  endDate,
  lockedStartDate,
  lockedEndDate,
  progressSteps,
  blockerStageKey,
  activeOverlay,
  onStepClick,
  participationMeter,
  isLeader = false
}: ProgressStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const effectiveStart = lockedStartDate || startDate
  const effectiveEnd = lockedEndDate || endDate

  const dateDisplay = useMemo(() => {
    if (!effectiveStart || !effectiveEnd) return null
    try {
      const s = new Date(effectiveStart)
      const e = new Date(effectiveEnd)
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    } catch {
      return null
    }
  }, [effectiveStart, effectiveEnd])

  // Auto-scroll to blocker/active chevron on mobile
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const targetKey = activeOverlay
      ? Object.entries(STEP_TO_OVERLAY).find(([_, v]) => v === activeOverlay)?.[0]
      : blockerStageKey

    if (!targetKey) return

    const targetIndex = TRIP_PROGRESS_STEPS.findIndex(s => s.key === targetKey)
    if (targetIndex === -1) return

    // Find the button element and scroll it into view
    const buttons = container.querySelectorAll('button')
    const targetButton = buttons[targetIndex]
    if (targetButton) {
      targetButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [blockerStageKey, activeOverlay])

  return (
    <div className="border-b border-gray-200 bg-gray-50 shrink-0">
      {/* Row 1: Trip name + dates + participation meter */}
      <div className="flex items-center justify-between px-3 md:px-4 pt-2 pb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm md:text-base font-semibold text-brand-carbon truncate">
            {tripName}
          </h1>
          {isLeader && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-blue/10 text-brand-blue cursor-help">
                    Leader
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">You're organizing this trip. You can lock dates and make final decisions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {dateDisplay && (
            <>
              <span className="text-gray-400 hidden sm:inline" aria-hidden="true">·</span>
              <span className="text-xs md:text-sm text-gray-500 hidden sm:inline whitespace-nowrap">
                {dateDisplay}
              </span>
            </>
          )}
        </div>
        {participationMeter && (
          <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
            {participationMeter.responded} of {participationMeter.total} {participationMeter.label}
          </span>
        )}
      </div>

      {/* Row 2: Chevron arrows - horizontal scroll with snap on mobile */}
      {/* Only shows main stages (Proposed → On Trip). Memories/Expenses are in bottom CTA bar */}
      <div
        ref={scrollContainerRef}
        className={cn(
          'flex items-center justify-center gap-1 md:gap-2 px-2 md:px-3 pb-2',
          'overflow-x-auto scrollbar-none',
          'snap-x snap-mandatory md:snap-none'
        )}
      >
        {TRIP_PROGRESS_STEPS
          .filter(step => STAGE_CHEVRON_KEYS.includes(step.key))
          .map((step) => {
            const isCompleted = progressSteps[step.key]
            const isBlocker = step.key === blockerStageKey
            const overlayType = STEP_TO_OVERLAY[step.key]
            const isActive = overlayType !== null && activeOverlay === overlayType
            const isClickable = overlayType !== null

            // Blocker or active overlay points DOWN (attention); rest point RIGHT (flow)
            const pointDirection = (isBlocker || isActive) ? 'down' : 'right'

            return (
              <button
                key={step.key}
                onClick={() => isClickable && onStepClick(overlayType)}
                disabled={!isClickable}
                className={cn(
                  'flex flex-col items-center gap-0.5 snap-center shrink-0',
                  'focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-1 rounded'
                )}
                aria-label={`${step.label}${isCompleted ? ' (completed)' : ''}${isBlocker ? ' (needs attention)' : ''}`}
              >
                <StripChevron
                  isCompleted={isCompleted}
                  isBlocker={isBlocker}
                  isActiveOverlay={isActive}
                  isClickable={isClickable}
                  icon={step.icon}
                  pointDirection={pointDirection}
                />
                <span className={cn(
                  'text-[9px] md:text-[10px] font-medium leading-tight text-center whitespace-nowrap',
                  isActive
                    ? 'text-brand-blue'
                    : isBlocker
                      ? 'text-brand-red'
                      : isCompleted
                        ? 'text-brand-blue'
                        : 'text-brand-carbon/40'
                )}>
                  {step.shortLabel}
                </span>
              </button>
            )
          })}
      </div>
    </div>
  )
}
