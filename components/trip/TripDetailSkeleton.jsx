'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader matching the trip detail (Command Center V3) layout:
 * - AppHeader bar
 * - ProgressStrip (trip name + 5 chevron pills)
 * - Chat area (5 message bubbles)
 * - CTA bar
 */
export function TripDetailSkeleton() {
  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* AppHeader placeholder */}
      <div className="h-14 bg-white border-b border-brand-carbon/10 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-full">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Main content - constrained like CommandCenterV3 */}
      <div className="flex-1 flex flex-col min-h-0 max-w-5xl mx-auto w-full bg-white">
        {/* ProgressStrip placeholder */}
        <div className="shrink-0 border-b border-brand-sand/50 px-4 py-3">
          {/* Row 1: Trip name + dates */}
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-32" />
          </div>
          {/* Row 2: Chevron pills */}
          <div className="flex items-center gap-1 overflow-hidden">
            {['w-20', 'w-16', 'w-20', 'w-14', 'w-12'].map((w, i) => (
              <Skeleton key={i} className={`h-7 ${w} rounded-md`} />
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-4 gap-3">
          {/* System message */}
          <div className="flex justify-center">
            <Skeleton className="h-10 w-3/4 rounded-lg" />
          </div>
          {/* Message bubbles - alternating alignment */}
          <div className="flex justify-start">
            <div className="flex items-start gap-2 max-w-[70%]">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-14 w-48 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
          <div className="flex justify-start">
            <div className="flex items-start gap-2 max-w-[70%]">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <Skeleton className="h-16 w-56 rounded-lg" />
            </div>
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </div>

        {/* Chat input placeholder */}
        <div className="shrink-0 px-4 py-2 border-t border-brand-sand/50">
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 flex-1 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>

        {/* CTA bar placeholder */}
        <div className="shrink-0 px-2 py-2" style={{ backgroundColor: 'var(--brand-red)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Skeleton className="h-9 w-20 rounded-md bg-white/20" />
              <Skeleton className="h-9 w-20 rounded-md bg-white/20" />
              <Skeleton className="h-9 w-20 rounded-md bg-white/20" />
            </div>
            <Skeleton className="h-9 w-36 rounded-md bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  )
}
