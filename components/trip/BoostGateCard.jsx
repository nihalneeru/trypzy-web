'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { GATED_FEATURE_DESCRIPTIONS } from '@/lib/trips/isFeatureGated'
import { toast } from 'sonner'

/**
 * BoostGateCard — inline card shown when a free user taps a gated feature.
 *
 * Follows the revenue spec: bg-brand-sand, no lock icons/premium badges/crown emojis.
 * On web: redirects to Stripe Checkout. On native (Capacitor): shows "Continue on tripti.ai".
 *
 * @param {{ trip: any, feature: string, token: string, otherFeatures?: string[] }} props
 */
export function BoostGateCard({ trip, feature, token, otherFeatures }) {
  const [loading, setLoading] = useState(false)

  const description = GATED_FEATURE_DESCRIPTIONS[feature] || 'This feature'
  const isNative = typeof window !== 'undefined' && !!window?.Capacitor

  // Show other features that boosting unlocks (exclude the current one)
  const others = (otherFeatures || Object.keys(GATED_FEATURE_DESCRIPTIONS))
    .filter(f => f !== feature)
    .slice(0, 3)
    .map(f => GATED_FEATURE_DESCRIPTIONS[f])
    .filter(Boolean)

  const handleBoost = async () => {
    if (isNative) {
      // Native apps: purchase not available (IAP not yet implemented)
      // Compliant with Apple Guidelines 3.1.1 — no external payment link
      toast.info('Trip Boost is available at tripti.ai')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/boost`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not start boost checkout')
      }

      if (data.sessionUrl) {
        window.location.href = data.sessionUrl
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <Card className="bg-brand-sand border-brand-sand">
      <CardContent className="py-4 space-y-3">
        <p className="text-sm font-medium text-brand-carbon">
          {description}
        </p>

        {others.length > 0 && (
          <div>
            <p className="text-xs text-brand-carbon/60 mb-1">Boosting also unlocks:</p>
            <ul className="text-xs text-brand-carbon/60 space-y-0.5 pl-4 list-disc">
              {others.map((desc, i) => (
                <li key={i}>{desc}</li>
              ))}
            </ul>
          </div>
        )}

        <Button
          onClick={handleBoost}
          disabled={loading}
          className="w-full bg-brand-red hover:bg-brand-red/90 text-white"
        >
          {loading ? (
            <>
              <BrandedSpinner size="sm" className="mr-2" />
              Redirecting...
            </>
          ) : isNative ? (
            'Continue on tripti.ai'
          ) : (
            'Boost this trip \u2014 $4.99'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
