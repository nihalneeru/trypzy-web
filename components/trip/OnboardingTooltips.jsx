'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

const TIPS = [
  {
    id: 'progress',
    text: "These circles show your trip's progress \u2014 red means it needs attention",
    position: 'top', // appears near top of screen
  },
  {
    id: 'cta',
    text: 'Start here \u2014 this shows your next step',
    position: 'bottom', // appears near bottom CTA bar
  },
]

export function OnboardingTooltips() {
  const [currentTip, setCurrentTip] = useState(null)

  useEffect(() => {
    // Only show on first ever trip visit
    if (localStorage.getItem('tripti_onboarding_seen')) return

    // Small delay so the page renders first
    const timer = setTimeout(() => setCurrentTip(0), 800)
    return () => clearTimeout(timer)
  }, [])

  const dismiss = () => {
    const next = currentTip + 1
    if (next < TIPS.length) {
      setCurrentTip(next)
    } else {
      setCurrentTip(null)
      localStorage.setItem('tripti_onboarding_seen', '1')
    }
  }

  const dismissAll = () => {
    setCurrentTip(null)
    localStorage.setItem('tripti_onboarding_seen', '1')
  }

  if (currentTip === null) return null

  const tip = TIPS[currentTip]

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={dismissAll} />

      {/* Tooltip */}
      <div
        className={`fixed z-[61] max-w-xs mx-4 px-4 py-3 rounded-xl bg-brand-sand border-2 border-brand-carbon/20 shadow-lg ${
          tip.position === 'top' ? 'top-20 left-4 right-4' : 'bottom-24 left-4 right-4'
        }`}
        onClick={dismiss}
        role="tooltip"
      >
        <div className="flex items-start gap-3">
          <p className="text-sm text-brand-carbon flex-1">{tip.text}</p>
          <button
            onClick={(e) => { e.stopPropagation(); dismissAll() }}
            className="flex-shrink-0 text-brand-carbon/50 hover:text-brand-carbon"
            aria-label="Dismiss tips"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-brand-carbon/50 mt-1">
          Tap to continue &middot; {currentTip + 1}/{TIPS.length}
        </p>
      </div>
    </>
  )
}
