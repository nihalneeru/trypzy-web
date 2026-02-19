/**
 * Push notification copy registry.
 *
 * Each entry: (context, { userId, trip }) => { title, body }
 * Title is always the trip name (more useful than "Tripti" when scanning).
 *
 * Brand guardrails:
 * - Never "You must", "Required", "Incomplete"
 * - Calm, friendly, non-preachy
 */

/**
 * Format a date string as "Feb 7" (short month + day).
 */
function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Format a date range as "Feb 7–Feb 9".
 */
export function formatDateRange(startDate, endDate) {
  return `${fmtDate(startDate)}\u2013${fmtDate(endDate)}`
}

/**
 * Push copy registry.
 * Each function receives (context, { userId, trip }) and returns { title, body }.
 */
export const PUSH_COPY = {
  // ============ P0 — Must Have ============

  trip_created_notify: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} started planning this trip \u2014 take a look when you're ready.`,
  }),

  trip_canceled: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} canceled this trip.`,
  }),

  first_dates_suggested: (ctx) => ({
    title: ctx.tripName,
    body: 'Date ideas are rolling in. Add yours when you\'re ready!',
  }),

  dates_proposed_by_leader: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} suggested ${ctx.dates}. Let them know if it works!`,
  }),

  dates_locked: (ctx, { userId, trip }) => ({
    title: ctx.tripName,
    body: trip.createdBy === userId
      ? `You confirmed ${ctx.dates}. Nice work!`
      : `Dates confirmed: ${ctx.dates}! Next up \u2014 share trip ideas.`,
  }),

  itinerary_generated: (ctx) => ({
    title: ctx.tripName,
    body: ctx.version === 1
      ? 'The itinerary is ready! Take a look and share your thoughts.'
      : 'Itinerary updated based on feedback \u2014 see what changed.',
  }),

  join_request_received: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} wants to join \u2014 take a look when you're ready.`,
  }),

  join_request_approved: (ctx) => ({
    title: ctx.tripName,
    body: 'You\'re in! Your request to join was approved.',
  }),

  // ============ P1 — High Value ============

  leader_ready_to_propose: (ctx) => ({
    title: ctx.tripName,
    body: `Over half your group has weighed in. ${ctx.dates ? ctx.dates + ' has' : 'There\'s a date with'} the most support.`,
  }),

  window_supported_author: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} likes your dates \u2014 gaining traction!`,
  }),

  expense_added: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} added an expense \u2014 check it out.`,
  }),

  accommodation_selected: (ctx) => ({
    title: ctx.tripName,
    body: 'Your stay is set! Check out the details.',
  }),

  first_idea_contributed: (ctx) => ({
    title: ctx.tripName,
    body: `${ctx.actorName} shared a trip idea \u2014 see what's on the list.`,
  }),

  prep_reminder_7d: (ctx) => ({
    title: ctx.tripName,
    body: 'One week away! Check the prep list.',
  }),

  trip_started: (ctx) => ({
    title: ctx.tripName,
    body: 'Starts today \u2014 have an amazing time!',
  }),

  leader_transferred: (ctx) => ({
    title: ctx.tripName,
    body: 'You\'re now leading this trip. Check in when you\'re ready.',
  }),
}
