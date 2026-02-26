'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton loader matching the dashboard layout:
 * - AppHeader bar
 * - "Dashboard" heading
 * - "Your Circles" heading with action buttons
 * - 2 circle sections, each with 3 trip card placeholders
 */
export function DashboardSkeleton() {
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
        {/* Dashboard heading */}
        <Skeleton className="h-9 w-48 mb-6" />

        {/* Your Circles heading row */}
        <div className="flex items-center justify-between mb-6 mt-2">
          <Skeleton className="h-7 w-36" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>

        {/* Circle sections */}
        {[0, 1].map((i) => (
          <div key={i} className="mb-8">
            {/* Circle header */}
            <div className="flex items-center gap-3 mb-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div>
                <Skeleton className="h-5 w-40 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>

            {/* Trip cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[0, 1, 2].map((j) => (
                <div key={j} className="bg-white rounded-lg border border-brand-carbon/10 p-4">
                  <Skeleton className="h-5 w-3/4 mb-3" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-2/3 mb-4" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
