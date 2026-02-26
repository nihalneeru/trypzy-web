'use client'

import { cn } from '@/lib/utils'

/**
 * Unified empty state with icon, title, description, and optional CTA.
 * Foundation component for empty lists, no-results states, first-time experiences.
 */
export function EmptyState({ icon, title, description, cta, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}>
      {icon && (
        <div className="mb-4 text-brand-carbon/30 animate-pulse">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-brand-carbon mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-brand-carbon/60 max-w-xs">{description}</p>
      )}
      {cta && (
        <div className="mt-4">
          {cta}
        </div>
      )}
    </div>
  )
}
