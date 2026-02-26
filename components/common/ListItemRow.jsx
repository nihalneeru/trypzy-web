'use client'

import { cn } from '@/lib/utils'

/**
 * Standard list row layout: avatar left, title+description center, action right.
 * Foundation component for member lists, itinerary items, prep checklists, etc.
 */
export function ListItemRow({ avatar, title, description, action, className }) {
  return (
    <div className={cn('flex items-center gap-3 py-2', className)}>
      {avatar && (
        <div className="shrink-0">
          {avatar}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-carbon truncate">{title}</p>
        {description && (
          <p className="text-xs text-brand-carbon/60 truncate">{description}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0">
          {action}
        </div>
      )}
    </div>
  )
}
