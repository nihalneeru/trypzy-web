'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

/**
 * toDateStr — returns YYYY-MM-DD for a Date, using local time.
 */
function toDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * DateRangePicker — lightweight calendar for selecting a date range.
 *
 * Props:
 *  - onSelect({ startDate, endDate })  called when both dates are picked
 *  - selectedStart (YYYY-MM-DD)        optional controlled start
 *  - selectedEnd   (YYYY-MM-DD)        optional controlled end
 */
export function DateRangePicker({ onSelect, selectedStart, selectedEnd, heatData, totalTravelers }) {
  const today = useMemo(() => {
    const d = new Date()
    return toDateStr(d)
  }, [])

  // The first month to display (year, monthIndex 0-11)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  // Internal selection state
  const [rangeStart, setRangeStart] = useState(selectedStart || null)
  const [rangeEnd, setRangeEnd] = useState(selectedEnd || null)
  // Hover preview
  const [hoverDate, setHoverDate] = useState(null)

  // Sync from controlled props (e.g. smart chip pre-selection)
  useEffect(() => {
    if (selectedStart) {
      setRangeStart(selectedStart)
      setRangeEnd(selectedEnd || null)
      // Navigate calendar to the start date's month
      const d = new Date(selectedStart + 'T12:00:00')
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
      // Fire onSelect if we have both
      if (selectedEnd) {
        onSelect?.({ startDate: selectedStart, endDate: selectedEnd })
      }
    }
  }, [selectedStart, selectedEnd])

  const goForward = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
  }, [])

  const goBack = useCallback(() => {
    // Don't go before current month
    const now = new Date()
    if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
  }, [viewYear, viewMonth])

  const canGoBack = useMemo(() => {
    const now = new Date()
    return !(viewYear === now.getFullYear() && viewMonth === now.getMonth())
  }, [viewYear, viewMonth])

  const handleDayClick = useCallback(
    (dateStr) => {
      if (dateStr < today) return // past date

      if (!rangeStart || rangeEnd) {
        // Starting a new selection
        setRangeStart(dateStr)
        setRangeEnd(null)
        setHoverDate(null)
      } else {
        // Completing the selection
        if (dateStr < rangeStart) {
          // Clicked before start — swap
          setRangeEnd(rangeStart)
          setRangeStart(dateStr)
          onSelect?.({ startDate: dateStr, endDate: rangeStart })
        } else if (dateStr === rangeStart) {
          // Same day = single-day range
          setRangeEnd(dateStr)
          onSelect?.({ startDate: dateStr, endDate: dateStr })
        } else {
          setRangeEnd(dateStr)
          onSelect?.({ startDate: rangeStart, endDate: dateStr })
        }
      }
    },
    [rangeStart, rangeEnd, today, onSelect]
  )

  // Build grid data for a single month
  const buildMonthGrid = useCallback((year, month) => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()

    // getDay() returns 0=Sun ... 6=Sat. We want Mon=0 ... Sun=6
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6

    const cells = []

    // Leading empty cells
    for (let i = 0; i < startDow; i++) {
      cells.push({ key: `empty-${i}`, dateStr: null })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      cells.push({ key: toDateStr(date), dateStr: toDateStr(date), day: d })
    }

    return { year, month, cells, label: `${MONTH_NAMES[month]} ${year}` }
  }, [])

  // Two months to render
  const month1 = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth, buildMonthGrid]
  )

  const month2Year = viewMonth === 11 ? viewYear + 1 : viewYear
  const month2Month = viewMonth === 11 ? 0 : viewMonth + 1

  const month2 = useMemo(
    () => buildMonthGrid(month2Year, month2Month),
    [month2Year, month2Month, buildMonthGrid]
  )

  // Determine effective preview end while hovering
  const effectiveEnd = rangeEnd || (rangeStart && hoverDate && hoverDate >= rangeStart ? hoverDate : null)

  function getCellClasses(dateStr) {
    if (!dateStr) return ''

    const isPast = dateStr < today
    if (isPast) return 'opacity-40 pointer-events-none text-brand-carbon/40'

    const isStart = dateStr === rangeStart
    const isEnd = dateStr === (rangeEnd || effectiveEnd)
    const inRange =
      rangeStart &&
      effectiveEnd &&
      dateStr > rangeStart &&
      dateStr < effectiveEnd

    // Selection colors take precedence over heat
    if (isStart && isEnd) {
      return 'bg-brand-red text-white rounded-lg font-semibold'
    }
    if (isStart) {
      return 'bg-brand-red text-white rounded-l-lg font-semibold'
    }
    if (isEnd) {
      return 'bg-brand-red text-white rounded-r-lg font-semibold'
    }
    if (inRange) {
      return 'bg-brand-sand text-brand-carbon'
    }

    // Heat tint from availability data (when not selected)
    if (heatData && totalTravelers > 0 && heatData[dateStr]) {
      const fraction = heatData[dateStr] / totalTravelers
      if (fraction >= 0.6) return 'bg-brand-blue/20 text-brand-carbon rounded-lg hover:bg-brand-blue/30'
      if (fraction >= 0.3) return 'bg-brand-blue/10 text-brand-carbon rounded-lg hover:bg-brand-blue/20'
      return 'bg-brand-sand/60 text-brand-carbon rounded-lg hover:bg-brand-sand'
    }

    // Default: future date
    return 'hover:bg-brand-sand/50 text-brand-carbon rounded-lg'
  }

  function renderMonth(monthData) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-brand-carbon text-center mb-2">
          {monthData.label}
        </h4>
        <div className="grid grid-cols-7 gap-0">
          {/* Day headers */}
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-medium text-muted-foreground pb-1"
            >
              {d}
            </div>
          ))}
          {/* Day cells */}
          {monthData.cells.map((cell) => (
            <div
              key={cell.key}
              className={`h-9 flex items-center justify-center text-sm cursor-pointer select-none transition-colors ${getCellClasses(
                cell.dateStr
              )}`}
              onClick={() => cell.dateStr && handleDayClick(cell.dateStr)}
              onMouseEnter={() => {
                if (cell.dateStr && rangeStart && !rangeEnd && cell.dateStr >= rangeStart) {
                  setHoverDate(cell.dateStr)
                }
              }}
              onMouseLeave={() => setHoverDate(null)}
            >
              {cell.day || ''}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between px-1">
        <button
          onClick={goBack}
          disabled={!canGoBack}
          className="p-1.5 rounded-md hover:bg-brand-sand/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4 text-brand-carbon" />
        </button>
        <button
          onClick={goForward}
          className="p-1.5 rounded-md hover:bg-brand-sand/50 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4 text-brand-carbon" />
        </button>
      </div>

      {/* Calendar grids — single-column on mobile, 2-column on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderMonth(month1)}
        {renderMonth(month2)}
      </div>

      {/* Selection summary */}
      {rangeStart && rangeEnd && (
        <p className="text-xs text-center text-muted-foreground">
          Selected: {formatDisplay(rangeStart)} &ndash; {formatDisplay(rangeEnd)}
        </p>
      )}
      {rangeStart && !rangeEnd && (
        <p className="text-xs text-center text-muted-foreground">
          Tap an end date to complete your selection
        </p>
      )}
    </div>
  )
}

/** Format YYYY-MM-DD to "Feb 7, 2026" style */
function formatDisplay(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return dateStr
  }
}
