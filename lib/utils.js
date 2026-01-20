import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format a single date in human-friendly format: "January 18, 2026"
 * @param {string|null|undefined} dateStr - ISO date string (YYYY-MM-DD) or null/undefined
 * @returns {string} Formatted date or "TBD" if null/undefined
 */
export function formatTripDate(dateStr) {
  if (!dateStr) return 'TBD'
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/**
 * Format a date range in human-friendly format: "January 18, 2026 to February 2, 2026"
 * @param {string|null|undefined} startDate - ISO date string (YYYY-MM-DD) or null/undefined
 * @param {string|null|undefined} endDate - ISO date string (YYYY-MM-DD) or null/undefined
 * @returns {string} Formatted date range or "TBD" if dates are missing
 */
export function formatTripDateRange(startDate, endDate) {
  if (!startDate || !endDate) return 'TBD'
  const startFormatted = formatTripDate(startDate)
  const endFormatted = formatTripDate(endDate)
  return `${startFormatted} to ${endFormatted}`
}
