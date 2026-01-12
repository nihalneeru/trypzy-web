import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { generateItinerary, summarizeFeedback, reviseItinerary } from '@/lib/server/llm.js'

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'trypzy-secret-key-change-in-production'

// MongoDB connection
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME || 'trypzy')
  }
  return db
}

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// Get user from JWT token
async function getUserFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const db = await connectToMongo()
    const user = await db.collection('users').findOne({ id: decoded.userId })
    return user
  } catch (error) {
    return null
  }
}

// Protected route helper
async function requireAuth(request) {
  const user = await getUserFromToken(request)
  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }
  return { user }
}

// Generate invite code
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// Normalize availability to effective per-day view
// Handles broad, weekly, and per-day availability with precedence: per-day > weekly > broad
// Returns array of { day: 'YYYY-MM-DD', status: 'available'|'maybe'|'unavailable', userId: string }
function normalizeAvailabilityToPerDay(availabilities, tripStartDate, tripEndDate, userId) {
  const userAvails = availabilities.filter(a => a.userId === userId)
  if (userAvails.length === 0) return []
  
  // Separate by type
  const perDayAvails = userAvails.filter(a => a.day && !a.isBroad && !a.isWeekly)
  const broadAvails = userAvails.filter(a => a.isBroad === true)
  const weeklyAvails = userAvails.filter(a => a.isWeekly === true)
  
  // Generate all days in trip range
  const startDate = new Date(tripStartDate)
  const endDate = new Date(tripEndDate)
  const dayMap = new Map()
  
  // Initialize with broad availability (lowest precedence)
  if (broadAvails.length > 0) {
    const broadStatus = broadAvails[0].status // Take first if multiple
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0]
      dayMap.set(dayStr, broadStatus)
    }
  }
  
  // Apply weekly blocks (medium precedence)
  weeklyAvails.forEach(weekly => {
    const weekStart = new Date(weekly.startDate)
    const weekEnd = new Date(weekly.endDate)
    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split('T')[0]
      // Only set if within trip range
      if (dayStr >= tripStartDate && dayStr <= tripEndDate) {
        dayMap.set(dayStr, weekly.status)
      }
    }
  })
  
  // Apply per-day records (highest precedence - overrides everything)
  perDayAvails.forEach(perDay => {
    dayMap.set(perDay.day, perDay.status)
  })
  
  // Convert to array format and sort by day
  return Array.from(dayMap.entries())
    .map(([day, status]) => ({
      day,
      status,
      userId
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

// Get normalized availabilities for all users
// Returns array of { day: 'YYYY-MM-DD', status: 'available'|'maybe'|'unavailable', userId: string }
function getAllNormalizedAvailabilities(availabilities, tripStartDate, tripEndDate) {
  const uniqueUserIds = [...new Set(availabilities.map(a => a.userId))]
  const normalized = []
  
  uniqueUserIds.forEach(userId => {
    const userNormalized = normalizeAvailabilityToPerDay(availabilities, tripStartDate, tripEndDate, userId)
    normalized.push(...userNormalized)
  })
  
  return normalized
}

// Consensus Algorithm - MUST BE DETERMINISTIC
// Available = +1, Maybe = +0.5, Unavailable = 0
// Now accepts normalized per-day availabilities
function calculateConsensus(availabilities, tripStartDate, tripEndDate, tripDuration = 3) {
  const dateMap = new Map()
  
  // Group availabilities by day
  availabilities.forEach(avail => {
    if (!dateMap.has(avail.day)) {
      dateMap.set(avail.day, [])
    }
    dateMap.get(avail.day).push(avail)
  })
  
  // Get all unique users who submitted availability
  const uniqueUsers = [...new Set(availabilities.map(a => a.userId))]
  const totalUsers = uniqueUsers.length
  
  if (totalUsers === 0) return []
  
  // Generate all possible date ranges
  const startDate = new Date(tripStartDate)
  const endDate = new Date(tripEndDate)
  const options = []
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const rangeStart = new Date(d)
    const rangeEnd = new Date(d)
    rangeEnd.setDate(rangeEnd.getDate() + tripDuration - 1)
    
    if (rangeEnd > endDate) break
    
    // Calculate score for this range
    let totalScore = 0
    let daysWithAvailability = 0
    
    for (let dayDate = new Date(rangeStart); dayDate <= rangeEnd; dayDate.setDate(dayDate.getDate() + 1)) {
      const dayStr = dayDate.toISOString().split('T')[0]
      const dayAvails = dateMap.get(dayStr) || []
      
      dayAvails.forEach(avail => {
        if (avail.status === 'available') totalScore += 1
        else if (avail.status === 'maybe') totalScore += 0.5
        // unavailable = 0
      })
      
      if (dayAvails.length > 0) daysWithAvailability++
    }
    
    // Normalize score by number of days and users
    const normalizedScore = totalScore / (tripDuration * totalUsers)
    
    options.push({
      optionKey: `${rangeStart.toISOString().split('T')[0]}_${rangeEnd.toISOString().split('T')[0]}`,
      startDate: rangeStart.toISOString().split('T')[0],
      endDate: rangeEnd.toISOString().split('T')[0],
      score: normalizedScore,
      totalScore: totalScore,
      coverage: daysWithAvailability / tripDuration
    })
  }
  
  // Sort by score descending, then by startDate ascending for determinism
  options.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.startDate.localeCompare(b.startDate)
  })
  
  return options.slice(0, 3)
}

// Generate promising windows for refinement
// Returns 2-3 top date windows based on consensus algorithm
// Uses normalized availability (handles broad/weekly/per-day automatically)
// Returns array of { optionKey, startDate, endDate, score, totalScore, coverage }
function generatePromisingWindows(availabilities, tripStartDate, tripEndDate, tripDuration = 3) {
  // Use existing consensus algorithm
  const consensusOptions = calculateConsensus(availabilities, tripStartDate, tripEndDate, tripDuration)
  
  // Return 2-3 windows (prefer 3, but return what's available)
  // If we have fewer than 2, return what we have (could be 0 or 1)
  if (consensusOptions.length >= 2) {
    return consensusOptions.slice(0, Math.min(3, consensusOptions.length))
  }
  
  return consensusOptions
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // ============ AUTH ROUTES ============
    
    // Signup - POST /api/auth/signup
    if (route === '/auth/signup' && method === 'POST') {
      const body = await request.json()
      const { email, password, name } = body
      
      if (!email || !password || !name) {
        return handleCORS(NextResponse.json(
          { error: 'Email, password, and name are required' },
          { status: 400 }
        ))
      }
      
      // Check if user exists
      const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (existingUser) {
        return handleCORS(NextResponse.json(
          { error: 'Email already registered' },
          { status: 400 }
        ))
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10)
      
      const user = {
        id: uuidv4(),
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('users').insertOne(user)
      
      // Generate token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
      
      return handleCORS(NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name },
        token
      }))
    }
    
    // Signin - POST /api/auth/signin
    if (route === '/auth/signin' && method === 'POST') {
      const body = await request.json()
      const { email, password } = body
      
      if (!email || !password) {
        return handleCORS(NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        ))
      }
      
      const user = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        ))
      }
      
      const validPassword = await bcrypt.compare(password, user.password)
      if (!validPassword) {
        return handleCORS(NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        ))
      }
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
      
      return handleCORS(NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name },
        token
      }))
    }
    
    // Get current user - GET /api/auth/me
    if (route === '/auth/me' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      return handleCORS(NextResponse.json({
        user: { id: auth.user.id, email: auth.user.email, name: auth.user.name }
      }))
    }

    // ============ CIRCLE ROUTES ============
    
    // Create circle - POST /api/circles
    if (route === '/circles' && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const body = await request.json()
      const { name, description } = body
      
      if (!name) {
        return handleCORS(NextResponse.json(
          { error: 'Circle name is required' },
          { status: 400 }
        ))
      }
      
      const circle = {
        id: uuidv4(),
        name,
        description: description || '',
        ownerId: auth.user.id,
        inviteCode: generateInviteCode(),
        createdAt: new Date().toISOString()
      }
      
      await db.collection('circles').insertOne(circle)
      
      // Add owner as member
      await db.collection('memberships').insertOne({
        userId: auth.user.id,
        circleId: circle.id,
        role: 'owner',
        joinedAt: new Date().toISOString()
      })
      
      // Add system message for circle creation
      await db.collection('circle_messages').insertOne({
        id: uuidv4(),
        circleId: circle.id,
        userId: null,
        content: `✨ Circle "${name}" was created by ${auth.user.name}`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json(circle))
    }
    
    // Get user's circles - GET /api/circles
    if (route === '/circles' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const memberships = await db.collection('memberships')
        .find({ userId: auth.user.id })
        .toArray()
      
      const circleIds = memberships.map(m => m.circleId)
      
      const circles = await db.collection('circles')
        .find({ id: { $in: circleIds } })
        .toArray()
      
      // Add member count to each circle
      const circlesWithCounts = await Promise.all(circles.map(async (circle) => {
        const memberCount = await db.collection('memberships')
          .countDocuments({ circleId: circle.id })
        const tripCount = await db.collection('trips')
          .countDocuments({ circleId: circle.id })
        return {
          ...circle,
          memberCount,
          tripCount,
          isOwner: circle.ownerId === auth.user.id
        }
      }))
      
      return handleCORS(NextResponse.json(circlesWithCounts.map(({ _id, ...rest }) => rest)))
    }
    
    // Join circle via invite - POST /api/circles/join
    if (route === '/circles/join' && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const body = await request.json()
      const { inviteCode } = body
      
      if (!inviteCode) {
        return handleCORS(NextResponse.json(
          { error: 'Invite code is required' },
          { status: 400 }
        ))
      }
      
      const circle = await db.collection('circles').findOne({ inviteCode: inviteCode.toUpperCase() })
      if (!circle) {
        return handleCORS(NextResponse.json(
          { error: 'Invalid invite code' },
          { status: 404 }
        ))
      }
      
      // Check if already a member
      const existingMembership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: circle.id
      })
      
      if (existingMembership) {
        return handleCORS(NextResponse.json(
          { error: 'You are already a member of this circle' },
          { status: 400 }
        ))
      }
      
      await db.collection('memberships').insertOne({
        userId: auth.user.id,
        circleId: circle.id,
        role: 'member',
        joinedAt: new Date().toISOString()
      })
      
      // Add system message for joining circle
      await db.collection('circle_messages').insertOne({
        id: uuidv4(),
        circleId: circle.id,
        userId: null,
        content: `👋 ${auth.user.name} joined the circle`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Joined circle successfully', circle }))
    }
    
    // Get circle by ID - GET /api/circles/:id
    if (route.match(/^\/circles\/[^/]+$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const circleId = path[1]
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const circle = await db.collection('circles').findOne({ id: circleId })
      if (!circle) {
        return handleCORS(NextResponse.json(
          { error: 'Circle not found' },
          { status: 404 }
        ))
      }
      
      // Get members
      const memberships = await db.collection('memberships')
        .find({ circleId })
        .toArray()
      
      const memberIds = memberships.map(m => m.userId)
      const members = await db.collection('users')
        .find({ id: { $in: memberIds } })
        .toArray()
      
      const membersWithRoles = members.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: memberships.find(ms => ms.userId === m.id)?.role,
        joinedAt: memberships.find(ms => ms.userId === m.id)?.joinedAt
      }))
      
      // Get trips
      const trips = await db.collection('trips')
        .find({ circleId })
        .sort({ createdAt: -1 })
        .toArray()
      
      // Include isCreator flag for each trip
      const tripsWithCreator = trips.map(trip => {
        const { _id, ...rest } = trip
        return {
          ...rest,
          isCreator: trip.createdBy === auth.user.id
        }
      })
      
      return handleCORS(NextResponse.json({
        ...circle,
        members: membersWithRoles,
        trips: tripsWithCreator,
        isOwner: circle.ownerId === auth.user.id
      }))
    }

    // ============ TRIP ROUTES ============
    
    // Create trip - POST /api/trips
    if (route === '/trips' && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const body = await request.json()
      const { circleId, name, description, type, startDate, endDate, duration } = body
      
      if (!circleId || !name || !type || !startDate || !endDate) {
        return handleCORS(NextResponse.json(
          { error: 'Circle ID, name, type, start date, and end date are required' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // New scheduling mode: default to top3_heatmap for new trips
      // Backward compatibility: old trips without schedulingMode use legacy availability flow
      const schedulingMode = body.schedulingMode || 'top3_heatmap'
      
      const trip = {
        id: uuidv4(),
        circleId,
        name,
        description: description || '',
        type, // 'collaborative' or 'hosted'
        startDate, // YYYY-MM-DD (legacy, kept for backward compatibility)
        endDate,   // YYYY-MM-DD (legacy, kept for backward compatibility)
        duration: duration || 3,
        // New fields for top3_heatmap scheduling
        schedulingMode,
        startBound: body.startBound || startDate, // YYYY-MM-DD (lower bound for window start dates)
        endBound: body.endBound || endDate,       // YYYY-MM-DD (upper bound)
        tripLengthDays: body.tripLengthDays || duration || 3, // Fixed trip length in days
        status: type === 'hosted' ? 'locked' : 'proposed', // proposed, scheduling, voting, locked
        lockedStartDate: type === 'hosted' ? startDate : null,
        lockedEndDate: type === 'hosted' ? endDate : null,
        itineraryStatus: type === 'hosted' ? 'collecting_ideas' : null, // collecting_ideas, drafting, published, revising
        createdBy: auth.user.id,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne(trip)
      
      // Add system message for trip creation
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId: trip.id,
        userId: null,
        content: `✈️ Trip "${name}" was created by ${auth.user.name}`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      // For hosted trips, creator is automatically a participant
      if (type === 'hosted') {
        await db.collection('trip_participants').insertOne({
          id: uuidv4(),
          tripId: trip.id,
          userId: auth.user.id,
          joinedAt: new Date().toISOString()
        })
      }
      
      return handleCORS(NextResponse.json(trip))
    }
    
    // Delete trip - DELETE /api/trips/:id
    if (route.match(/^\/trips\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const trip = await db.collection('trips').findOne({ id: tripId })
      
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Only trip creator can delete
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator can delete this trip' },
          { status: 403 }
        ))
      }
      
      // Delete related data
      await db.collection('availabilities').deleteMany({ tripId })
      await db.collection('votes').deleteMany({ tripId })
      await db.collection('trip_participants').deleteMany({ tripId })
      await db.collection('posts').deleteMany({ tripId })
      await db.collection('trip_messages').deleteMany({ tripId })
      
      // Delete trip
      await db.collection('trips').deleteOne({ id: tripId })
      
      return handleCORS(NextResponse.json({ message: 'Trip deleted' }))
    }
    
    // Update trip - PATCH /api/trips/:id
    if (route.match(/^\/trips\/[^/]+$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const trip = await db.collection('trips').findOne({ id: tripId })
      
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Only trip creator can edit (unless status is locked)
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator can edit this trip' },
          { status: 403 }
        ))
      }
      
      // Can't edit locked trips
      if (trip.status === 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Cannot edit a locked trip' },
          { status: 400 }
        ))
      }
      
      const body = await request.json()
      const updateFields = {}
      
      if (body.name !== undefined) updateFields.name = body.name.trim()
      if (body.description !== undefined) updateFields.description = body.description?.trim() || null
      if (body.startDate !== undefined) updateFields.startDate = body.startDate
      if (body.endDate !== undefined) updateFields.endDate = body.endDate
      if (body.duration !== undefined) updateFields.duration = parseInt(body.duration)
      
      updateFields.updatedAt = new Date().toISOString()
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: updateFields }
      )
      
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      return handleCORS(NextResponse.json(updatedTrip))
    }
    
    // Get trip by ID - GET /api/trips/:id
    if (route.match(/^\/trips\/[^/]+$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Backward compatibility: default status for old trips without status field
      // Also check for legacy 'type' field to determine status
      if (!trip.status) {
        trip.status = trip.type === 'hosted' ? 'locked' : 'scheduling'
      }
      
      // Ensure status is valid
      const tripStatus = trip.status
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Get availabilities
      const availabilities = await db.collection('availabilities')
        .find({ tripId })
        .toArray()
      
      // Get votes
      const votes = await db.collection('votes')
        .find({ tripId })
        .toArray()
      
      // Get voter user details for vote display (only if there are votes)
      let votesWithVoters = votes
      if (votes.length > 0) {
        const voterIds = [...new Set(votes.map(v => v.userId))]
        const voters = await db.collection('users')
          .find({ id: { $in: voterIds } })
          .toArray()
        const voterMap = new Map(voters.map(u => [u.id, { id: u.id, name: u.name }]))
        
        // Enrich votes with voter names
        votesWithVoters = votes.map(vote => {
          const voter = voterMap.get(vote.userId)
          return {
            ...vote,
            voterName: voter?.name || 'Unknown'
          }
        })
      }
      
      // Get participants (for hosted trips)
      const participants = await db.collection('trip_participants')
        .find({ tripId })
        .toArray()
      
      // Get participant user details
      const participantUserIds = participants.map(p => p.userId)
      const participantUsers = await db.collection('users')
        .find({ id: { $in: participantUserIds } })
        .toArray()
      
      // Normalize availabilities to per-day view for consensus calculation
      const normalizedAvailabilities = trip.status !== 'locked' && trip.type === 'collaborative'
        ? getAllNormalizedAvailabilities(availabilities, trip.startDate, trip.endDate)
        : []
      
      // Calculate consensus options using normalized availabilities
      const consensusOptions = trip.status !== 'locked' && trip.type === 'collaborative'
        ? calculateConsensus(normalizedAvailabilities, trip.startDate, trip.endDate, trip.duration)
        : []
      
      // Generate promising windows (2-3 top date windows for refinement)
      // Computed on fetch - deterministic and stable across refreshes
      const promisingWindows = trip.status !== 'locked' && trip.type === 'collaborative'
        ? generatePromisingWindows(normalizedAvailabilities, trip.startDate, trip.endDate, trip.duration)
        : []
      
      // Get user's availability and normalize to per-day view for frontend
      const userRawAvailability = availabilities.filter(a => a.userId === auth.user.id)
      const userAvailability = normalizeAvailabilityToPerDay(availabilities, trip.startDate, trip.endDate, auth.user.id)
      
      // Get user's vote
      const userVote = votes.find(v => v.userId === auth.user.id)
      
      // Check if user is participant (for hosted trips)
      const isParticipant = participants.some(p => p.userId === auth.user.id)
      
      // Get circle info and member count for progress tracking
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Get all circle members for progress calculation
      const allMemberships = await db.collection('memberships')
        .find({ circleId: trip.circleId })
        .toArray()
      const totalMembers = allMemberships.length
      
      // Count unique users who have submitted availability
      const usersWithAvailability = [...new Set(availabilities.map(a => a.userId))]
      const respondedCount = usersWithAvailability.length
      
      // Count unique users who have voted
      const usersWithVotes = [...new Set(votes.map(v => v.userId))]
      const votedCount = usersWithVotes.length
      
      // New scheduling mode: top3_heatmap - aggregate date picks into heatmap
      let heatmapScores = {}
      let topCandidates = []
      let userDatePicks = null
      
      if (trip.schedulingMode === 'top3_heatmap') {
        // Get all date picks for this trip
        const allPicks = await db.collection('trip_date_picks')
          .find({ tripId })
          .toArray()
        
        // Get current user's picks
        const userPicksDoc = allPicks.find(p => p.userId === auth.user.id)
        userDatePicks = userPicksDoc ? userPicksDoc.picks : []
        
        // Compute heatmap scores: weight = {1:3, 2:2, 3:1}
        const weightMap = { 1: 3, 2: 2, 3: 1 }
        heatmapScores = {}
        const scoreBreakdown = {} // { startDate: { loveCount, canCount, mightCount } }
        
        allPicks.forEach(pickDoc => {
          pickDoc.picks.forEach(pick => {
            const startDate = pick.startDateISO
            const rank = pick.rank
            const weight = weightMap[rank] || 0
            
            if (!heatmapScores[startDate]) {
              heatmapScores[startDate] = 0
              scoreBreakdown[startDate] = { loveCount: 0, canCount: 0, mightCount: 0 }
            }
            
            heatmapScores[startDate] += weight
            
            // Track breakdown by rank
            if (rank === 1) scoreBreakdown[startDate].loveCount++
            else if (rank === 2) scoreBreakdown[startDate].canCount++
            else if (rank === 3) scoreBreakdown[startDate].mightCount++
          })
        })
        
        // Generate top candidates: top 5 start dates by score
        const startBound = trip.startBound || trip.startDate
        const endBound = trip.endBound || trip.endDate
        const tripLengthDays = trip.tripLengthDays || trip.duration || 3
        
        // Get all valid start dates (where startDate + (tripLengthDays-1) <= endBound)
        const validStartDates = []
        const startDateObj = new Date(startBound + 'T12:00:00')
        const endBoundObj = new Date(endBound + 'T12:00:00')
        
        for (let d = new Date(startDateObj); d <= endBoundObj; d.setDate(d.getDate() + 1)) {
          const startDateStr = d.toISOString().split('T')[0]
          const endDateObj = new Date(d)
          endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
          const endDateStr = endDateObj.toISOString().split('T')[0]
          
          if (endDateStr <= endBound) {
            validStartDates.push({
              startDateISO: startDateStr,
              endDateISO: endDateStr,
              score: heatmapScores[startDateStr] || 0,
              breakdown: scoreBreakdown[startDateStr] || { loveCount: 0, canCount: 0, mightCount: 0 }
            })
          }
        }
        
        // Sort by score descending, take top 5
        topCandidates = validStartDates
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(candidate => ({
            startDateISO: candidate.startDateISO,
            endDateISO: candidate.endDateISO,
            score: candidate.score,
            loveCount: candidate.breakdown.loveCount,
            canCount: candidate.breakdown.canCount,
            mightCount: candidate.breakdown.mightCount
          }))
      }
      
      return handleCORS(NextResponse.json({
        ...trip,
        circle: circle ? { id: circle.id, name: circle.name, ownerId: circle.ownerId } : null,
        availabilities: availabilities.map(({ _id, ...rest }) => rest),
        userAvailability: userAvailability.map(({ _id, ...rest }) => rest),
        votes: votesWithVoters.map(({ _id, ...rest }) => rest),
        userVote: userVote ? { optionKey: userVote.optionKey } : null,
        consensusOptions, // Backward compatibility
        promisingWindows, // New: 2-3 top date windows for refinement
        participants: participantUsers.map(u => ({ id: u.id, name: u.name })),
        isParticipant,
        isCreator: trip.createdBy === auth.user.id,
        canLock: (trip.createdBy === auth.user.id || circle?.ownerId === auth.user.id) && trip.status === 'voting',
        // Progress tracking stats
        totalMembers,
        respondedCount,
        votedCount,
        // New top3_heatmap scheduling data
        userDatePicks, // Current user's picks: [{rank:1|2|3, startDateISO}]
        heatmapScores, // { startDateISO: score }
        topCandidates, // Top 5: [{startDateISO, endDateISO, score, loveCount, canCount, mightCount}]
        // Itinerary status (for locked trips)
        itineraryStatus: trip.itineraryStatus || null
      }))
    }
    
    // Submit availability - POST /api/trips/:id/availability
    // Supports three payload formats:
    // 1. Per-day: { availabilities: [{ day: 'YYYY-MM-DD', status: '...' }] }
    // 2. Broad: { broadStatus: 'available'|'maybe'|'unavailable' }
    // 3. Weekly: { weeklyBlocks: [{ startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', status: '...' }] }
    // Can combine formats - per-day overrides weekly, which overrides broad
    if (route.match(/^\/trips\/[^/]+\/availability$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { availabilities, broadStatus, weeklyBlocks } = body
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Backward compatibility: default status for old trips without status field
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Guard: Cannot submit availability after voting starts or when locked
      if (tripStatus === 'voting' || tripStatus === 'locked') {
        const errorMessage = tripStatus === 'voting' 
          ? 'Availability is frozen while voting is open.'
          : 'Dates are locked; scheduling is closed.'
        return handleCORS(NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        ))
      }
      
      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json(
          { error: 'Availability only applies to collaborative trips' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Validate payload
      const hasPerDay = availabilities && Array.isArray(availabilities) && availabilities.length > 0
      const hasBroad = broadStatus && ['available', 'maybe', 'unavailable'].includes(broadStatus)
      const hasWeekly = weeklyBlocks && Array.isArray(weeklyBlocks) && weeklyBlocks.length > 0
      
      if (!hasPerDay && !hasBroad && !hasWeekly) {
        return handleCORS(NextResponse.json(
          { error: 'Must provide availabilities, broadStatus, or weeklyBlocks' },
          { status: 400 }
        ))
      }
      
      // Validate per-day format
      if (hasPerDay) {
        for (const a of availabilities) {
          if (!a.day || !a.status || !['available', 'maybe', 'unavailable'].includes(a.status)) {
            return handleCORS(NextResponse.json(
              { error: 'Invalid per-day availability format. Each item must have day (YYYY-MM-DD) and status (available|maybe|unavailable)' },
              { status: 400 }
            ))
          }
          // Validate day is within trip range
          if (a.day < trip.startDate || a.day > trip.endDate) {
            return handleCORS(NextResponse.json(
              { error: `Day ${a.day} is outside trip date range (${trip.startDate} to ${trip.endDate})` },
              { status: 400 }
            ))
          }
        }
      }
      
      // Validate weekly blocks format
      if (hasWeekly) {
        for (const block of weeklyBlocks) {
          if (!block.startDate || !block.endDate || !block.status || 
              !['available', 'maybe', 'unavailable'].includes(block.status)) {
            return handleCORS(NextResponse.json(
              { error: 'Invalid weekly block format. Each block must have startDate, endDate (YYYY-MM-DD), and status (available|maybe|unavailable)' },
              { status: 400 }
            ))
          }
          // Validate dates are within trip range
          if (block.startDate < trip.startDate || block.endDate > trip.endDate) {
            return handleCORS(NextResponse.json(
              { error: `Weekly block dates (${block.startDate} to ${block.endDate}) must be within trip range (${trip.startDate} to ${trip.endDate})` },
              { status: 400 }
            ))
          }
          if (block.startDate > block.endDate) {
            return handleCORS(NextResponse.json(
              { error: `Weekly block startDate (${block.startDate}) must be <= endDate (${block.endDate})` },
              { status: 400 }
            ))
          }
        }
      }
      
      // Delete existing availability for this user/trip
      await db.collection('availabilities').deleteMany({
        tripId,
        userId: auth.user.id
      })
      
      const newAvailabilities = []
      const now = new Date().toISOString()
      
      // Store broad availability (if provided)
      if (hasBroad) {
        newAvailabilities.push({
          id: uuidv4(),
          tripId,
          userId: auth.user.id,
          day: null, // Broad availability doesn't have a specific day
          isBroad: true,
          status: broadStatus,
          createdAt: now
        })
      }
      
      // Store weekly blocks (if provided)
      if (hasWeekly) {
        weeklyBlocks.forEach(block => {
          newAvailabilities.push({
            id: uuidv4(),
            tripId,
            userId: auth.user.id,
            startDate: block.startDate,
            endDate: block.endDate,
            isWeekly: true,
            status: block.status,
            createdAt: now
          })
        })
      }
      
      // Store per-day availabilities (if provided) - these override broad/weekly
      if (hasPerDay) {
        availabilities.forEach(a => {
          newAvailabilities.push({
            id: uuidv4(),
            tripId,
            userId: auth.user.id,
            day: a.day,
            status: a.status,
            createdAt: now
          })
        })
      }
      
      if (newAvailabilities.length > 0) {
        await db.collection('availabilities').insertMany(newAvailabilities)
        
        // Transition from 'proposed' to 'scheduling' when first availability is submitted
        if (tripStatus === 'proposed') {
          await db.collection('trips').updateOne(
            { id: tripId },
            { $set: { status: 'scheduling' } }
          )
          
          // Add system message for scheduling phase start
          await db.collection('trip_messages').insertOne({
            id: uuidv4(),
            tripId,
            userId: null,
            content: `📅 Scheduling has started! Mark your availability to help find the best dates.`,
            isSystem: true,
            createdAt: new Date().toISOString()
          })
        }
      }
      
      // Note: No system message for individual availability submissions
      // (only state transitions generate system messages)
      
      return handleCORS(NextResponse.json({ 
        message: 'Availability saved', 
        saved: {
          broad: hasBroad,
          weekly: hasWeekly ? weeklyBlocks.length : 0,
          perDay: hasPerDay ? availabilities.length : 0
        }
      }))
    }
    
    // Open voting - POST /api/trips/:id/open-voting
    if (route.match(/^\/trips\/[^/]+\/open-voting$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Only trip creator or circle owner can open voting
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can open voting' },
          { status: 403 }
        ))
      }
      
      // Backward compatibility: default status for old trips
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Allow opening voting from 'proposed' or 'scheduling' states
      // This supports leader flexibility - they can move forward even if not everyone responded
      // Guard: Cannot open voting if already voting or locked
      if (tripStatus === 'voting' || tripStatus === 'locked') {
        return handleCORS(NextResponse.json(
          { error: tripStatus === 'voting' ? 'Voting is already open' : 'Cannot open voting for a locked trip' },
          { status: 400 }
        ))
      }
      
      if (tripStatus !== 'proposed' && tripStatus !== 'scheduling') {
        return handleCORS(NextResponse.json(
          { error: 'Voting can only be opened during proposed or scheduling phase' },
          { status: 400 }
        ))
      }
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { status: 'voting' } }
      )
      
      // Add system message for voting phase
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `🗳️ Voting is now open! Choose your preferred dates from the top options.`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Voting opened' }))
    }
    
    // Vote - POST /api/trips/:id/vote
    if (route.match(/^\/trips\/[^/]+\/vote$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { optionKey } = body // 'YYYY-MM-DD_YYYY-MM-DD'
      
      if (!optionKey) {
        return handleCORS(NextResponse.json(
          { error: 'Option key is required' },
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
      
      // Backward compatibility: default status for old trips
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Guard: Voting only allowed during voting phase
      if (tripStatus !== 'voting') {
        return handleCORS(NextResponse.json(
          { error: 'Voting is not open for this trip' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Upsert vote
      await db.collection('votes').updateOne(
        { tripId, userId: auth.user.id },
        { 
          $set: { 
            optionKey,
            updatedAt: new Date().toISOString()
          },
          $setOnInsert: {
            id: uuidv4(),
            tripId,
            userId: auth.user.id,
            createdAt: new Date().toISOString()
          }
        },
        { upsert: true }
      )
      
      return handleCORS(NextResponse.json({ message: 'Vote recorded' }))
    }
    
    // Submit date picks - POST /api/trips/:id/date-picks (new top3_heatmap scheduling)
    if (route.match(/^\/trips\/[^/]+\/date-picks$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { picks } = body // Array of {rank: 1|2|3, startDateISO: 'YYYY-MM-DD'}
      
      if (!Array.isArray(picks)) {
        return handleCORS(NextResponse.json(
          { error: 'Picks must be an array' },
          { status: 400 }
        ))
      }
      
      if (picks.length > 3) {
        return handleCORS(NextResponse.json(
          { error: 'Maximum 3 picks allowed' },
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
      
      // Only allow for top3_heatmap scheduling mode
      if (trip.schedulingMode !== 'top3_heatmap') {
        return handleCORS(NextResponse.json(
          { error: 'Date picks only available for top3_heatmap scheduling mode' },
          { status: 400 }
        ))
      }
      
      // Backward compatibility: default status
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Guard: Cannot submit picks when locked
      if (tripStatus === 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Trip dates are locked; picks cannot be changed' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Validate picks
      const startBound = trip.startBound || trip.startDate
      const endBound = trip.endBound || trip.endDate
      const tripLengthDays = trip.tripLengthDays || trip.duration || 3
      const seenRanks = new Set()
      const seenDates = new Set()
      
      for (const pick of picks) {
        if (!pick.rank || !pick.startDateISO) {
          return handleCORS(NextResponse.json(
            { error: 'Each pick must have rank (1-3) and startDateISO' },
            { status: 400 }
          ))
        }
        
        if (![1, 2, 3].includes(pick.rank)) {
          return handleCORS(NextResponse.json(
            { error: 'Rank must be 1, 2, or 3' },
            { status: 400 }
          ))
        }
        
        if (seenRanks.has(pick.rank)) {
          return handleCORS(NextResponse.json(
            { error: `Duplicate rank ${pick.rank}` },
            { status: 400 }
          ))
        }
        
        if (seenDates.has(pick.startDateISO)) {
          return handleCORS(NextResponse.json(
            { error: `Duplicate start date ${pick.startDateISO}` },
            { status: 400 }
          ))
        }
        
        // Validate start date is within bounds
        if (pick.startDateISO < startBound || pick.startDateISO > endBound) {
          return handleCORS(NextResponse.json(
            { error: `Start date ${pick.startDateISO} is outside trip bounds (${startBound} to ${endBound})` },
            { status: 400 }
          ))
        }
        
        // Validate window fits within bounds
        const startDateObj = new Date(pick.startDateISO + 'T12:00:00')
        const endDateObj = new Date(startDateObj)
        endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
        const endDateISO = endDateObj.toISOString().split('T')[0]
        
        if (endDateISO > endBound) {
          return handleCORS(NextResponse.json(
            { error: `Window starting ${pick.startDateISO} (${tripLengthDays} days) extends beyond end bound ${endBound}` },
            { status: 400 }
          ))
        }
        
        seenRanks.add(pick.rank)
        seenDates.add(pick.startDateISO)
      }
      
      // Upsert user's picks
      await db.collection('trip_date_picks').updateOne(
        { tripId, userId: auth.user.id },
        {
          $set: {
            picks: picks.map(p => ({ rank: p.rank, startDateISO: p.startDateISO })),
            updatedAt: new Date().toISOString()
          }
        },
        { upsert: true }
      )
      
      return handleCORS(NextResponse.json({ message: 'Date picks saved' }))
    }
    
    // Lock trip - POST /api/trips/:id/lock
    // Supports both old format (optionKey) and new format (startDateISO for top3_heatmap)
    if (route.match(/^\/trips\/[^/]+\/lock$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { optionKey, startDateISO } = body
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Backward compatibility: default status for old trips
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Only trip creator or circle owner can lock
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can lock the trip' },
          { status: 403 }
        ))
      }
      
      // Guard: Cannot lock if already locked (no re-locking)
      if (tripStatus === 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Trip is already locked' },
          { status: 400 }
        ))
      }
      
      let lockedStartDate, lockedEndDate
      
      // New format: top3_heatmap uses startDateISO
      if (trip.schedulingMode === 'top3_heatmap' && startDateISO) {
        const startBound = trip.startBound || trip.startDate
        const endBound = trip.endBound || trip.endDate
        const tripLengthDays = trip.tripLengthDays || trip.duration || 3
        
        if (startDateISO < startBound || startDateISO > endBound) {
          return handleCORS(NextResponse.json(
            { error: `Start date ${startDateISO} is outside trip bounds` },
            { status: 400 }
          ))
        }
        
        const startDateObj = new Date(startDateISO + 'T12:00:00')
        const endDateObj = new Date(startDateObj)
        endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
        const endDateISO = endDateObj.toISOString().split('T')[0]
        
        if (endDateISO > endBound) {
          return handleCORS(NextResponse.json(
            { error: `Window extends beyond end bound` },
            { status: 400 }
          ))
        }
        
        lockedStartDate = startDateISO
        lockedEndDate = endDateISO
      } else if (optionKey) {
        // Old format: legacy voting uses optionKey
        // Guard: Locking only allowed during voting phase for legacy trips
        if (tripStatus !== 'voting') {
          return handleCORS(NextResponse.json(
            { error: 'Trip can only be locked during voting phase' },
            { status: 400 }
          ))
        }
        
        [lockedStartDate, lockedEndDate] = optionKey.split('_')
      } else {
        return handleCORS(NextResponse.json(
          { error: 'Must provide either optionKey (legacy) or startDateISO (top3_heatmap)' },
          { status: 400 }
        ))
      }
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { 
          $set: { 
            status: 'locked',
            lockedStartDate,
            lockedEndDate,
            itineraryStatus: 'collecting_ideas' // Default to collecting ideas when locked
          } 
        }
      )
      
      // Format dates for display
      const startDateFormatted = new Date(lockedStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const endDateFormatted = new Date(lockedEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      
      // Add system message for locked dates
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `🔒 Trip dates locked! ${startDateFormatted} to ${endDateFormatted}. Planning can now begin! 🎉`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Trip locked', lockedStartDate, lockedEndDate }))
    }
    
    // Join hosted trip - POST /api/trips/:id/join
    if (route.match(/^\/trips\/[^/]+\/join$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      if (trip.type !== 'hosted') {
        return handleCORS(NextResponse.json(
          { error: 'Can only join hosted trips' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Check if already participant
      const existingParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      if (existingParticipant) {
        return handleCORS(NextResponse.json(
          { error: 'You are already a participant' },
          { status: 400 }
        ))
      }
      
      await db.collection('trip_participants').insertOne({
        id: uuidv4(),
        tripId,
        userId: auth.user.id,
        joinedAt: new Date().toISOString()
      })
      
      // Add system message for joining hosted trip
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `👋 ${auth.user.name} joined the trip!`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Joined trip successfully' }))
    }
    
    // Leave hosted trip - POST /api/trips/:id/leave
    if (route.match(/^\/trips\/[^/]+\/leave$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      await db.collection('trip_participants').deleteOne({
        tripId,
        userId: auth.user.id
      })
      
      // Add system message for leaving hosted trip
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `👋 ${auth.user.name} left the trip`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Left trip successfully' }))
    }

    // ============ CHAT ROUTES ============
    
    // Get circle messages - GET /api/circles/:id/messages
    if (route.match(/^\/circles\/[^/]+\/messages$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const circleId = path[1]
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const messages = await db.collection('circle_messages')
        .find({ circleId })
        .sort({ createdAt: 1 })
        .limit(100)
        .toArray()
      
      // Get user details for messages
      const userIds = [...new Set(messages.filter(m => m.userId).map(m => m.userId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      const messagesWithUsers = messages.map(m => ({
        id: m.id,
        content: m.content,
        isSystem: m.isSystem,
        createdAt: m.createdAt,
        user: m.userId ? users.find(u => u.id === m.userId) : null
      })).map(m => ({
        ...m,
        user: m.user ? { id: m.user.id, name: m.user.name } : null
      }))
      
      return handleCORS(NextResponse.json(messagesWithUsers))
    }
    
    // Send circle message - POST /api/circles/:id/messages
    if (route.match(/^\/circles\/[^/]+\/messages$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const circleId = path[1]
      const body = await request.json()
      const { content } = body
      
      if (!content || !content.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Message content is required' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const message = {
        id: uuidv4(),
        circleId,
        userId: auth.user.id,
        content: content.trim(),
        isSystem: false,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('circle_messages').insertOne(message)
      
      return handleCORS(NextResponse.json({
        ...message,
        user: { id: auth.user.id, name: auth.user.name }
      }))
    }
    
    // Get trip messages - GET /api/trips/:id/messages
    if (route.match(/^\/trips\/[^/]+\/messages$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const messages = await db.collection('trip_messages')
        .find({ tripId })
        .sort({ createdAt: 1 })
        .limit(100)
        .toArray()
      
      // Get user details for messages
      const userIds = [...new Set(messages.filter(m => m.userId).map(m => m.userId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      const messagesWithUsers = messages.map(m => ({
        id: m.id,
        content: m.content,
        isSystem: m.isSystem,
        createdAt: m.createdAt,
        user: m.userId ? users.find(u => u.id === m.userId) : null
      })).map(m => ({
        ...m,
        user: m.user ? { id: m.user.id, name: m.user.name } : null
      }))
      
      return handleCORS(NextResponse.json(messagesWithUsers))
    }
    
    // Send trip message - POST /api/trips/:id/messages
    if (route.match(/^\/trips\/[^/]+\/messages$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { content } = body
      
      if (!content || !content.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Message content is required' },
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
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const message = {
        id: uuidv4(),
        tripId,
        userId: auth.user.id,
        content: content.trim(),
        isSystem: false,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trip_messages').insertOne(message)
      
      return handleCORS(NextResponse.json({
        ...message,
        user: { id: auth.user.id, name: auth.user.name }
      }))
    }

    // ============ POSTS/MEMORIES ROUTES ============
    
    // Get circle posts - GET /api/circles/:id/posts
    if (route.match(/^\/circles\/[^/]+\/posts$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const circleId = path[1]
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const posts = await db.collection('posts')
        .find({ circleId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()
      
      // Get user details and trip details for posts
      const userIds = [...new Set(posts.map(p => p.userId))]
      const tripIds = [...new Set(posts.filter(p => p.tripId).map(p => p.tripId))]
      
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      const trips = tripIds.length > 0 
        ? await db.collection('trips').find({ id: { $in: tripIds } }).toArray()
        : []
      
      const postsWithDetails = posts.map(post => ({
        id: post.id,
        caption: post.caption,
        mediaUrls: post.mediaUrls || [],
        discoverable: post.discoverable || false,
        destinationText: post.destinationText,
        createdAt: post.createdAt,
        author: users.find(u => u.id === post.userId) 
          ? { id: users.find(u => u.id === post.userId).id, name: users.find(u => u.id === post.userId).name }
          : null,
        trip: post.tripId && trips.find(t => t.id === post.tripId)
          ? { id: trips.find(t => t.id === post.tripId).id, name: trips.find(t => t.id === post.tripId).name }
          : null,
        isAuthor: post.userId === auth.user.id
      }))
      
      return handleCORS(NextResponse.json(postsWithDetails))
    }
    
    // Create circle post - POST /api/circles/:id/posts
    if (route.match(/^\/circles\/[^/]+\/posts$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const circleId = path[1]
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const body = await request.json()
      const { mediaUrls, caption, tripId, discoverable, destinationText, itineraryId, itineraryMode } = body
      
      // Validate mediaUrls
      if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0 || mediaUrls.length > 5) {
        return handleCORS(NextResponse.json(
          { error: 'Posts require 1-5 images' },
          { status: 400 }
        ))
      }
      
      // If tripId provided, verify it belongs to this circle
      let trip = null
      if (tripId) {
        trip = await db.collection('trips').findOne({ id: tripId, circleId })
        if (!trip) {
          return handleCORS(NextResponse.json(
            { error: 'Trip not found in this circle' },
            { status: 400 }
          ))
        }
      }
      
      // If itineraryId provided, validate it
      let validatedItineraryId = null
      let validatedItineraryMode = null
      if (itineraryId) {
        // Must have a tripId to attach an itinerary
        if (!tripId) {
          return handleCORS(NextResponse.json(
            { error: 'Cannot attach itinerary without selecting a trip' },
            { status: 400 }
          ))
        }
        
        // Verify itinerary exists, belongs to the trip, and is selected (final)
        const itinerary = await db.collection('itineraries').findOne({ 
          id: itineraryId, 
          tripId,
          status: 'selected'
        })
        
        if (!itinerary) {
          return handleCORS(NextResponse.json(
            { error: 'Only final (selected) itineraries can be attached to memories' },
            { status: 400 }
          ))
        }
        
        validatedItineraryId = itineraryId
        validatedItineraryMode = itineraryMode === 'full' ? 'full' : 'highlights'
      }
      
      const post = {
        id: uuidv4(),
        circleId,
        tripId: tripId || null,
        userId: auth.user.id,
        mediaUrls,
        caption: caption?.trim() || null,
        discoverable: discoverable || false,
        destinationText: destinationText?.trim() || null,
        itineraryId: validatedItineraryId,
        itineraryMode: validatedItineraryMode,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('posts').insertOne(post)
      
      return handleCORS(NextResponse.json({
        ...post,
        author: { id: auth.user.id, name: auth.user.name },
        isAuthor: true
      }))
    }
    
    // Get trip posts - GET /api/trips/:id/posts
    if (route.match(/^\/trips\/[^/]+\/posts$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const posts = await db.collection('posts')
        .find({ tripId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()
      
      // Get user details
      const userIds = [...new Set(posts.map(p => p.userId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      const postsWithDetails = posts.map(post => ({
        id: post.id,
        caption: post.caption,
        mediaUrls: post.mediaUrls || [],
        discoverable: post.discoverable || false,
        destinationText: post.destinationText,
        createdAt: post.createdAt,
        author: users.find(u => u.id === post.userId) 
          ? { id: users.find(u => u.id === post.userId).id, name: users.find(u => u.id === post.userId).name }
          : null,
        isAuthor: post.userId === auth.user.id
      }))
      
      return handleCORS(NextResponse.json(postsWithDetails))
    }
    
    // Update post - PATCH /api/posts/:id
    if (route.match(/^\/posts\/[^/]+$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const postId = path[1]
      
      const post = await db.collection('posts').findOne({ id: postId })
      if (!post) {
        return handleCORS(NextResponse.json(
          { error: 'Post not found' },
          { status: 404 }
        ))
      }
      
      // Author-only edit
      if (post.userId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the author can edit this post' },
          { status: 403 }
        ))
      }
      
      const body = await request.json()
      const updateFields = {}
      
      if (body.caption !== undefined) updateFields.caption = body.caption?.trim() || null
      if (body.discoverable !== undefined) updateFields.discoverable = Boolean(body.discoverable)
      if (body.destinationText !== undefined) updateFields.destinationText = body.destinationText?.trim() || null
      if (body.tripId !== undefined) {
        if (body.tripId) {
          const trip = await db.collection('trips').findOne({ id: body.tripId, circleId: post.circleId })
          if (!trip) {
            return handleCORS(NextResponse.json(
              { error: 'Trip not found in this circle' },
              { status: 400 }
            ))
          }
        }
        updateFields.tripId = body.tripId || null
      }
      
      updateFields.updatedAt = new Date().toISOString()
      
      await db.collection('posts').updateOne(
        { id: postId },
        { $set: updateFields }
      )
      
      return handleCORS(NextResponse.json({ message: 'Post updated' }))
    }
    
    // Delete post - DELETE /api/posts/:id
    if (route.match(/^\/posts\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const postId = path[1]
      
      const post = await db.collection('posts').findOne({ id: postId })
      if (!post) {
        return handleCORS(NextResponse.json(
          { error: 'Post not found' },
          { status: 404 }
        ))
      }
      
      // Author-only delete
      if (post.userId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the author can delete this post' },
          { status: 403 }
        ))
      }
      
      await db.collection('posts').deleteOne({ id: postId })
      
      return handleCORS(NextResponse.json({ message: 'Post deleted' }))
    }
    
    // ============ DISCOVER ROUTES ============
    // Note: GET /api/discover/posts and POST /api/discover/posts are now handled by
    // app/api/discover/posts/route.js
    
    // Get discoverable itineraries - GET /api/discover/itineraries (public, read-only)
    if (route === '/discover/itineraries' && method === 'GET') {
      const url = new URL(request.url)
      const search = url.searchParams.get('search')?.toLowerCase() || ''
      const style = url.searchParams.get('style') || '' // Balanced, Packed, Chill
      const duration = url.searchParams.get('duration') || '' // weekend, short, week
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = 12
      const skip = (page - 1) * limit
      
      // Find trips that have:
      // 1. A selected itinerary marked discoverable OR
      // 2. At least one discoverable post
      
      // First, get trips with discoverable selected itineraries
      const discoverableItineraries = await db.collection('itineraries')
        .find({ 
          status: 'selected',
          discoverable: true 
        })
        .toArray()
      
      const tripIdsFromItineraries = discoverableItineraries.map(i => i.tripId)
      
      // Get trips with discoverable posts
      const discoverablePosts = await db.collection('posts')
        .find({ 
          discoverable: true,
          tripId: { $ne: null }
        })
        .toArray()
      
      const tripIdsFromPosts = [...new Set(discoverablePosts.map(p => p.tripId))]
      
      // Combine unique trip IDs
      const allDiscoverableTripIds = [...new Set([...tripIdsFromItineraries, ...tripIdsFromPosts])]
      
      // Build query for trips
      let tripQuery = {
        id: { $in: allDiscoverableTripIds },
        status: 'locked'
      }
      
      // Get all matching trips
      let trips = await db.collection('trips')
        .find(tripQuery)
        .toArray()
      
      // Get itineraries for these trips
      const selectedItineraries = await db.collection('itineraries')
        .find({ 
          tripId: { $in: trips.map(t => t.id) },
          status: 'selected'
        })
        .toArray()
      
      // Get itinerary items
      const itineraryIds = selectedItineraries.map(i => i.id)
      const allItems = await db.collection('itinerary_items')
        .find({ itineraryId: { $in: itineraryIds } })
        .sort({ day: 1, order: 1 })
        .toArray()
      
      // Get posts for preview images
      const tripPosts = await db.collection('posts')
        .find({ tripId: { $in: trips.map(t => t.id) }, discoverable: true })
        .toArray()
      
      // Combine trip data with itinerary info
      let tripCards = trips.map(trip => {
        const itinerary = selectedItineraries.find(i => i.tripId === trip.id)
        const items = itinerary ? allItems.filter(item => item.itineraryId === itinerary.id) : []
        const posts = tripPosts.filter(p => p.tripId === trip.id)
        
        // Calculate trip length in days
        const start = new Date(trip.lockedStartDate)
        const end = new Date(trip.lockedEndDate)
        const tripLength = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        
        // Get destination from posts or trip name
        const destination = posts.find(p => p.destinationText)?.destinationText || 
                          trip.name.replace(/trip|getaway|retreat|vacation/gi, '').trim() ||
                          'Destination'
        
        // Get preview image from posts
        const previewImage = posts.find(p => p.mediaUrls?.length > 0)?.mediaUrls[0] || null
        
        // Get first 3 unique activities for preview
        const activityPreview = items
          .slice(0, 3)
          .map(item => item.title)
        
        return {
          id: trip.id,
          destination,
          tripName: trip.name,
          tripLength,
          tripLengthLabel: tripLength <= 2 ? 'Weekend' : tripLength <= 5 ? `${tripLength} days` : `${tripLength} days`,
          startDate: trip.lockedStartDate,
          endDate: trip.lockedEndDate,
          itineraryStyle: itinerary?.title || null,
          itineraryId: itinerary?.id || null,
          activityPreview,
          totalActivities: items.length,
          previewImage,
          hasItinerary: !!itinerary
        }
      })
      
      // Apply filters
      if (search) {
        tripCards = tripCards.filter(t => 
          t.destination.toLowerCase().includes(search) ||
          t.tripName.toLowerCase().includes(search) ||
          t.activityPreview.some(a => a.toLowerCase().includes(search))
        )
      }
      
      if (style) {
        tripCards = tripCards.filter(t => 
          t.itineraryStyle?.toLowerCase() === style.toLowerCase()
        )
      }
      
      if (duration) {
        tripCards = tripCards.filter(t => {
          if (duration === 'weekend') return t.tripLength <= 2
          if (duration === 'short') return t.tripLength >= 3 && t.tripLength <= 5
          if (duration === 'week') return t.tripLength >= 6
          return true
        })
      }
      
      // Sort by trip length and then by name for determinism
      tripCards.sort((a, b) => {
        if (a.tripLength !== b.tripLength) return a.tripLength - b.tripLength
        return a.destination.localeCompare(b.destination)
      })
      
      const total = tripCards.length
      const paginatedCards = tripCards.slice(skip, skip + limit)
      
      return handleCORS(NextResponse.json({
        trips: paginatedCards,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + paginatedCards.length < total
        }
      }))
    }
    
    // Get single discoverable itinerary details - GET /api/discover/itineraries/:tripId
    if (route.match(/^\/discover\/itineraries\/[^/]+$/) && method === 'GET') {
      const tripId = path[2]
      
      const trip = await db.collection('trips').findOne({ id: tripId, status: 'locked' })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Get selected itinerary
      const itinerary = await db.collection('itineraries').findOne({
        tripId,
        status: 'selected'
      })
      
      if (!itinerary) {
        return handleCORS(NextResponse.json({ error: 'No itinerary found' }, { status: 404 }))
      }
      
      // Check if itinerary or any posts are discoverable
      const hasDiscoverablePost = await db.collection('posts').findOne({
        tripId,
        discoverable: true
      })
      
      if (!itinerary.discoverable && !hasDiscoverablePost) {
        return handleCORS(NextResponse.json({ error: 'Itinerary not discoverable' }, { status: 403 }))
      }
      
      // Get all items
      const items = await db.collection('itinerary_items')
        .find({ itineraryId: itinerary.id })
        .sort({ day: 1, order: 1 })
        .toArray()
      
      // Get destination from posts
      const posts = await db.collection('posts')
        .find({ tripId, discoverable: true })
        .toArray()
      
      const destination = posts.find(p => p.destinationText)?.destinationText || trip.name
      const previewImages = posts.flatMap(p => p.mediaUrls || []).slice(0, 5)
      
      // Calculate trip length
      const start = new Date(trip.lockedStartDate)
      const end = new Date(trip.lockedEndDate)
      const tripLength = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      
      // Group items by day
      const days = []
      const uniqueDays = [...new Set(items.map(i => i.day))].sort()
      
      uniqueDays.forEach((day, idx) => {
        const dayItems = items.filter(i => i.day === day).sort((a, b) => a.order - b.order)
        days.push({
          dayNumber: idx + 1,
          date: day,
          items: dayItems.map(({ _id, ...rest }) => rest)
        })
      })
      
      return handleCORS(NextResponse.json({
        tripId: trip.id,
        destination,
        tripName: trip.name,
        tripLength,
        itineraryStyle: itinerary.title,
        itineraryId: itinerary.id,
        totalActivities: items.length,
        previewImages,
        days
      }))
    }
    
    // Propose trip to circle - POST /api/discover/itineraries/:tripId/propose
    if (route.match(/^\/discover\/itineraries\/[^/]+\/propose$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const sourceTripId = path[2]
      const body = await request.json()
      const { circleId } = body
      
      if (!circleId) {
        return handleCORS(NextResponse.json({ error: 'Circle ID is required' }, { status: 400 }))
      }
      
      // Verify user membership in target circle
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Get source trip
      const sourceTrip = await db.collection('trips').findOne({ id: sourceTripId, status: 'locked' })
      if (!sourceTrip) {
        return handleCORS(NextResponse.json({ error: 'Source trip not found' }, { status: 404 }))
      }
      
      // Get source itinerary
      const sourceItinerary = await db.collection('itineraries').findOne({
        tripId: sourceTripId,
        status: 'selected'
      })
      
      // Get source items if itinerary exists
      const sourceItems = sourceItinerary 
        ? await db.collection('itinerary_items')
            .find({ itineraryId: sourceItinerary.id })
            .sort({ day: 1, order: 1 })
            .toArray()
        : []
      
      // Get destination from posts
      const posts = await db.collection('posts')
        .find({ tripId: sourceTripId, discoverable: true })
        .toArray()
      const destination = posts.find(p => p.destinationText)?.destinationText || null
      
      // Calculate trip length
      const sourceStart = new Date(sourceTrip.lockedStartDate)
      const sourceEnd = new Date(sourceTrip.lockedEndDate)
      const tripLength = Math.ceil((sourceEnd - sourceStart) / (1000 * 60 * 60 * 24)) + 1
      
      // Create date range for new trip (start from 2 weeks from now, span same length)
      const today = new Date()
      const earliestStart = new Date(today)
      earliestStart.setDate(today.getDate() + 14)
      const latestEnd = new Date(earliestStart)
      latestEnd.setDate(earliestStart.getDate() + tripLength + 13) // Add buffer for scheduling
      
      // Create new trip
      const newTrip = {
        id: uuidv4(),
        circleId,
        name: destination ? `${destination} Trip` : `Inspired Trip`,
        description: `Inspired by a ${tripLength}-day ${sourceItinerary?.title?.toLowerCase() || 'balanced'} itinerary. Your group will decide the dates!`,
        type: 'collaborative',
        startDate: earliestStart.toISOString().split('T')[0],
        endDate: latestEnd.toISOString().split('T')[0],
        duration: tripLength,
        status: 'scheduling',
        lockedStartDate: null,
        lockedEndDate: null,
        createdBy: auth.user.id,
        inspiredBy: {
          sourceTripId,
          destination,
          itineraryStyle: sourceItinerary?.title || null
        },
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne(newTrip)
      
      // Copy itinerary as template if source has one
      if (sourceItinerary && sourceItems.length > 0) {
        // Group source items by day number (relative position)
        const dayMap = new Map()
        const uniqueDays = [...new Set(sourceItems.map(i => i.day))].sort()
        uniqueDays.forEach((day, idx) => {
          dayMap.set(day, idx + 1) // Day 1, Day 2, etc.
        })
        
        const templateItinerary = {
          id: uuidv4(),
          tripId: newTrip.id,
          version: 1,
          title: sourceItinerary.title,
          status: 'draft',
          startDay: null, // Will be set when trip dates are locked
          endDay: null,
          createdBy: auth.user.id,
          isTemplate: true,
          sourceType: 'discover',
          sourceTripId,
          createdAt: new Date().toISOString()
        }
        
        await db.collection('itineraries').insertOne(templateItinerary)
        
        // Copy items with relative day numbers (stored in notes for now)
        const templateItems = sourceItems.map((item, idx) => ({
          id: uuidv4(),
          itineraryId: templateItinerary.id,
          day: `Day ${dayMap.get(item.day)}`, // Relative day
          dayNumber: dayMap.get(item.day),
          timeBlock: item.timeBlock,
          title: item.title,
          notes: item.notes,
          locationText: item.locationText,
          order: item.order
        }))
        
        if (templateItems.length > 0) {
          await db.collection('itinerary_items').insertMany(templateItems)
        }
      }
      
      // Copy ideas from source if any
      const sourceIdeas = await db.collection('trip_ideas')
        .find({ tripId: sourceTripId })
        .toArray()
      
      // Get unique ideas by title
      const uniqueIdeas = new Map()
      sourceIdeas.forEach(idea => {
        const key = idea.title.toLowerCase()
        if (!uniqueIdeas.has(key)) {
          uniqueIdeas.set(key, idea)
        }
      })
      
      // Copy unique ideas to new trip
      const newIdeas = Array.from(uniqueIdeas.values()).map(idea => ({
        id: uuidv4(),
        tripId: newTrip.id,
        userId: auth.user.id,
        title: idea.title,
        category: idea.category,
        notes: idea.notes,
        createdAt: new Date().toISOString()
      }))
      
      if (newIdeas.length > 0) {
        await db.collection('trip_ideas').insertMany(newIdeas)
      }
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId: newTrip.id,
        userId: null,
        content: `${auth.user.name} proposed this trip inspired by a ${tripLength}-day itinerary. Add your availability and the group will decide the dates!`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({
        message: 'Trip proposed successfully',
        trip: {
          id: newTrip.id,
          name: newTrip.name,
          circleId: newTrip.circleId
        }
      }))
    }
    
    // Propose trip from a memory post - POST /api/discover/posts/:postId/propose
    if (route.match(/^\/discover\/posts\/[^/]+\/propose$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const postId = path[2]
      const body = await request.json()
      const { circleId } = body
      
      if (!circleId) {
        return handleCORS(NextResponse.json({ error: 'Circle ID is required' }, { status: 400 }))
      }
      
      // Verify user membership in target circle
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Get the source post
      const sourcePost = await db.collection('posts').findOne({ id: postId, discoverable: true })
      if (!sourcePost) {
        return handleCORS(NextResponse.json({ error: 'Post not found or not discoverable' }, { status: 404 }))
      }
      
      // Post must have an itinerary attached
      if (!sourcePost.itineraryId) {
        return handleCORS(NextResponse.json(
          { error: 'This memory does not have an itinerary attached' },
          { status: 400 }
        ))
      }
      
      // Get the itinerary
      const sourceItinerary = await db.collection('itineraries').findOne({
        id: sourcePost.itineraryId,
        status: 'selected'
      })
      
      if (!sourceItinerary) {
        return handleCORS(NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }))
      }
      
      // Get source items
      const sourceItems = await db.collection('itinerary_items')
        .find({ itineraryId: sourceItinerary.id })
        .sort({ day: 1, order: 1 })
        .toArray()
      
      // Calculate trip length from itinerary
      const tripLength = sourceItems.length > 0 
        ? Math.max(...sourceItems.map(i => typeof i.day === 'number' ? i.day : parseInt(i.day) || 1))
        : 3
      
      // Use destination from post or fall back to itinerary info
      const destination = sourcePost.destinationText || null
      
      // Create date range for new trip (start from 2 weeks from now)
      const today = new Date()
      const earliestStart = new Date(today)
      earliestStart.setDate(today.getDate() + 14)
      const latestEnd = new Date(earliestStart)
      latestEnd.setDate(earliestStart.getDate() + tripLength + 13)
      
      // Create new trip
      const newTrip = {
        id: uuidv4(),
        circleId,
        name: destination ? `${destination} Trip` : `Inspired Trip`,
        description: `A ${tripLength}-day trip inspired by a traveler's experience. Your group will decide the dates and can customize the itinerary!`,
        type: 'collaborative',
        startDate: earliestStart.toISOString().split('T')[0],
        endDate: latestEnd.toISOString().split('T')[0],
        duration: tripLength,
        status: 'scheduling',
        lockedStartDate: null,
        lockedEndDate: null,
        createdBy: auth.user.id,
        inspiredBy: {
          sourceType: 'memory',
          sourcePostId: postId,
          destination,
          itineraryStyle: sourceItinerary.title || null
        },
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne(newTrip)
      
      // Copy itinerary as editable draft template
      if (sourceItems.length > 0) {
        // Group source items by day number
        const dayMap = new Map()
        const uniqueDays = [...new Set(sourceItems.map(i => {
          const d = typeof i.day === 'number' ? i.day : parseInt(i.day) || i.dayNumber || 1
          return d
        }))].sort((a, b) => a - b)
        
        uniqueDays.forEach((day, idx) => {
          dayMap.set(day, idx + 1)
        })
        
        const templateItinerary = {
          id: uuidv4(),
          tripId: newTrip.id,
          version: 1,
          title: sourceItinerary.title || 'Balanced',
          status: 'draft', // Important: Draft so group can edit
          startDay: null,
          endDay: null,
          createdBy: auth.user.id,
          isTemplate: true,
          sourceType: 'memory',
          sourcePostId: postId,
          createdAt: new Date().toISOString()
        }
        
        await db.collection('itineraries').insertOne(templateItinerary)
        
        // Copy items with relative day numbers
        const templateItems = sourceItems.map((item) => {
          const originalDay = typeof item.day === 'number' ? item.day : parseInt(item.day) || item.dayNumber || 1
          const relativeDay = dayMap.get(originalDay) || 1
          
          return {
            id: uuidv4(),
            itineraryId: templateItinerary.id,
            day: relativeDay,
            dayNumber: relativeDay,
            timeBlock: item.timeBlock,
            title: item.title,
            notes: item.notes,
            locationText: item.locationText,
            order: item.order
          }
        })
        
        if (templateItems.length > 0) {
          await db.collection('itinerary_items').insertMany(templateItems)
        }
      }
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId: newTrip.id,
        userId: null,
        content: `${auth.user.name} proposed this trip inspired by a traveler's ${tripLength}-day itinerary. This itinerary worked for them - your group can customize it! Add your availability to get started.`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({
        message: 'Trip proposed successfully',
        trip: {
          id: newTrip.id,
          name: newTrip.name,
          circleId: newTrip.circleId
        }
      }))
    }
    
    // Mark itinerary as discoverable - PATCH /api/trips/:tripId/itineraries/:itineraryId/discoverable
    if (route.match(/^\/trips\/[^/]+\/itineraries\/[^/]+\/discoverable$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const itineraryId = path[3]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Only trip creator or circle owner can make itinerary discoverable
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can change discoverability' },
          { status: 403 }
        ))
      }
      
      const itinerary = await db.collection('itineraries').findOne({ id: itineraryId, tripId })
      if (!itinerary) {
        return handleCORS(NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }))
      }
      
      const body = await request.json()
      const { discoverable } = body
      
      await db.collection('itineraries').updateOne(
        { id: itineraryId },
        { $set: { discoverable: Boolean(discoverable) } }
      )
      
      return handleCORS(NextResponse.json({ 
        message: discoverable ? 'Itinerary is now discoverable' : 'Itinerary is now private'
      }))
    }
    
    // ============ REPORT ROUTES ============
    
    // Report a post - POST /api/reports
    if (route === '/reports' && method === 'POST') {
      const body = await request.json()
      const { postId, reason } = body
      
      if (!postId || !reason) {
        return handleCORS(NextResponse.json(
          { error: 'Post ID and reason are required' },
          { status: 400 }
        ))
      }
      
      // Verify post exists
      const post = await db.collection('posts').findOne({ id: postId })
      if (!post) {
        return handleCORS(NextResponse.json(
          { error: 'Post not found' },
          { status: 404 }
        ))
      }
      
      // Optional: get user if authenticated
      const user = await getUserFromToken(request)
      
      const report = {
        id: uuidv4(),
        postId,
        reporterUserId: user?.id || null,
        reason: reason.trim(),
        createdAt: new Date().toISOString()
      }
      
      await db.collection('reports').insertOne(report)
      
      return handleCORS(NextResponse.json({ message: 'Report submitted. Thank you.' }))
    }
    
    // ============ FILE UPLOAD ROUTES ============
    
    // Upload image - POST /api/upload
    if (route === '/upload' && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      try {
        const formData = await request.formData()
        const file = formData.get('file')
        
        if (!file) {
          return handleCORS(NextResponse.json(
            { error: 'No file uploaded' },
            { status: 400 }
          ))
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!allowedTypes.includes(file.type)) {
          return handleCORS(NextResponse.json(
            { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
            { status: 400 }
          ))
        }
        
        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024
        if (file.size > maxSize) {
          return handleCORS(NextResponse.json(
            { error: 'File too large. Maximum size is 5MB' },
            { status: 400 }
          ))
        }
        
        // Generate unique filename
        const ext = file.name.split('.').pop() || 'jpg'
        const filename = `${uuidv4()}.${ext}`
        
        // Write file to uploads directory
        const fs = await import('fs/promises')
        const filePath = `/app/public/uploads/${filename}`
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(filePath, buffer)
        
        const fileUrl = `/uploads/${filename}`
        
        return handleCORS(NextResponse.json({ url: fileUrl }))
      } catch (error) {
        console.error('Upload error:', error)
        return handleCORS(NextResponse.json(
          { error: 'Failed to upload file' },
          { status: 500 }
        ))
      }
    }

    // ============ TRIP IDEAS ROUTES ============
    
    // Get trip ideas - GET /api/trips/:tripId/ideas
    if (route.match(/^\/trips\/[^/]+\/ideas$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const ideas = await db.collection('trip_ideas')
        .find({ tripId })
        .sort({ createdAt: -1 })
        .toArray()
      
      // Get user details
      const userIds = [...new Set(ideas.map(i => i.userId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      // Count ideas by normalized title
      const ideaCounts = {}
      ideas.forEach(idea => {
        const key = idea.title.toLowerCase().trim()
        if (!ideaCounts[key]) {
          ideaCounts[key] = { count: 0, users: [] }
        }
        ideaCounts[key].count++
        ideaCounts[key].users.push(idea.userId)
      })
      
      const ideasWithDetails = ideas.map(idea => ({
        id: idea.id,
        title: idea.title,
        category: idea.category,
        notes: idea.notes,
        createdAt: idea.createdAt,
        author: users.find(u => u.id === idea.userId)
          ? { id: users.find(u => u.id === idea.userId).id, name: users.find(u => u.id === idea.userId).name }
          : null,
        isAuthor: idea.userId === auth.user.id,
        suggestionCount: ideaCounts[idea.title.toLowerCase().trim()]?.count || 1
      }))
      
      return handleCORS(NextResponse.json(ideasWithDetails))
    }
    
    // Create trip idea - POST /api/trips/:tripId/ideas
    if (route.match(/^\/trips\/[^/]+\/ideas$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { title, category, notes } = body
      
      if (!title || !title.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        ))
      }
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Check for duplicate (same user, same title for this trip)
      const existingIdea = await db.collection('trip_ideas').findOne({
        tripId,
        userId: auth.user.id,
        title: { $regex: new RegExp(`^${title.trim()}$`, 'i') }
      })
      
      if (existingIdea) {
        return handleCORS(NextResponse.json(
          { error: 'You have already suggested this activity' },
          { status: 400 }
        ))
      }
      
      const idea = {
        id: uuidv4(),
        tripId,
        userId: auth.user.id,
        title: title.trim(),
        category: category?.trim() || null,
        notes: notes?.trim() || null,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trip_ideas').insertOne(idea)
      
      return handleCORS(NextResponse.json({
        ...idea,
        author: { id: auth.user.id, name: auth.user.name },
        isAuthor: true
      }))
    }
    
    // Delete trip idea - DELETE /api/trips/:tripId/ideas/:ideaId
    if (route.match(/^\/trips\/[^/]+\/ideas\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const ideaId = path[3]
      
      const idea = await db.collection('trip_ideas').findOne({ id: ideaId, tripId })
      if (!idea) {
        return handleCORS(NextResponse.json({ error: 'Idea not found' }, { status: 404 }))
      }
      
      // Author only
      if (idea.userId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the author can delete this idea' },
          { status: 403 }
        ))
      }
      
      await db.collection('trip_ideas').deleteOne({ id: ideaId })
      
      return handleCORS(NextResponse.json({ message: 'Idea deleted' }))
    }
    
    // ============ ITINERARY ROUTES ============
    
    // Get itineraries - GET /api/trips/:tripId/itineraries
    if (route.match(/^\/trips\/[^/]+\/itineraries$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const itineraries = await db.collection('itineraries')
        .find({ tripId })
        .sort({ version: 1 })
        .toArray()
      
      // Get items for each itinerary
      const itineraryIds = itineraries.map(i => i.id)
      const allItems = await db.collection('itinerary_items')
        .find({ itineraryId: { $in: itineraryIds } })
        .sort({ day: 1, order: 1 })
        .toArray()
      
      const itinerariesWithItems = itineraries.map(itin => ({
        id: itin.id,
        tripId: itin.tripId,
        version: itin.version,
        title: itin.title,
        status: itin.status,
        startDay: itin.startDay,
        endDay: itin.endDay,
        createdBy: itin.createdBy,
        createdAt: itin.createdAt,
        items: allItems
          .filter(item => item.itineraryId === itin.id)
          .map(({ _id, ...rest }) => rest)
      }))
      
      return handleCORS(NextResponse.json(itinerariesWithItems))
    }
    
    // Get selected (final) itinerary for a trip - GET /api/trips/:tripId/itineraries/selected
    if (route.match(/^\/trips\/[^/]+\/itineraries\/selected$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Get only selected (final) itinerary
      const selectedItinerary = await db.collection('itineraries').findOne({
        tripId,
        status: 'selected'
      })
      
      if (!selectedItinerary) {
        return handleCORS(NextResponse.json({ itinerary: null }))
      }
      
      // Get items
      const items = await db.collection('itinerary_items')
        .find({ itineraryId: selectedItinerary.id })
        .sort({ day: 1, order: 1 })
        .toArray()
      
      return handleCORS(NextResponse.json({
        itinerary: {
          id: selectedItinerary.id,
          tripId: selectedItinerary.tripId,
          title: selectedItinerary.title,
          status: selectedItinerary.status,
          itemCount: items.length,
          items: items.map(({ _id, ...rest }) => rest)
        }
      }))
    }
    
    // Generate itineraries - POST /api/trips/:tripId/itineraries/generate
    if (route.match(/^\/trips\/[^/]+\/itineraries\/generate$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Only allowed when trip is locked
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itineraries can only be generated after trip dates are locked' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Get existing ideas and aggregate by title
      const ideas = await db.collection('trip_ideas')
        .find({ tripId })
        .toArray()
      
      // Normalize and rank ideas by frequency
      const ideaCounts = new Map()
      ideas.forEach(idea => {
        const key = idea.title.toLowerCase().trim()
        if (!ideaCounts.has(key)) {
          ideaCounts.set(key, { title: idea.title, category: idea.category, count: 0 })
        }
        ideaCounts.get(key).count++
      })
      
      // Sort by count descending, then alphabetically for determinism
      const rankedIdeas = Array.from(ideaCounts.values())
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return a.title.localeCompare(b.title)
        })
      
      // Default placeholders if not enough ideas
      const defaultActivities = [
        { title: 'Explore local neighborhood', category: 'outdoors' },
        { title: 'Try local cuisine', category: 'food' },
        { title: 'Visit popular landmark', category: 'culture' },
        { title: 'Relax and unwind', category: 'relax' },
        { title: 'Shopping and souvenirs', category: 'culture' },
        { title: 'Scenic walk or hike', category: 'outdoors' },
        { title: 'Local cafe or coffee shop', category: 'food' },
        { title: 'Evening entertainment', category: 'nightlife' },
        { title: 'Flexible free time', category: 'relax' }
      ]
      
      // Fill ideas pool
      const ideasPool = rankedIdeas.length >= 3 ? rankedIdeas : [...rankedIdeas, ...defaultActivities]
      
      // Generate day list from locked dates
      const startDate = new Date(trip.lockedStartDate)
      const endDate = new Date(trip.lockedEndDate)
      const days = []
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toISOString().split('T')[0])
      }
      
      // Delete existing draft itineraries (regenerate)
      await db.collection('itinerary_items').deleteMany({
        itineraryId: { $in: (await db.collection('itineraries').find({ tripId, status: 'draft' }).toArray()).map(i => i.id) }
      })
      await db.collection('itineraries').deleteMany({ tripId, status: 'draft' })
      
      // Keep track of next version
      const maxVersion = await db.collection('itineraries')
        .find({ tripId })
        .sort({ version: -1 })
        .limit(1)
        .toArray()
      let nextVersion = (maxVersion[0]?.version || 0) + 1
      
      // Generate 3 itinerary styles
      const styles = [
        { title: 'Balanced', timeBlocks: ['morning', 'evening'], itemsPerDay: 2 },
        { title: 'Packed', timeBlocks: ['morning', 'afternoon', 'evening'], itemsPerDay: 3 },
        { title: 'Chill', timeBlocks: ['evening'], itemsPerDay: 1, addFreeTime: true }
      ]
      
      const generatedItineraries = []
      
      for (const style of styles) {
        const itinerary = {
          id: uuidv4(),
          tripId,
          version: nextVersion++,
          title: style.title,
          status: 'draft',
          startDay: trip.lockedStartDate,
          endDay: trip.lockedEndDate,
          createdBy: null, // system-generated
          createdAt: new Date().toISOString()
        }
        
        await db.collection('itineraries').insertOne(itinerary)
        
        // Generate items
        const items = []
        let ideaIndex = 0
        
        for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
          const day = days[dayIdx]
          let order = 0
          
          for (const timeBlock of style.timeBlocks) {
            const idea = ideasPool[ideaIndex % ideasPool.length]
            ideaIndex++
            
            items.push({
              id: uuidv4(),
              itineraryId: itinerary.id,
              day,
              timeBlock,
              title: idea.title,
              notes: idea.category ? `Category: ${idea.category}` : null,
              locationText: null,
              order: order++
            })
          }
          
          // Add free time note for Chill style
          if (style.addFreeTime) {
            items.push({
              id: uuidv4(),
              itineraryId: itinerary.id,
              day,
              timeBlock: 'afternoon',
              title: 'Free time',
              notes: 'Relax, explore at your own pace, or rest up',
              locationText: null,
              order: order++
            })
          }
        }
        
        if (items.length > 0) {
          await db.collection('itinerary_items').insertMany(items)
        }
        
        generatedItineraries.push({
          ...itinerary,
          items
        })
      }
      
      return handleCORS(NextResponse.json({
        message: 'Itineraries generated',
        itineraries: generatedItineraries
      }))
    }
    
    // Select itinerary - PATCH /api/trips/:tripId/itineraries/:itineraryId/select
    if (route.match(/^\/trips\/[^/]+\/itineraries\/[^/]+\/select$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const itineraryId = path[3]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Only trip creator or circle owner can select
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can select an itinerary' },
          { status: 403 }
        ))
      }
      
      const itinerary = await db.collection('itineraries').findOne({ id: itineraryId, tripId })
      if (!itinerary) {
        return handleCORS(NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }))
      }
      
      // Unselect any previously selected itinerary for this trip
      await db.collection('itineraries').updateMany(
        { tripId, status: 'selected' },
        { $set: { status: 'draft' } }
      )
      
      // Mark this one as selected
      await db.collection('itineraries').updateOne(
        { id: itineraryId },
        { $set: { status: 'selected' } }
      )
      
      // Add system message for itinerary selection
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `✅ "${itinerary.title}" itinerary selected as the final plan`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Itinerary selected' }))
    }
    
    // Update itinerary items - PATCH /api/trips/:tripId/itineraries/:itineraryId/items
    if (route.match(/^\/trips\/[^/]+\/itineraries\/[^/]+\/items$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const itineraryId = path[3]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const itinerary = await db.collection('itineraries').findOne({ id: itineraryId, tripId })
      if (!itinerary) {
        return handleCORS(NextResponse.json({ error: 'Itinerary not found' }, { status: 404 }))
      }
      
      // Cannot edit selected itinerary
      if (itinerary.status === 'selected') {
        return handleCORS(NextResponse.json(
          { error: 'Cannot edit a selected itinerary' },
          { status: 400 }
        ))
      }
      
      const body = await request.json()
      const { items } = body // Array of items to replace
      
      if (!items || !Array.isArray(items)) {
        return handleCORS(NextResponse.json(
          { error: 'Items array is required' },
          { status: 400 }
        ))
      }
      
      // Delete existing items
      await db.collection('itinerary_items').deleteMany({ itineraryId })
      
      // Insert new items
      const newItems = items.map((item, idx) => ({
        id: item.id || uuidv4(),
        itineraryId,
        day: item.day,
        timeBlock: item.timeBlock,
        title: item.title,
        notes: item.notes || null,
        locationText: item.locationText || null,
        order: item.order ?? idx
      }))
      
      if (newItems.length > 0) {
        await db.collection('itinerary_items').insertMany(newItems)
      }
      
      return handleCORS(NextResponse.json({
        message: 'Itinerary updated',
        items: newItems
      }))
    }

    // ============ ITINERARY ROUTES ============
    
    // Create itinerary idea - POST /api/trips/:tripId/itinerary/ideas
    if (route.match(/^\/trips\/[^/]+\/itinerary\/ideas$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { title, details, category, constraints, location } = body
      
      if (!title || !title.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Title is required' },
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
      
      // Guard: Must be locked
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary ideas can only be added to locked trips' },
          { status: 400 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const idea = {
        id: uuidv4(),
        tripId,
        authorId: auth.user.id,
        title: title.trim(),
        details: details?.trim() || null,
        category: category || 'other',
        constraints: Array.isArray(constraints) ? constraints : (constraints ? constraints.split(',').map(c => c.trim()).filter(c => c) : []),
        location: location?.trim() || null,
        priority: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('itinerary_ideas').insertOne(idea)
      
      return handleCORS(NextResponse.json(idea))
    }
    
    // List itinerary ideas - GET /api/trips/:tripId/itinerary/ideas
    if (route.match(/^\/trips\/[^/]+\/itinerary\/ideas$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const ideas = await db.collection('itinerary_ideas')
        .find({ tripId })
        .sort({ priority: -1, createdAt: -1 })
        .toArray()
      
      // Get authors
      const authorIds = [...new Set(ideas.map(i => i.authorId))]
      const authors = await db.collection('users')
        .find({ id: { $in: authorIds } })
        .toArray()
      
      const ideasWithAuthors = ideas.map(idea => {
        const { _id, ...rest } = idea
        const author = authors.find(a => a.id === idea.authorId)
        return {
          ...rest,
          author: author ? { id: author.id, name: author.name } : null,
          isAuthor: idea.authorId === auth.user.id
        }
      })
      
      return handleCORS(NextResponse.json(ideasWithAuthors))
    }
    
    // Upvote itinerary idea - POST /api/trips/:tripId/itinerary/ideas/:ideaId/upvote
    if (route.match(/^\/trips\/[^/]+\/itinerary\/ideas\/[^/]+\/upvote$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const ideaId = path[4]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const idea = await db.collection('itinerary_ideas').findOne({ id: ideaId, tripId })
      if (!idea) {
        return handleCORS(NextResponse.json(
          { error: 'Idea not found' },
          { status: 404 }
        ))
      }
      
      // MVP: Simple increment (no duplicate checking for MVP)
      await db.collection('itinerary_ideas').updateOne(
        { id: ideaId },
        { $inc: { priority: 1 } }
      )
      
      return handleCORS(NextResponse.json({ message: 'Idea upvoted' }))
    }
    
    // List itinerary versions - GET /api/trips/:tripId/itinerary/versions
    if (route.match(/^\/trips\/[^/]+\/itinerary\/versions$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const versions = await db.collection('itinerary_versions')
        .find({ tripId })
        .sort({ version: -1 })
        .toArray()
      
      // Get creators
      const creatorIds = [...new Set(versions.map(v => v.createdBy))]
      const creators = await db.collection('users')
        .find({ id: { $in: creatorIds } })
        .toArray()
      
      const versionsWithCreators = versions.map(version => {
        const { _id, ...rest } = version
        const creator = creators.find(c => c.id === version.createdBy)
        return {
          ...rest,
          creator: creator ? { id: creator.id, name: creator.name } : null
        }
      })
      
      return handleCORS(NextResponse.json(versionsWithCreators))
    }
    
    // Get latest itinerary version - GET /api/trips/:tripId/itinerary/versions/latest
    if (route.match(/^\/trips\/[^/]+\/itinerary\/versions\/latest$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const version = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })
      
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'No itinerary version found' },
          { status: 404 }
        ))
      }
      
      const { _id, ...rest } = version
      return handleCORS(NextResponse.json(rest))
    }
    
    // Generate initial itinerary - POST /api/trips/:tripId/itinerary/generate
    if (route.match(/^\/trips\/[^/]+\/itinerary\/generate$/) && method === 'POST') {
      // Debug: Log the route and auth header
      const authHeader = request.headers.get('Authorization')
      if (!authHeader) {
        return handleCORS(NextResponse.json({ error: 'Authorization header missing' }, { status: 401 }))
      }
      
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Guard: Must be locked
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary can only be generated for locked trips' },
          { status: 400 }
        ))
      }
      
      // Only trip creator or circle owner can generate
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can generate an itinerary' },
          { status: 403 }
        ))
      }
      
      // MVP: Only allow if no versions exist
      const existingVersions = await db.collection('itinerary_versions')
        .find({ tripId })
        .toArray()
      
      if (existingVersions.length > 0) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary already generated. Use revise endpoint to create new versions.' },
          { status: 400 }
        ))
      }
      
      // Update status to drafting
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { itineraryStatus: 'drafting' } }
      )
      
      try {
        // Get top ideas by priority
        const ideas = await db.collection('itinerary_ideas')
          .find({ tripId })
          .sort({ priority: -1, createdAt: -1 })
          .limit(10)
          .toArray()
        
        // Extract all constraints
        const allConstraints = []
        ideas.forEach(idea => {
          if (idea.constraints && Array.isArray(idea.constraints)) {
            allConstraints.push(...idea.constraints)
          }
        })
        
        // Get circle for group size
        const groupSize = (await db.collection('memberships')
          .find({ circleId: trip.circleId })
          .toArray()).length
        
        // Generate itinerary using LLM
        const itineraryContent = await generateItinerary({
          destination: trip.description || trip.name, // Use description or name as destination hint
          startDate: trip.lockedStartDate || trip.startDate,
          endDate: trip.lockedEndDate || trip.endDate,
          groupSize,
          ideas: ideas.map(idea => ({
            id: idea.id,
            title: idea.title,
            details: idea.details,
            category: idea.category,
            constraints: idea.constraints || [],
            location: idea.location
          })),
          constraints: [...new Set(allConstraints)]
        })
        
        // Create version 1
        const version = {
          id: uuidv4(),
          tripId,
          version: 1,
          createdBy: auth.user.id,
          createdAt: new Date().toISOString(),
          sourceIdeaIds: ideas.map(i => i.id),
          content: itineraryContent,
          changeLog: ''
        }
        
        await db.collection('itinerary_versions').insertOne(version)
        
        // Update status to published
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { itineraryStatus: 'published' } }
        )
        
        const { _id, ...versionResponse } = version
        return handleCORS(NextResponse.json(versionResponse))
      } catch (error) {
        // Reset status on error
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { itineraryStatus: 'collecting_ideas' } }
        )
        throw error
      }
    }
    
    // Submit feedback - POST /api/trips/:tripId/itinerary/feedback
    if (route.match(/^\/trips\/[^/]+\/itinerary\/feedback$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { itineraryVersion, message, type, target } = body
      
      if (!itineraryVersion || !message || !message.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary version and message are required' },
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
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      // Verify version exists
      const version = await db.collection('itinerary_versions').findOne({
        tripId,
        version: parseInt(itineraryVersion)
      })
      
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary version not found' },
          { status: 404 }
        ))
      }
      
      const feedback = {
        id: uuidv4(),
        tripId,
        itineraryVersion: parseInt(itineraryVersion),
        authorId: auth.user.id,
        message: message.trim(),
        type: type || 'suggestion',
        target: target || null,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('itinerary_feedback').insertOne(feedback)
      
      // Get author info
      const author = await db.collection('users').findOne({ id: auth.user.id })
      
      return handleCORS(NextResponse.json({
        ...feedback,
        author: author ? { id: author.id, name: author.name } : null
      }))
    }
    
    // Get feedback for version - GET /api/trips/:tripId/itinerary/feedback?version=1
    if (route.match(/^\/trips\/[^/]+\/itinerary\/feedback$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const searchParams = request.nextUrl.searchParams
      const version = searchParams.get('version')
      
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'Version parameter is required' },
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
      
      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You are not a member of this circle' },
          { status: 403 }
        ))
      }
      
      const feedbackMessages = await db.collection('itinerary_feedback')
        .find({ tripId, itineraryVersion: parseInt(version) })
        .sort({ createdAt: 1 })
        .toArray()
      
      // Get authors
      const authorIds = [...new Set(feedbackMessages.map(f => f.authorId))]
      const authors = await db.collection('users')
        .find({ id: { $in: authorIds } })
        .toArray()
      
      const feedbackWithAuthors = feedbackMessages.map(feedback => {
        const { _id, ...rest } = feedback
        const author = authors.find(a => a.id === feedback.authorId)
        return {
          ...rest,
          author: author ? { id: author.id, name: author.name } : null
        }
      })
      
      return handleCORS(NextResponse.json(feedbackWithAuthors))
    }
    
    // Revise itinerary - POST /api/trips/:tripId/itinerary/revise
    if (route.match(/^\/trips\/[^/]+\/itinerary\/revise$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Guard: Must be locked
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary can only be revised for locked trips' },
          { status: 400 }
        ))
      }
      
      // Only trip creator or circle owner can revise
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can revise an itinerary' },
          { status: 403 }
        ))
      }
      
      // Get latest version
      const latestVersion = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })
      
      if (!latestVersion) {
        return handleCORS(NextResponse.json(
          { error: 'No itinerary version found. Generate an initial itinerary first.' },
          { status: 400 }
        ))
      }
      
      // Get feedback for latest version
      const feedbackMessages = await db.collection('itinerary_feedback')
        .find({ tripId, itineraryVersion: latestVersion.version })
        .sort({ createdAt: 1 })
        .toArray()
      
      // Get new ideas since last version
      const newIdeas = await db.collection('itinerary_ideas')
        .find({ 
          tripId,
          createdAt: { $gt: latestVersion.createdAt }
        })
        .sort({ priority: -1, createdAt: -1 })
        .limit(5)
        .toArray()
      
      // Update status to revising
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { itineraryStatus: 'revising' } }
      )
      
      try {
        // Summarize feedback
        const feedbackSummary = await summarizeFeedback(feedbackMessages)
        
        // Revise itinerary using LLM
        const { itinerary: revisedContent, changeLog } = await reviseItinerary({
          currentItinerary: latestVersion.content,
          feedbackSummary,
          newIdeas: newIdeas.map(idea => ({
            id: idea.id,
            title: idea.title,
            details: idea.details,
            category: idea.category,
            location: idea.location
          })),
          destination: trip.description || trip.name,
          startDate: trip.lockedStartDate || trip.startDate,
          endDate: trip.lockedEndDate || trip.endDate
        })
        
        // Create next version
        const nextVersion = latestVersion.version + 1
        const sourceIdeaIds = [
          ...latestVersion.sourceIdeaIds,
          ...newIdeas.map(i => i.id)
        ]
        
        const newVersion = {
          id: uuidv4(),
          tripId,
          version: nextVersion,
          createdBy: auth.user.id,
          createdAt: new Date().toISOString(),
          sourceIdeaIds: [...new Set(sourceIdeaIds)],
          content: revisedContent,
          changeLog: changeLog.trim()
        }
        
        await db.collection('itinerary_versions').insertOne(newVersion)
        
        // Update status back to published
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { itineraryStatus: 'published' } }
        )
        
        const { _id, ...versionResponse } = newVersion
        return handleCORS(NextResponse.json(versionResponse))
      } catch (error) {
        // Reset status on error
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { itineraryStatus: 'published' } }
        )
        throw error
      }
    }

    // ============ DASHBOARD ROUTES ============
    
    // Get dashboard data - GET /api/dashboard
    if (route === '/dashboard' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      try {
        const { getDashboardData } = await import('@/lib/dashboard/getDashboardData.js')
        const data = await getDashboardData(auth.user.id)
        return handleCORS(NextResponse.json(data))
      } catch (error) {
        console.error('Dashboard error:', error)
        return handleCORS(NextResponse.json(
          { error: 'Failed to fetch dashboard data', details: error.message },
          { status: 500 }
        ))
      }
    }
    
    // ============ DEV/SEEDING ROUTES ============
    // Note: POST /api/seed/discover is now handled by app/api/seed/discover/route.js
    
    // ============ DEFAULT ROUTES ============
    
    // Root endpoint
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: 'Trypzy API', version: '1.0.0' }))
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` },
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
