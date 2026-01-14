'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

// Trypzy Logo Component
// Preserves aspect ratio by using height-controlled sizing with width: auto
export function TrypzyLogo({ variant = 'full', className = '' }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check for dark mode class on html element (Tailwind class-based dark mode)
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }
    
    // Initial check
    checkDarkMode()
    
    // Watch for changes using MutationObserver
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
    
    return () => observer.disconnect()
  }, [])

  if (variant === 'icon') {
    // Icon-only variant (static icon - use trypzy-logomark.svg)
    return (
      <Image
        src="/brand/trypzy-logomark.svg"
        alt="Trypzy"
        width={32}
        height={32}
        className={className || "h-8 w-8"}
        unoptimized
      />
    )
  }
  
  // Full logo variant (for headers/nav)
  // Theme-aware: light background uses light-background SVG, dark uses dark-background SVG
  // Use height-controlled sizing (h-*) with w-auto to preserve aspect ratio
  const logoSrc = isDark 
    ? "/brand/trypzy-dark-background-full-logo-with-spacing.svg"
    : "/brand/trypzy-light-background-full-logo-with-spacing.svg"
  
  return (
    <Image
      src={logoSrc}
      alt="Trypzy"
      width={140}
      height={40}
      className={className || "h-8 w-auto"}
      unoptimized
    />
  )
}
