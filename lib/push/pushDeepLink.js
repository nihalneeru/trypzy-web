/**
 * Build deep link payload for push notifications.
 * Capacitor PushHandler reads { tripId, overlay } from notification data.
 * CommandCenterV3 reads ?overlay= from URL params.
 */

const OVERLAY_MAP = {
  // P0
  trip_created_notify: null,
  trip_canceled: null,
  first_dates_suggested: 'scheduling',
  dates_proposed_by_leader: 'scheduling',
  dates_locked: 'itinerary',
  itinerary_generated: 'itinerary',
  join_request_received: 'travelers',
  join_request_approved: null,
  // P1
  leader_ready_to_propose: 'scheduling',
  window_supported_author: 'scheduling',
  expense_added: 'expenses',
  accommodation_selected: 'accommodation',
  first_idea_contributed: 'itinerary',
  prep_reminder_7d: 'prep',
  trip_started: null,
  leader_transferred: null,
}

/**
 * Build deep link data for a push notification.
 *
 * @param {string} pushType - Notification type
 * @param {string} tripId - Trip ID
 * @returns {{ tripId: string, overlay?: string }}
 */
export function buildDeepLink(pushType, tripId) {
  const overlay = OVERLAY_MAP[pushType] || null
  const data = { tripId }
  if (overlay) data.overlay = overlay
  return data
}
