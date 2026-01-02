import { AvailabilityStatus } from '@/types/enums'
import { DateOption } from '@/types'

export interface AvailabilityData {
  day: string // "YYYY-MM-DD"
  status: AvailabilityStatus | 'available' | 'maybe' | 'unavailable'
  userId: string
}

/**
 * Convert date to YYYY-MM-DD format (timezone-safe, uses UTC)
 */
export function dateToDayString(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Convert YYYY-MM-DD string to Date (midnight UTC to avoid timezone issues)
 */
export function dayStringToDate(dayString: string): Date {
  return new Date(dayString + 'T00:00:00.000Z')
}

/**
 * Generate optionKey from start and end dates
 */
export function generateOptionKey(startDay: string, endDay: string): string {
  return `${startDay}_${endDay}`
}

/**
 * Parse optionKey to get start and end days
 */
export function parseOptionKey(optionKey: string): { startDay: string; endDay: string } {
  const [startDay, endDay] = optionKey.split('_')
  return { startDay, endDay }
}

/**
 * Get all days between two dates (inclusive) as YYYY-MM-DD strings
 */
export function getAllDaysBetween(startDate: Date, endDate: Date): string[] {
  const days: string[] = []
  const current = new Date(startDate)
  
  // Normalize to midnight UTC to avoid timezone issues
  current.setUTCHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setUTCHours(0, 0, 0, 0)
  
  while (current <= end) {
    days.push(dateToDayString(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  
  return days
}

/**
 * Calculate consensus scores for date windows
 * Available = +1, Maybe = +0.5, Unavailable = 0
 */
export function calculateConsensus(
  availabilities: AvailabilityData[],
  earliestStart: Date,
  latestEnd: Date,
  minDays: number = 1,
  maxDays: number = 14
): DateOption[] {
  const options: DateOption[] = []
  const allDays = getAllDaysBetween(earliestStart, latestEnd)
  
  // Get unique users
  const userIds = Array.from(new Set(availabilities.map(a => a.userId)))
  
  // Try windows of different lengths
  for (let days = minDays; days <= maxDays && days <= allDays.length; days++) {
    for (let i = 0; i <= allDays.length - days; i++) {
      const windowStartDay = allDays[i]
      const windowEndDay = allDays[i + days - 1]
      
      let totalScore = 0
      let attendeeCount = 0
      
      // For each user, check their availability in this window
      for (const userId of userIds) {
        const userAvailabilities = availabilities.filter(a => a.userId === userId)
        let userScore = 0
        let userCanAttend = true
        
        // Check each day in the window
        for (let j = i; j < i + days; j++) {
          const day = allDays[j]
          const availability = userAvailabilities.find(a => a.day === day)
          
          if (!availability) {
            userCanAttend = false
            break
          }
          
          if (availability.status === 'unavailable') {
            userCanAttend = false
            break
          } else if (availability.status === 'available') {
            userScore += 1
          } else if (availability.status === 'maybe') {
            userScore += 0.5
          }
        }
        
        if (userCanAttend) {
          totalScore += userScore / days // Normalize by window length
          attendeeCount++
        }
      }
      
      const optionKey = generateOptionKey(windowStartDay, windowEndDay)
      const startDate = dayStringToDate(windowStartDay)
      const endDate = dayStringToDate(windowEndDay)
      
      options.push({
        optionKey,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        score: totalScore,
        attendeeCount,
      })
    }
  }
  
  // Sort by score (descending), then by attendee count
  options.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return b.attendeeCount - a.attendeeCount
  })
  
  // Return top 3
  return options.slice(0, 3)
}

