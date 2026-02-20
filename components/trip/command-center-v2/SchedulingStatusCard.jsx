'use client'

import { Calendar, ChevronRight } from 'lucide-react'

/**
 * SchedulingStatusCard — pinned above chat, shows live scheduling state.
 * Reads trip.schedulingSummary (populated server-side for date_windows mode).
 * Returns null when scheduling is locked/complete or no summary available.
 */
export function SchedulingStatusCard({ trip, user, onOpenScheduling }) {
  const summary = trip?.schedulingSummary
  if (!summary) return null

  const { phase } = summary
  if (phase === 'LOCKED') return null

  const isLeader = trip?.createdBy === user?.id

  if (phase === 'COLLECTING') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenScheduling}
          className="w-full text-left rounded-lg border border-brand-sand bg-brand-sand/40 px-3 py-2.5 transition-colors hover:bg-brand-sand/60 active:bg-brand-sand/80"
        >
          <div className="flex items-start gap-2.5">
            <Calendar className="h-4 w-4 text-brand-carbon/60 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-carbon">
                  {summary.windowCount === 0
                    ? 'No dates suggested yet'
                    : `${summary.windowCount} date${summary.windowCount === 1 ? '' : 's'} suggested`}
                  {summary.leadingWindowText && summary.windowCount > 0 && (
                    <span className="font-normal text-brand-carbon/70">
                      {' · '}{summary.leadingWindowText} leads ({summary.leadingSupportCount})
                    </span>
                  )}
                </p>
                <ChevronRight className="h-4 w-4 text-brand-carbon/40 shrink-0" />
              </div>

              <p className="text-xs text-brand-carbon/60 mt-0.5">
                {summary.responderCount} of {summary.totalTravelers} weighed in
              </p>

              {isLeader && summary.proposalReady && (
                <p className="text-xs font-medium text-brand-blue mt-1">
                  Ready to propose — the group has a clear favorite
                </p>
              )}
            </div>
          </div>

          {/* CTA hint */}
          <div className="mt-2 flex justify-end">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              !summary.userHasResponded
                ? 'bg-brand-red text-white'
                : 'bg-brand-blue/10 text-brand-blue'
            }`}>
              {!summary.userHasResponded ? 'Add your dates' : 'View dates'}
            </span>
          </div>
        </button>
      </div>
    )
  }

  if (phase === 'PROPOSED') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenScheduling}
          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 transition-colors hover:bg-amber-100 active:bg-amber-200/60"
        >
          <div className="flex items-start gap-2.5">
            <Calendar className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-carbon">
                  Leader proposed {summary.proposedWindowText || 'dates'}
                </p>
                <ChevronRight className="h-4 w-4 text-brand-carbon/40 shrink-0" />
              </div>

              <p className="text-xs text-brand-carbon/60 mt-0.5">
                {summary.approvalCount} approved · {summary.totalReactions} of {summary.totalTravelers} reacted
              </p>
            </div>
          </div>

          {/* CTA hint */}
          <div className="mt-2 flex justify-end">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              !summary.userReaction
                ? 'bg-brand-red text-white'
                : 'bg-amber-200/60 text-amber-800'
            }`}>
              {!summary.userReaction ? 'React now' : 'View proposal'}
            </span>
          </div>
        </button>
      </div>
    )
  }

  return null
}
