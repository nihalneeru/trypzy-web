/**
 * Generate ICS calendar content from trip and itinerary data.
 * RFC 5545 compliant.
 */

function escapeICS(text) {
  if (!text) return ''
  return text.replace(/[\\;,\n]/g, match => {
    if (match === '\n') return '\\n'
    return '\\' + match
  })
}

function formatICSDate(dateStr) {
  // Convert "2026-03-07" to "20260307"
  return dateStr.replace(/-/g, '')
}

function generateUID() {
  // Use timestamp + random for environments without crypto.randomUUID
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 10)
  return `${ts}-${rand}@tripti.ai`
}

/**
 * Parse a time string like "9:00 AM" or "2:30 PM" into { hours, minutes }
 */
function parseTime(timeStr) {
  if (!timeStr) return null
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return { hours, minutes }
}

/**
 * Parse a timeRange like "9:00 AM - 12:00 PM" into start/end time objects
 */
function parseTimeRange(timeRange) {
  if (!timeRange) return null
  const parts = timeRange.split(/\s*[-–]\s*/)
  if (parts.length !== 2) return null
  const start = parseTime(parts[0])
  const end = parseTime(parts[1])
  if (!start || !end) return null
  return { start, end }
}

/**
 * Format date + time as ICS datetime: "20260307T090000"
 */
function formatICSDateTime(dateStr, time) {
  const d = formatICSDate(dateStr)
  const h = String(time.hours).padStart(2, '0')
  const m = String(time.minutes).padStart(2, '0')
  return `${d}T${h}${m}00`
}

/**
 * Build description for an itinerary block event
 */
function buildBlockDescription(block, tripId) {
  const parts = []
  if (block.description) parts.push(block.description)
  if (block.estCost) parts.push(`Est. cost: ${block.estCost}`)
  if (block.transitNotes) parts.push(`Transit: ${block.transitNotes}`)
  if (tripId) parts.push(`View on Tripti: https://tripti.ai/trips/${tripId}`)
  return escapeICS(parts.join('\n'))
}

function createEventFromBlock(trip, day, block) {
  const lines = []
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:${generateUID()}`)
  lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString().slice(0, 10))}T000000Z`)
  lines.push(`SUMMARY:${escapeICS(block.title)}`)

  const timeRange = parseTimeRange(block.timeRange)
  if (timeRange) {
    lines.push(`DTSTART:${formatICSDateTime(day.date, timeRange.start)}`)
    lines.push(`DTEND:${formatICSDateTime(day.date, timeRange.end)}`)
  } else {
    // No parseable time — all-day event for that date
    lines.push(`DTSTART;VALUE=DATE:${formatICSDate(day.date)}`)
    lines.push(`DTEND;VALUE=DATE:${formatICSDate(day.date)}`)
  }

  if (block.location) {
    lines.push(`LOCATION:${escapeICS(block.location)}`)
  } else if (trip.destinationHint) {
    lines.push(`LOCATION:${escapeICS(trip.destinationHint)}`)
  }

  const desc = buildBlockDescription(block, trip.id)
  if (desc) lines.push(`DESCRIPTION:${desc}`)

  lines.push('END:VEVENT')
  return lines
}

function createAllDayEvent(trip, day) {
  const lines = []
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:${generateUID()}`)
  lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString().slice(0, 10))}T000000Z`)
  lines.push(`SUMMARY:${escapeICS(day.title || `${trip.name} - ${day.date}`)}`)
  lines.push(`DTSTART;VALUE=DATE:${formatICSDate(day.date)}`)
  lines.push(`DTEND;VALUE=DATE:${formatICSDate(day.date)}`)

  if (trip.destinationHint) {
    lines.push(`LOCATION:${escapeICS(trip.destinationHint)}`)
  }

  if (day.areaFocus) {
    lines.push(`DESCRIPTION:${escapeICS(day.areaFocus)}`)
  }

  lines.push('END:VEVENT')
  return lines
}

function createTripSpanEvent(trip) {
  const lines = []
  lines.push('BEGIN:VEVENT')
  lines.push(`UID:${generateUID()}`)
  lines.push(`DTSTAMP:${formatICSDate(new Date().toISOString().slice(0, 10))}T000000Z`)
  lines.push(`SUMMARY:${escapeICS(trip.name)}`)
  lines.push(`DTSTART;VALUE=DATE:${formatICSDate(trip.lockedStartDate)}`)
  // ICS all-day end date is exclusive, so add 1 day
  const endDate = new Date(trip.lockedEndDate)
  endDate.setDate(endDate.getDate() + 1)
  const endStr = endDate.toISOString().slice(0, 10)
  lines.push(`DTEND;VALUE=DATE:${formatICSDate(endStr)}`)

  if (trip.destinationHint) {
    lines.push(`LOCATION:${escapeICS(trip.destinationHint)}`)
  }

  lines.push(`DESCRIPTION:${escapeICS(`View on Tripti: https://tripti.ai/trips/${trip.id}`)}`)
  lines.push('END:VEVENT')
  return lines
}

export function generateICS(trip, itinerary) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tripti.ai//Trip Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(trip.name)}`,
  ]

  if (itinerary?.content?.days) {
    for (const day of itinerary.content.days) {
      if (day.blocks?.length > 0) {
        for (const block of day.blocks) {
          lines.push(...createEventFromBlock(trip, day, block))
        }
      } else {
        lines.push(...createAllDayEvent(trip, day))
      }
    }
  } else if (trip.lockedStartDate && trip.lockedEndDate) {
    lines.push(...createTripSpanEvent(trip))
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

// Export helpers for testing
export { escapeICS, formatICSDate, parseTimeRange, formatICSDateTime }
