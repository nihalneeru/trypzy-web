'use client'

import { useState, useEffect, useRef } from 'react'
import { Calendar, ChevronRight, Lock } from 'lucide-react'
import { ResponsePips } from '@/components/common/ResponsePips'

/**
 * SchedulingStatusCard — pinned above chat, shows live scheduling state.
 * Reads trip.schedulingSummary (populated server-side for date_windows mode).
 * Returns null when scheduling is locked/complete or no summary available.
 * Shows a brief "sealed" card when transitioning to LOCKED before disappearing.
 */
export function SchedulingStatusCard({ trip, user, onOpenScheduling }) {
  const summary = trip?.schedulingSummary
  const { phase } = summary || {}

  // Detect LOCKED transition for seal animation
  const prevPhaseRef = useRef(phase)
  const [showSeal, setShowSeal] = useState(false)

  useEffect(() => {
    if (phase === 'LOCKED' && prevPhaseRef.current && prevPhaseRef.current !== 'LOCKED') {
      setShowSeal(true)
      const timer = setTimeout(() => setShowSeal(false), 2000)
      return () => clearTimeout(timer)
    }
    prevPhaseRef.current = phase
  }, [phase])

  if (!summary) return null

  // Show seal card briefly when locking
  if (phase === 'LOCKED' && showSeal) {
    return (
      <div className="mx-3 mt-2 mb-1">
        <div className="rounded-lg border border-brand-blue/30 bg-white overflow-hidden">
          <div className="flex">
            <div className="w-1 self-stretch rounded-l shrink-0 animate-accent-seal" />
            <div className="flex-1 px-3 py-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <Lock className="h-4 w-4 text-brand-blue" />
                <p className="text-sm font-semibold text-brand-carbon">Dates locked</p>
              </div>
              {summary.proposedWindowText && (
                <p className="text-lg font-bold text-brand-blue mt-1">{summary.proposedWindowText}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'LOCKED') return null

  const isLeader = trip?.createdBy === user?.id

  // Accent bar color: red when user hasn't acted, blue when responded
  const userHasActed = phase === 'COLLECTING' ? summary.userHasResponded : !!summary.userReaction

  if (phase === 'COLLECTING') {
    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenScheduling}
          className="w-full text-left rounded-lg border border-brand-sand bg-brand-sand/40 transition-colors hover:bg-brand-sand/60 active:bg-brand-sand/80 overflow-hidden"
        >
          <div className="flex">
            {/* Accent bar */}
            <div className={`w-1 self-stretch rounded-l shrink-0 ${userHasActed ? 'bg-brand-blue' : 'bg-brand-red'}`} />

            <div className="flex-1 px-3 py-2.5">
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

                  <div className="flex items-center gap-2 mt-1">
                    <ResponsePips responded={summary.responderCount} total={summary.totalTravelers} />
                    <span className="text-xs text-brand-carbon/60">
                      {summary.responderCount} of {summary.totalTravelers} weighed in
                    </span>
                  </div>

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
            </div>
          </div>
        </button>
      </div>
    )
  }

  if (phase === 'PROPOSED') {
    const stanceLabels = { WORKS: 'Works', CAVEAT: 'Maybe', CANT: "Can't" }
    const thresholdMet = summary.approvalCount >= summary.requiredApprovals

    return (
      <div className="mx-3 mt-2 mb-1">
        <button
          onClick={onOpenScheduling}
          className="w-full text-left rounded-lg border border-amber-200 bg-amber-50 transition-colors hover:bg-amber-100 active:bg-amber-200/60 overflow-hidden"
        >
          <div className="flex">
            {/* Accent bar */}
            <div className={`w-1 self-stretch rounded-l shrink-0 ${userHasActed ? 'bg-brand-blue' : 'bg-brand-red'}`} />

            <div className="flex-1 px-3 py-2.5">
              <div className="flex items-start gap-2.5">
                <Calendar className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-brand-carbon">
                      Leader proposed {summary.proposedWindowText || 'dates'}
                    </p>
                    <ChevronRight className="h-4 w-4 text-brand-carbon/40 shrink-0" />
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <ResponsePips responded={summary.totalReactions} total={summary.totalTravelers} />
                    <span className="text-xs text-brand-carbon/60">
                      {summary.totalReactions} of {summary.totalTravelers} reacted
                    </span>
                  </div>

                  {summary.userReaction && (
                    <p className="text-xs text-brand-carbon/60 mt-1">
                      Your stance: <span className="font-medium">{stanceLabels[summary.userReaction] || summary.userReaction}</span>
                    </p>
                  )}

                  {isLeader && thresholdMet && (
                    <p className="text-xs font-medium text-brand-blue mt-1">
                      Threshold met — you can lock dates
                    </p>
                  )}
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
            </div>
          </div>
        </button>
      </div>
    )
  }

  return null
}
