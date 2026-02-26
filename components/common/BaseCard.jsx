'use client'

import { cn } from '@/lib/utils'

/**
 * Consistent card wrapper with padding, shadow, and border-radius.
 * Foundation component for trip cards, list cards, info panels, etc.
 */
export function BaseCard({ children, className, onClick }) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      className={cn(
        'bg-white rounded-xl border border-brand-carbon/10 shadow-sm p-4 text-left w-full',
        onClick && 'cursor-pointer hover:shadow-md transition-shadow',
        className
      )}
      onClick={onClick}
    >
      {children}
    </Component>
  )
}
