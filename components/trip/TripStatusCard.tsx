'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, X, MapPin } from 'lucide-react'

interface TripStatusSummary {
  phase: string
  stats: string | null
  sinceLastVisit: { summary: string } | null
  nextAction: string | null
  nextActionRole: 'traveler' | 'leader' | null
}

interface TripStatusCardProps {
  tripId: string
  summary: TripStatusSummary | null
  isLeader: boolean
  onActionClick?: () => void
}

export function TripStatusCard({ tripId, summary, isLeader, onActionClick }: TripStatusCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Restore dismissed state from localStorage
  useEffect(() => {
    const key = `tripti_status_dismissed_${tripId}`
    if (localStorage.getItem(key) === 'true') {
      setDismissed(true)
    }
  }, [tripId])

  if (!summary || dismissed) return null

  // Don't show for canceled trips
  if (summary.phase === 'Trip canceled') return null

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem(`tripti_status_dismissed_${tripId}`, 'true')
  }

  // Determine if the next action is relevant to this user
  const showAction = summary.nextAction && (
    (summary.nextActionRole === 'traveler') ||
    (summary.nextActionRole === 'leader' && isLeader)
  )

  return (
    <div className="mx-3 mt-2 mb-1">
      <div className="rounded-lg border border-brand-sand bg-brand-sand/40 px-3 py-2.5">
        {/* Header row: icon + phase + collapse/dismiss buttons */}
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-brand-carbon/60 shrink-0" />
          <p className="text-sm font-medium text-brand-carbon flex-1 min-w-0 truncate">
            {summary.phase}
          </p>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-0.5 rounded hover:bg-brand-carbon/5 text-brand-carbon/40"
            aria-label={collapsed ? 'Expand status card' : 'Collapse status card'}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleDismiss}
            className="p-0.5 rounded hover:bg-brand-carbon/5 text-brand-carbon/40"
            aria-label="Dismiss status card"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Expanded content */}
        {!collapsed && (
          <div className="mt-1.5 ml-6">
            {summary.stats && (
              <p className="text-xs text-brand-carbon/60">{summary.stats}</p>
            )}

            {summary.sinceLastVisit && (
              <p className="text-xs text-brand-blue mt-1">
                Since you were last here: {summary.sinceLastVisit.summary}
              </p>
            )}

            {showAction && onActionClick && (
              <button
                onClick={onActionClick}
                className="mt-1.5 text-xs font-semibold text-brand-red hover:text-brand-red/80 transition-colors"
              >
                &rarr; {summary.nextAction}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
