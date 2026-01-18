/**
 * Server-side validator for trip stage actions
 * 
 * Enforces stage transitions and leader-only action gates.
 * 
 * Stage ordering (canonical):
 * - proposed → scheduling (auto on first availability pick)
 * - scheduling → voting (leader opens)
 * - voting → locked (leader locks)
 * - locked → completed (auto after end date)
 * 
 * @param {Object} trip - Trip object from database
 * @param {string} actionName - Name of the action being performed
 * @param {string} actorUserId - ID of the user attempting the action
 * @param {Object} circle - Circle object (optional, for leader check)
 * @returns {{ ok: boolean, status?: number, code?: string, message?: string }}
 */
export function validateStageAction(trip, actionName, actorUserId, circle = null) {
  if (!trip) {
    return {
      ok: false,
      status: 404,
      code: 'TRIP_NOT_FOUND',
      message: 'Trip not found'
    }
  }

  // Backward compatibility: default status for old trips
  const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')

  // Block all actions on canceled trips
  if (tripStatus === 'canceled') {
    return {
      ok: false,
      status: 400,
      code: 'TRIP_CANCELED',
      message: 'This trip has been canceled and cannot be modified'
    }
  }

  // Block all actions on completed trips
  if (tripStatus === 'completed') {
    return {
      ok: false,
      status: 400,
      code: 'TRIP_COMPLETED',
      message: 'This trip has been completed and cannot be modified'
    }
  }

  // Helper: Check if user is trip leader (creator or circle owner)
  const isLeader = trip.createdBy === actorUserId || circle?.ownerId === actorUserId

  // Helper: Check if action is leader-only
  const LEADER_ONLY_ACTIONS = ['open_voting', 'lock']
  const requiresLeader = LEADER_ONLY_ACTIONS.includes(actionName)

  // Enforce leader-only actions
  if (requiresLeader && !isLeader) {
    return {
      ok: false,
      status: 403,
      code: 'LEADER_ONLY',
      message: actionName === 'open_voting'
        ? 'Only the trip creator or circle owner can open voting'
        : 'Only the trip creator or circle owner can lock the trip'
    }
  }

  // Validate stage-specific action rules
  switch (actionName) {
    case 'submit_availability':
      // Availability can be submitted in 'proposed' or 'scheduling' stages
      // Guard: Cannot submit after voting starts or when locked
      if (tripStatus === 'voting' || tripStatus === 'locked') {
        return {
          ok: false,
          status: 400,
          code: 'STAGE_BLOCKED',
          message: tripStatus === 'voting'
            ? 'Availability is frozen while voting is open.'
            : 'Dates are locked; scheduling is closed.'
        }
      }
      // Note: Auto-transition to 'scheduling' on first pick is handled in the endpoint
      return { ok: true }

    case 'submit_date_picks':
      // Date picks can be submitted in 'proposed' or 'scheduling' stages
      // Guard: Cannot submit when locked
      if (tripStatus === 'locked') {
        return {
          ok: false,
          status: 400,
          code: 'STAGE_BLOCKED',
          message: 'Trip dates are locked; picks cannot be changed'
        }
      }
      return { ok: true }

    case 'open_voting':
      // Voting can only be opened from 'proposed' or 'scheduling' stages
      // Guard: Cannot open if already voting or locked
      if (tripStatus === 'voting' || tripStatus === 'locked') {
        return {
          ok: false,
          status: 400,
          code: 'STAGE_BLOCKED',
          message: tripStatus === 'voting'
            ? 'Voting is already open'
            : 'Cannot open voting for a locked trip'
        }
      }
      if (tripStatus !== 'proposed' && tripStatus !== 'scheduling') {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_STAGE_TRANSITION',
          message: 'Voting can only be opened during proposed or scheduling phase'
        }
      }
      return { ok: true }

    case 'vote':
      // Voting only allowed during 'voting' stage
      if (tripStatus !== 'voting') {
        return {
          ok: false,
          status: 400,
          code: 'STAGE_BLOCKED',
          message: 'Voting is not open for this trip'
        }
      }
      return { ok: true }

    case 'lock':
      // Locking allowed from 'voting' stage (legacy) or 'scheduling' stage (top3_heatmap)
      // Guard: Cannot lock if already locked
      if (tripStatus === 'locked') {
        return {
          ok: false,
          status: 400,
          code: 'STAGE_BLOCKED',
          message: 'Trip is already locked'
        }
      }
      // For legacy trips with optionKey, must be in voting stage
      // For top3_heatmap trips with startDateISO, can lock from scheduling or voting
      // This validation will be supplemented by endpoint-specific logic based on payload format
      // At this level, we just ensure it's not already locked
      return { ok: true }

    default:
      return {
        ok: false,
        status: 400,
        code: 'UNKNOWN_ACTION',
        message: `Unknown action: ${actionName}`
      }
  }
}
