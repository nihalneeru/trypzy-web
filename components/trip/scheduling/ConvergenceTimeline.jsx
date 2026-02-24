'use client'

import { useMemo } from 'react'

const DAY_MS = 86400000

/**
 * ConvergenceTimeline — Per-day availability heat strip with text summary.
 *
 * Answers the question: "Which dates work for the most people?"
 *
 * Data model: for each day in the global range, count the number of UNIQUE
 * travelers who support at least one window that covers that day. This avoids
 * double-counting when a traveler supports multiple overlapping windows.
 *
 * Visual: a compact row of day cells colored by availability intensity, plus
 * a one-line text summary ("Best overlap: Mar 10–15 · 7 of 9 available").
 *
 * Only renders when there are >= 2 windows with concrete start/end dates.
 *
 * Props:
 *   windows        — array of DateWindow objects (from DateWindowsFunnel)
 *   totalTravelers — total number of travelers on the trip (for "X of Y" display)
 */
export function ConvergenceTimeline({ windows, totalTravelers = 0 }) {
  const data = useMemo(() => {
    if (!windows || windows.length < 2) return null

    // Only include windows with concrete start/end dates (exclude unstructured)
    const dated = windows.filter(w => w.startDate && w.endDate)
    if (dated.length < 2) return null

    const toMs = (d) => new Date(d + 'T12:00:00').getTime()
    const globalMin = Math.min(...dated.map(w => toMs(w.startDate)))
    const globalMax = Math.max(...dated.map(w => toMs(w.endDate)))

    // Safety: don't render if span exceeds 120 days (performance / readability)
    const totalDays = Math.round((globalMax - globalMin) / DAY_MS) + 1
    if (totalDays <= 0 || totalDays > 120) return null

    // Build per-day unique traveler counts
    const days = []
    let peakCount = 0

    for (let time = globalMin; time <= globalMax; time += DAY_MS) {
      const available = new Set()

      dated.forEach(w => {
        const wStart = toMs(w.startDate)
        const wEnd = toMs(w.endDate)
        if (time >= wStart && time <= wEnd) {
          // Use supporterIds for accurate unique-traveler counting
          if (w.supporterIds && Array.isArray(w.supporterIds)) {
            w.supporterIds.forEach(uid => available.add(uid))
          }
          // Also count the proposer (they implicitly support their own window)
          if (w.proposedBy) {
            available.add(w.proposedBy)
          }
        }
      })

      const count = available.size
      if (count > peakCount) peakCount = count
      days.push({ time, count })
    }

    if (peakCount === 0) return null

    // Find the best contiguous stretch: longest run of days at peak availability
    let bestStretch = null
    let currentStart = null
    let currentLength = 0

    for (let i = 0; i < days.length; i++) {
      if (days[i].count === peakCount) {
        if (currentStart === null) currentStart = i
        currentLength++
      } else {
        if (currentLength > 0 && (!bestStretch || currentLength > bestStretch.length)) {
          bestStretch = { startIdx: currentStart, length: currentLength }
        }
        currentStart = null
        currentLength = 0
      }
    }
    // Check final stretch
    if (currentLength > 0 && (!bestStretch || currentLength > bestStretch.length)) {
      bestStretch = { startIdx: currentStart, length: currentLength }
    }

    // Format the best stretch label
    const fmt = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    let bestLabel = null
    if (bestStretch) {
      const startTime = days[bestStretch.startIdx].time
      const endTime = days[bestStretch.startIdx + bestStretch.length - 1].time
      bestLabel = startTime === endTime
        ? fmt(startTime)
        : `${fmt(startTime)} – ${fmt(endTime)}`
    }

    return { days, peakCount, bestStretch, bestLabel, totalDays }
  }, [windows])

  if (!data) return null

  const { days, peakCount, bestStretch, bestLabel, totalDays } = data
  const showDenominator = totalTravelers > 0

  // Determine which axis labels to show (sparse labeling to avoid clutter)
  const getAxisLabel = (time, index) => {
    const d = new Date(time)
    const dayOfMonth = d.getDate()
    const isFirst = index === 0
    const isLast = index === days.length - 1

    if (isFirst || isLast || dayOfMonth === 1) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    // For shorter ranges (<= 21 days), show weekly Monday markers
    if (totalDays <= 21 && d.getDay() === 1) {
      return String(dayOfMonth)
    }
    return null
  }

  // Color intensity: discrete levels based on fraction of peak
  const getCellColor = (count, index) => {
    if (count === 0) return 'bg-gray-100'

    const fraction = count / peakCount
    const isPeak = bestStretch &&
      index >= bestStretch.startIdx &&
      index < bestStretch.startIdx + bestStretch.length

    if (isPeak) return 'bg-brand-red'
    if (fraction >= 0.7) return 'bg-brand-blue/60'
    if (fraction >= 0.4) return 'bg-brand-blue/30'
    return 'bg-brand-sand'
  }

  return (
    <div className="space-y-2">
      {/* Text summary — the primary information */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-medium text-brand-carbon/50 uppercase tracking-wide">
            Best overlap
          </p>
          <p className="text-sm font-semibold text-brand-blue leading-tight">
            {bestLabel || 'No overlap yet'}
          </p>
        </div>
        {bestLabel && (
          <div className="text-right">
            <span className="text-lg font-bold text-brand-carbon">{peakCount}</span>
            {showDenominator && (
              <span className="text-xs text-brand-carbon/50">/{totalTravelers}</span>
            )}
            <p className="text-[10px] text-brand-carbon/40 leading-tight">available</p>
          </div>
        )}
      </div>

      {/* Heat strip — compact row of day cells */}
      <div className="overflow-x-auto no-scrollbar">
        <div
          className="flex gap-px px-1"
          style={{ minWidth: days.length > 30 ? `${days.length * 10}px` : 'auto' }}
        >
          {days.map((day, i) => {
            const label = getAxisLabel(day.time, i)

            return (
              <div key={day.time} className="flex flex-col items-center" style={{ flex: '1 1 0', minWidth: '8px' }}>
                {/* Cell */}
                <div
                  className={`w-full rounded-sm transition-colors duration-300 ${getCellColor(day.count, i)}`}
                  style={{ height: '20px' }}
                  title={`${new Date(day.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${day.count} available`}
                />
                {/* Axis label (sparse) */}
                {label ? (
                  <span className="text-[8px] text-brand-carbon/40 mt-0.5 whitespace-nowrap">
                    {label}
                  </span>
                ) : (
                  <span className="h-[12px]" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-red" />
          <span className="text-[9px] text-brand-carbon/40">Best</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-blue/60" />
          <span className="text-[9px] text-brand-carbon/40">Good</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-blue/30" />
          <span className="text-[9px] text-brand-carbon/40">Some</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-sand" />
          <span className="text-[9px] text-brand-carbon/40">Few</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-sm bg-gray-100" />
          <span className="text-[9px] text-brand-carbon/40">None</span>
        </div>
      </div>
    </div>
  )
}
