'use client'

import { Button } from '@/components/ui/button'
import { X, ChevronRight } from 'lucide-react'

/**
 * ActionCard displays a contextual CTA card for next actions
 * 
 * @param {Object} props
 * @param {Object} props.action - NextAction object from getNextAction
 * @param {Function} props.onDismiss - Callback when card is dismissed
 * @param {Function} props.onAction - Callback when primary button is clicked
 * @param {Function} [props.onSeeDetails] - Optional callback for "See details" link
 */
export function ActionCard({
  action,
  onDismiss,
  onAction,
  onSeeDetails
}: {
  action: {
    id: string
    title: string
    description: string
    ctaLabel: string
    kind: 'deeplink' | 'inline'
    deeplinkTab?: string
  }
  onDismiss: () => void
  onAction: () => void
  onSeeDetails?: () => void
}) {
  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {action.title}
          </h3>
          <p className="text-sm text-gray-700">
            {action.description}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          onClick={onAction}
          size="sm"
          className="flex-shrink-0"
        >
          {action.ctaLabel}
        </Button>
        {/* "See details" link only shown for inline actions */}
        {action.kind === 'inline' && onSeeDetails && (
          <button
            onClick={onSeeDetails}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            See details
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
