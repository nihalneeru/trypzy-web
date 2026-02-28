'use client'

import { useMemo, useRef, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { TRIP_PROGRESS_STEPS } from '@/lib/trips/progress'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
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

// Only show main stage steps (exclude Memories and Expenses - those are in CTA bar)
const STAGE_STEP_KEYS = [
  'tripProposed',
  'datesLocked',
  'itineraryFinalized',
  'accommodationChosen',
  'prepStarted',
  'tripOngoing'
]

// ─────────────────────────────────────────────────
// Circle step indicator
// ─────────────────────────────────────────────────

function StripCircle({
  isCompleted,
  isBlocker,
  isActiveOverlay,
  isClickable,
  isNextStep = false,
  icon: Icon,
  showRingBurst = false,
}: {
  isCompleted: boolean
  isBlocker: boolean
  isActiveOverlay: boolean
  isClickable: boolean
  isNextStep?: boolean
  icon: React.ComponentType<{ className?: string }>
  showRingBurst?: boolean
}) {
  const getBgColor = () => {
    if (isActiveOverlay) return 'bg-brand-blue'
    if (isBlocker) return 'bg-brand-red'
    if (isCompleted) return 'bg-brand-blue'
    return 'bg-brand-carbon/20'
  }

  const getIconColor = () => {
    if (isActiveOverlay || isBlocker || isCompleted) return 'text-white'
    if (isNextStep) return 'text-brand-carbon/60'
    return 'text-brand-carbon/60'
  }

  return (
    <div
      className={cn(
        'relative flex items-center justify-center transition-all duration-200',
        isClickable && 'cursor-pointer hover:scale-110',
        !isClickable && 'cursor-default opacity-60'
      )}
      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
    >
      {showRingBurst && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-brand-blue animate-ring-burst" />
        </div>
      )}
      {isNextStep && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-9 h-9 rounded-full border-2 border-dashed border-brand-sand" />
        </div>
      )}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300',
        getBgColor(),
        isBlocker && !isActiveOverlay && 'ring-2 ring-brand-red/30 ring-offset-1'
      )}>
        <Icon className={cn('w-4 h-4', getIconColor())} />
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
  /** Circle ID for back navigation (falls back to /dashboard) */
  circleId?: string | null
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
  isLeader = false,
  circleId,
}: ProgressStripProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const effectiveStart = lockedStartDate || startDate
  const effectiveEnd = lockedEndDate || endDate

  // Track whether the scroll container has overflow to show/hide the scroll gradient
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const checkScroll = () => {
      const hasOverflow = container.scrollWidth > container.clientWidth
      const isNotAtEnd = container.scrollLeft + container.clientWidth < container.scrollWidth - 4
      setCanScrollRight(hasOverflow && isNotAtEnd)
    }

    checkScroll()
    container.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      container.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [])

  // Detect datesLocked transition for ring burst celebration
  const prevDatesLockedRef = useRef(progressSteps.datesLocked)
  const [showLockBurst, setShowLockBurst] = useState(false)

  useEffect(() => {
    if (progressSteps.datesLocked && !prevDatesLockedRef.current) {
      setShowLockBurst(true)
      // Trigger haptic feedback on native (safe if Capacitor not available)
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        import(/* webpackIgnore: true */ '@capacitor/haptics')
          .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
          .catch(() => {})
      }
      // Clear after animation
      const timer = setTimeout(() => setShowLockBurst(false), 500)
      return () => clearTimeout(timer)
    }
    prevDatesLockedRef.current = progressSteps.datesLocked
  }, [progressSteps.datesLocked])

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

  // Compute "Step X of Y" for mobile indicator
  const stepIndicator = useMemo(() => {
    const stageSteps = TRIP_PROGRESS_STEPS.filter(step => STAGE_STEP_KEYS.includes(step.key))
    const total = stageSteps.length
    const blockerIdx = stageSteps.findIndex(s => s.key === blockerStageKey)
    if (blockerIdx >= 0) return { current: blockerIdx + 1, total }
    // Find last completed step
    let lastCompletedIdx = -1
    stageSteps.forEach((s, i) => { if (progressSteps[s.key]) lastCompletedIdx = i })
    return { current: Math.min(total, lastCompletedIdx + 2), total }
  }, [progressSteps, blockerStageKey])

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
    <div className="border-b border-brand-carbon/10 bg-brand-sand/30 shrink-0 safe-top">
      {/* Row 1: Trip name + dates + participation meter */}
      <div className="flex items-center justify-between px-3 md:px-4 pt-2 pb-1 gap-2">
        <div className="flex items-baseline gap-2 min-w-0 flex-wrap">
          <Link
            href="/dashboard"
            className="flex-shrink-0 p-1 -ml-1 text-brand-carbon/50 hover:text-brand-carbon self-center"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base md:text-lg font-bold text-brand-carbon break-words min-w-0">
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
                  <p className="text-xs">You're leading this trip. You can lock dates and make key decisions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {dateDisplay && (
            <>
              <span className="text-brand-carbon/40 hidden sm:inline" aria-hidden="true">·</span>
              <span className="text-xs md:text-sm text-brand-carbon/60 hidden sm:inline whitespace-nowrap">
                {dateDisplay}
              </span>
            </>
          )}
        </div>
        {participationMeter && (
          <span className="text-sm text-brand-carbon/60 whitespace-nowrap shrink-0">
            {participationMeter.responded} of {participationMeter.total} {participationMeter.label}
          </span>
        )}
      </div>

      {/* Row 2: Stage circles - horizontal scroll with snap on mobile */}
      {/* Only shows main stages (Proposed → On Trip). Memories/Expenses are in bottom CTA bar */}
      <div className="relative">
      <div
        ref={scrollContainerRef}
        className={cn(
          'flex items-center justify-center gap-1 md:gap-2 px-2 md:px-3 pb-2',
          'overflow-x-auto scrollbar-none',
          'snap-x snap-mandatory md:snap-none'
        )}
      >
        {TRIP_PROGRESS_STEPS
          .filter(step => STAGE_STEP_KEYS.includes(step.key))
          .map((step, idx, arr) => {
            const isCompleted = progressSteps[step.key]
            const isBlocker = step.key === blockerStageKey
            const overlayType = STEP_TO_OVERLAY[step.key]
            const isActive = overlayType !== null && activeOverlay === overlayType
            const isClickable = overlayType !== null

            // Next step after blocker gets a dashed sand ring ("in motion")
            const isNextStep = !isCompleted && !isBlocker && idx > 0 && arr[idx - 1].key === blockerStageKey

            const isCurrent = isBlocker || isActive

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
                <StripCircle
                  isCompleted={isCompleted}
                  isBlocker={isBlocker}
                  isActiveOverlay={isActive}
                  isClickable={isClickable}
                  isNextStep={isNextStep}
                  icon={step.icon}
                  showRingBurst={step.key === 'datesLocked' && showLockBurst}
                />
                <span className={cn(
                  'text-[11px] md:text-xs font-medium leading-tight text-center whitespace-nowrap transition-colors duration-300',
                  isCurrent && 'underline underline-offset-2',
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
      {/* Right-edge fade gradient — only visible when more steps are scrollable */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white/80 via-white/40 to-transparent pointer-events-none md:hidden" />
      )}
      </div>

      {/* Mobile step counter */}
      <div className="flex justify-center pb-1.5 md:hidden">
        <span className="text-[11px] font-medium text-brand-carbon/40">
          Step {stepIndicator.current} of {stepIndicator.total}
        </span>
      </div>
    </div>
  )
}
