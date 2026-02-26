'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import Link from 'next/link'
import { circlePageHref } from '@/lib/navigation/routes'

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * CircleOverview — horizontal scrollable strip of circle bubbles
 * Each circle is a rounded bubble with stacked avatars and stats.
 * Tapping navigates to circle detail page.
 */
export function CircleOverview({ circles }) {
  if (!circles || circles.length === 0) return null

  return (
    <div className="mb-6">
      <div
        className="flex gap-4 overflow-x-auto scrollbar-none pb-1 snap-x snap-mandatory"
        role="list"
        aria-label="Your circles"
      >
        {circles.map((circle) => {
          const tripCount = (circle.trips?.length || 0) + (circle.cancelledTrips?.length || 0)
          const memberCount = circle.memberCount || 0
          const preview = circle.memberPreview || []

          return (
            <Link
              key={circle.id}
              href={circlePageHref(circle.id)}
              prefetch={false}
              className="snap-start shrink-0 flex flex-col items-center text-center group"
              role="listitem"
            >
              {/* Bubble — circular container with avatars inside */}
              <div className="w-20 h-20 rounded-full bg-brand-sand/60 border-2 border-brand-sand group-hover:border-brand-blue/40 transition-colors flex items-center justify-center relative">
                {/* Stacked avatars in a 2x2 grid inside the bubble */}
                <div className="flex flex-wrap items-center justify-center gap-0.5">
                  {preview.slice(0, 4).map((member, i) => (
                    <Avatar key={i} className="h-7 w-7 ring-1 ring-white">
                      {member.image && <AvatarImage src={member.image} alt={member.name} />}
                      <AvatarFallback className="text-[9px] bg-brand-blue text-white font-medium">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {/* Overflow count badge */}
                {memberCount > 4 && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center h-5 w-5 rounded-full bg-brand-blue text-[9px] font-bold text-white ring-2 ring-white">
                    +{memberCount - 4}
                  </span>
                )}
              </div>

              {/* Circle name */}
              <p className="text-xs font-semibold text-brand-carbon mt-2 max-w-[5.5rem] truncate group-hover:text-brand-blue transition-colors">
                {circle.name}
              </p>

              {/* Trip count */}
              <p className="text-[10px] text-brand-carbon/40">
                {tripCount} {tripCount === 1 ? 'trip' : 'trips'}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
