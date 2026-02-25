/**
 * Sanitize trip data for public (unauthenticated) consumption.
 *
 * Strips all PII (participant names/IDs, chat messages, internal metadata)
 * and returns only the fields safe for a shared preview page.
 */
export function sanitizeTripForPublic(trip, itinerary, ideas, circle, travelerCount) {
  return {
    trip: {
      name: trip.name,
      destinationHint: trip.destinationHint || null,
      lockedStartDate: trip.lockedStartDate || null,
      lockedEndDate: trip.lockedEndDate || null,
      duration: trip.duration || null,
      type: trip.type || 'collaborative',
      travelerCount,
      status: trip.status,
    },
    itinerary: itinerary ? {
      version: itinerary.version || 1,
      content: itinerary.content || '',
      ideaCount: ideas?.length || 0,
    } : null,
    circle: circle ? {
      name: circle.name,
      inviteCode: circle.inviteCode || null,
    } : null,
    cta: {
      remixUrl: `/remix/${trip.shareId}`,
      joinUrl: circle?.inviteCode ? `/join/${circle.inviteCode}?tripId=${trip._id}&ref=share` : null,
    }
  }
}
