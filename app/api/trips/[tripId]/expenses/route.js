import { NextRequest, NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/server/db.js'
import { requireAuth } from '@/lib/server/auth.js'
import { handleCORS } from '@/lib/server/cors.js'
import { ObjectId } from 'mongodb'
import { isLateJoinerForTrip } from '@/lib/trips/isLateJoiner.js'

// Helper: Check if user is an active traveler for a trip
async function isActiveTraveler(db, trip, userId) {
  if (!trip || !userId) return false

  // Get all participants
  const allParticipants = await db.collection('trip_participants')
    .find({ tripId: trip.id })
    .toArray()

  if (trip.type === 'collaborative') {
    // For collaborative trips: user must be circle member AND not have left/removed status
    const circleMembership = await db.collection('memberships').findOne({
      userId,
      circleId: trip.circleId,
      status: { $ne: 'left' }
    })

    if (!circleMembership) return false

    // Check explicit participant record
    const participant = allParticipants.find(p => p.userId === userId)
    if (participant) {
      const status = participant.status || 'active'
      if (status === 'active') return true
      return false
    }

    // No participant record: check if late joiner
    if (isLateJoinerForTrip(circleMembership, trip)) return false

    // Original member
    return true
  } else {
    // Hosted trips: user must have active participant record
    const participant = allParticipants.find(p => p.userId === userId)
    if (!participant) return false

    const status = participant.status || 'active'
    return status === 'active'
  }
}

// GET /api/trips/:tripId/expenses
export async function GET(request, { params }) {
  try {
    const { tripId } = params
    const db = await connectToMongo()
    
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }
    
    const trip = await db.collection('trips').findOne({ id: tripId })
    if (!trip) {
      return handleCORS(NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      ))
    }
    
    // Check if user is an active traveler
    const isTraveler = await isActiveTraveler(db, trip, auth.user.id)
    if (!isTraveler) {
      return handleCORS(NextResponse.json(
        { error: 'You are not a traveler on this trip' },
        { status: 403 }
      ))
    }
    
    // Return expenses array (default to empty array if not set)
    const expenses = trip.expenses || []
    return handleCORS(NextResponse.json(expenses))
  } catch (error) {
    console.error('Error in GET /api/trips/:tripId/expenses:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ))
  }
}

// POST /api/trips/:tripId/expenses
export async function POST(request, { params }) {
  try {
    const { tripId } = params
    const db = await connectToMongo()
    
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }
    
    const body = await request.json()
    const { title, amountCents, currency, paidByUserId, splitBetweenUserIds, incurredAt, note } = body
    
    // Validation
    if (!title || !title.trim()) {
      return handleCORS(NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      ))
    }
    
    if (!amountCents || typeof amountCents !== 'number' || amountCents <= 0) {
      return handleCORS(NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      ))
    }
    
    if (!paidByUserId) {
      return handleCORS(NextResponse.json(
        { error: 'Payer is required' },
        { status: 400 }
      ))
    }
    
    if (!Array.isArray(splitBetweenUserIds) || splitBetweenUserIds.length === 0) {
      return handleCORS(NextResponse.json(
        { error: 'At least one person must be included in split' },
        { status: 400 }
      ))
    }
    
    const trip = await db.collection('trips').findOne({ id: tripId })
    if (!trip) {
      return handleCORS(NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      ))
    }

    // Block modifications on cancelled trips
    if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
      return handleCORS(NextResponse.json(
        { error: 'This trip has been canceled and is read-only' },
        { status: 400 }
      ))
    }

    // Check if user is an active traveler
    const isTraveler = await isActiveTraveler(db, trip, auth.user.id)
    if (!isTraveler) {
      return handleCORS(NextResponse.json(
        { error: 'You are not a traveler on this trip' },
        { status: 403 }
      ))
    }

    // Validate that paidByUserId and all splitBetweenUserIds are travelers
    // Match isActiveTraveler logic: for collaborative trips, all circle members are valid
    // unless they have a trip_participants record with status left/removed
    const allParticipants = await db.collection('trip_participants')
      .find({ tripId })
      .toArray()
    
    // DEBUG: Log validation details (dev-only)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Expenses POST validation:', {
        tripId,
        tripType: trip.type,
        paidByUserId,
        splitBetweenUserIds,
        allParticipantsSample: allParticipants.slice(0, 5).map(p => ({ userId: p.userId, status: p.status }))
      })
    }
    
    let validTravelerIds = new Set()
    if (trip.type === 'collaborative') {
      // For collaborative trips: circle members minus left/removed minus late joiners without explicit records
      const memberships = await db.collection('memberships')
        .find({ circleId: trip.circleId, status: { $ne: 'left' } })
        .toArray()
      const memberIds = new Set(memberships.map(m => m.userId))
      const membershipByUserId = new Map(memberships.map(m => [m.userId, m]))

      const statusByUserId = new Map()
      allParticipants.forEach(p => {
        statusByUserId.set(p.userId, p.status || 'active')
      })

      memberIds.forEach(userId => {
        const status = statusByUserId.get(userId)
        if (status === 'active') {
          validTravelerIds.add(userId)
        } else if (status === 'left' || status === 'removed') {
          // not valid
        } else {
          // No record — check late joiner
          const membership = membershipByUserId.get(userId)
          if (!isLateJoinerForTrip(membership, trip)) {
            validTravelerIds.add(userId)
          }
        }
      })

      // DEBUG: Log collaborative trip details
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DEBUG] Collaborative trip validation:', {
          memberIdsSample: Array.from(memberIds).slice(0, 5),
          paidByUserIdInMemberIds: memberIds.has(paidByUserId),
          leftRemovedUserIds: allParticipants
            .filter(p => (p.status || 'active') === 'left' || (p.status || 'active') === 'removed')
            .map(p => p.userId)
        })
      }
    } else {
      // Hosted trips: must have active participant record
      allParticipants.forEach(p => {
        const status = p.status || 'active'
        if (status === 'active') {
          validTravelerIds.add(p.userId)
        }
      })
    }
    
    // DEBUG: Log computed valid traveler IDs
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG] Valid traveler IDs:', {
        validTravelerIdsArray: Array.from(validTravelerIds),
        paidByUserIdInValidSet: validTravelerIds.has(paidByUserId)
      })
    }
    
    if (!validTravelerIds.has(paidByUserId)) {
      return handleCORS(NextResponse.json(
        { error: 'Payer must be a traveler on this trip' },
        { status: 400 }
      ))
    }
    
    const invalidSplitIds = splitBetweenUserIds.filter(id => !validTravelerIds.has(id))
    if (invalidSplitIds.length > 0) {
      return handleCORS(NextResponse.json(
        { error: 'All split participants must be travelers on this trip' },
        { status: 400 }
      ))
    }

    // Defensive check: ensure splitCount is not zero to prevent division by zero
    // when calculating per-person shares downstream
    const splitCount = splitBetweenUserIds.length
    if (!splitCount || splitCount === 0) {
      return handleCORS(NextResponse.json(
        { error: 'At least one person must be selected for expense split' },
        { status: 400 }
      ))
    }

    // Create expense object
    const expense = {
      _id: new ObjectId(),
      title: title.trim(),
      amountCents: Math.round(amountCents), // Ensure integer
      currency: currency || trip.currency || 'USD',
      paidByUserId,
      splitBetweenUserIds,
      incurredAt: incurredAt || new Date().toISOString(),
      note: note?.trim() || undefined,
      createdAt: new Date().toISOString()
    }
    
    // Add expense to trip's expenses array
    await db.collection('trips').updateOne(
      { id: tripId },
      { 
        $push: { expenses: expense },
        $set: { updatedAt: new Date().toISOString() }
      }
    )
    
    return handleCORS(NextResponse.json(expense))
  } catch (error) {
    console.error('Error in POST /api/trips/:tripId/expenses:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ))
  }
}

// DELETE /api/trips/:tripId/expenses?expenseId=...
export async function DELETE(request, { params }) {
  try {
    const { tripId } = params
    const db = await connectToMongo()
    
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }
    
    const { searchParams } = new URL(request.url)
    const expenseId = searchParams.get('expenseId')
    
    if (!expenseId) {
      return handleCORS(NextResponse.json(
        { error: 'Expense ID is required' },
        { status: 400 }
      ))
    }
    
    const trip = await db.collection('trips').findOne({ id: tripId })
    if (!trip) {
      return handleCORS(NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      ))
    }

    // Block modifications on cancelled trips
    if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
      return handleCORS(NextResponse.json(
        { error: 'This trip has been canceled and is read-only' },
        { status: 400 }
      ))
    }

    // Check if user is an active traveler
    const isTraveler = await isActiveTraveler(db, trip, auth.user.id)
    if (!isTraveler) {
      return handleCORS(NextResponse.json(
        { error: 'You are not a traveler on this trip' },
        { status: 403 }
      ))
    }

    // Find expense and verify permission (user must be expense creator or trip leader)
    const expenses = trip.expenses || []
    const expense = expenses.find((e) => {
      const eId = e._id?.toString() || e.id
      return eId === expenseId
    })

    if (!expense) {
      return handleCORS(NextResponse.json(
        { error: 'Expense not found' },
        { status: 404 }
      ))
    }

    // Check if user has permission to delete (must be expense creator or trip leader)
    const isExpenseCreator = expense.paidByUserId === auth.user.id
    const isTripLeader = trip.ownerId === auth.user.id || trip.leaderId === auth.user.id

    if (!isExpenseCreator && !isTripLeader) {
      return handleCORS(NextResponse.json(
        { error: 'Only the expense creator or trip leader can delete this expense' },
        { status: 403 }
      ))
    }

    // Use atomic $pull to remove expense (prevents race conditions)
    const result = await db.collection('trips').updateOne(
      { id: tripId },
      {
        $pull: { expenses: { _id: new ObjectId(expenseId) } },
        $set: { updatedAt: new Date().toISOString() }
      }
    )

    if (result.modifiedCount === 0) {
      return handleCORS(NextResponse.json(
        { error: 'Expense not found or already deleted' },
        { status: 404 }
      ))
    }

    return handleCORS(NextResponse.json({ message: 'Expense deleted' }))
  } catch (error) {
    console.error('Error in DELETE /api/trips/:tripId/expenses:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ))
  }
}
