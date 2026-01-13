'use client'

import Image from 'next/image'

// Trypzy Logo Component
// Preserves aspect ratio by using height-controlled sizing with width: auto
export function TrypzyLogo({ variant = 'full', className = '' }) {
  if (variant === 'icon') {
    // Icon-only variant (square, for spinners - use BrandedSpinner instead)
    return (
      <Image
        src="/brand/trypzy-icon.png"
        alt="Trypzy"
        width={32}
        height={32}
        className={className || "h-8 w-8"}
        unoptimized
      />
    )
  }
  
  // Full logo variant (for headers/nav)
  // Aspect ratio: 140:40 = 3.5:1 (matches auth page)
  // Use height-controlled sizing (h-*) with w-auto to preserve aspect ratio
  return (
    <Image
      src="/brand/trypzy-logo.png"
      alt="Trypzy"
      width={140}
      height={40}
      className={className || "h-8 w-auto"}
      unoptimized
    />
  )
}
