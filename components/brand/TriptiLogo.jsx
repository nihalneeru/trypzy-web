'use client'

import Image from 'next/image'

/**
 * TriptiLogo Component
 *
 * Logo component that supports full logo and icon variants.
 * Full variant uses the positive original SVG, icon variant uses the red logomark.
 *
 * @param {string} variant - 'full' for full logo with text, 'icon' for icon-only (logomark)
 * @param {string} className - Additional CSS classes
 */
export function TriptiLogo({ variant = 'full', className = '' }) {
  if (variant === 'icon') {
    return (
      <Image
        src="/brand/tripti-icon.svg"
        alt="Tripti.ai"
        width={32}
        height={32}
        className={className || "h-8 w-8"}
        unoptimized
      />
    )
  }

  // Full logo variant (for headers/nav)
  return (
    <Image
      src="/brand/tripti-logo.svg"
      alt="Tripti.ai"
      width={140}
      height={40}
      className={className || "h-8 w-auto"}
      unoptimized
    />
  )
}

// Backward-compat alias
export const TrypzyLogo = TriptiLogo
