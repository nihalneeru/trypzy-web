'use client'

import Image from 'next/image'

export function BrandedSpinner({ className = '', size = 'default' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }

  const dimensions = {
    sm: 16,
    default: 20,
    md: 24,
    lg: 32
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <Image
        src="/brand/loading-animation.gif"
        alt="Loading"
        width={dimensions[size]}
        height={dimensions[size]}
        className={sizeClasses[size]}
        unoptimized
      />
    </div>
  )
}
