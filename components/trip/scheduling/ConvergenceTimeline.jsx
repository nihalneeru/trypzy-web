'use client'

import { useMemo } from 'react'

/**
 * ConvergenceTimeline — div-based date range visualization.
 * Shows all proposed date windows as horizontal bars on a shared timeline.
 * Highlights overlap zones and the most-supported window.
 *
 * Only renders when windows.length >= 2.
 */
export function ConvergenceTimeline({ windows, proposedWindowId = null }) {
  const timeline = useMemo(() => {
    if (!windows || windows.length < 2) return null

    // Filter to windows with parseable dates
    const dated = windows.filter(w => w.startDate && w.endDate)
    if (dated.length < 2) return null

    const toMs = (d) => new Date(d + 'T12:00:00').getTime()
    const globalMin = Math.min(...dated.map(w => toMs(w.startDate)))
    const globalMax = Math.max(...dated.map(w => toMs(w.endDate)))
    const span = globalMax - globalMin
    if (span <= 0) return null

    const pct = (ms) => ((ms - globalMin) / span) * 100

    // Most-supported window
    const maxSupport = Math.max(...dated.map(w => w.supportCount || 0))
    const mostSupportedId = maxSupport > 0
      ? dated.find(w => w.supportCount === maxSupport)?.id
      : null

    // Compute overlap zones (pairwise intersections)
    const overlaps = []
    for (let i = 0; i < dated.length; i++) {
      for (let j = i + 1; j < dated.length; j++) {
        const overlapStart = Math.max(toMs(dated[i].startDate), toMs(dated[j].startDate))
        const overlapEnd = Math.min(toMs(dated[i].endDate), toMs(dated[j].endDate))
        if (overlapStart < overlapEnd) {
          overlaps.push({ start: overlapStart, end: overlapEnd })
        }
      }
    }

    // Merge overlapping overlap zones
    const merged = []
    const sorted = overlaps.sort((a, b) => a.start - b.start)
    for (const zone of sorted) {
      const last = merged[merged.length - 1]
      if (last && zone.start <= last.end) {
        last.end = Math.max(last.end, zone.end)
      } else {
        merged.push({ ...zone })
      }
    }

    // Format date label
    const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    return { dated, pct, mostSupportedId, overlaps: merged, globalMin, globalMax, fmtDate }
  }, [windows, proposedWindowId])

  if (!timeline) return null

  const { dated, pct, mostSupportedId, overlaps, globalMin, globalMax, fmtDate } = timeline
  const isAnimatingOut = !!proposedWindowId

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-brand-carbon/60">Date overlap</p>
      <div className="relative h-8 bg-gray-50 rounded border border-gray-100">
        {/* Overlap zones */}
        {overlaps.map((zone, i) => (
          <div
            key={`overlap-${i}`}
            className="absolute top-0 bottom-0 bg-brand-blue/10 rounded"
            style={{ left: `${pct(zone.start)}%`, width: `${pct(zone.end) - pct(zone.start)}%` }}
          />
        ))}

        {/* Window bars */}
        {dated.map((w) => {
          const isProposed = w.id === proposedWindowId
          const isMostSupported = w.id === mostSupportedId && !proposedWindowId
          const shouldHide = isAnimatingOut && !isProposed

          return (
            <div
              key={w.id}
              className={`absolute top-1.5 h-5 rounded bg-brand-sand/60 transition-all duration-300 ${
                isMostSupported ? 'border-b-2 border-brand-red' : ''
              } ${shouldHide ? 'opacity-0 scale-y-0' : 'opacity-100 scale-y-100'}`}
              style={{
                left: `${pct(new Date(w.startDate + 'T12:00:00').getTime())}%`,
                width: `${Math.max(
                  pct(new Date(w.endDate + 'T12:00:00').getTime()) -
                  pct(new Date(w.startDate + 'T12:00:00').getTime()),
                  2
                )}%`,
                transformOrigin: 'center',
              }}
              title={`${w.sourceText || `${w.startDate} – ${w.endDate}`} (${w.supportCount} supporters)`}
            />
          )
        })}
      </div>

      {/* Date axis labels */}
      <div className="flex justify-between text-[10px] text-brand-carbon/40 px-0.5">
        <span>{fmtDate(globalMin)}</span>
        <span>{fmtDate(globalMax)}</span>
      </div>
    </div>
  )
}
