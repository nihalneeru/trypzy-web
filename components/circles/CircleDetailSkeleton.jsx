'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader matching the circle detail page layout:
 * - AppHeader bar
 * - CircleHeader (avatar + name + stats)
 * - Tab bar (4 tabs)
 * - Content rows
 */
export function CircleDetailSkeleton() {
  return (
    <div className="min-h-screen bg-brand-sand/30">
      {/* AppHeader placeholder */}
      <div className="h-14 bg-white border-b border-brand-carbon/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-full">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* CircleHeader placeholder */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>

        {/* Tab bar placeholder */}
        <div className="flex items-center gap-1 mb-6 border-b border-brand-carbon/10 pb-1">
          {['w-32', 'w-24', 'w-16', 'w-24'].map((w, i) => (
            <Skeleton key={i} className={`h-9 ${w} rounded-md`} />
          ))}
        </div>

        {/* Content rows */}
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-brand-carbon/10 p-4">
              <div className="flex items-center gap-3 mb-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
