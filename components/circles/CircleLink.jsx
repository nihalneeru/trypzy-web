'use client'

import Link from 'next/link'

/**
 * Reusable component for rendering clickable circle names
 * Links to the Circle Detail page
 * 
 * @param {Object} props
 * @param {string} props.circleId - Circle ID
 * @param {string} props.circleName - Circle name to display
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.returnTo] - Optional returnTo parameter for breadcrumb navigation
 */
export function CircleLink({ circleId, circleName, className = '', returnTo = null }) {
  if (!circleId || !circleName) {
    return <span className={className}>{circleName || ''}</span>
  }

  // Build href with optional returnTo parameter
  let href = `/circles/${circleId}`
  if (returnTo) {
    const params = new URLSearchParams()
    params.set('returnTo', returnTo)
    href = `${href}?${params.toString()}`
  }

  return (
    <Link 
      href={href}
      className={`hover:underline text-inherit ${className}`}
      onClick={(e) => {
        // Don't interfere with parent click handlers (e.g., card onClick)
        e.stopPropagation()
      }}
    >
      {circleName}
    </Link>
  )
}
