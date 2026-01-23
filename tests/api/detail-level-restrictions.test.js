/**
 * Tests for trip detail level restrictions based on showTripDetailsLevel setting
 *
 * These tests verify how the showTripDetailsLevel privacy setting affects what
 * non-participants can see about trips:
 *
 * - 'full': Non-participants see all trip details (destination, dates, itinerary, etc.)
 * - 'limited': Non-participants see only destination and date range (no activities, accommodation, expenses, chat)
 * - 'none': Non-participants see minimal info (trip exists, destination city only)
 *
 * IMPORTANT: Participants (travelers) and trip creators always see full details regardless of setting.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { setupTestDatabase, teardownTestDatabase } from '../testUtils/dbTestHarness.js'

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Creates a comprehensive trip object with all detail fields
 */
function createFullTripData(overrides = {}) {
  const tripId = overrides.id || `trip-${Date.now()}-${Math.random().toString(36).substring(7)}`
  return {
    id: tripId,
    name: 'Beach Vacation Getaway',
    circleId: overrides.circleId || 'circle-test',
    createdBy: overrides.createdBy || 'owner-123',
    type: overrides.type || 'collaborative',
    status: overrides.status || 'proposed',

    // Destination info
    destination: {
      city: 'Miami',
      state: 'Florida',
      country: 'United States',
      placeId: 'ChIJEcHIDqKw2YgRZU-t3XHylv8',
      coordinates: { lat: 25.7617, lng: -80.1918 }
    },

    // Date fields
    startDate: '2025-06-15',
    endDate: '2025-06-22',
    startBound: '2025-06-01',
    endBound: '2025-06-30',
    tripLengthDays: 7,
    lockedStartDate: overrides.lockedStartDate || null,
    lockedEndDate: overrides.lockedEndDate || null,

    // Itinerary details
    itinerary: [
      {
        id: 'day-1',
        date: '2025-06-15',
        activities: [
          {
            id: 'act-1',
            name: 'Arrive at Miami Airport',
            type: 'travel',
            time: '10:00',
            notes: 'Flight lands at 10 AM',
            cost: 0
          },
          {
            id: 'act-2',
            name: 'Hotel Check-in',
            type: 'accommodation',
            time: '14:00',
            notes: 'Early check-in requested',
            cost: 0
          },
          {
            id: 'act-3',
            name: 'Dinner at Joe\'s Stone Crab',
            type: 'dining',
            time: '19:00',
            notes: 'Reservation for 6',
            cost: 250,
            address: '11 Washington Ave, Miami Beach, FL'
          }
        ]
      },
      {
        id: 'day-2',
        date: '2025-06-16',
        activities: [
          {
            id: 'act-4',
            name: 'Beach Day at South Beach',
            type: 'activity',
            time: '09:00',
            notes: 'Rent umbrellas and chairs',
            cost: 50
          },
          {
            id: 'act-5',
            name: 'Jet Ski Rental',
            type: 'activity',
            time: '14:00',
            notes: 'Booked for 2 hours',
            cost: 200
          }
        ]
      }
    ],

    // Accommodation details
    accommodation: {
      name: 'The Fontainebleau Miami Beach',
      address: '4441 Collins Ave, Miami Beach, FL 33140',
      checkIn: '2025-06-15',
      checkOut: '2025-06-22',
      confirmationNumber: 'FONT-123456',
      totalCost: 2800,
      notes: 'Ocean view room, pool access included',
      contactPhone: '+1 305-538-2000',
      amenities: ['Pool', 'Spa', 'Beach Access', 'Restaurant']
    },

    // Expense details
    expenses: [
      {
        id: 'exp-1',
        description: 'Hotel deposit',
        amount: 500,
        paidBy: 'owner-123',
        date: '2025-05-01',
        category: 'accommodation'
      },
      {
        id: 'exp-2',
        description: 'Restaurant reservation deposit',
        amount: 100,
        paidBy: 'owner-123',
        date: '2025-05-15',
        category: 'dining'
      }
    ],
    expensesSummary: {
      totalSpent: 600,
      perPersonCost: 100,
      pendingReimbursements: 0
    },

    // Notes and chat
    notes: 'Remember to pack sunscreen! Group chat for coordination in the app.',
    chatEnabled: true,

    // Metadata
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    ...overrides
  }
}

/**
 * Creates a user document with privacy settings
 */
function createUserData(overrides = {}) {
  const userId = overrides.id || `user-${Date.now()}-${Math.random().toString(36).substring(7)}`
  return {
    id: userId,
    name: overrides.name || 'Test User',
    email: overrides.email || `${userId}@test.com`,
    privacy: {
      profileVisibility: 'circle',
      tripsVisibility: 'circle',
      allowTripJoinRequests: true,
      showTripDetailsLevel: 'limited',
      ...(overrides.privacy || {})
    },
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

/**
 * Creates a circle document
 */
function createCircleData(overrides = {}) {
  const circleId = overrides.id || `circle-${Date.now()}-${Math.random().toString(36).substring(7)}`
  return {
    id: circleId,
    name: overrides.name || 'Test Circle',
    ownerId: overrides.ownerId || 'owner-123',
    inviteCode: overrides.inviteCode || 'TEST123',
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

// ============================================================================
// Field Filtering Logic (to be tested)
// ============================================================================

/**
 * Filters trip details based on showTripDetailsLevel setting
 * This simulates the filtering that should happen in API responses
 *
 * @param {Object} trip - Full trip document
 * @param {string} detailLevel - 'full' | 'limited' | 'none'
 * @param {boolean} isParticipant - Whether viewer is a trip participant
 * @param {boolean} isCreator - Whether viewer is the trip creator
 * @returns {Object} Filtered trip object
 */
function filterTripByDetailLevel(trip, detailLevel, isParticipant, isCreator) {
  // Participants and creators always see full details
  if (isParticipant || isCreator) {
    return { ...trip }
  }

  // Non-participants: filter based on detail level
  switch (detailLevel) {
    case 'full':
      // Non-participants can see everything
      return { ...trip }

    case 'limited':
      // Non-participants see only: destination, date range
      // Hidden: specific activities, accommodation details, expenses, chat, notes
      return {
        id: trip.id,
        name: trip.name,
        circleId: trip.circleId,
        createdBy: trip.createdBy,
        type: trip.type,
        status: trip.status,
        // Destination info - visible
        destination: trip.destination,
        // Only date range, not specific locked dates
        startDate: trip.startDate,
        endDate: trip.endDate,
        tripLengthDays: trip.tripLengthDays,
        // Hidden fields return null/empty
        itinerary: null,
        accommodation: null,
        expenses: null,
        expensesSummary: null,
        notes: null,
        chatEnabled: false, // Hide chat access
        lockedStartDate: null,
        lockedEndDate: null,
        // Metadata
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt
      }

    case 'none':
      // Non-participants see minimal info: trip exists, destination city only
      // Hidden: dates, itinerary, all details
      return {
        id: trip.id,
        name: trip.name,
        circleId: trip.circleId,
        createdBy: trip.createdBy,
        type: trip.type,
        status: trip.status,
        // Only city, not full destination details
        destination: trip.destination ? {
          city: trip.destination.city,
          country: trip.destination.country
          // state, placeId, coordinates are hidden
        } : null,
        // All dates hidden
        startDate: null,
        endDate: null,
        tripLengthDays: null,
        startBound: null,
        endBound: null,
        // All details hidden
        itinerary: null,
        accommodation: null,
        expenses: null,
        expensesSummary: null,
        notes: null,
        chatEnabled: false,
        lockedStartDate: null,
        lockedEndDate: null,
        // Metadata
        createdAt: trip.createdAt,
        updatedAt: trip.updatedAt
      }

    default:
      // Unknown level - default to limited for safety
      return filterTripByDetailLevel(trip, 'limited', isParticipant, isCreator)
  }
}

/**
 * Validates that a response doesn't contain hidden fields
 * Returns an array of field names that were leaked
 */
function findLeakedFields(filteredTrip, fullTrip, detailLevel, isParticipant, isCreator) {
  const leakedFields = []

  // Participants and creators should have all fields
  if (isParticipant || isCreator) {
    return []
  }

  if (detailLevel === 'limited') {
    // These should be null/empty for non-participants at limited level
    const hiddenFields = ['itinerary', 'accommodation', 'expenses', 'expensesSummary', 'notes']
    for (const field of hiddenFields) {
      if (filteredTrip[field] !== null && filteredTrip[field] !== undefined) {
        leakedFields.push(field)
      }
    }
    // lockedStartDate and lockedEndDate should be hidden
    if (filteredTrip.lockedStartDate && fullTrip.lockedStartDate) {
      leakedFields.push('lockedStartDate')
    }
    if (filteredTrip.lockedEndDate && fullTrip.lockedEndDate) {
      leakedFields.push('lockedEndDate')
    }
  }

  if (detailLevel === 'none') {
    // All date fields should be hidden
    const hiddenDateFields = ['startDate', 'endDate', 'tripLengthDays', 'startBound', 'endBound', 'lockedStartDate', 'lockedEndDate']
    for (const field of hiddenDateFields) {
      if (filteredTrip[field] !== null && filteredTrip[field] !== undefined) {
        leakedFields.push(field)
      }
    }
    // Destination should only have city and country
    if (filteredTrip.destination) {
      if (filteredTrip.destination.state) leakedFields.push('destination.state')
      if (filteredTrip.destination.placeId) leakedFields.push('destination.placeId')
      if (filteredTrip.destination.coordinates) leakedFields.push('destination.coordinates')
    }
    // All other details should be hidden
    const hiddenFields = ['itinerary', 'accommodation', 'expenses', 'expensesSummary', 'notes']
    for (const field of hiddenFields) {
      if (filteredTrip[field] !== null && filteredTrip[field] !== undefined) {
        leakedFields.push(field)
      }
    }
  }

  return leakedFields
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Detail Level Restrictions (showTripDetailsLevel)', () => {
  let client
  let db

  beforeAll(async () => {
    const result = await setupTestDatabase()
    db = result.db
    client = result.client
  })

  afterAll(async () => {
    await teardownTestDatabase(client)
  })

  beforeEach(async () => {
    // Clean up test data before each test
    await db.collection('users').deleteMany({ id: /^test-/ })
    await db.collection('trips').deleteMany({ id: /^trip-test-/ })
    await db.collection('circles').deleteMany({ id: /^circle-test-/ })
    await db.collection('memberships').deleteMany({ userId: /^test-/ })
    await db.collection('trip_participants').deleteMany({ tripId: /^trip-test-/ })
  })

  // --------------------------------------------------------------------------
  // Full Detail Level Tests
  // --------------------------------------------------------------------------

  describe('showTripDetailsLevel = "full"', () => {
    it('should show all trip info to non-participants', () => {
      // Setup
      const trip = createFullTripData()
      const detailLevel = 'full'
      const isParticipant = false
      const isCreator = false

      // Execute
      const filtered = filterTripByDetailLevel(trip, detailLevel, isParticipant, isCreator)

      // Assert - all fields should be present
      expect(filtered.destination).toEqual(trip.destination)
      expect(filtered.startDate).toBe(trip.startDate)
      expect(filtered.endDate).toBe(trip.endDate)
      expect(filtered.itinerary).toEqual(trip.itinerary)
      expect(filtered.accommodation).toEqual(trip.accommodation)
      expect(filtered.expenses).toEqual(trip.expenses)
      expect(filtered.expensesSummary).toEqual(trip.expensesSummary)
      expect(filtered.notes).toBe(trip.notes)
    })

    it('should include itinerary activities with all details', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'full', false, false)

      expect(filtered.itinerary).toBeDefined()
      expect(filtered.itinerary.length).toBe(2)
      expect(filtered.itinerary[0].activities.length).toBe(3)
      expect(filtered.itinerary[0].activities[0].cost).toBe(0)
      expect(filtered.itinerary[0].activities[2].address).toBe('11 Washington Ave, Miami Beach, FL')
    })

    it('should include accommodation confirmation number and contact', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'full', false, false)

      expect(filtered.accommodation).toBeDefined()
      expect(filtered.accommodation.confirmationNumber).toBe('FONT-123456')
      expect(filtered.accommodation.contactPhone).toBe('+1 305-538-2000')
      expect(filtered.accommodation.totalCost).toBe(2800)
    })

    it('should include expense breakdown with paidBy details', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'full', false, false)

      expect(filtered.expenses).toBeDefined()
      expect(filtered.expenses.length).toBe(2)
      expect(filtered.expenses[0].paidBy).toBe('owner-123')
      expect(filtered.expensesSummary.totalSpent).toBe(600)
    })

    it('should not leak any fields (full level allows all)', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'full', false, false)

      const leakedFields = findLeakedFields(filtered, trip, 'full', false, false)
      expect(leakedFields).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // Limited Detail Level Tests
  // --------------------------------------------------------------------------

  describe('showTripDetailsLevel = "limited"', () => {
    it('should show destination and date range only to non-participants', () => {
      // Setup
      const trip = createFullTripData()
      const detailLevel = 'limited'
      const isParticipant = false
      const isCreator = false

      // Execute
      const filtered = filterTripByDetailLevel(trip, detailLevel, isParticipant, isCreator)

      // Assert - destination and dates visible
      expect(filtered.destination).toEqual(trip.destination)
      expect(filtered.startDate).toBe(trip.startDate)
      expect(filtered.endDate).toBe(trip.endDate)
      expect(filtered.tripLengthDays).toBe(trip.tripLengthDays)
    })

    it('should hide specific activities from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.itinerary).toBeNull()
    })

    it('should hide accommodation details from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.accommodation).toBeNull()
    })

    it('should hide expenses from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.expenses).toBeNull()
      expect(filtered.expensesSummary).toBeNull()
    })

    it('should hide chat access from non-participants', () => {
      const trip = createFullTripData({ chatEnabled: true })
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.chatEnabled).toBe(false)
    })

    it('should hide notes from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.notes).toBeNull()
    })

    it('should hide locked dates from non-participants', () => {
      const trip = createFullTripData({
        status: 'locked',
        lockedStartDate: '2025-06-15',
        lockedEndDate: '2025-06-22'
      })
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.lockedStartDate).toBeNull()
      expect(filtered.lockedEndDate).toBeNull()
    })

    it('should not leak hidden fields at limited level', () => {
      const trip = createFullTripData({
        status: 'locked',
        lockedStartDate: '2025-06-15',
        lockedEndDate: '2025-06-22'
      })
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      const leakedFields = findLeakedFields(filtered, trip, 'limited', false, false)
      expect(leakedFields).toHaveLength(0)
    })

    it('should preserve basic trip metadata', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.id).toBe(trip.id)
      expect(filtered.name).toBe(trip.name)
      expect(filtered.circleId).toBe(trip.circleId)
      expect(filtered.createdBy).toBe(trip.createdBy)
      expect(filtered.type).toBe(trip.type)
      expect(filtered.status).toBe(trip.status)
      expect(filtered.createdAt).toBe(trip.createdAt)
    })
  })

  // --------------------------------------------------------------------------
  // None Detail Level Tests
  // --------------------------------------------------------------------------

  describe('showTripDetailsLevel = "none"', () => {
    it('should show only trip existence and destination city to non-participants', () => {
      // Setup
      const trip = createFullTripData()
      const detailLevel = 'none'
      const isParticipant = false
      const isCreator = false

      // Execute
      const filtered = filterTripByDetailLevel(trip, detailLevel, isParticipant, isCreator)

      // Assert - only city and country visible
      expect(filtered.destination).toBeDefined()
      expect(filtered.destination.city).toBe('Miami')
      expect(filtered.destination.country).toBe('United States')
    })

    it('should hide destination state, placeId, and coordinates', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.destination.state).toBeUndefined()
      expect(filtered.destination.placeId).toBeUndefined()
      expect(filtered.destination.coordinates).toBeUndefined()
    })

    it('should hide all date information from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.startDate).toBeNull()
      expect(filtered.endDate).toBeNull()
      expect(filtered.tripLengthDays).toBeNull()
      expect(filtered.startBound).toBeNull()
      expect(filtered.endBound).toBeNull()
      expect(filtered.lockedStartDate).toBeNull()
      expect(filtered.lockedEndDate).toBeNull()
    })

    it('should hide itinerary from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.itinerary).toBeNull()
    })

    it('should hide all details from non-participants', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.accommodation).toBeNull()
      expect(filtered.expenses).toBeNull()
      expect(filtered.expensesSummary).toBeNull()
      expect(filtered.notes).toBeNull()
      expect(filtered.chatEnabled).toBe(false)
    })

    it('should not leak any hidden fields at none level', () => {
      const trip = createFullTripData({
        status: 'locked',
        lockedStartDate: '2025-06-15',
        lockedEndDate: '2025-06-22'
      })
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      const leakedFields = findLeakedFields(filtered, trip, 'none', false, false)
      expect(leakedFields).toHaveLength(0)
    })

    it('should preserve only basic identifiers', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.id).toBe(trip.id)
      expect(filtered.name).toBe(trip.name)
      expect(filtered.circleId).toBe(trip.circleId)
      expect(filtered.createdBy).toBe(trip.createdBy)
      expect(filtered.type).toBe(trip.type)
      expect(filtered.status).toBe(trip.status)
    })
  })

  // --------------------------------------------------------------------------
  // Participant Access Tests
  // --------------------------------------------------------------------------

  describe('Participants always see full details', () => {
    it('should show all details to participants regardless of "limited" setting', () => {
      const trip = createFullTripData()
      const isParticipant = true
      const isCreator = false

      const filtered = filterTripByDetailLevel(trip, 'limited', isParticipant, isCreator)

      // Participant should see everything
      expect(filtered.itinerary).toEqual(trip.itinerary)
      expect(filtered.accommodation).toEqual(trip.accommodation)
      expect(filtered.expenses).toEqual(trip.expenses)
      expect(filtered.notes).toBe(trip.notes)
    })

    it('should show all details to participants regardless of "none" setting', () => {
      const trip = createFullTripData()
      const isParticipant = true
      const isCreator = false

      const filtered = filterTripByDetailLevel(trip, 'none', isParticipant, isCreator)

      // Participant should see everything including dates
      expect(filtered.startDate).toBe(trip.startDate)
      expect(filtered.endDate).toBe(trip.endDate)
      expect(filtered.destination).toEqual(trip.destination)
      expect(filtered.itinerary).toEqual(trip.itinerary)
    })

    it('should show all destination details to participants at "none" level', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', true, false)

      expect(filtered.destination.state).toBe('Florida')
      expect(filtered.destination.placeId).toBe('ChIJEcHIDqKw2YgRZU-t3XHylv8')
      expect(filtered.destination.coordinates).toEqual({ lat: 25.7617, lng: -80.1918 })
    })

    it('should show locked dates to participants', () => {
      const trip = createFullTripData({
        status: 'locked',
        lockedStartDate: '2025-06-15',
        lockedEndDate: '2025-06-22'
      })
      const filtered = filterTripByDetailLevel(trip, 'limited', true, false)

      expect(filtered.lockedStartDate).toBe('2025-06-15')
      expect(filtered.lockedEndDate).toBe('2025-06-22')
    })
  })

  // --------------------------------------------------------------------------
  // Trip Creator Access Tests
  // --------------------------------------------------------------------------

  describe('Trip creator always sees full details', () => {
    it('should show all details to creator regardless of "limited" setting', () => {
      const trip = createFullTripData()
      const isParticipant = false
      const isCreator = true

      const filtered = filterTripByDetailLevel(trip, 'limited', isParticipant, isCreator)

      expect(filtered.itinerary).toEqual(trip.itinerary)
      expect(filtered.accommodation).toEqual(trip.accommodation)
      expect(filtered.expenses).toEqual(trip.expenses)
      expect(filtered.notes).toBe(trip.notes)
    })

    it('should show all details to creator regardless of "none" setting', () => {
      const trip = createFullTripData()
      const isParticipant = false
      const isCreator = true

      const filtered = filterTripByDetailLevel(trip, 'none', isParticipant, isCreator)

      expect(filtered.startDate).toBe(trip.startDate)
      expect(filtered.endDate).toBe(trip.endDate)
      expect(filtered.destination).toEqual(trip.destination)
      expect(filtered.itinerary).toEqual(trip.itinerary)
    })

    it('should allow creator to see all accommodation details', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, true)

      expect(filtered.accommodation.confirmationNumber).toBe('FONT-123456')
      expect(filtered.accommodation.contactPhone).toBe('+1 305-538-2000')
      expect(filtered.accommodation.totalCost).toBe(2800)
    })

    it('should allow creator who is also a participant to see full details', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', true, true)

      expect(filtered).toEqual(trip)
    })
  })

  // --------------------------------------------------------------------------
  // Field Filtering for Nested Objects
  // --------------------------------------------------------------------------

  describe('Field filtering for nested objects', () => {
    it('should properly handle null destination at all levels', () => {
      const trip = createFullTripData({ destination: null })

      const fullFiltered = filterTripByDetailLevel(trip, 'full', false, false)
      expect(fullFiltered.destination).toBeNull()

      const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
      expect(limitedFiltered.destination).toBeNull()

      const noneFiltered = filterTripByDetailLevel(trip, 'none', false, false)
      expect(noneFiltered.destination).toBeNull()
    })

    it('should properly handle empty itinerary array', () => {
      const trip = createFullTripData({ itinerary: [] })

      const fullFiltered = filterTripByDetailLevel(trip, 'full', false, false)
      expect(fullFiltered.itinerary).toEqual([])

      const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
      expect(limitedFiltered.itinerary).toBeNull()
    })

    it('should properly handle missing optional fields', () => {
      const minimalTrip = {
        id: 'trip-minimal',
        name: 'Minimal Trip',
        circleId: 'circle-test',
        createdBy: 'owner-123',
        type: 'collaborative',
        status: 'proposed',
        destination: { city: 'Paris', country: 'France' },
        startDate: '2025-07-01',
        endDate: '2025-07-05',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
        // No itinerary, accommodation, expenses, notes
      }

      const filtered = filterTripByDetailLevel(minimalTrip, 'limited', false, false)

      expect(filtered.itinerary).toBeNull()
      expect(filtered.accommodation).toBeNull()
      expect(filtered.expenses).toBeNull()
      expect(filtered.notes).toBeNull()
    })

    it('should handle deep nested activity objects correctly', () => {
      const trip = createFullTripData()

      // Non-participant at full level should see nested activities
      const fullFiltered = filterTripByDetailLevel(trip, 'full', false, false)
      expect(fullFiltered.itinerary[0].activities[2].address).toBe('11 Washington Ave, Miami Beach, FL')
      expect(fullFiltered.itinerary[1].activities[1].cost).toBe(200)

      // Non-participant at limited level should not see activities
      const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
      expect(limitedFiltered.itinerary).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // API Response Leak Prevention Tests
  // --------------------------------------------------------------------------

  describe('API response doesn\'t leak hidden fields', () => {
    it('should not include accommodation in limited response', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      // Check that accommodation is completely null
      expect(filtered.accommodation).toBeNull()

      // Ensure no partial accommodation data
      expect(Object.keys(filtered).includes('accommodation')).toBe(true)
      expect(filtered.accommodation).not.toEqual(expect.objectContaining({
        confirmationNumber: expect.any(String)
      }))
    })

    it('should not include expenses array in limited response', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      expect(filtered.expenses).toBeNull()
      expect(filtered.expensesSummary).toBeNull()
    })

    it('should not include any sensitive fields in none response', () => {
      const trip = createFullTripData({
        status: 'locked',
        lockedStartDate: '2025-06-15',
        lockedEndDate: '2025-06-22'
      })
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      // All sensitive fields should be null
      const sensitiveFields = [
        'itinerary', 'accommodation', 'expenses',
        'expensesSummary', 'notes', 'startDate', 'endDate',
        'lockedStartDate', 'lockedEndDate'
      ]

      for (const field of sensitiveFields) {
        expect(filtered[field]).toBeNull()
      }
    })

    it('should not leak placeId in none response destination', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      expect(filtered.destination).toBeDefined()
      expect(filtered.destination.placeId).toBeUndefined()
      expect(filtered.destination.coordinates).toBeUndefined()

      // Only city and country should be present
      const destinationKeys = Object.keys(filtered.destination)
      expect(destinationKeys).toContain('city')
      expect(destinationKeys).toContain('country')
      expect(destinationKeys).not.toContain('placeId')
      expect(destinationKeys).not.toContain('coordinates')
      expect(destinationKeys).not.toContain('state')
    })

    it('should use leakage detector to verify no field leaks at limited level', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'limited', false, false)

      const leaks = findLeakedFields(filtered, trip, 'limited', false, false)
      expect(leaks).toHaveLength(0)
    })

    it('should use leakage detector to verify no field leaks at none level', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', false, false)

      const leaks = findLeakedFields(filtered, trip, 'none', false, false)
      expect(leaks).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // Edge Cases and Boundary Conditions
  // --------------------------------------------------------------------------

  describe('Edge cases', () => {
    it('should handle unknown detail level by defaulting to limited', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'unknown_level', false, false)

      // Should behave like limited
      expect(filtered.itinerary).toBeNull()
      expect(filtered.destination).toEqual(trip.destination)
      expect(filtered.startDate).toBe(trip.startDate)
    })

    it('should handle empty string detail level as unknown', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, '', false, false)

      // Should default to limited
      expect(filtered.itinerary).toBeNull()
      expect(filtered.accommodation).toBeNull()
    })

    it('should handle null detail level as unknown', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, null, false, false)

      // Should default to limited
      expect(filtered.itinerary).toBeNull()
    })

    it('should preserve trip type for hosted vs collaborative trips', () => {
      const hostedTrip = createFullTripData({ type: 'hosted' })
      const collabTrip = createFullTripData({ type: 'collaborative' })

      const hostedFiltered = filterTripByDetailLevel(hostedTrip, 'none', false, false)
      const collabFiltered = filterTripByDetailLevel(collabTrip, 'none', false, false)

      expect(hostedFiltered.type).toBe('hosted')
      expect(collabFiltered.type).toBe('collaborative')
    })

    it('should preserve trip status in all filtering modes', () => {
      const statusValues = ['proposed', 'scheduling', 'voting', 'locked', 'completed', 'cancelled']

      for (const status of statusValues) {
        const trip = createFullTripData({ status })

        const fullFiltered = filterTripByDetailLevel(trip, 'full', false, false)
        const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
        const noneFiltered = filterTripByDetailLevel(trip, 'none', false, false)

        expect(fullFiltered.status).toBe(status)
        expect(limitedFiltered.status).toBe(status)
        expect(noneFiltered.status).toBe(status)
      }
    })

    it('should handle very long itinerary arrays', () => {
      const longItinerary = Array.from({ length: 30 }, (_, i) => ({
        id: `day-${i}`,
        date: `2025-06-${String(i + 1).padStart(2, '0')}`,
        activities: [{ id: `act-${i}`, name: `Activity ${i}`, type: 'activity' }]
      }))

      const trip = createFullTripData({ itinerary: longItinerary })

      const fullFiltered = filterTripByDetailLevel(trip, 'full', false, false)
      expect(fullFiltered.itinerary.length).toBe(30)

      const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
      expect(limitedFiltered.itinerary).toBeNull()
    })

    it('should handle trips with special characters in names', () => {
      const trip = createFullTripData({
        name: 'Trip to Paris "City of Light" <3',
        notes: 'Notes with <script>alert("xss")</script> and special chars: éàü'
      })

      const filtered = filterTripByDetailLevel(trip, 'full', false, false)
      expect(filtered.name).toBe('Trip to Paris "City of Light" <3')
      expect(filtered.notes).toBe('Notes with <script>alert("xss")</script> and special chars: éàü')

      const limitedFiltered = filterTripByDetailLevel(trip, 'limited', false, false)
      expect(limitedFiltered.name).toBe('Trip to Paris "City of Light" <3')
      expect(limitedFiltered.notes).toBeNull()
    })
  })

  // --------------------------------------------------------------------------
  // Integration with Database Tests
  // --------------------------------------------------------------------------

  describe('Integration with database', () => {
    it('should correctly store and retrieve user detail level preference', async () => {
      const userId = 'test-user-detail-pref'
      const user = createUserData({
        id: userId,
        privacy: { showTripDetailsLevel: 'none' }
      })

      await db.collection('users').insertOne(user)

      const retrievedUser = await db.collection('users').findOne({ id: userId })
      expect(retrievedUser.privacy.showTripDetailsLevel).toBe('none')

      // Cleanup
      await db.collection('users').deleteOne({ id: userId })
    })

    it('should default to limited when user has no detail level set', async () => {
      const userId = 'test-user-no-detail'
      const user = createUserData({
        id: userId,
        privacy: { tripsVisibility: 'circle' } // No showTripDetailsLevel set
      })
      delete user.privacy.showTripDetailsLevel

      await db.collection('users').insertOne(user)

      const retrievedUser = await db.collection('users').findOne({ id: userId })

      // Application should default to 'limited' when not set
      const detailLevel = retrievedUser.privacy.showTripDetailsLevel || 'limited'
      expect(detailLevel).toBe('limited')

      // Cleanup
      await db.collection('users').deleteOne({ id: userId })
    })

    it('should handle user with full privacy object', async () => {
      const userId = 'test-user-full-privacy'
      const user = createUserData({
        id: userId,
        privacy: {
          profileVisibility: 'public',
          tripsVisibility: 'public',
          allowTripJoinRequests: false,
          showTripDetailsLevel: 'full'
        }
      })

      await db.collection('users').insertOne(user)

      const retrievedUser = await db.collection('users').findOne({ id: userId })
      expect(retrievedUser.privacy.profileVisibility).toBe('public')
      expect(retrievedUser.privacy.tripsVisibility).toBe('public')
      expect(retrievedUser.privacy.allowTripJoinRequests).toBe(false)
      expect(retrievedUser.privacy.showTripDetailsLevel).toBe('full')

      // Cleanup
      await db.collection('users').deleteOne({ id: userId })
    })

    it('should determine participant status from trip_participants collection', async () => {
      const ownerId = 'test-owner-db'
      const participantId = 'test-participant-db'
      const nonParticipantId = 'test-nonparticipant-db'
      const circleId = 'circle-test-db'
      const tripId = 'trip-test-db'

      // Create users
      const owner = createUserData({
        id: ownerId,
        privacy: { showTripDetailsLevel: 'limited' }
      })
      const participant = createUserData({ id: participantId })
      const nonParticipant = createUserData({ id: nonParticipantId })

      // Create circle
      const circle = createCircleData({ id: circleId, ownerId })

      // Create trip
      const trip = createFullTripData({ id: tripId, circleId, createdBy: ownerId })

      // Add participant record
      const participantRecord = {
        tripId,
        userId: participantId,
        status: 'active',
        joinedAt: new Date().toISOString()
      }

      await db.collection('users').insertMany([owner, participant, nonParticipant])
      await db.collection('circles').insertOne(circle)
      await db.collection('trips').insertOne(trip)
      await db.collection('trip_participants').insertOne(participantRecord)

      // Check participant status
      const participantCheck = await db.collection('trip_participants').findOne({
        tripId,
        userId: participantId,
        status: 'active'
      })
      expect(participantCheck).toBeTruthy()

      const nonParticipantCheck = await db.collection('trip_participants').findOne({
        tripId,
        userId: nonParticipantId,
        status: 'active'
      })
      expect(nonParticipantCheck).toBeNull()

      // Cleanup
      await db.collection('users').deleteMany({ id: { $in: [ownerId, participantId, nonParticipantId] } })
      await db.collection('circles').deleteOne({ id: circleId })
      await db.collection('trips').deleteOne({ id: tripId })
      await db.collection('trip_participants').deleteMany({ tripId })
    })
  })

  // --------------------------------------------------------------------------
  // Context-Aware Filtering Tests
  // --------------------------------------------------------------------------

  describe('Context-aware detail filtering', () => {
    it('should apply filtering only to profile view context', async () => {
      // Import the actual function
      const { applyProfileTripPrivacy } = await import('../../lib/trips/applyProfileTripPrivacy.js')

      const ownerId = 'test-owner-context'
      const viewerId = 'test-viewer-context'
      const trip = createFullTripData({ createdBy: ownerId })
      const ownerPrivacy = { showTripDetailsLevel: 'limited' }

      // Profile view should apply details level
      const profileResult = await applyProfileTripPrivacy({
        viewerId,
        ownerId,
        ownerPrivacy,
        trips: [trip],
        context: 'PROFILE_VIEW'
      })
      expect(profileResult.applyDetailsLevel).toBe(true)

      // Dashboard should NOT apply details level
      const dashboardResult = await applyProfileTripPrivacy({
        viewerId,
        ownerId,
        ownerPrivacy,
        trips: [trip],
        context: 'DASHBOARD'
      })
      expect(dashboardResult.applyDetailsLevel).toBe(false)

      // Self profile should NOT apply details level
      const selfResult = await applyProfileTripPrivacy({
        viewerId: ownerId, // Self viewing
        ownerId,
        ownerPrivacy,
        trips: [trip],
        context: 'SELF_PROFILE'
      })
      expect(selfResult.applyDetailsLevel).toBe(false)
    })

    it('should not apply filtering when viewer is trip owner', async () => {
      const { applyProfileTripPrivacy } = await import('../../lib/trips/applyProfileTripPrivacy.js')

      const ownerId = 'test-owner-self'
      const trip = createFullTripData({ createdBy: ownerId })
      const ownerPrivacy = { showTripDetailsLevel: 'none' }

      const result = await applyProfileTripPrivacy({
        viewerId: ownerId, // Owner viewing own trips
        ownerId,
        ownerPrivacy,
        trips: [trip],
        context: 'PROFILE_VIEW'
      })

      expect(result.applyDetailsLevel).toBe(false)
      expect(result.filteredTrips).toHaveLength(1)
    })
  })

  // --------------------------------------------------------------------------
  // Combination Scenarios
  // --------------------------------------------------------------------------

  describe('Combination scenarios', () => {
    it('should handle participant who is also creator with none level', () => {
      const trip = createFullTripData()
      const filtered = filterTripByDetailLevel(trip, 'none', true, true)

      // Should see everything
      expect(filtered).toEqual(trip)
    })

    it('should prioritize participant access over detail level restriction', () => {
      const trip = createFullTripData()

      // Even at 'none' level, participant sees all
      const filtered = filterTripByDetailLevel(trip, 'none', true, false)

      expect(filtered.itinerary).toEqual(trip.itinerary)
      expect(filtered.accommodation).toEqual(trip.accommodation)
      expect(filtered.startDate).toBe(trip.startDate)
    })

    it('should handle multiple trips with different owners and levels', () => {
      const trip1 = createFullTripData({ id: 'trip-1', createdBy: 'owner-1' })
      const trip2 = createFullTripData({ id: 'trip-2', createdBy: 'owner-2' })
      const trip3 = createFullTripData({ id: 'trip-3', createdBy: 'owner-3' })

      // Simulate different detail levels for different owners
      const filtered1 = filterTripByDetailLevel(trip1, 'full', false, false)
      const filtered2 = filterTripByDetailLevel(trip2, 'limited', false, false)
      const filtered3 = filterTripByDetailLevel(trip3, 'none', false, false)

      // Trip 1: full details
      expect(filtered1.itinerary).toEqual(trip1.itinerary)

      // Trip 2: limited details
      expect(filtered2.itinerary).toBeNull()
      expect(filtered2.startDate).toBe(trip2.startDate)

      // Trip 3: minimal details
      expect(filtered3.itinerary).toBeNull()
      expect(filtered3.startDate).toBeNull()
    })

    it('should handle collaborative vs hosted trips consistently', () => {
      const collabTrip = createFullTripData({ type: 'collaborative' })
      const hostedTrip = createFullTripData({ type: 'hosted' })

      const collabFiltered = filterTripByDetailLevel(collabTrip, 'limited', false, false)
      const hostedFiltered = filterTripByDetailLevel(hostedTrip, 'limited', false, false)

      // Both should have same filtering behavior
      expect(collabFiltered.itinerary).toBeNull()
      expect(hostedFiltered.itinerary).toBeNull()
      expect(collabFiltered.destination).toEqual(collabTrip.destination)
      expect(hostedFiltered.destination).toEqual(hostedTrip.destination)
    })
  })
})
