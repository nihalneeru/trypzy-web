'use client'

/**
 * ConfidenceMeter — visual bar showing how close a window is to proposal-ready.
 * Replaces numeric threshold text with a colored progress bar + label.
 */
export function ConfidenceMeter({ current, target }) {
  const ratio = Math.min(current / Math.max(target, 1), 1)

  let fillColor, label
  if (ratio >= 1) {
    fillColor = 'bg-brand-red'
    label = 'Ready when you are'
  } else if (ratio >= 0.8) {
    fillColor = 'bg-brand-blue/60'
    label = `${current} of ${target} on board`
  } else if (ratio >= 0.5) {
    fillColor = 'bg-brand-blue/30'
    label = `${current} of ${target} on board`
  } else {
    fillColor = 'bg-brand-sand'
    label = `${current} of ${target} responded`
  }

  return (
    <div className="flex items-center gap-2" title={`${current} of ${target} needed`}>
      <div className="flex-1 h-1 rounded-full bg-brand-carbon/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${fillColor} transition-all duration-500`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="text-xs text-brand-carbon/60 whitespace-nowrap">{label}</span>
    </div>
  )
}
