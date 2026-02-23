'use client'

import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

/**
 * ActionCard displays a contextual CTA card for next actions
 * 
 * @param {Object} props
 * @param {Object} props.action - NextAction object from getNextAction
 * @param {Function} props.onDismiss - Callback when card is dismissed
 * @param {Function} props.onAction - Callback when primary button is clicked
 * @param {boolean} props.actionRequired - Whether action is required (for red styling)
 */
export function ActionCard({
  action,
  onDismiss,
  onAction,
  actionRequired = false
}: {
  action: {
    id: string
    title: string
    description: string
    ctaLabel: string
    kind: 'deeplink' | 'inline'
    deeplinkTab?: string
    actionRequired?: boolean
  }
  onDismiss: () => void
  onAction: () => void
  actionRequired?: boolean
}) {
  return (
    <div className="mb-4 p-4 bg-brand-sand/40 border border-brand-blue/20 rounded-lg flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-brand-carbon mb-1">
            {action.title}
          </h3>
          <p className="text-sm text-gray-700">
            {action.description}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex items-center gap-2">
        <Button
          onClick={onAction}
          size="sm"
          className={`flex-shrink-0 h-10 md:h-9 ${actionRequired ? 'bg-brand-red hover:bg-brand-red/90' : ''}`}
        >
          {action.ctaLabel}
        </Button>
      </div>
    </div>
  )
}
