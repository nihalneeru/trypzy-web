'use client'

import Image from 'next/image'

/**
 * TrypzyLogo Component
 * 
 * Logo component that supports full logo and icon variants.
 * When SVG logo files (trypzy-light-background-full-logo-with-spacing.svg,
 * trypzy-dark-background-full-logo-with-spacing.svg, trypzy-logomark.svg) are added,
 * this component can be enhanced to be theme-aware.
 * 
 * @param {string} variant - 'full' for full logo with text, 'icon' for icon-only (logomark)
 * @param {string} className - Additional CSS classes
 */
export function TrypzyLogo({ variant = 'full', className = '' }) {
  if (variant === 'icon') {
    // Icon-only variant (logomark)
    // When trypzy-logomark.svg is available, use it here
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
  // Aspect ratio: 140:40 = 3.5:1
  // When theme-aware SVG files are available, add theme detection here
  // to switch between trypzy-light-background-full-logo-with-spacing.svg
  // and trypzy-dark-background-full-logo-with-spacing.svg
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
