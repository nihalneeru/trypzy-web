import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { generateItinerary, summarizeFeedback, reviseItinerary } from '@/lib/server/llm.js'
import { validateStageAction } from '@/lib/trips/validateStageAction.js'
import { getVotingStatus } from '@/lib/trips/getVotingStatus.js'
import { ITINERARY_CONFIG } from '@/lib/itinerary/config.js'

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable must be set in production')
}
// For development, use a default
const jwtSecret = JWT_SECRET || 'dev-only-secret-key'

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
    const decoded = jwt.verify(token, jwtSecret)
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
      circleId: trip.circleId
    })
    
    if (!circleMembership) return false
    
    // Check if user has left/removed status
    const participant = allParticipants.find(p => p.userId === userId)
    if (participant) {
      const status = participant.status || 'active'
      if (status === 'left' || status === 'removed') return false
    }
    
    return true
  } else {
    // Hosted trips: user must have active participant record
    const participant = allParticipants.find(p => p.userId === userId)
    if (!participant) return false
    
    const status = participant.status || 'active'
    return status === 'active'
  }
}

// Privacy helper: Get user privacy with defaults applied
function getUserPrivacyWithDefaults(userDoc) {
  if (!userDoc) return null
  
  const privacy = userDoc.privacy || {}
  return {
    profileVisibility: privacy.profileVisibility || 'circle',
    tripsVisibility: privacy.tripsVisibility || 'circle',
    allowTripJoinRequests: privacy.allowTripJoinRequests !== undefined ? privacy.allowTripJoinRequests : true,
    showTripDetailsLevel: privacy.showTripDetailsLevel || 'limited'
  }
}

// Privacy helper: Get shared circle IDs between two users
async function getSharedCircleIds(db, viewerId, ownerId) {
  if (viewerId === ownerId) {
    // User viewing their own profile - return all their circles
    const memberships = await db.collection('memberships')
      .find({ userId: ownerId })
      .toArray()
    return memberships.map(m => m.circleId)
  }
  
  // Get both users' circle memberships
  const [viewerMemberships, ownerMemberships] = await Promise.all([
    db.collection('memberships').find({ userId: viewerId }).toArray(),
    db.collection('memberships').find({ userId: ownerId }).toArray()
  ])
  
  const viewerCircleIds = new Set(viewerMemberships.map(m => m.circleId))
  const ownerCircleIds = new Set(ownerMemberships.map(m => m.circleId))
  
  // Intersect the sets
  const sharedCircleIds = []
  for (const circleId of viewerCircleIds) {
    if (ownerCircleIds.has(circleId)) {
      sharedCircleIds.push(circleId)
    }
  }
  
  return sharedCircleIds
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
      const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' })
      
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
      
      const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '7d' })
      
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

    // Get circle members - GET /api/circles/:circleId/members
    if (route.match(/^\/circles\/[^/]+\/members$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const circleId = path[1]

      // Check that requesting user is a member of the circle
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

      // Get all memberships for this circle
      const memberships = await db.collection('memberships')
        .find({ circleId })
        .toArray()

      // Get user info for all members
      const userIds = memberships.map(m => m.userId)
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      const userMap = new Map(users.map(u => [u.id, u]))

      const members = memberships.map(m => ({
        userId: m.userId,
        userName: userMap.get(m.userId)?.name || 'Unknown',
        role: m.role || 'member',
        joinedAt: m.joinedAt
      }))

      return handleCORS(NextResponse.json(members))
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
      
      // Backfill: Add user as traveler to all existing collaborative trips in this circle
      // This ensures late joiners can see existing trips consistently
      // For collaborative trips, circle members are travelers, so we explicitly add them
      const existingTrips = await db.collection('trips')
        .find({ circleId: circle.id, type: 'collaborative' })
        .toArray()
      
      if (existingTrips.length > 0) {
        const tripIds = existingTrips.map(t => t.id)
        const now = new Date().toISOString()
        
        // Get existing trip_participants records for this user in these trips
        const existingParticipants = await db.collection('trip_participants')
          .find({
            tripId: { $in: tripIds },
            userId: auth.user.id
          })
          .toArray()
        
        const existingByTripId = new Map(existingParticipants.map(p => [p.tripId, p]))
        
        // Process each trip: update existing records to 'active' or insert new ones
        for (const trip of existingTrips) {
          const existing = existingByTripId.get(trip.id)
          
          if (existing) {
            // User already has a record - update to 'active' if it's not already active
            // This handles the case where user previously left (status='left') and is rejoining
            if (existing.status !== 'active') {
              await db.collection('trip_participants').updateOne(
                { tripId: trip.id, userId: auth.user.id },
                { 
                  $set: { 
                    status: 'active',
                    joinedAt: now,
                    updatedAt: now
                  }
                }
              )
            }
          } else {
            // No existing record - insert new one
            await db.collection('trip_participants').insertOne({
              tripId: trip.id,
              userId: auth.user.id,
              status: 'active',
              joinedAt: now,
              createdAt: now
            })
          }
        }
      }
      
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
        .toArray()
      
      // Filter trips based on active travelers' privacy settings ("most restrictive wins")
      // If any active traveler has privacy='private', non-travelers cannot see the trip
      const { filterTripsByActiveTravelerPrivacy } = await import('@/lib/trips/canViewerSeeTrip.js')
      const visibleTrips = await filterTripsByActiveTravelerPrivacy({
        viewerId: auth.user.id,
        trips,
        db
      })
      
      // Build trip card data using shared function (same as dashboard)
      const { buildTripCardDataBatch } = await import('@/lib/trips/buildTripCardData.js')
      const tripCardData = await buildTripCardDataBatch(
        visibleTrips,
        auth.user.id,
        membership.role,
        db
      )
      
      // Sort trips using shared function (same as dashboard)
      const { sortTrips } = await import('@/lib/dashboard/sortTrips.js')
      const sortedTrips = sortTrips(tripCardData)
      
      return handleCORS(NextResponse.json({
        ...circle,
        members: membersWithRoles,
        trips: sortedTrips,
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

      // Validate required fields
      if (!circleId || !name || !type) {
        return handleCORS(NextResponse.json(
          { error: 'Circle ID, name, and type are required' },
          { status: 400 }
        ))
      }

      // Validate type is valid
      if (type !== 'collaborative' && type !== 'hosted') {
        return handleCORS(NextResponse.json(
          { error: 'Type must be "collaborative" or "hosted"' },
          { status: 400 }
        ))
      }

      // Hosted trips REQUIRE dates at creation
      if (type === 'hosted' && (!startDate || !endDate)) {
        return handleCORS(NextResponse.json(
          { error: 'Hosted trips require start and end dates' },
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

      // Scheduling mode: collaborative trips use 'date_windows' mode (free-form text, caps, overlap)
      // Legacy trips without schedulingMode use top3_heatmap flow
      const schedulingMode = type === 'hosted' ? null : (body.schedulingMode || 'date_windows')

      // For collaborative trips: dates are optional planning bounds, NOT locked
      // For hosted trips: dates are required and locked immediately
      const isHosted = type === 'hosted'

      const trip = {
        id: uuidv4(),
        circleId,
        name,
        description: description || '',
        type, // 'collaborative' or 'hosted'
        // Legacy date fields (kept for backward compatibility)
        startDate: startDate || null,
        endDate: endDate || null,
        // Duration: for hosted trips, derive from dates; for collaborative, store as soft preference (null = no preference)
        duration: isHosted && startDate && endDate
          ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
          : (duration || null),
        // Scheduling configuration
        schedulingMode,
        // For collaborative: optional planning bounds; for hosted: ignored (dates are locked)
        startBound: !isHosted ? (body.startBound || startDate || null) : null,
        endBound: !isHosted ? (body.endBound || endDate || null) : null,
        // tripLengthDays: soft preference, not enforced (null = no preference)
        tripLengthDays: isHosted && startDate && endDate
          ? Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1
          : (body.tripLengthDays || duration || null),
        // Status and lock state
        tripStatus: 'ACTIVE', // Lifecycle status: ACTIVE | CANCELLED | COMPLETED
        status: isHosted ? 'locked' : 'proposed',
        datesLocked: isHosted ? true : false,
        lockedStartDate: isHosted ? startDate : null,
        lockedEndDate: isHosted ? endDate : null,
        // Scheduling funnel fields (collaborative only)
        windowProposals: isHosted ? null : [],      // Array of proposed time windows
        windowPreferences: isHosted ? null : [],    // Array of member preferences on windows
        dateProposal: null,                          // Single active date proposal
        dateReactions: isHosted ? null : [],         // Array of reactions to date proposal
        // Itinerary
        itineraryStatus: isHosted ? 'collecting_ideas' : null,
        destinationHint: body.destinationHint?.trim() || null,
        createdBy: auth.user.id,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne(trip)
      
      // Emit chat event for trip creation
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId: trip.id,
        circleId: circleId,
        actorUserId: auth.user.id,
        subtype: 'milestone',
        text: `✈️ Trip "${name}" was created by ${auth.user.name}`,
        metadata: {
          key: 'trip_created'
        }
      })
      
      // For hosted trips, creator is automatically a participant
      if (type === 'hosted') {
        await db.collection('trip_participants').insertOne({
          id: uuidv4(),
          tripId: trip.id,
          userId: auth.user.id,
          status: 'active',
          joinedAt: new Date().toISOString()
        })

        // If invitedUserIds provided, create pending invitations
        const { invitedUserIds } = body
        if (invitedUserIds && Array.isArray(invitedUserIds) && invitedUserIds.length > 0) {
          // Verify all invited users are circle members
          const circleMemberships = await db.collection('memberships')
            .find({ circleId, userId: { $in: invitedUserIds } })
            .toArray()
          const validUserIds = new Set(circleMemberships.map(m => m.userId))

          // Create invitations for valid users (excluding creator)
          const invitationsToCreate = invitedUserIds
            .filter(userId => validUserIds.has(userId) && userId !== auth.user.id)
            .map(userId => ({
              id: uuidv4(),
              tripId: trip.id,
              circleId: circleId,
              invitedUserId: userId,
              invitedBy: auth.user.id,
              status: 'pending',
              createdAt: new Date().toISOString()
            }))

          if (invitationsToCreate.length > 0) {
            await db.collection('trip_invitations').insertMany(invitationsToCreate)

            // Emit chat event for invitations sent
            const invitedUsers = await db.collection('users')
              .find({ id: { $in: invitationsToCreate.map(i => i.invitedUserId) } })
              .toArray()
            const invitedNames = invitedUsers.map(u => u.name).join(', ')
            const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
            await emitTripChatEvent({
              tripId: trip.id,
              circleId: circleId,
              actorUserId: auth.user.id,
              subtype: 'update',
              text: `📩 ${auth.user.name} invited ${invitedNames} to the trip`,
              metadata: {
                key: 'invitations_sent',
                invitedUserIds: invitationsToCreate.map(i => i.invitedUserId)
              }
            })
          }
        }
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
      
      // Get circle and membership
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
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
      
      // Get active participant count
      const allParticipants = await db.collection('trip_participants')
        .find({ tripId })
        .toArray()
      
      let activeMemberCount
      if (trip.type === 'collaborative') {
        // For collaborative trips: count circle members minus those who left/removed
        const circleMemberships = await db.collection('memberships')
          .find({ circleId: trip.circleId })
          .toArray()
        const circleMemberUserIds = new Set(circleMemberships.map(m => m.userId))
        
        // Subtract those who left/removed
        let activeCount = circleMemberUserIds.size
        allParticipants.forEach(p => {
          const status = p.status || 'active'
          if ((status === 'left' || status === 'removed') && circleMemberUserIds.has(p.userId)) {
            activeCount--
          }
        })
        activeMemberCount = activeCount
      } else {
        // Hosted trips: count active participants
        activeMemberCount = allParticipants.filter(p => {
          const status = p.status || 'active'
          return status === 'active'
        }).length
      }
      
      // SOLO TRIP: Only the solo member can delete
      // MULTI-MEMBER TRIP: Only the trip leader can delete
      if (activeMemberCount === 1) {
        // Solo trip: must be the only member
        if (trip.createdBy !== auth.user.id) {
          return handleCORS(NextResponse.json(
            { error: 'Only the trip owner can delete this trip' },
            { status: 403 }
          ))
        }
      } else {
        // Multi-member trip: only trip leader can delete
        if (trip.createdBy !== auth.user.id) {
          return handleCORS(NextResponse.json(
            { error: 'Only the Trip Leader can delete this trip' },
            { status: 403 }
          ))
        }
      }
      
      // Delete related data (destructive operation)
      await Promise.all([
        db.collection('availabilities').deleteMany({ tripId }),
        db.collection('votes').deleteMany({ tripId }),
        db.collection('trip_participants').deleteMany({ tripId }),
        db.collection('posts').deleteMany({ tripId }),
        db.collection('trip_messages').deleteMany({ tripId }),
        db.collection('circle_messages').deleteMany({ tripId }),
        db.collection('itineraries').deleteMany({ tripId }),
        db.collection('trip_date_picks').deleteMany({ tripId }),
        db.collection('join_requests').deleteMany({ tripId })
      ])
      
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
      
      // Only trip creator can edit
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator can edit this trip' },
          { status: 403 }
        ))
      }
      
      const body = await request.json()
      const updateFields = {}
      
      // destinationHint can be edited even on locked trips (for clarity and future LLM prompting)
      const canEditDestinationHint = true
      const canEditOtherFields = trip.status !== 'locked'
      
      if (canEditOtherFields) {
        // Regular fields can only be edited when trip is not locked
        if (body.name !== undefined) updateFields.name = body.name.trim()
        if (body.description !== undefined) updateFields.description = body.description?.trim() || null
        if (body.startDate !== undefined) updateFields.startDate = body.startDate
        if (body.endDate !== undefined) updateFields.endDate = body.endDate
        if (body.duration !== undefined) updateFields.duration = parseInt(body.duration)
      } else {
        // If trip is locked, only allow editing destinationHint
        const onlyDestinationHint = Object.keys(body).every(key => key === 'destinationHint' || key === 'destinationHint' || Object.keys(updateFields).length === 0)
        if (!onlyDestinationHint && Object.keys(body).some(key => key !== 'destinationHint')) {
          return handleCORS(NextResponse.json(
            { error: 'Cannot edit trip details when trip is locked. Only destination hint can be updated.' },
            { status: 400 }
          ))
        }
      }
      
      // destinationHint can always be edited by trip leader
      if (canEditDestinationHint && body.destinationHint !== undefined) {
        updateFields.destinationHint = body.destinationHint?.trim() || null
      }
      
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

      // Check privacy: If any active traveler has privacy='private', non-travelers cannot access trip detail
      // Return 404 to avoid leaking trip existence
      const { canViewerSeeTrip } = await import('@/lib/trips/canViewerSeeTrip.js')
      const canSee = await canViewerSeeTrip({
        viewerId: auth.user.id,
        trip,
        db
      })

      if (!canSee) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
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
      
      // Get circle members (for collaborative trips - base set of participants)
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      const allCircleMemberships = await db.collection('memberships')
        .find({ circleId: trip.circleId })
        .toArray()
      const circleMemberUserIds = new Set(allCircleMemberships.map(m => m.userId))
      
      // Get participant records (overrides for collaborative trips, authoritative for hosted trips)
      const allParticipants = await db.collection('trip_participants')
        .find({ tripId })
        .toArray()
      
      // Build status map from participant records
      const statusByUserId = new Map()
      allParticipants.forEach(p => {
        statusByUserId.set(p.userId, p.status || 'active')
      })
      
      // Derive active participants based on trip type
      // Authoritative: Build effectiveActiveUserIds strictly from participants where status === 'active'
      let effectiveActiveUserIds
      let participantsWithStatus
      
      if (trip.type === 'collaborative') {
        // Collaborative trips: Circle members are eligible, but only active participants count
        // Start with empty set - only add users who are active
        effectiveActiveUserIds = new Set()
        
        // Add circle members who are active participants
        // A circle member is active if:
        // 1. They have no trip_participants record (implicitly active)
        // 2. Their trip_participants status is 'active'
        circleMemberUserIds.forEach(userId => {
          const participantStatus = statusByUserId.get(userId)
          // If no record or status is 'active', they're active
          if (!participantStatus || participantStatus === 'active') {
            effectiveActiveUserIds.add(userId)
          }
          // If status is 'left' or 'removed', they are NOT active (don't add)
        })
        
        // Build participantsWithStatus: include ALL circle members with their status
        const allUserIds = Array.from(circleMemberUserIds)
        const participantUsers = await db.collection('users')
          .find({ id: { $in: allUserIds } })
          .toArray()
        const userMap = new Map(participantUsers.map(u => [u.id, u]))
        
        participantsWithStatus = allUserIds.map(userId => {
          const participantRecord = allParticipants.find(p => p.userId === userId)
          const user = userMap.get(userId)
          const status = statusByUserId.get(userId) || 'active'
          
          return {
            id: participantRecord?.id || null,
            tripId,
            userId,
            status,
            user: user ? { id: user.id, name: user.name } : null,
            joinedAt: participantRecord?.joinedAt || null
          }
        })
      } else {
        // Hosted trips: trip_participants is authoritative
        // Only include participants where status === 'active'
        const activeParticipants = allParticipants.filter(p => {
          const status = p.status || 'active'
          return status === 'active'
        })
        
        effectiveActiveUserIds = new Set(activeParticipants.map(p => p.userId))
        
        // Get user details for participants
        const participantUserIds = allParticipants.map(p => p.userId)
        const participantUsers = await db.collection('users')
          .find({ id: { $in: participantUserIds } })
          .toArray()
        const userMap = new Map(participantUsers.map(u => [u.id, u]))
        
        participantsWithStatus = allParticipants.map(p => {
          const user = userMap.get(p.userId)
          return {
            ...p,
            user: user ? { id: user.id, name: user.name } : null,
            status: p.status || 'active'
          }
        })
      }
      
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
      
      // Check if user is active participant
      const userParticipant = allParticipants.find(p => p.userId === auth.user.id)
      const userParticipantStatus = userParticipant ? (userParticipant.status || 'active') : null
      
      // Determine if user is active participant using derived activeUserIds
      const isActiveParticipant = effectiveActiveUserIds.has(auth.user.id)
      const isParticipant = trip.type === 'collaborative' 
        ? circleMemberUserIds.has(auth.user.id) // Circle member = participant
        : !!userParticipant // Hosted: must have record
      
        // Use effectiveActiveUserIds for all count calculations
        const totalMembers = effectiveActiveUserIds.size
        const memberCount = totalMembers // Exported for UI logic
      
      // Count unique ACTIVE users who have submitted availability
      const usersWithAvailability = [...new Set(availabilities.map(a => a.userId))]
      const respondedCount = usersWithAvailability.filter(userId => effectiveActiveUserIds.has(userId)).length
      
      // Count unique ACTIVE users who have voted
      const usersWithVotes = [...new Set(votes.map(v => v.userId))]
      const votedCount = usersWithVotes.filter(userId => effectiveActiveUserIds.has(userId)).length
      
      // New scheduling mode: top3_heatmap - aggregate date picks into heatmap
      let heatmapScores = {}
      let topCandidates = []
      let userDatePicks = null
      let pickProgress = undefined
      
      if (trip.schedulingMode === 'top3_heatmap') {
        // Get all date picks for this trip
        const allPicks = await db.collection('trip_date_picks')
          .find({ tripId })
          .toArray()
        
        // Get current user's picks
        const userPicksDoc = allPicks.find(p => p.userId === auth.user.id)
        userDatePicks = userPicksDoc ? userPicksDoc.picks : []
        
        // Compute pick progress: who has saved picks
        const respondedUserIds = new Set()
        allPicks.forEach(pickDoc => {
          // Only count active participants who have picks
          if (effectiveActiveUserIds.has(pickDoc.userId) && pickDoc.picks && pickDoc.picks.length > 0) {
            respondedUserIds.add(pickDoc.userId)
          }
        })
        
        pickProgress = {
          respondedCount: respondedUserIds.size,
          totalCount: effectiveActiveUserIds.size,
          respondedUserIds: Array.from(respondedUserIds)
        }
        
        // Compute heatmap scores: weight = {1:3, 2:2, 3:1}
        // Only count picks from active participants
        const weightMap = { 1: 3, 2: 2, 3: 1 }
        heatmapScores = {}
        const scoreBreakdown = {} // { startDate: { loveCount, canCount, mightCount } }
        
        allPicks.forEach(pickDoc => {
          // Only count picks from active participants
          if (!effectiveActiveUserIds.has(pickDoc.userId)) {
            return
          }
          
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
        participants: participantsWithStatus.map(p => ({ id: p.user?.id || p.userId, name: p.user?.name || 'Unknown' })),
        participantsWithStatus, // Include status info for UI
        memberCount: totalMembers, // Active member count for UI logic (solo vs multi-member)
        isParticipant,
        isActiveParticipant, // New: whether user is active participant
        isCreator: trip.createdBy === auth.user.id,
        canLock: (trip.createdBy === auth.user.id || circle?.ownerId === auth.user.id) && trip.status === 'voting',
        // Viewer participation info for UI
        viewer: {
          isTripLeader: trip.createdBy === auth.user.id,
          isCircleLeader: circle ? (circle.ownerId === auth.user.id) : false,
          hasParticipantRecord: !!userParticipant,
          participantStatus: userParticipantStatus || (trip.type === 'collaborative' && circleMemberUserIds.has(auth.user.id) ? 'active' : null),
          isActiveParticipant,
          // Pending leadership transfer info
          pendingLeadershipTransfer: trip.pendingLeadershipTransfer || null,
          isPendingLeader: trip.pendingLeadershipTransfer?.toUserId === auth.user.id
        },
        // Progress tracking stats
        totalMembers,
        activeTravelerCount: effectiveActiveUserIds.size, // Explicit count for UI
        effectiveActiveVoterCount: effectiveActiveUserIds.size, // Count of active participants for heatmap scaling
        respondedCount,
        votedCount,
        // New top3_heatmap scheduling data
        userDatePicks, // Current user's picks: [{rank:1|2|3, startDateISO}]
        heatmapScores, // { startDateISO: score }
        topCandidates, // Top 5: [{startDateISO, endDateISO, score, loveCount, canCount, mightCount}]
        pickProgress, // { respondedCount, totalCount, respondedUserIds } - only for top3_heatmap
        // Itinerary status (for locked trips)
        itineraryStatus: trip.itineraryStatus || null,
        // Voting status (for voting stage)
        votingStatus: getVotingStatus(trip, participantsWithStatus.map(p => ({ id: p.user?.id || p.userId, name: p.user?.name || 'Unknown' })), auth.user.id)
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
      const circle = await db.collection('circles').findOne({ id: trip?.circleId })
      
      // Validate stage action (checks trip existence and stage)
      // Note: Auto-transition to 'scheduling' on first pick is preserved below
      const validation = validateStageAction(trip, 'submit_availability', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json(
          { error: validation.message },
          { status: validation.status }
        ))
      }
      
      // Backward compatibility: default status for old trips (needed for auto-transition logic)
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
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
          
          // Emit chat event for scheduling started milestone
          const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: null,
            subtype: 'milestone',
            text: `📅 Scheduling has started! Mark your availability to help find the best dates.`,
            metadata: {
              key: 'scheduling_started'
            }
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
      const circle = await db.collection('circles').findOne({ id: trip?.circleId })
      
      // Validate stage action (checks trip existence, leader permission, and stage)
      const validation = validateStageAction(trip, 'open_voting', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json(
          { error: validation.message },
          { status: validation.status }
        ))
      }
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { status: 'voting' } }
      )
      
      // Emit chat event for voting opened milestone
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: null,
        subtype: 'milestone',
        text: `🗳️ Voting is now open! Choose your preferred dates from the top options.`,
        metadata: {
          key: 'voting_opened'
        }
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
      const circle = await db.collection('circles').findOne({ id: trip?.circleId })
      
      // Validate stage action (checks trip existence and stage)
      const validation = validateStageAction(trip, 'vote', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json(
          { error: validation.message },
          { status: validation.status }
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
      
      // Check if user is active participant (hasn't left)
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }
      // If no participant record exists for collaborative trips, user is implicitly active (backward compatibility)
      
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

    // ============ SCHEDULING FUNNEL ENDPOINTS (collaborative trips) ============

    // Propose a time window - POST /api/trips/:id/windows/propose
    if (route.match(/^\/trips\/[^/]+\/windows\/propose$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { description, startHint, endHint } = body

      if (!description || typeof description !== 'string' || description.trim().length === 0) {
        return handleCORS(NextResponse.json(
          { error: 'Description is required' },
          { status: 400 }
        ))
      }

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Block modifications on cancelled trips
      if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
        return handleCORS(NextResponse.json(
          { error: 'This trip has been canceled and is read-only' },
          { status: 400 }
        ))
      }

      // Only collaborative trips use the scheduling funnel
      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json(
          { error: 'Window proposals are only available for collaborative trips' },
          { status: 400 }
        ))
      }

      // Check if windows are frozen (dateProposal exists)
      if (trip.dateProposal?.startDate && trip.dateProposal?.endDate) {
        return handleCORS(NextResponse.json(
          { error: 'Windows are frozen. A date proposal is active.' },
          { status: 400 }
        ))
      }

      // Check if dates are already locked
      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Dates are already locked' },
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

      // Check if user is active participant
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      if (userParticipant && (userParticipant.status === 'left' || userParticipant.status === 'removed')) {
        return handleCORS(NextResponse.json(
          { error: 'You have left this trip' },
          { status: 403 }
        ))
      }

      const windowProposal = {
        id: uuidv4(),
        userId: auth.user.id,
        userName: auth.user.name,
        description: description.trim(),
        startHint: startHint || null,
        endHint: endHint || null,
        archived: false,
        createdAt: new Date().toISOString()
      }

      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $push: { windowProposals: windowProposal },
          $set: { status: 'scheduling' }  // Move to scheduling if not already
        }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'window_proposed',
        text: `📅 ${auth.user.name} suggested a time window: "${description.trim()}"`,
        metadata: { windowId: windowProposal.id, description: description.trim() }
      })

      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      return handleCORS(NextResponse.json(updatedTrip))
    }

    // Set preference on a window - POST /api/trips/:id/windows/preference
    if (route.match(/^\/trips\/[^/]+\/windows\/preference$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { windowId, preference, note } = body

      if (!windowId) {
        return handleCORS(NextResponse.json({ error: 'windowId is required' }, { status: 400 }))
      }

      const validPreferences = ['WORKS', 'MAYBE', 'NO']
      if (!preference || !validPreferences.includes(preference)) {
        return handleCORS(NextResponse.json(
          { error: 'preference must be WORKS, MAYBE, or NO' },
          { status: 400 }
        ))
      }

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Block modifications on cancelled trips
      if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
        return handleCORS(NextResponse.json(
          { error: 'This trip has been canceled and is read-only' },
          { status: 400 }
        ))
      }

      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json(
          { error: 'Preferences are only available for collaborative trips' },
          { status: 400 }
        ))
      }

      // Check if windows are frozen
      if (trip.dateProposal?.startDate && trip.dateProposal?.endDate) {
        return handleCORS(NextResponse.json(
          { error: 'Windows are frozen. A date proposal is active.' },
          { status: 400 }
        ))
      }

      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json({ error: 'Dates are already locked' }, { status: 400 }))
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

      // Check active participant
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      if (userParticipant && (userParticipant.status === 'left' || userParticipant.status === 'removed')) {
        return handleCORS(NextResponse.json({ error: 'You have left this trip' }, { status: 403 }))
      }

      // Verify window exists and is not archived
      const windowProposal = (trip.windowProposals || []).find(w => w.id === windowId)
      if (!windowProposal) {
        return handleCORS(NextResponse.json({ error: 'Window not found' }, { status: 404 }))
      }
      if (windowProposal.archived) {
        return handleCORS(NextResponse.json({ error: 'Window has been archived' }, { status: 400 }))
      }

      const now = new Date().toISOString()

      // Remove existing preference for this user+window, then add new one
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $pull: { windowPreferences: { userId: auth.user.id, windowId } }
        }
      )

      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $push: {
            windowPreferences: {
              userId: auth.user.id,
              userName: auth.user.name,
              windowId,
              preference,
              note: note || null,
              createdAt: now,
              updatedAt: now
            }
          }
        }
      )

      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      return handleCORS(NextResponse.json(updatedTrip))
    }

    // Compress windows (leader only) - POST /api/trips/:id/windows/compress
    if (route.match(/^\/trips\/[^/]+\/windows\/compress$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { keepWindowIds } = body  // Optional: array of window IDs to keep

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Only leader can compress
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json({ error: 'Only the trip leader can compress windows' }, { status: 403 }))
      }

      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json({ error: 'Only collaborative trips have windows' }, { status: 400 }))
      }

      if (trip.dateProposal?.startDate && trip.dateProposal?.endDate) {
        return handleCORS(NextResponse.json({ error: 'Windows are already frozen' }, { status: 400 }))
      }

      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json({ error: 'Dates are already locked' }, { status: 400 }))
      }

      const windows = trip.windowProposals || []
      const preferences = trip.windowPreferences || []

      // Score windows: +3 per WORKS, +1 per MAYBE, -2 per NO
      const scoredWindows = windows.filter(w => !w.archived).map(w => {
        const windowPrefs = preferences.filter(p => p.windowId === w.id)
        const works = windowPrefs.filter(p => p.preference === 'WORKS').length
        const maybe = windowPrefs.filter(p => p.preference === 'MAYBE').length
        const no = windowPrefs.filter(p => p.preference === 'NO').length
        const score = (works * 3) + (maybe * 1) + (no * -2)
        return { ...w, score, works, maybe, no }
      }).sort((a, b) => b.score - a.score)

      // Determine which windows to keep
      let idsToKeep
      if (Array.isArray(keepWindowIds) && keepWindowIds.length > 0) {
        idsToKeep = new Set(keepWindowIds)
      } else {
        // Default: keep top 2 scoring windows
        idsToKeep = new Set(scoredWindows.slice(0, 2).map(w => w.id))
      }

      // Archive all windows not in keepWindowIds
      const updatedWindows = windows.map(w => ({
        ...w,
        archived: !idsToKeep.has(w.id) ? true : w.archived
      }))

      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { windowProposals: updatedWindows } }
      )

      const keptCount = updatedWindows.filter(w => !w.archived).length
      const archivedCount = updatedWindows.filter(w => w.archived).length - windows.filter(w => w.archived).length

      // Emit chat event if any were archived
      if (archivedCount > 0) {
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'windows_compressed',
          text: `📋 ${auth.user.name} narrowed down to ${keptCount} window${keptCount !== 1 ? 's' : ''} based on group preferences.`,
          metadata: { keptCount, archivedCount }
        })
      }

      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      return handleCORS(NextResponse.json(updatedTrip))
    }

    // Propose concrete dates (leader only) - POST /api/trips/:id/dates/propose
    if (route.match(/^\/trips\/[^/]+\/dates\/propose$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { startDate, endDate, note } = body

      if (!startDate || !endDate) {
        return handleCORS(NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 }))
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return handleCORS(NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 }))
      }

      if (startDate > endDate) {
        return handleCORS(NextResponse.json({ error: 'startDate must be before or equal to endDate' }, { status: 400 }))
      }

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Only leader can propose dates
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json({ error: 'Only the trip leader can propose dates' }, { status: 403 }))
      }

      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json({ error: 'Only collaborative trips use date proposals' }, { status: 400 }))
      }

      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json({ error: 'Dates are already locked' }, { status: 400 }))
      }

      const dateProposal = {
        startDate,
        endDate,
        proposedBy: auth.user.id,
        proposedAt: new Date().toISOString(),
        note: note || null
      }

      // Set dateProposal and clear any existing reactions (new proposal = fresh reactions)
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            dateProposal,
            dateReactions: [],  // Clear reactions for new proposal
            status: 'voting'    // Move to voting status
          }
        }
      )

      // Format dates for chat message
      const startObj = new Date(startDate + 'T12:00:00')
      const endObj = new Date(endDate + 'T12:00:00')
      const dateRangeStr = `${startObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'date_proposed',
        text: `📆 ${auth.user.name} proposed dates: ${dateRangeStr}. React to let them know if this works!`,
        metadata: { startDate, endDate }
      })

      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      return handleCORS(NextResponse.json(updatedTrip))
    }

    // React to date proposal - POST /api/trips/:id/dates/react
    if (route.match(/^\/trips\/[^/]+\/dates\/react$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { reactionType, note } = body

      const validReactions = ['WORKS', 'CAVEAT', 'CANT']
      if (!reactionType || !validReactions.includes(reactionType)) {
        return handleCORS(NextResponse.json(
          { error: 'reactionType must be WORKS, CAVEAT, or CANT' },
          { status: 400 }
        ))
      }

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      if (trip.type !== 'collaborative') {
        return handleCORS(NextResponse.json({ error: 'Only collaborative trips use date reactions' }, { status: 400 }))
      }

      // Must have an active date proposal
      if (!trip.dateProposal?.startDate || !trip.dateProposal?.endDate) {
        return handleCORS(NextResponse.json({ error: 'No active date proposal to react to' }, { status: 400 }))
      }

      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json({ error: 'Dates are already locked' }, { status: 400 }))
      }

      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      if (!membership) {
        return handleCORS(NextResponse.json({ error: 'You are not a member of this circle' }, { status: 403 }))
      }

      // Check active participant
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      if (userParticipant && (userParticipant.status === 'left' || userParticipant.status === 'removed')) {
        return handleCORS(NextResponse.json({ error: 'You have left this trip' }, { status: 403 }))
      }

      const now = new Date().toISOString()

      // Remove existing reaction from this user, then add new one
      await db.collection('trips').updateOne(
        { id: tripId },
        { $pull: { dateReactions: { userId: auth.user.id } } }
      )

      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $push: {
            dateReactions: {
              userId: auth.user.id,
              userName: auth.user.name,
              reactionType,
              note: note || null,
              createdAt: now,
              updatedAt: now
            }
          }
        }
      )

      const updatedTrip = await db.collection('trips').findOne({ id: tripId })

      // Compute approval status for response
      const memberCount = await (async () => {
        const circleMemberships = await db.collection('memberships').find({ circleId: trip.circleId }).toArray()
        const participants = await db.collection('trip_participants').find({ tripId }).toArray()
        const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))
        let count = 0
        for (const m of circleMemberships) {
          const status = statusMap.get(m.userId)
          if (!status || status === 'active') count++
        }
        return count
      })()

      const approvals = (updatedTrip.dateReactions || []).filter(r => r.reactionType === 'WORKS').length
      const requiredApprovals = Math.ceil(memberCount / 2)

      return handleCORS(NextResponse.json({
        ...updatedTrip,
        approvalSummary: {
          approvals,
          requiredApprovals,
          memberCount,
          readyToLock: approvals >= requiredApprovals
        }
      }))
    }

    // Suggest date adjustments (leader only) - POST /api/trips/:id/dates/suggest-adjustments
    if (route.match(/^\/trips\/[^/]+\/dates\/suggest-adjustments$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const trip = await db.collection('trips').findOne({ id: tripId })

      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json({ error: 'Only the trip leader can request suggestions' }, { status: 403 }))
      }

      if (!trip.dateProposal?.startDate || !trip.dateProposal?.endDate) {
        return handleCORS(NextResponse.json({ error: 'No active date proposal' }, { status: 400 }))
      }

      if (trip.datesLocked || trip.status === 'locked') {
        return handleCORS(NextResponse.json({ error: 'Dates are already locked' }, { status: 400 }))
      }

      // Generate deterministic adjustments: +/- 1 week
      const start = new Date(trip.dateProposal.startDate + 'T12:00:00')
      const end = new Date(trip.dateProposal.endDate + 'T12:00:00')
      const duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

      const adjustments = []

      // 1 week earlier
      const earlierStart = new Date(start)
      earlierStart.setDate(earlierStart.getDate() - 7)
      const earlierEnd = new Date(earlierStart)
      earlierEnd.setDate(earlierEnd.getDate() + duration)
      adjustments.push({
        startDate: earlierStart.toISOString().split('T')[0],
        endDate: earlierEnd.toISOString().split('T')[0],
        label: '1 week earlier'
      })

      // 1 week later
      const laterStart = new Date(start)
      laterStart.setDate(laterStart.getDate() + 7)
      const laterEnd = new Date(laterStart)
      laterEnd.setDate(laterEnd.getDate() + duration)
      adjustments.push({
        startDate: laterStart.toISOString().split('T')[0],
        endDate: laterEnd.toISOString().split('T')[0],
        label: '1 week later'
      })

      return handleCORS(NextResponse.json({ adjustments }))
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
      
      const circle = await db.collection('circles').findOne({ id: trip?.circleId })
      
      // Validate stage action (checks trip existence and stage)
      const validation = validateStageAction(trip, 'submit_date_picks', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json(
          { error: validation.message },
          { status: validation.status }
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
      
      // Check if user is active participant (hasn't left)
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }
      // If no participant record exists for collaborative trips, user is implicitly active (backward compatibility)
      
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
      
      // Check if this is a first-time save (before upserting)
      const existingPicksDoc = await db.collection('trip_date_picks').findOne({
        tripId,
        userId: auth.user.id
      })
      const hadExistingPicks = existingPicksDoc && existingPicksDoc.picks && existingPicksDoc.picks.length > 0
      const isFirstTimeSave = !hadExistingPicks && picks.length > 0
      
      // Compute effectiveActiveUserIds (needed for both first-time save event and completion detection)
      // Authoritative: Build strictly from participants where status === 'active'
      let effectiveActiveUserIds
      
      if (trip.type === 'collaborative') {
        const allCircleMemberships = await db.collection('memberships')
          .find({ circleId: trip.circleId })
          .toArray()
        const circleMemberUserIds = new Set(allCircleMemberships.map(m => m.userId))
        
        const allParticipants = await db.collection('trip_participants')
          .find({ tripId })
          .toArray()
        
        // Build status map
        const statusByUserId = new Map()
        allParticipants.forEach(p => {
          statusByUserId.set(p.userId, p.status || 'active')
        })
        
        // Start with empty set - only add users who are active
        effectiveActiveUserIds = new Set()
        
        // Add circle members who are active participants
        // A circle member is active if:
        // 1. They have no trip_participants record (implicitly active)
        // 2. Their trip_participants status is 'active'
        circleMemberUserIds.forEach(userId => {
          const participantStatus = statusByUserId.get(userId)
          // If no record or status is 'active', they're active
          if (!participantStatus || participantStatus === 'active') {
            effectiveActiveUserIds.add(userId)
          }
          // If status is 'left' or 'removed', they are NOT active (don't add)
        })
      } else {
        // Hosted trips: only active participants
        // Only include participants where status === 'active'
        const allParticipants = await db.collection('trip_participants')
          .find({ tripId })
          .toArray()
        const activeParticipants = allParticipants.filter(p => {
          const status = p.status || 'active'
          return status === 'active'
        })
        effectiveActiveUserIds = new Set(activeParticipants.map(p => p.userId))
      }
      
      // Compute previous pick progress BEFORE saving (to detect transition)
      const allPicksBeforeSave = await db.collection('trip_date_picks')
        .find({ tripId })
        .toArray()
      
      const previousRespondedUserIds = new Set()
      allPicksBeforeSave.forEach(pickDoc => {
        if (effectiveActiveUserIds.has(pickDoc.userId) && pickDoc.picks && pickDoc.picks.length > 0) {
          previousRespondedUserIds.add(pickDoc.userId)
        }
      })
      const previousRespondedCount = previousRespondedUserIds.size
      const totalCount = effectiveActiveUserIds.size
      
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
      
      // Auto-transition from proposed to scheduling when first date pick is submitted
      if (trip.status === 'proposed' && previousRespondedCount === 0 && picks.length > 0) {
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { status: 'scheduling' } }
        )
        
        // Add system message
        await db.collection('trip_messages').insertOne({
          tripId: trip.id || tripId,
          type: 'system',
          content: 'Date picking has started',
          timestamp: new Date().toISOString()
        })
      }
      
      // Compute pick progress AFTER save
      const allPicksAfterSave = await db.collection('trip_date_picks')
        .find({ tripId })
        .toArray()
      
      const respondedUserIds = new Set()
      allPicksAfterSave.forEach(pickDoc => {
        if (effectiveActiveUserIds.has(pickDoc.userId) && pickDoc.picks && pickDoc.picks.length > 0) {
          respondedUserIds.add(pickDoc.userId)
        }
      })
      
      const respondedCount = respondedUserIds.size
      
      // Emit system chat event for first-time save
      if (isFirstTimeSave) {
        // Get user display name
        const userDoc = await db.collection('users').findOne({ id: auth.user.id })
        const displayName = userDoc?.name || auth.user.name || 'Someone'
        
        // Emit system chat event
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'scheduling_picks_saved',
          text: `✅ ${displayName} saved date picks (${respondedCount}/${totalCount} responded)`,
          metadata: {
            userId: auth.user.id,
            respondedCount,
            totalCount
          },
          dedupeKey: `scheduling_picks_saved_${tripId}_${auth.user.id}`
        })
      }
      
      // Detect transition to "everyone responded" and emit one-time completion event
      const everyoneResponded = respondedCount === totalCount && totalCount > 0
      const wasIncomplete = previousRespondedCount < totalCount
      const transitionToComplete = everyoneResponded && wasIncomplete
      
      if (transitionToComplete) {
        // Check if a "scheduling_all_responded" event already exists for this trip
        const existingCompletionEvent = await db.collection('trip_messages').findOne({
          tripId,
          isSystem: true,
          subtype: 'scheduling_all_responded'
        })
        
        // Only emit if no prior completion event exists (one-time only)
        if (!existingCompletionEvent) {
          const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: null,
            subtype: 'scheduling_all_responded',
            text: '🎉 Everyone has shared their date preferences. When you\'re ready, the trip leader can lock the final dates.',
            metadata: {
              respondedCount,
              totalCount
            },
            dedupeKey: `scheduling_all_responded_${tripId}`
          })
        }
      }
      
      return handleCORS(NextResponse.json({ message: 'Date picks saved' }))
    }
    
    // Lock trip - POST /api/trips/:id/lock
    // Supports:
    // 1. funnel mode (no body required, locks from dateProposal)
    // 2. top3_heatmap (startDateISO in body)
    // 3. legacy voting (optionKey in body)
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

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action (checks trip existence, leader permission, and stage)
      const validation = validateStageAction(trip, 'lock', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json(
          { error: validation.message },
          { status: validation.status }
        ))
      }

      // Backward compatibility: default status for old trips (needed for payload-specific validation)
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')

      let lockedStartDate, lockedEndDate

      // Mode 1: Scheduling funnel with dateProposal
      if (trip.schedulingMode === 'funnel' && trip.dateProposal?.startDate && trip.dateProposal?.endDate) {
        // Check approval threshold
        const circleMemberships = await db.collection('memberships').find({ circleId: trip.circleId }).toArray()
        const participants = await db.collection('trip_participants').find({ tripId }).toArray()
        const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))
        let memberCount = 0
        for (const m of circleMemberships) {
          const status = statusMap.get(m.userId)
          if (!status || status === 'active') memberCount++
        }

        const approvals = (trip.dateReactions || []).filter(r => r.reactionType === 'WORKS').length
        const requiredApprovals = Math.ceil(memberCount / 2)

        if (approvals < requiredApprovals) {
          return handleCORS(NextResponse.json(
            { error: `Not enough approvals. Need ${requiredApprovals}, have ${approvals}.` },
            { status: 400 }
          ))
        }

        lockedStartDate = trip.dateProposal.startDate
        lockedEndDate = trip.dateProposal.endDate
      }
      // Mode 2: top3_heatmap uses startDateISO
      else if (trip.schedulingMode === 'top3_heatmap' && startDateISO) {
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
        // Mode 3: legacy voting uses optionKey
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
          { error: 'Cannot lock: no date proposal, startDateISO, or optionKey provided' },
          { status: 400 }
        ))
      }

      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            status: 'locked',
            datesLocked: true,
            lockedStartDate,
            lockedEndDate,
            itineraryStatus: 'collecting_ideas' // Default to collecting ideas when locked
          }
        }
      )
      
      // Get voting status for celebration message (if in voting stage)
      let winningOption = null
      
      if (tripStatus === 'voting') {
        // Get active travelers for voting status
        const allParticipants = await db.collection('trip_participants').find({ tripId }).toArray()
        let effectiveActiveUserIds
        
        if (trip.type === 'collaborative') {
          const circleMemberships = await db.collection('memberships').find({ circleId: trip.circleId }).toArray()
          const circleMemberUserIds = new Set(circleMemberships.map(m => m.userId))
          effectiveActiveUserIds = new Set()
          
          circleMemberUserIds.forEach(userId => {
            const participant = allParticipants.find(p => p.userId === userId)
            const status = participant ? (participant.status || 'active') : 'active'
            if (status === 'active') {
              effectiveActiveUserIds.add(userId)
            }
          })
        } else {
          effectiveActiveUserIds = new Set(allParticipants.filter(p => (p.status || 'active') === 'active').map(p => p.userId))
        }
        
        const travelers = Array.from(effectiveActiveUserIds).map(userId => {
          const participant = allParticipants.find(p => p.userId === userId)
          return { id: userId, name: participant?.userName || 'Unknown' }
        })
        
        // Get votes for voting status computation
        const votes = await db.collection('votes').find({ tripId }).toArray()
        const tripWithVotes = { ...trip, votes: votes.map(v => ({ userId: v.userId, optionKey: v.optionKey, voterName: v.voterName || v.userName })) }
        
        const votingStatus = getVotingStatus(tripWithVotes, travelers, auth.user.id)
        
        // Find winning option by matching locked dates or optionKey
        if (optionKey && votingStatus.options.length > 0) {
          // If optionKey provided, use it to find matching option
          winningOption = votingStatus.options.find(opt => opt.optionKey === optionKey)
        } else if (votingStatus.leadingOption) {
          // Use leading option (tie-breaking already handled by leader's choice)
          winningOption = votingStatus.leadingOption
        }
      }
      
      // Format dates for display
      const formatDate = (dateStr) => {
        if (!dateStr) return ''
        try {
          return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        } catch {
          return dateStr
        }
      }
      
      const startDateFormatted = formatDate(lockedStartDate)
      const endDateFormatted = formatDate(lockedEndDate)
      const dateRange = startDateFormatted && endDateFormatted ? `${startDateFormatted}–${endDateFormatted}` : ''
      
      // Emit single consolidated message for dates locked and itinerary planning
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      const lockMessage = dateRange 
        ? `Dates ${dateRange} are locked. Itinerary planning is now open — start sharing ideas.`
        : 'Dates are locked. Itinerary planning is now open — start sharing ideas.'
      
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: null,
        subtype: 'milestone',
        text: lockMessage,
        metadata: {
          key: 'dates_locked',
          startDate: lockedStartDate,
          endDate: lockedEndDate
        },
        dedupeKey: `dates_locked_${tripId}`
      })
      
      // Fetch updated trip to return full trip object for immediate UI update
      // This ensures progress pane, ChatTab CTAs, and stage routing update without refresh
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })
      
      // Return updated trip - client will merge this into trip state
      // The trip object includes status='locked' and lockedStartDate/lockedEndDate
      // Client-side stage computation (deriveTripPrimaryStage) will handle the rest
      return handleCORS(NextResponse.json(updatedTrip))
    }

    // ============================================
    // DATE-LOCKING FUNNEL V2 ENDPOINTS
    // Phases: COLLECTING → PROPOSED → LOCKED
    // ============================================

    // Get date windows - GET /api/trips/:id/date-windows
    // Returns windows with support counts and proposal readiness
    if (route.match(/^\/trips\/[^/]+\/date-windows$/) && method === 'GET') {
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
        return handleCORS(NextResponse.json({ error: 'You are not a member of this circle' }, { status: 403 }))
      }

      // Get windows and supports
      const windows = await db.collection('date_windows').find({ tripId }).sort({ createdAt: 1 }).toArray()
      const supports = await db.collection('window_supports').find({ tripId }).toArray()

      // Get travelers for proposal readiness calculation
      const { computeProposalReady, getSchedulingPhase } = await import('@/lib/trips/proposalReady.js')

      let travelers = []
      if (trip.type === 'collaborative') {
        const memberships = await db.collection('memberships').find({ circleId: trip.circleId }).toArray()
        const participants = await db.collection('trip_participants').find({ tripId }).toArray()
        const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))

        travelers = memberships
          .filter(m => {
            const status = statusMap.get(m.userId)
            return !status || status === 'active'
          })
          .map(m => ({ id: m.userId }))
      } else {
        const participants = await db.collection('trip_participants').find({ tripId, status: 'active' }).toArray()
        travelers = participants.map(p => ({ id: p.userId }))
      }

      // Compute proposal readiness
      const proposalStatus = computeProposalReady(trip, travelers, windows, supports)
      const phase = getSchedulingPhase(trip)

      // Enrich windows with support counts
      const enrichedWindows = windows.map(w => {
        const windowSupports = supports.filter(s => s.windowId === w.id)
        return {
          ...w,
          supportCount: windowSupports.length,
          supporterIds: windowSupports.map(s => s.userId),
          isProposed: trip.proposedWindowId === w.id
        }
      })

      // Check if current user supports each window
      const userSupports = supports.filter(s => s.userId === auth.user.id)
      const userSupportedWindowIds = new Set(userSupports.map(s => s.windowId))

      // Get user's window count and max
      const { WINDOW_CONFIG } = await import('@/lib/trips/normalizeWindow.js')
      const userWindowCount = windows.filter(w => w.proposedBy === auth.user.id).length

      return handleCORS(NextResponse.json({
        phase,
        windows: enrichedWindows,
        proposalStatus,
        userSupportedWindowIds: Array.from(userSupportedWindowIds),
        proposedWindowId: trip.proposedWindowId || null,
        isLeader: trip.createdBy === auth.user.id,
        userWindowCount,
        maxWindows: WINDOW_CONFIG.MAX_WINDOWS_PER_USER,
        canCreateWindow: phase === 'COLLECTING' && userWindowCount < WINDOW_CONFIG.MAX_WINDOWS_PER_USER
      }))
    }

    // Create date window - POST /api/trips/:id/date-windows
    // Supports both structured (startDate/endDate) and free-form (text) input
    // Blocked when in PROPOSED phase
    // Enforces per-user cap and overlap detection
    if (route.match(/^\/trips\/[^/]+\/date-windows$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { startDate, endDate, text, acknowledgeOverlap, forceAccept } = body

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action (blocks in PROPOSED and LOCKED phases)
      const validation = validateStageAction(trip, 'submit_date_window', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json({ error: validation.message }, { status: validation.status }))
      }

      // Check membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      if (!membership) {
        return handleCORS(NextResponse.json({ error: 'You are not a member of this circle' }, { status: 403 }))
      }

      // Check if user is active participant
      const isActive = await isActiveTraveler(db, trip, auth.user.id)
      if (!isActive) {
        return handleCORS(NextResponse.json({ error: 'You are not an active participant in this trip' }, { status: 403 }))
      }

      // Import normalization and overlap modules
      const { normalizeWindow, validateWindowBounds, WINDOW_CONFIG } = await import('@/lib/trips/normalizeWindow.js')
      const { getMostSimilarWindow } = await import('@/lib/trips/windowOverlap.js')

      // Get existing windows for this trip
      const existingWindows = await db.collection('date_windows').find({ tripId }).toArray()

      // Enforce per-user cap
      const userWindowCount = existingWindows.filter(w => w.proposedBy === auth.user.id).length
      if (userWindowCount >= WINDOW_CONFIG.MAX_WINDOWS_PER_USER) {
        return handleCORS(NextResponse.json({
          error: `You've already suggested ${WINDOW_CONFIG.MAX_WINDOWS_PER_USER} date options. Support an existing one or wait for the leader to lock dates.`,
          code: 'USER_WINDOW_CAP_REACHED',
          userWindowCount,
          maxWindows: WINDOW_CONFIG.MAX_WINDOWS_PER_USER
        }, { status: 400 }))
      }

      // Determine normalized dates - either from explicit fields or free-form text
      let normalizedStart, normalizedEnd, precision, sourceText

      if (text && typeof text === 'string' && text.trim()) {
        // Free-form text input - try to normalize it
        sourceText = text.trim()
        const context = {
          startBound: trip.startBound || trip.startDate,
          endBound: trip.endBound || trip.endDate
        }
        const normResult = normalizeWindow(sourceText, context)
        if (normResult.error) {
          // If forceAccept is true, accept the text as-is without normalized dates
          if (forceAccept) {
            normalizedStart = null
            normalizedEnd = null
            precision = 'unstructured'
          } else {
            return handleCORS(NextResponse.json({ error: normResult.error }, { status: 400 }))
          }
        } else {
          normalizedStart = normResult.startISO
          normalizedEnd = normResult.endISO
          precision = normResult.precision
        }
      } else if (startDate && endDate) {
        // Structured input - validate format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
          return handleCORS(NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 }))
        }
        if (startDate > endDate) {
          return handleCORS(NextResponse.json({ error: 'Start date must be before or equal to end date' }, { status: 400 }))
        }
        normalizedStart = startDate
        normalizedEnd = endDate
        precision = 'exact'
        sourceText = `${startDate} to ${endDate}`

        // Check max window length
        const daysDiff = Math.round((new Date(endDate + 'T12:00:00') - new Date(startDate + 'T12:00:00')) / (1000 * 60 * 60 * 24)) + 1
        if (daysDiff > WINDOW_CONFIG.MAX_WINDOW_DAYS) {
          return handleCORS(NextResponse.json({
            error: `That's ${daysDiff} days, which is longer than the ${WINDOW_CONFIG.MAX_WINDOW_DAYS}-day limit. Try a shorter range.`
          }, { status: 400 }))
        }
      } else {
        return handleCORS(NextResponse.json({
          error: 'Please provide dates. Use "text" for free-form input (e.g., "Feb 7-9") or "startDate" and "endDate" for structured input.'
        }, { status: 400 }))
      }

      // Only validate dates if we have normalized dates (skip for unstructured)
      let similarMatch = null
      if (precision !== 'unstructured' && normalizedStart && normalizedEnd) {
        // Validate dates are within trip bounds
        const boundsCheck = validateWindowBounds(
          normalizedStart,
          normalizedEnd,
          trip.startBound || trip.startDate,
          trip.endBound || trip.endDate
        )
        if (!boundsCheck.valid) {
          return handleCORS(NextResponse.json({ error: boundsCheck.error }, { status: 400 }))
        }

        // Check for exact duplicate (same normalized dates by same user)
        const exactDuplicate = existingWindows.find(w =>
          w.proposedBy === auth.user.id &&
          (w.normalizedStart || w.startDate) === normalizedStart &&
          (w.normalizedEnd || w.endDate) === normalizedEnd
        )
        if (exactDuplicate) {
          return handleCORS(NextResponse.json({ error: 'You have already proposed this date range' }, { status: 400 }))
        }

        // Check for similar windows (overlap detection)
        const newWindowForComparison = { startISO: normalizedStart, endISO: normalizedEnd }
        similarMatch = getMostSimilarWindow(newWindowForComparison, existingWindows)

        // If similar window found and user hasn't acknowledged, return nudge without creating
        if (similarMatch && !acknowledgeOverlap) {
          return handleCORS(NextResponse.json({
            similarWindowId: similarMatch.windowId,
            similarScore: similarMatch.score,
            pendingWindow: { normalizedStart, normalizedEnd, sourceText, precision },
            message: 'Similar date range exists. Support it or create anyway.',
            requiresAcknowledgement: true
          }))
        }
      }

      // Create window with normalized fields
      const windowId = uuidv4()
      const window = {
        id: windowId,
        tripId,
        proposedBy: auth.user.id,
        // Original fields for backward compatibility
        startDate: normalizedStart,
        endDate: normalizedEnd,
        // New normalized fields
        sourceText,
        normalizedStart,
        normalizedEnd,
        precision,
        createdAt: new Date().toISOString()
      }
      await db.collection('date_windows').insertOne(window)

      // Auto-support the window you created
      await db.collection('window_supports').insertOne({
        id: uuidv4(),
        windowId,
        tripId,
        userId: auth.user.id,
        createdAt: new Date().toISOString()
      })

      // Auto-transition from proposed to scheduling on first window
      if (trip.status === 'proposed') {
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { status: 'scheduling' } }
        )
      }

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      const formatDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
      const chatText = precision === 'unstructured'
        ? `📅 ${auth.user.name} proposed dates: "${sourceText}"`
        : `📅 ${auth.user.name} proposed dates: ${formatDate(normalizedStart)}–${formatDate(normalizedEnd)}`
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'window_proposed',
        text: chatText,
        metadata: { windowId, startDate: normalizedStart, endDate: normalizedEnd, sourceText }
      })

      // Build response with similarity info if applicable
      const response = {
        window,
        message: 'Date window created',
        userWindowCount: userWindowCount + 1,
        maxWindows: WINDOW_CONFIG.MAX_WINDOWS_PER_USER
      }

      if (similarMatch) {
        response.similarWindowId = similarMatch.windowId
        response.similarScore = similarMatch.score
      }

      return handleCORS(NextResponse.json(response))
    }

    // Support a date window - POST /api/trips/:id/date-windows/:windowId/support
    if (route.match(/^\/trips\/[^/]+\/date-windows\/[^/]+\/support$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const windowId = path[3]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action
      const validation = validateStageAction(trip, 'support_window', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json({ error: validation.message }, { status: validation.status }))
      }

      // Check window exists
      const window = await db.collection('date_windows').findOne({ id: windowId, tripId })
      if (!window) {
        return handleCORS(NextResponse.json({ error: 'Window not found' }, { status: 404 }))
      }

      // Check if user is active participant
      const isActive = await isActiveTraveler(db, trip, auth.user.id)
      if (!isActive) {
        return handleCORS(NextResponse.json({ error: 'You are not an active participant in this trip' }, { status: 403 }))
      }

      // Check if already supporting
      const existingSupport = await db.collection('window_supports').findOne({
        windowId,
        userId: auth.user.id
      })
      if (existingSupport) {
        return handleCORS(NextResponse.json({ error: 'You already support this window' }, { status: 400 }))
      }

      // Add support
      await db.collection('window_supports').insertOne({
        id: uuidv4(),
        windowId,
        tripId,
        userId: auth.user.id,
        createdAt: new Date().toISOString()
      })

      return handleCORS(NextResponse.json({ message: 'Support added' }))
    }

    // Remove support from a date window - DELETE /api/trips/:id/date-windows/:windowId/support
    if (route.match(/^\/trips\/[^/]+\/date-windows\/[^/]+\/support$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const windowId = path[3]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action
      const validation = validateStageAction(trip, 'support_window', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json({ error: validation.message }, { status: validation.status }))
      }

      // Remove support
      const result = await db.collection('window_supports').deleteOne({
        windowId,
        tripId,
        userId: auth.user.id
      })

      if (result.deletedCount === 0) {
        return handleCORS(NextResponse.json({ error: 'Support not found' }, { status: 404 }))
      }

      return handleCORS(NextResponse.json({ message: 'Support removed' }))
    }

    // Propose dates - POST /api/trips/:id/propose-dates
    // Leader proposes a window. Gated by proposalReady || leaderOverride
    if (route.match(/^\/trips\/[^/]+\/propose-dates$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json()
      const { windowId, leaderOverride = false, concreteDates } = body

      if (!windowId) {
        return handleCORS(NextResponse.json({ error: 'windowId is required' }, { status: 400 }))
      }

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action (checks leader permission, blocks if already proposed or locked)
      const validation = validateStageAction(trip, 'propose_dates', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json({ error: validation.message }, { status: validation.status }))
      }

      // Check window exists
      let window = await db.collection('date_windows').findOne({ id: windowId, tripId })
      if (!window) {
        return handleCORS(NextResponse.json({ error: 'Window not found' }, { status: 404 }))
      }

      // If window is unstructured, leader must supply concrete dates
      if (window.precision === 'unstructured') {
        if (!concreteDates || !concreteDates.startDate || !concreteDates.endDate) {
          return handleCORS(NextResponse.json({
            error: 'This date option needs concrete dates before it can be proposed.',
            code: 'REQUIRES_CONCRETE_DATES',
            windowId,
            sourceText: window.sourceText
          }, { status: 400 }))
        }

        // Validate concrete dates format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(concreteDates.startDate) || !dateRegex.test(concreteDates.endDate)) {
          return handleCORS(NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format' }, { status: 400 }))
        }
        if (concreteDates.startDate > concreteDates.endDate) {
          return handleCORS(NextResponse.json({ error: 'Start date must be before or equal to end date' }, { status: 400 }))
        }

        // Update the window with concrete dates
        await db.collection('date_windows').updateOne(
          { id: windowId },
          {
            $set: {
              startDate: concreteDates.startDate,
              endDate: concreteDates.endDate,
              normalizedStart: concreteDates.startDate,
              normalizedEnd: concreteDates.endDate,
              precision: 'exact',
              concretizedAt: new Date().toISOString(),
              concretizedBy: auth.user.id
            }
          }
        )

        // Refresh window data
        window = await db.collection('date_windows').findOne({ id: windowId, tripId })
      }

      // Get travelers and supports for proposal readiness check
      const { canLeaderPropose } = await import('@/lib/trips/proposalReady.js')

      let travelers = []
      if (trip.type === 'collaborative') {
        const memberships = await db.collection('memberships').find({ circleId: trip.circleId }).toArray()
        const participants = await db.collection('trip_participants').find({ tripId }).toArray()
        const statusMap = new Map(participants.map(p => [p.userId, p.status || 'active']))

        travelers = memberships
          .filter(m => {
            const status = statusMap.get(m.userId)
            return !status || status === 'active'
          })
          .map(m => ({ id: m.userId }))
      } else {
        const participants = await db.collection('trip_participants').find({ tripId, status: 'active' }).toArray()
        travelers = participants.map(p => ({ id: p.userId }))
      }

      const windows = await db.collection('date_windows').find({ tripId }).toArray()
      const supports = await db.collection('window_supports').find({ tripId }).toArray()

      // Check if leader can propose (threshold met OR override)
      const proposalCheck = canLeaderPropose(trip, travelers, windows, supports, leaderOverride)
      if (!proposalCheck.canPropose) {
        return handleCORS(NextResponse.json({
          error: 'Cannot propose dates yet. Not enough travelers have indicated their availability.',
          proposalStatus: proposalCheck
        }, { status: 400 }))
      }

      // Set the proposed window
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            proposedWindowId: windowId,
            proposedAt: new Date().toISOString(),
            proposedByOverride: leaderOverride
          }
        }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'dates_proposed',
        text: `📅 ${auth.user.name} proposed ${formatDate(window.startDate)}–${formatDate(window.endDate)} for the trip`,
        metadata: { windowId, startDate: window.startDate, endDate: window.endDate }
      })

      // Get updated trip
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })

      return handleCORS(NextResponse.json({
        message: 'Dates proposed',
        trip: updatedTrip,
        proposedWindow: window
      }))
    }

    // Withdraw proposal - POST /api/trips/:id/withdraw-proposal
    // Returns trip from PROPOSED back to COLLECTING
    if (route.match(/^\/trips\/[^/]+\/withdraw-proposal$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Validate stage action (checks leader permission, requires active proposal)
      const validation = validateStageAction(trip, 'withdraw_proposal', auth.user.id, circle)
      if (!validation.ok) {
        return handleCORS(NextResponse.json({ error: validation.message }, { status: validation.status }))
      }

      // Clear the proposed window
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $unset: {
            proposedWindowId: '',
            proposedAt: '',
            proposedByOverride: ''
          }
        }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'proposal_withdrawn',
        text: `📅 ${auth.user.name} withdrew the date proposal. You can propose new dates.`,
        metadata: {}
      })

      // Get updated trip
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })

      return handleCORS(NextResponse.json({
        message: 'Proposal withdrawn',
        trip: updatedTrip
      }))
    }

    // Lock dates from proposed window - POST /api/trips/:id/lock-proposed
    // Locks the currently proposed window (new funnel flow)
    if (route.match(/^\/trips\/[^/]+\/lock-proposed$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      const circle = await db.collection('circles').findOne({ id: trip?.circleId })

      // Check leader permission
      const isLeader = trip.createdBy === auth.user.id || circle?.ownerId === auth.user.id
      if (!isLeader) {
        return handleCORS(NextResponse.json({ error: 'Only the trip leader can lock dates' }, { status: 403 }))
      }

      // Check if already locked
      if (trip.status === 'locked' || trip.lockedStartDate) {
        return handleCORS(NextResponse.json({ error: 'Trip dates are already locked' }, { status: 400 }))
      }

      // Must have a proposed window
      if (!trip.proposedWindowId) {
        return handleCORS(NextResponse.json({ error: 'No dates are proposed. Propose dates first.' }, { status: 400 }))
      }

      // Get the proposed window
      const proposedWindow = await db.collection('date_windows').findOne({ id: trip.proposedWindowId })
      if (!proposedWindow) {
        return handleCORS(NextResponse.json({ error: 'Proposed window not found' }, { status: 404 }))
      }

      // Lock the dates
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            status: 'locked',
            lockedStartDate: proposedWindow.startDate,
            lockedEndDate: proposedWindow.endDate,
            lockedAt: new Date().toISOString(),
            lockedFromWindowId: proposedWindow.id,
            itineraryStatus: 'collecting_ideas'
          }
        }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      const formatDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: null,
        subtype: 'milestone',
        text: `Dates ${formatDate(proposedWindow.startDate)}–${formatDate(proposedWindow.endDate)} are locked. Itinerary planning is now open — start sharing ideas.`,
        metadata: {
          key: 'dates_locked',
          startDate: proposedWindow.startDate,
          endDate: proposedWindow.endDate
        },
        dedupeKey: `dates_locked_${tripId}`
      })

      // Get updated trip
      const updatedTrip = await db.collection('trips').findOne({ id: tripId })

      return handleCORS(NextResponse.json(updatedTrip))
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
      
      // Emit chat event for traveler joined
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'traveler_joined',
        text: `👋 ${auth.user.name} joined the trip!`,
        metadata: {
          userId: auth.user.id
        }
      })
      
      return handleCORS(NextResponse.json({ message: 'Joined trip successfully' }))
    }
    
    // Leave trip - POST /api/trips/:tripId/leave
    // For multi-member trips, leaders must transfer leadership before leaving
    if (route.match(/^\/trips\/[^/]+\/leave$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json().catch(() => ({})) // Optional body for transferToUserId
      const transferToUserId = body.transferToUserId
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check membership (circle-first requirement)
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
      
      // Get active participant count
      const allParticipants = await db.collection('trip_participants')
        .find({ tripId })
        .toArray()
      
      let activeMemberCount
      let effectiveActiveUserIds
      
      if (trip.type === 'collaborative') {
        // For collaborative trips: count circle members minus those who left/removed
        const circleMemberships = await db.collection('memberships')
          .find({ circleId: trip.circleId })
          .toArray()
        effectiveActiveUserIds = new Set(circleMemberships.map(m => m.userId))
        
        // Subtract those who left/removed
        allParticipants.forEach(p => {
          const status = p.status || 'active'
          if ((status === 'left' || status === 'removed') && effectiveActiveUserIds.has(p.userId)) {
            effectiveActiveUserIds.delete(p.userId)
          }
        })
        activeMemberCount = effectiveActiveUserIds.size
      } else {
        // Hosted trips: count active participants
        const activeParticipants = allParticipants.filter(p => {
          const status = p.status || 'active'
          return status === 'active'
        })
        effectiveActiveUserIds = new Set(activeParticipants.map(p => p.userId))
        activeMemberCount = effectiveActiveUserIds.size
      }
      
      const isTripLeader = trip.createdBy === auth.user.id
      
      // SOLO TRIP: Cannot leave, must delete
      if (activeMemberCount === 1) {
        return handleCORS(NextResponse.json(
          { error: 'Cannot leave a solo trip. Delete the trip instead.' },
          { status: 403 }
        ))
      }
      
      // MULTI-MEMBER TRIP: Leader must transfer before leaving
      if (isTripLeader) {
        if (!transferToUserId) {
          return handleCORS(NextResponse.json(
            { error: 'Trip Leader must transfer leadership before leaving. Please select a new leader.' },
            { status: 400 }
          ))
        }
        
        // Validate transferToUserId is an active member (and not the current leader)
        if (transferToUserId === auth.user.id) {
          return handleCORS(NextResponse.json(
            { error: 'Cannot transfer leadership to yourself' },
            { status: 400 }
          ))
        }
        
        if (!effectiveActiveUserIds.has(transferToUserId)) {
          return handleCORS(NextResponse.json(
            { error: 'New leader must be an active member of the trip' },
            { status: 403 }
          ))
        }
        
        // Transfer leadership: update trip.createdBy
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { createdBy: transferToUserId } }
        )
      }
      
      // Find participant record (may not exist for collaborative trips created before this feature)
      let participant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      // If no participant record exists, create one with status "left"
      // This handles collaborative trips where participants weren't explicitly tracked
      if (!participant) {
        // For collaborative trips: if user is circle member, they are a virtual participant
        // For hosted trips: user must have an existing record to leave
        if (trip.type === 'collaborative') {
          // User is circle member (already verified above), so create left record
          participant = {
            id: uuidv4(),
            tripId,
            userId: auth.user.id,
            status: 'left',
            leftAt: new Date().toISOString(),
            removedAt: null,
            removedBy: null,
            joinedAt: new Date().toISOString() // Estimate - they were implicitly a participant
          }
          await db.collection('trip_participants').insertOne(participant)
        } else {
          // Hosted trip - user must have a participant record to leave
          return handleCORS(NextResponse.json(
            { error: 'You are not a participant in this trip' },
            { status: 403 }
          ))
        }
      } else {
        // Check if user is already left/removed
        const currentStatus = participant.status || 'active'
        if (currentStatus !== 'active') {
          return handleCORS(NextResponse.json(
            { error: `You have already ${currentStatus === 'left' ? 'left' : 'been removed from'} this trip` },
            { status: 403 }
          ))
        }
        
        // Update participant record to mark as left
        await db.collection('trip_participants').updateOne(
          { tripId, userId: auth.user.id },
          {
            $set: {
              status: 'left',
              leftAt: new Date().toISOString()
            }
          }
        )
      }
      
      // Emit chat event for traveler left (and leadership transfer if applicable)
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      if (isTripLeader && transferToUserId) {
        // Emit leadership transfer event
        const newLeader = await db.collection('users').findOne({ id: transferToUserId })
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'leadership_transferred',
          text: `${auth.user.name} transferred trip leadership to ${newLeader?.name || 'another member'}`,
          metadata: {
            previousLeaderId: auth.user.id,
            newLeaderId: transferToUserId
          }
        })
      }
      
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'traveler_left',
        text: `${auth.user.name} left the trip`,
        metadata: {
          userId: auth.user.id
        }
      })
      
      // Return success with transfer info if applicable
      const response = { message: 'Left trip successfully' }
      if (isTripLeader && transferToUserId) {
        response.leadershipTransferred = true
        response.newLeaderId = transferToUserId
      }
      
      return handleCORS(NextResponse.json(response))
    }

    // Transfer leadership (initiate pending transfer) - POST /api/trips/:tripId/transfer-leadership
    // Creates a pending transfer that must be accepted by the recipient
    if (route.match(/^\/trips\/[^/]+\/transfer-leadership$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const body = await request.json().catch(() => ({}))
      const { newLeaderId } = body

      if (!newLeaderId) {
        return handleCORS(NextResponse.json(
          { error: 'newLeaderId is required' },
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

      // Only current leader can initiate transfer
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip leader can transfer leadership' },
          { status: 403 }
        ))
      }

      // Cannot transfer to yourself
      if (newLeaderId === auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Cannot transfer leadership to yourself' },
          { status: 400 }
        ))
      }

      // Check if there's already a pending transfer
      if (trip.pendingLeadershipTransfer) {
        return handleCORS(NextResponse.json(
          { error: 'A leadership transfer is already pending. Cancel it before initiating a new one.' },
          { status: 400 }
        ))
      }

      // Validate new leader is an active traveler
      const newLeaderIsActive = await isActiveTraveler(db, trip, newLeaderId)
      if (!newLeaderIsActive) {
        return handleCORS(NextResponse.json(
          { error: 'New leader must be an active traveler of the trip' },
          { status: 403 }
        ))
      }

      // Create pending transfer
      const pendingTransfer = {
        toUserId: newLeaderId,
        fromUserId: auth.user.id,
        createdAt: new Date().toISOString()
      }

      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { pendingLeadershipTransfer: pendingTransfer } }
      )

      // Get new leader info for system message
      const newLeader = await db.collection('users').findOne({ id: newLeaderId })

      // Emit system message about pending transfer
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'leadership_transfer_pending',
        text: `${auth.user.name} requested to transfer trip leadership to ${newLeader?.name || 'another member'}`,
        metadata: {
          fromUserId: auth.user.id,
          toUserId: newLeaderId
        }
      })

      return handleCORS(NextResponse.json({
        message: 'Leadership transfer initiated. Waiting for acceptance.',
        pendingLeadershipTransfer: pendingTransfer
      }))
    }

    // Accept leadership transfer - POST /api/trips/:tripId/transfer-leadership/accept
    if (route.match(/^\/trips\/[^/]+\/transfer-leadership\/accept$/) && method === 'POST') {
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

      // Check if there's a pending transfer
      if (!trip.pendingLeadershipTransfer) {
        return handleCORS(NextResponse.json(
          { error: 'No pending leadership transfer to accept' },
          { status: 400 }
        ))
      }

      // Only the intended recipient can accept
      if (trip.pendingLeadershipTransfer.toUserId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the intended recipient can accept the transfer' },
          { status: 403 }
        ))
      }

      // Verify recipient is still an active traveler
      const isStillActive = await isActiveTraveler(db, trip, auth.user.id)
      if (!isStillActive) {
        // Clear the pending transfer since recipient is no longer active
        await db.collection('trips').updateOne(
          { id: tripId },
          { $unset: { pendingLeadershipTransfer: '' } }
        )
        return handleCORS(NextResponse.json(
          { error: 'You are no longer an active traveler and cannot accept leadership' },
          { status: 403 }
        ))
      }

      const previousLeaderId = trip.createdBy

      // Accept transfer: update createdBy and clear pending transfer
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: { createdBy: auth.user.id },
          $unset: { pendingLeadershipTransfer: '' }
        }
      )

      // Get previous leader info for system message
      const previousLeader = await db.collection('users').findOne({ id: previousLeaderId })

      // Emit system message
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'leadership_transferred',
        text: `${auth.user.name} accepted trip leadership from ${previousLeader?.name || 'the previous leader'}`,
        metadata: {
          previousLeaderId: previousLeaderId,
          newLeaderId: auth.user.id
        }
      })

      return handleCORS(NextResponse.json({
        message: 'Leadership transfer accepted. You are now the trip leader.',
        newLeaderId: auth.user.id
      }))
    }

    // Decline leadership transfer - POST /api/trips/:tripId/transfer-leadership/decline
    if (route.match(/^\/trips\/[^/]+\/transfer-leadership\/decline$/) && method === 'POST') {
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

      // Check if there's a pending transfer
      if (!trip.pendingLeadershipTransfer) {
        return handleCORS(NextResponse.json(
          { error: 'No pending leadership transfer to decline' },
          { status: 400 }
        ))
      }

      // Only the intended recipient can decline
      if (trip.pendingLeadershipTransfer.toUserId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the intended recipient can decline the transfer' },
          { status: 403 }
        ))
      }

      const fromUserId = trip.pendingLeadershipTransfer.fromUserId

      // Decline transfer: clear pending transfer
      await db.collection('trips').updateOne(
        { id: tripId },
        { $unset: { pendingLeadershipTransfer: '' } }
      )

      // Get original leader info for system message
      const originalLeader = await db.collection('users').findOne({ id: fromUserId })

      // Emit system message
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'leadership_transfer_declined',
        text: `${auth.user.name} declined the leadership transfer from ${originalLeader?.name || 'the leader'}`,
        metadata: {
          fromUserId: fromUserId,
          declinedByUserId: auth.user.id
        }
      })

      return handleCORS(NextResponse.json({
        message: 'Leadership transfer declined.'
      }))
    }

    // Cancel pending leadership transfer - POST /api/trips/:tripId/transfer-leadership/cancel
    if (route.match(/^\/trips\/[^/]+\/transfer-leadership\/cancel$/) && method === 'POST') {
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

      // Check if there's a pending transfer
      if (!trip.pendingLeadershipTransfer) {
        return handleCORS(NextResponse.json(
          { error: 'No pending leadership transfer to cancel' },
          { status: 400 }
        ))
      }

      // Only the current leader (who initiated) can cancel
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip leader can cancel a pending transfer' },
          { status: 403 }
        ))
      }

      const toUserId = trip.pendingLeadershipTransfer.toUserId

      // Cancel transfer: clear pending transfer
      await db.collection('trips').updateOne(
        { id: tripId },
        { $unset: { pendingLeadershipTransfer: '' } }
      )

      // Get intended recipient info for system message
      const intendedRecipient = await db.collection('users').findOne({ id: toUserId })

      // Emit system message
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'leadership_transfer_canceled',
        text: `${auth.user.name} canceled the leadership transfer to ${intendedRecipient?.name || 'another member'}`,
        metadata: {
          canceledByUserId: auth.user.id,
          intendedRecipientUserId: toUserId
        }
      })

      return handleCORS(NextResponse.json({
        message: 'Leadership transfer canceled.'
      }))
    }

    // Cancel trip - POST /api/trips/:tripId/cancel
    // Leader-only: cancels trip at any time (sets tripStatus = CANCELLED)
    if (route.match(/^\/trips\/[^/]+\/cancel$/) && method === 'POST') {
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

      // Check if trip is already canceled (check both legacy status and new tripStatus)
      if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
        return handleCORS(NextResponse.json(
          {
            error: 'Trip has already been canceled',
            code: 'TRIP_ALREADY_CANCELED'
          },
          { status: 400 }
        ))
      }

      // Check if trip is already completed (check both legacy status and new tripStatus)
      if (trip.tripStatus === 'COMPLETED' || trip.status === 'completed') {
        return handleCORS(NextResponse.json(
          {
            error: 'Trip has already been completed',
            code: 'TRIP_ALREADY_COMPLETED'
          },
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

      // Only trip leader can cancel
      const isTripLeader = trip.createdBy === auth.user.id
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      const isCircleOwner = circle?.ownerId === auth.user.id

      if (!isTripLeader && !isCircleOwner) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can cancel the trip' },
          { status: 403 }
        ))
      }

      // Update trip status to canceled (set both tripStatus and legacy status)
      const now = new Date().toISOString()
      await db.collection('trips').updateOne(
        { id: tripId },
        {
          $set: {
            tripStatus: 'CANCELLED',
            status: 'canceled',
            canceledAt: now,
            canceledBy: auth.user.id,
            updatedAt: now
          }
        }
      )

      // Emit chat event for trip cancellation
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'milestone',
        text: `🚫 Trip "${trip.name}" has been canceled by ${auth.user.name}`,
        metadata: {
          key: 'trip_canceled'
        }
      })

      return handleCORS(NextResponse.json({
        message: 'Trip canceled successfully',
        trip: { id: tripId, status: 'canceled', tripStatus: 'CANCELLED' }
      }))
    }
    
    // ============ TRIP JOIN REQUESTS ROUTES ============
    
    // Create join request - POST /api/trips/:tripId/join-requests
    if (route.match(/^\/trips\/[^/]+\/join-requests$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { message } = body
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Check requester is a member of trip.circleId
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You must be a member of this circle to request to join the trip' },
          { status: 403 }
        ))
      }
      
      // Check if requester is already an active participant
      const existingParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      let isActiveParticipant = false
      if (trip.type === 'collaborative') {
        // For collaborative trips, circle membership means active participant unless overridden
        if (!existingParticipant || !existingParticipant.status || existingParticipant.status === 'active') {
          isActiveParticipant = true
        }
      } else {
        // For hosted trips, must have active participant record
        if (existingParticipant && (!existingParticipant.status || existingParticipant.status === 'active')) {
          isActiveParticipant = true
        }
      }
      
      if (isActiveParticipant) {
        return handleCORS(NextResponse.json(
          { error: 'You are already an active participant on this trip' },
          { status: 400 }
        ))
      }
      
      // Check for existing pending request (idempotent)
      const existingRequest = await db.collection('trip_join_requests').findOne({
        tripId,
        requesterId: auth.user.id,
        status: 'pending'
      })
      
      if (existingRequest) {
        return handleCORS(NextResponse.json({
          request: existingRequest,
          status: 'pending'
        }))
      }
      
      // Create new join request
      const joinRequest = {
        id: uuidv4(),
        tripId,
        circleId: trip.circleId,
        requesterId: auth.user.id,
        message: message || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decidedBy: null
      }
      
      await db.collection('trip_join_requests').insertOne(joinRequest)
      
      // Add system message to trip chat
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'join_request',
        text: `${auth.user.name} requested to join the trip`,
        metadata: { requestId: joinRequest.id }
      })
      
      return handleCORS(NextResponse.json({
        request: joinRequest,
        status: 'pending'
      }))
    }
    
    // Get join requests for trip (Trip Leader only) - GET /api/trips/:tripId/join-requests
    if (route.match(/^\/trips\/[^/]+\/join-requests$/) && method === 'GET') {
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
      
      // Only Trip Leader can view join requests
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the Trip Leader can view join requests' },
          { status: 403 }
        ))
      }
      
      // Get pending requests
      const requests = await db.collection('trip_join_requests')
        .find({ tripId, status: 'pending' })
        .sort({ createdAt: 1 })
        .toArray()
      
      // Get requester user info
      const requesterIds = [...new Set(requests.map(r => r.requesterId))]
      const requesters = await db.collection('users')
        .find({ id: { $in: requesterIds } })
        .toArray()
      const requesterMap = new Map(requesters.map(u => [u.id, u]))
      
      const requestsWithUsers = requests.map(req => ({
        id: req.id,
        requesterId: req.requesterId,
        requesterName: requesterMap.get(req.requesterId)?.name || 'Unknown',
        message: req.message,
        createdAt: req.createdAt
      }))
      
      return handleCORS(NextResponse.json(requestsWithUsers))
    }
    
    // Get current user's join request status - GET /api/trips/:tripId/join-requests/me
    if (route.match(/^\/trips\/[^/]+\/join-requests\/me$/) && method === 'GET') {
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
      
      // Get user's most recent request
      const request = await db.collection('trip_join_requests')
        .findOne(
          { tripId, requesterId: auth.user.id },
          { sort: { createdAt: -1 } }
        )
      
      if (!request) {
        return handleCORS(NextResponse.json({ status: 'none' }))
      }
      
      return handleCORS(NextResponse.json({
        status: request.status,
        requestId: request.id
      }))
    }
    
    // Approve/reject join request - PATCH /api/trips/:tripId/join-requests/:requestId
    if (route.match(/^\/trips\/[^/]+\/join-requests\/[^/]+$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const requestId = path[3]
      const body = await request.json()
      const { action } = body
      
      if (!action || (action !== 'approve' && action !== 'reject')) {
        return handleCORS(NextResponse.json(
          { error: 'Action must be "approve" or "reject"' },
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
      
      // Only Trip Leader can approve/reject
      if (trip.createdBy !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the Trip Leader can approve or reject join requests' },
          { status: 403 }
        ))
      }
      
      // Get the request
      const joinRequest = await db.collection('trip_join_requests').findOne({
        id: requestId,
        tripId
      })
      
      if (!joinRequest) {
        return handleCORS(NextResponse.json(
          { error: 'Join request not found' },
          { status: 404 }
        ))
      }
      
      if (joinRequest.status !== 'pending') {
        return handleCORS(NextResponse.json(
          { error: 'This request has already been processed' },
          { status: 400 }
        ))
      }
      
      const now = new Date().toISOString()
      
      if (action === 'approve') {
        // Update request status
        await db.collection('trip_join_requests').updateOne(
          { id: requestId },
          {
            $set: {
              status: 'approved',
              decidedAt: now,
              decidedBy: auth.user.id
            }
          }
        )
        
        // Upsert trip_participants record
        await db.collection('trip_participants').updateOne(
          { tripId, userId: joinRequest.requesterId },
          {
            $set: {
              tripId,
              userId: joinRequest.requesterId,
              status: 'active',
              role: 'member',
              joinedAt: now,
              leftAt: null,
              removedAt: null
            }
          },
          { upsert: true }
        )
        
        // Add system message
        const requester = await db.collection('users').findOne({ id: joinRequest.requesterId })
        const requesterName = requester?.name || 'Unknown'
        
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'traveler_joined',
          text: `${auth.user.name || 'Trip organizer'} approved ${requesterName}'s request to join`,
          metadata: { requestId }
        })
      } else {
        // Reject
        await db.collection('trip_join_requests').updateOne(
          { id: requestId },
          {
            $set: {
              status: 'rejected',
              decidedAt: now,
              decidedBy: auth.user.id
            }
          }
        )
        
        // Optional: Add system message for rejection
        const requester = await db.collection('users').findOne({ id: joinRequest.requesterId })
        const requesterName = requester?.name || 'Unknown'
        
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: null,
          subtype: 'join_request_rejected',
          text: `Join request from ${requesterName} was declined`,
          metadata: { requestId, requesterId: joinRequest.requesterId }
        })
      }
      
      // Return updated request
      const updatedRequest = await db.collection('trip_join_requests').findOne({ id: requestId })
      return handleCORS(NextResponse.json(updatedRequest))
    }

    // ============ TRIP INVITATIONS ============

    // Get invitations for trip - GET /api/trips/:tripId/invitations
    // Leader sees all pending invitations, regular users see only their own
    if (route.match(/^\/trips\/[^/]+\/invitations$/) && method === 'GET') {
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

      const isLeader = trip.createdBy === auth.user.id

      // Get invitations based on role
      const query = isLeader
        ? { tripId, status: 'pending' }
        : { tripId, invitedUserId: auth.user.id }

      const invitations = await db.collection('trip_invitations')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()

      // Get user info for invited users
      const userIds = [...new Set(invitations.map(i => i.invitedUserId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      const userMap = new Map(users.map(u => [u.id, u]))

      // Get inviter info
      const inviterIds = [...new Set(invitations.map(i => i.invitedBy))]
      const inviters = await db.collection('users')
        .find({ id: { $in: inviterIds } })
        .toArray()
      const inviterMap = new Map(inviters.map(u => [u.id, u]))

      const invitationsWithUsers = invitations.map(inv => ({
        id: inv.id,
        tripId: inv.tripId,
        invitedUserId: inv.invitedUserId,
        invitedUserName: userMap.get(inv.invitedUserId)?.name || 'Unknown',
        invitedBy: inv.invitedBy,
        inviterName: inviterMap.get(inv.invitedBy)?.name || 'Unknown',
        status: inv.status,
        createdAt: inv.createdAt,
        respondedAt: inv.respondedAt
      }))

      return handleCORS(NextResponse.json(invitationsWithUsers))
    }

    // Get current user's invitation - GET /api/trips/:tripId/invitations/me
    if (route.match(/^\/trips\/[^/]+\/invitations\/me$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      const invitation = await db.collection('trip_invitations')
        .findOne(
          { tripId, invitedUserId: auth.user.id },
          { sort: { createdAt: -1 } }
        )

      if (!invitation) {
        return handleCORS(NextResponse.json({ status: 'none' }))
      }

      // Get inviter info
      const inviter = await db.collection('users').findOne({ id: invitation.invitedBy })

      return handleCORS(NextResponse.json({
        id: invitation.id,
        status: invitation.status,
        inviterName: inviter?.name || 'Unknown',
        tripId: invitation.tripId,
        createdAt: invitation.createdAt
      }))
    }

    // Accept invitation - POST /api/trips/:tripId/invitations/:invitationId/accept
    if (route.match(/^\/trips\/[^/]+\/invitations\/[^/]+\/accept$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const invitationId = path[3]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }

      const invitation = await db.collection('trip_invitations').findOne({
        id: invitationId,
        tripId
      })

      if (!invitation) {
        return handleCORS(NextResponse.json(
          { error: 'Invitation not found' },
          { status: 404 }
        ))
      }

      // Only the invited user can accept
      if (invitation.invitedUserId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'You can only accept your own invitations' },
          { status: 403 }
        ))
      }

      if (invitation.status !== 'pending') {
        return handleCORS(NextResponse.json(
          { error: 'This invitation has already been responded to' },
          { status: 400 }
        ))
      }

      const now = new Date().toISOString()

      // Update invitation status
      await db.collection('trip_invitations').updateOne(
        { id: invitationId },
        {
          $set: {
            status: 'accepted',
            respondedAt: now
          }
        }
      )

      // Add as trip participant
      await db.collection('trip_participants').updateOne(
        { tripId, userId: auth.user.id },
        {
          $set: {
            tripId,
            userId: auth.user.id,
            status: 'active',
            invitedBy: invitation.invitedBy,
            joinedAt: now
          }
        },
        { upsert: true }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'traveler_joined',
        text: `✅ ${auth.user.name} accepted the invitation and joined the trip`,
        metadata: { invitationId }
      })

      return handleCORS(NextResponse.json({ success: true, status: 'accepted' }))
    }

    // Decline invitation - POST /api/trips/:tripId/invitations/:invitationId/decline
    if (route.match(/^\/trips\/[^/]+\/invitations\/[^/]+\/decline$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const invitationId = path[3]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }

      const invitation = await db.collection('trip_invitations').findOne({
        id: invitationId,
        tripId
      })

      if (!invitation) {
        return handleCORS(NextResponse.json(
          { error: 'Invitation not found' },
          { status: 404 }
        ))
      }

      // Only the invited user can decline
      if (invitation.invitedUserId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'You can only decline your own invitations' },
          { status: 403 }
        ))
      }

      if (invitation.status !== 'pending') {
        return handleCORS(NextResponse.json(
          { error: 'This invitation has already been responded to' },
          { status: 400 }
        ))
      }

      const now = new Date().toISOString()

      // Update invitation status
      await db.collection('trip_invitations').updateOne(
        { id: invitationId },
        {
          $set: {
            status: 'declined',
            respondedAt: now
          }
        }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: null,
        subtype: 'invitation_declined',
        text: `${auth.user.name} declined the invitation`,
        metadata: { invitationId, invitedUserId: auth.user.id }
      })

      return handleCORS(NextResponse.json({ success: true, status: 'declined' }))
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
    
    // Send circle message - POST /api/circles/:id/messages (DISABLED - Circle Lounge removed)
    if (route.match(/^\/circles\/[^/]+\/messages$/) && method === 'POST') {
      return handleCORS(NextResponse.json(
        { error: 'Circle Lounge chat has been removed. Use Trip Chat instead.' },
        { status: 410 }
      ))
    }
    
    // Get circle updates - GET /api/circles/:id/updates
    // Derived read-only digest from trip activity (trip creation, status changes, joins, votes)
    if (route.match(/^\/circles\/[^/]+\/updates$/) && method === 'GET') {
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
      const circleName = circle?.name || 'Circle'
      
      // Get all trips in this circle
      const trips = await db.collection('trips')
        .find({ circleId })
        .sort({ createdAt: -1 })
        .toArray()
      
      // Filter trips based on active travelers' privacy settings ("most restrictive wins")
      // If any active traveler has privacy='private', non-travelers cannot see the trip
      const { filterTripsByActiveTravelerPrivacy } = await import('@/lib/trips/canViewerSeeTrip.js')
      const visibleTrips = await filterTripsByActiveTravelerPrivacy({
        viewerId: auth.user.id,
        trips,
        db
      })
      
      // Get trip creators/leaders
      const tripCreatorIds = [...new Set(visibleTrips.map(t => t.createdBy).filter(Boolean))]
      const creators = tripCreatorIds.length > 0
        ? await db.collection('users')
            .find({ id: { $in: tripCreatorIds } })
            .toArray()
        : []
      const creatorMap = new Map(creators.map(u => [u.id, u.name]))
      
      // Build updates from trips
      const updates = []

      // Update: Circle members joined (including owner for circle creation marker)
      const circleMemberships = await db.collection('memberships')
        .find({ circleId })
        .sort({ joinedAt: -1 })
        .toArray()

      const circleMemberIds = [...new Set(circleMemberships.map(m => m.userId).filter(Boolean))]
      const circleMembers = circleMemberIds.length > 0
        ? await db.collection('users')
            .find({ id: { $in: circleMemberIds } })
            .toArray()
        : []
      const circleMemberMap = new Map(circleMembers.map(u => [u.id, u.name]))

      for (const member of circleMemberships) {
        if (member.joinedAt) {
          const userName = circleMemberMap.get(member.userId) || 'Unknown'
          const isOwner = member.role === 'owner'
          updates.push({
            id: `${isOwner ? 'circle-created' : 'circle-join'}-${circleId}-${member.userId}`,
            type: isOwner ? 'circle_created' : 'circle_member_joined',
            timestamp: member.joinedAt,
            circleId,
            circleName,
            actorId: member.userId,
            actorName: userName,
            message: isOwner
              ? `${userName} created ${circleName}`
              : `${userName} joined ${circleName}`
          })
        }
      }
      
      for (const trip of visibleTrips) {
        const tripName = trip.name
        const leaderName = creatorMap.get(trip.createdBy) || 'Unknown'
        
        // Update: Trip created
        if (trip.createdAt) {
          updates.push({
            id: `trip-created-${trip.id}`,
            type: 'trip_created',
            timestamp: trip.createdAt,
            tripId: trip.id,
            tripName,
            actorName: leaderName,
            message: `${tripName} created by ${leaderName}`
          })
        }
        
        // Update: Status changes (scheduling -> locked, dates locked)
        // Check if trip has locked dates (status = 'locked' or has lockedStartDate/lockedEndDate)
        const datesLocked = trip.status === 'locked' || (trip.lockedStartDate && trip.lockedEndDate)
        if (datesLocked && trip.updatedAt) {
          // Only show if updatedAt is more recent than createdAt (status actually changed)
          if (new Date(trip.updatedAt) > new Date(trip.createdAt || trip.updatedAt)) {
            updates.push({
              id: `trip-locked-${trip.id}`,
              type: 'dates_locked',
              timestamp: trip.updatedAt,
              tripId: trip.id,
              tripName,
              actorName: null,
              message: `${tripName} moved to Dates Locked`
            })
          }
        }
        
        // Update: Itinerary finalized
        if (trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published') {
          if (trip.updatedAt && new Date(trip.updatedAt) > new Date(trip.createdAt || trip.updatedAt)) {
            updates.push({
              id: `trip-itinerary-${trip.id}`,
              type: 'itinerary_finalized',
              timestamp: trip.updatedAt,
              tripId: trip.id,
              tripName,
              actorName: null,
              message: `${tripName} itinerary finalized`
            })
          }
        }
        
        // Update: Accommodation chosen (check if all stay requirements have selected accommodations)
        // For simplicity, we'll derive this from trip.updatedAt when accommodation is done
        // This is a lightweight check - full derivation would require checking accommodation_options
        // We'll check this via progress snapshot if available
        if (trip.status === 'locked') {
          const itineraryStatus = trip.itineraryStatus
          if (itineraryStatus === 'selected' || itineraryStatus === 'published') {
            // Accommodation is chosen when progress.steps.accommodationChosen is true
            // For now, we'll derive from updatedAt if accommodation exists
            // This is a simplified check - full implementation would check accommodation_options collection
          }
        }
      }
      
      // Get participants who joined trips (for collaborative trips, all circle members are participants)
      const allParticipants = await db.collection('trip_participants')
        .find({ tripId: { $in: visibleTrips.map(t => t.id) } })
        .sort({ joinedAt: -1 })
        .toArray()
      
      // Get user details for participants
      const participantUserIds = [...new Set(allParticipants.map(p => p.userId).filter(Boolean))]
      const participantUsers = participantUserIds.length > 0
        ? await db.collection('users')
            .find({ id: { $in: participantUserIds } })
            .toArray()
        : []
      const participantUserMap = new Map(participantUsers.map(u => [u.id, u.name]))
      
      // Add join events (only for explicit joins via trip_participants, not circle membership)
      for (const participant of allParticipants) {
        if (participant.joinedAt && participant.status === 'active') {
          const trip = visibleTrips.find(t => t.id === participant.tripId)
          if (trip) {
            // Only show if trip is collaborative and this is an explicit join (not just circle membership)
            // For hosted trips, all participants are explicit joins
            if (trip.type === 'hosted' || (trip.type === 'collaborative' && participant.joinedAt)) {
              const userName = participantUserMap.get(participant.userId) || 'Unknown'
              updates.push({
                id: `join-${participant.tripId}-${participant.userId}`,
                type: 'user_joined',
                timestamp: participant.joinedAt,
                tripId: participant.tripId,
                tripName: trip.name,
                actorName: userName,
                message: `${userName} joined ${trip.name}`
              })
            }
          }
        }
      }
      
      // Get votes
      const votes = await db.collection('votes')
        .find({ tripId: { $in: visibleTrips.map(t => t.id) } })
        .sort({ createdAt: -1 })
        .toArray()
      
      // Get user details for voters
      const voterIds = [...new Set(votes.map(v => v.userId).filter(Boolean))]
      const voters = voterIds.length > 0
        ? await db.collection('users')
            .find({ id: { $in: voterIds } })
            .toArray()
        : []
      const voterMap = new Map(voters.map(u => [u.id, u.name]))
      
      // Add vote events (only most recent vote per user per trip)
      const voteMap = new Map()
      for (const vote of votes) {
        const key = `${vote.tripId}-${vote.userId}`
        if (!voteMap.has(key) || new Date(vote.createdAt) > new Date(voteMap.get(key).createdAt)) {
          voteMap.set(key, vote)
        }
      }
      
      for (const vote of voteMap.values()) {
        const trip = visibleTrips.find(t => t.id === vote.tripId)
        if (trip && vote.createdAt) {
          const userName = voterMap.get(vote.userId) || 'Unknown'
          updates.push({
            id: `vote-${vote.tripId}-${vote.userId}`,
            type: 'user_voted',
            timestamp: vote.createdAt,
            tripId: vote.tripId,
            tripName: trip.name,
            actorName: userName,
            message: `${userName} voted on dates for ${trip.name}`
          })
        }
      }
      
      // Sort updates by timestamp (most recent first)
      updates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      
      // Limit to 50 most recent updates
      return handleCORS(NextResponse.json(updates.slice(0, 50)))
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
        subtype: m.subtype || null,
        metadata: m.metadata || {},
        createdAt: m.createdAt,
        userId: m.userId, // Include userId for own-message detection
        user: m.userId ? users.find(u => u.id === m.userId) : null
      })).map(m => ({
        ...m,
        user: m.user ? { id: m.user.id, name: m.user.name } : null
      }))
      
      // Derive system messages from trip events (lightweight, read-time derivation)
      // This complements existing persisted system messages for a complete timeline
      const derivedSystemMessages = []
      
      // Get trip status and relevant data
      const tripStatus = trip.status || (trip.type === 'hosted' ? 'locked' : 'scheduling')
      
      // Get votes for vote aggregation (only if trip is in voting stage)
      if (tripStatus === 'voting') {
        const votes = await db.collection('votes')
          .find({ tripId })
          .toArray()
        
        if (votes.length > 0) {
          // Get voter details
          const voterIds = [...new Set(votes.map(v => v.userId).filter(Boolean))]
          const voters = voterIds.length > 0
            ? await db.collection('users')
                .find({ id: { $in: voterIds } })
                .toArray()
            : []
          const voterMap = new Map(voters.map(u => [u.id, u.name]))
          
          // Get active participants count for total
          let activeParticipantCount = 0
          if (trip.type === 'collaborative') {
            const memberships = await db.collection('memberships')
              .find({ circleId: trip.circleId })
              .toArray()
            activeParticipantCount = memberships.length
          } else {
            const participants = await db.collection('trip_participants')
              .find({ tripId })
              .toArray()
            activeParticipantCount = participants.filter(p => (p.status || 'active') === 'active').length
          }
          
          const votedCount = votes.length
          
          // Only create aggregate vote message if we have votes and not everyone has voted yet
          // (to avoid spam - final vote message would be redundant with dates locked message)
          if (votedCount < activeParticipantCount && votedCount > 0) {
            // Check if vote aggregation message already exists (to avoid duplicates)
            const existingVoteMessage = messages.find(m => 
              m.isSystem && 
              m.subtype === 'votes_aggregate'
            )
            
            if (!existingVoteMessage) {
              // Create lightweight derived message for vote aggregation
              // Use most recent vote timestamp as the message timestamp
              const mostRecentVote = votes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
              derivedSystemMessages.push({
                id: `derived-votes-${tripId}`,
                content: `🗳️ ${votedCount}/${activeParticipantCount} voted on dates`,
                isSystem: true,
                subtype: 'votes_aggregate',
                metadata: { votedCount, totalCount: activeParticipantCount },
                createdAt: mostRecentVote.createdAt,
                user: null
              })
            }
          }
        }
      }
      
      // Combine messages and derived system messages, then sort chronologically
      const allMessages = [...messagesWithUsers, ...derivedSystemMessages].sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      )
      
      return handleCORS(NextResponse.json(allMessages))
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

      // Block messages on cancelled trips
      if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
        return handleCORS(NextResponse.json(
          { error: 'This trip has been canceled and is read-only' },
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

    // ============ TRIP INTELLIGENCE ROUTES (Phase 6 LLM) ============

    // Get trip intelligence (blocker detection, nudges) - GET /api/trips/:id/intelligence
    if (route.match(/^\/trips\/[^/]+\/intelligence$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      // Get trip data
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Check access
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      if (!membership) {
        return handleCORS(NextResponse.json({ error: 'Access denied' }, { status: 403 }))
      }

      // Skip AI for canceled/completed trips - return simple heuristic response
      if (trip.status === 'canceled' || trip.status === 'completed') {
        const blockerType = trip.status === 'canceled' ? 'READY' : 'READY'
        return handleCORS(NextResponse.json({
          blocker: {
            type: blockerType,
            confidence: 1.0,
            reasoning: `Trip is ${trip.status}`,
            usedLLM: false,
            cta: trip.status === 'canceled' ? 'Trip canceled' : 'Trip completed'
          },
          nudge: null,
          heuristicBlocker: { type: blockerType, cta: trip.status === 'canceled' ? 'Trip canceled' : 'Trip completed' },
          llmBlocker: null
        }))
      }

      // Get participants to check if trip has active travelers
      const activeParticipants = await db.collection('trip_participants')
        .find({ tripId, status: 'active' })
        .toArray()

      // Skip AI if no active travelers
      if (activeParticipants.length === 0) {
        return handleCORS(NextResponse.json({
          blocker: {
            type: 'READY',
            confidence: 1.0,
            reasoning: 'No active travelers',
            usedLLM: false,
            cta: 'No travelers'
          },
          nudge: null,
          heuristicBlocker: { type: 'READY', cta: 'No travelers' },
          llmBlocker: null
        }))
      }

      // Get recent messages for context
      const messages = await db.collection('trip_messages')
        .find({ tripId })
        .sort({ createdAt: -1 })
        .limit(30)
        .toArray()

      // Use already-fetched participants
      const totalMembers = activeParticipants.length || trip.activeTravelerCount || 1
      const respondedCount = trip.respondedCount || 0
      const votedCount = trip.votedCount || 0

      // Import LLM functions
      const { detectBlocker, generateNudge, summarizeConsensus, extractAccommodationPreferences } = await import('@/lib/server/llm.js')

      // Compute heuristic blocker first (fallback)
      const datesLocked = trip.status === 'locked' || !!(trip.lockedStartDate && trip.lockedEndDate)
      const itineraryFinalized = trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published'
      const accommodationChosen = trip.progress?.steps?.accommodationChosen || false

      let heuristicBlocker = { type: 'DATES', cta: 'Pick your dates' }
      if (datesLocked && !itineraryFinalized) {
        heuristicBlocker = { type: 'ITINERARY', cta: 'Plan your itinerary' }
      } else if (datesLocked && itineraryFinalized && !accommodationChosen) {
        heuristicBlocker = { type: 'ACCOMMODATION', cta: 'Choose accommodation' }
      } else if (datesLocked && itineraryFinalized && accommodationChosen) {
        heuristicBlocker = { type: 'READY', cta: 'Trip is ready!' }
      }

      // Detect blocker with LLM (uses heuristic as fallback)
      const blocker = await detectBlocker({
        trip,
        messages: messages.reverse(), // Chronological order
        participation: { totalMembers, respondedCount, votedCount },
        heuristicBlocker
      })

      // Generate nudge
      const nudge = await generateNudge({
        trip,
        participation: { totalMembers, respondedCount, votedCount },
        currentBlocker: blocker.type
      })

      // Only use LLM blocker if confidence is high enough, otherwise use heuristic
      const CONFIDENCE_THRESHOLD = 0.7
      const effectiveBlocker = blocker.usedLLM && blocker.confidence >= CONFIDENCE_THRESHOLD
        ? blocker
        : { ...heuristicBlocker, confidence: 1.0, reasoning: 'Rule-based detection', usedLLM: false }

      return handleCORS(NextResponse.json({
        blocker: effectiveBlocker,
        nudge,
        heuristicBlocker,
        llmBlocker: blocker.usedLLM ? blocker : null
      }))
    }

    // Get consensus summary - GET /api/trips/:id/consensus
    if (route.match(/^\/trips\/[^/]+\/consensus$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Check access
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      if (!membership) {
        return handleCORS(NextResponse.json({ error: 'Access denied' }, { status: 403 }))
      }

      // Skip AI for canceled/completed trips
      if (trip.status === 'canceled' || trip.status === 'completed') {
        return handleCORS(NextResponse.json({
          consensus: {
            agreements: [],
            unresolved: [],
            actionItems: [],
            summary: `Trip is ${trip.status}.`
          }
        }))
      }

      const messages = await db.collection('trip_messages')
        .find({ tripId })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

      const { summarizeConsensus } = await import('@/lib/server/llm.js')

      // Determine current blocker for context
      const datesLocked = trip.status === 'locked'
      const itineraryFinalized = trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published'
      let currentBlocker = 'DATES'
      if (datesLocked && !itineraryFinalized) currentBlocker = 'ITINERARY'
      else if (datesLocked && itineraryFinalized) currentBlocker = 'ACCOMMODATION'

      const consensus = await summarizeConsensus({
        messages: messages.reverse(),
        currentBlocker,
        tripContext: {
          status: trip.status,
          lockedDates: trip.lockedStartDate ? `${trip.lockedStartDate} to ${trip.lockedEndDate}` : null
        }
      })

      return handleCORS(NextResponse.json({ consensus }))
    }

    // Get accommodation preferences - GET /api/trips/:id/accommodation-preferences
    if (route.match(/^\/trips\/[^/]+\/accommodation-preferences$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]

      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json({ error: 'Trip not found' }, { status: 404 }))
      }

      // Check access
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId: trip.circleId
      })
      if (!membership) {
        return handleCORS(NextResponse.json({ error: 'Access denied' }, { status: 403 }))
      }

      // Skip AI for canceled/completed trips
      if (trip.status === 'canceled' || trip.status === 'completed') {
        return handleCORS(NextResponse.json({ preferences: null }))
      }

      const messages = await db.collection('trip_messages')
        .find({ tripId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      const participants = await db.collection('trip_participants')
        .find({ tripId, status: 'active' })
        .toArray()

      // Skip AI if no active travelers
      if (participants.length === 0) {
        return handleCORS(NextResponse.json({ preferences: null }))
      }

      const { extractAccommodationPreferences } = await import('@/lib/server/llm.js')

      const preferences = await extractAccommodationPreferences({
        messages: messages.reverse(),
        groupSize: participants.length || trip.activeTravelerCount || 1
      })

      return handleCORS(NextResponse.json({ preferences }))
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
      
      const allTrips = tripIds.length > 0 
        ? await db.collection('trips').find({ id: { $in: tripIds } }).toArray()
        : []
      
      // NOTE: In self contexts (circle pages, dashboard), we do NOT filter by trip owner's privacy.
      // "Upcoming Trips Visibility" only affects what others see on member profile pages.
      // All trips in user's circles are visible here based on membership/access.
      const trips = allTrips
      
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
        tripStatus: 'ACTIVE', // Lifecycle status: ACTIVE | CANCELLED | COMPLETED
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
      
      // Emit chat event for trip proposed from discover
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId: newTrip.id,
        circleId: circleId,
        actorUserId: auth.user.id,
        subtype: 'milestone',
        text: `${auth.user.name} proposed this trip inspired by a ${tripLength}-day itinerary. Add your availability and the group will decide the dates!`,
        metadata: {
          key: 'trip_proposed_from_discover',
          source: 'discover_itinerary'
        }
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
        tripStatus: 'ACTIVE', // Lifecycle status: ACTIVE | CANCELLED | COMPLETED
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
      
      // Emit chat event for trip proposed from discover (post-based)
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId: newTrip.id,
        circleId: circleId,
        actorUserId: auth.user.id,
        subtype: 'milestone',
        text: `${auth.user.name} proposed this trip inspired by a traveler's ${tripLength}-day itinerary. This itinerary worked for them - your group can customize it! Add your availability to get started.`,
        metadata: {
          key: 'trip_proposed_from_discover',
          source: 'discover_post'
        }
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

      // Block modifications on cancelled trips
      if (trip.tripStatus === 'CANCELLED' || trip.status === 'canceled') {
        return handleCORS(NextResponse.json(
          { error: 'This trip has been canceled and is read-only' },
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

      // Check if user is active participant (hasn't left)
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })

      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }
      // If no participant record exists for collaborative trips, user is implicitly active (backward compatibility)
      
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

      // Get itinerary content from version if available, or from itinerary items
      let itineraryContent = null
      const latestVersion = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })
      
      if (latestVersion && latestVersion.content) {
        itineraryContent = latestVersion.content
      } else {
        // Fallback: build from itinerary items
        const items = await db.collection('itinerary_items')
          .find({ itineraryId })
          .sort({ day: 1, order: 1 })
          .toArray()
        
        if (items.length > 0) {
          // Group by day
          const daysMap = new Map()
          items.forEach(item => {
            const dayNum = item.day || item.dayNumber || 1
            if (!daysMap.has(dayNum)) {
              daysMap.set(dayNum, {
                date: null, // Will use fallback
                blocks: []
              })
            }
            daysMap.get(dayNum).blocks.push({
              location: item.locationText || null,
              title: item.title || '',
              timeRange: item.timeBlock || ''
            })
          })
          itineraryContent = {
            days: Array.from(daysMap.entries()).map(([dayNum, dayData]) => ({
              date: null,
              blocks: dayData.blocks
            }))
          }
        }
      }

      // Sync stay requirements if we have itinerary content
      if (itineraryContent) {
        const { syncStayRequirements } = await import('@/lib/itinerary/deriveStayRequirements.js')
        const syncResult = await syncStayRequirements({
          tripId,
          itinerary: itineraryContent,
          db,
          fallbackStartDate: trip.lockedStartDate || trip.startDate,
          fallbackEndDate: trip.lockedEndDate || trip.endDate,
          fallbackDestination: trip.description || trip.name
        })

        // Build stay summary for chat
        const stays = await db.collection('stay_requirements')
          .find({ tripId, status: { $ne: 'inactive' } })
          .sort({ startDate: 1 })
          .toArray()
        
        const staySummary = stays.length > 0
          ? stays.map(s => `${s.locationName} (${s.nights} night${s.nights !== 1 ? 's' : ''})`).join(', ')
          : 'No stay segments identified'

        // Emit chat event for stay requirements synced
        if (syncResult.created > 0 || syncResult.updated > 0) {
          const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: null,
            subtype: 'stay_requirements_synced',
            text: `🏨 Accommodation for this trip: ${staySummary}. Browse options when you're ready.`,
            metadata: {
              segments: stays.map(s => ({
                locationName: s.locationName,
                startDate: s.startDate,
                endDate: s.endDate,
                nights: s.nights
              }))
            }
          })
        }
      }
      
      // Emit chat event for itinerary finalized
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: null,
        subtype: 'milestone',
        text: `✅ "${itinerary.title}" selected as the final itinerary. Next step: book accommodation and prepare for your trip.`,
        metadata: {
          key: 'itinerary_finalized',
          itineraryId: itineraryId,
          itineraryTitle: itinerary.title
        }
      })
      
      return handleCORS(NextResponse.json({ message: 'Itinerary selected' }))
    }
    
    // Get trip progress - GET /api/trips/:id/progress
    if (route.match(/^\/trips\/[^/]+\/progress$/) && method === 'GET') {
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
      
      // Get circle for owner check
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Get progress document (or create empty)
      let progress = await db.collection('trip_progress').findOne({ tripId })
      if (!progress) {
        progress = {
          tripId,
          accommodationChosenAt: null,
          prepStartedAt: null,
          memoriesSharedAt: null,
          expensesSettledAt: null
        }
      }
      
      // Check for selected itinerary
      const selectedItinerary = await db.collection('itineraries').findOne({
        tripId,
        status: 'selected'
      })
      
      // Compute accommodation done: check if all stay requirements have selected accommodations
      const { computeAccommodationDone } = await import('@/lib/trips/computeAccommodationDone.js')
      const accommodationDone = await computeAccommodationDone(db, tripId)
      
      // Auto-update accommodationChosenAt if accommodation is done but timestamp is missing
      if (accommodationDone && !progress.accommodationChosenAt) {
        const now = new Date().toISOString()
        await db.collection('trip_progress').updateOne(
          { tripId },
          { $set: { accommodationChosenAt: now } },
          { upsert: true }
        )
        progress.accommodationChosenAt = now
      } else if (!accommodationDone && progress.accommodationChosenAt) {
        // If accommodation is not done but timestamp exists, clear it (manual override was removed)
        // Actually, keep the timestamp if it was manually set - only auto-update when done
        // For now, we'll trust the computed value over the timestamp
      }
      
      // Check prep status from trip.prepStatus or progress.prepStartedAt
      const prepStatus = trip.prepStatus || 'not_started'
      const prepStarted = prepStatus === 'in_progress' || prepStatus === 'complete' || !!progress.prepStartedAt
      
      // Compute step statuses
      const today = new Date().toISOString().split('T')[0]
      const isTripOngoing = trip.lockedStartDate && trip.lockedEndDate && 
        today >= trip.lockedStartDate && today <= trip.lockedEndDate
      
      const steps = {
        tripProposed: true, // Always complete
        datesLocked: trip.status === 'locked',
        itineraryFinalized: !!selectedItinerary,
        accommodationChosen: accommodationDone, // Use computed value
        prepStarted: prepStarted,
        tripOngoing: isTripOngoing,
        memoriesShared: !!progress.memoriesSharedAt,
        expensesSettled: !!progress.expensesSettledAt
      }
      
      return handleCORS(NextResponse.json({
        steps,
        timestamps: {
          accommodationChosenAt: progress.accommodationChosenAt,
          prepStartedAt: progress.prepStartedAt,
          memoriesSharedAt: progress.memoriesSharedAt,
          expensesSettledAt: progress.expensesSettledAt
        },
        canEdit: trip.createdBy === auth.user.id || circle?.ownerId === auth.user.id
      }))
    }
    
    // Update trip progress - PATCH /api/trips/:id/progress
    if (route.match(/^\/trips\/[^/]+\/progress$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { step, completed } = body
      
      if (!step || typeof completed !== 'boolean') {
        return handleCORS(NextResponse.json(
          { error: 'step and completed fields are required' },
          { status: 400 }
        ))
      }
      
      const validSteps = ['accommodationChosen', 'prepStarted', 'memoriesShared', 'expensesSettled']
      if (!validSteps.includes(step)) {
        return handleCORS(NextResponse.json(
          { error: 'Invalid step. Valid steps: accommodationChosen, prepStarted, memoriesShared, expensesSettled' },
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
      
      // Get circle for owner check
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Check authorization: Trip Leader OR Circle Owner
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the Trip Leader or Circle Owner can update progress' },
          { status: 403 }
        ))
      }
      
      // Get or create progress document
      let progress = await db.collection('trip_progress').findOne({ tripId })
      const now = new Date().toISOString()
      const fieldMap = {
        accommodationChosen: 'accommodationChosenAt',
        prepStarted: 'prepStartedAt',
        memoriesShared: 'memoriesSharedAt',
        expensesSettled: 'expensesSettledAt'
      }
      const timestampField = fieldMap[step]
      const messageMap = {
        accommodationChosen: '🏨 Accommodation confirmed. Next step: finalize travel and prep details.',
        prepStarted: '📋 Trip preparation has begun. Add items to your packing list when you\'re ready.',
        memoriesShared: '📸 Memories shared with the group.',
        expensesSettled: '💰 Expenses settled. Trip wrap-up complete.'
      }
      
      if (!progress) {
        // Create new progress document
        progress = {
          tripId,
          accommodationChosenAt: null,
          prepStartedAt: null,
          memoriesSharedAt: null,
          expensesSettledAt: null
        }
        progress[timestampField] = completed ? now : null
        await db.collection('trip_progress').insertOne(progress)
      } else {
        // Update existing progress document
        await db.collection('trip_progress').updateOne(
          { tripId },
          { $set: { [timestampField]: completed ? now : null } }
        )
        progress[timestampField] = completed ? now : null
      }
      
      // Emit chat event if step was marked complete (toggled ON)
      if (completed) {
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: null,
          subtype: 'milestone',
          text: messageMap[step],
          metadata: {
            key: step
          }
        })
      }
      
      // Return updated progress (recompute step statuses)
      const selectedItinerary = await db.collection('itineraries').findOne({
        tripId,
        status: 'selected'
      })
      
      const today = new Date().toISOString().split('T')[0]
      const isTripOngoing = trip.lockedStartDate && trip.lockedEndDate && 
        today >= trip.lockedStartDate && today <= trip.lockedEndDate
      
      const steps = {
        tripProposed: true,
        datesLocked: trip.status === 'locked',
        accommodationChosen: !!progress.accommodationChosenAt,
        itineraryFinalized: !!selectedItinerary,
        prepStarted: !!progress.prepStartedAt,
        tripOngoing: isTripOngoing,
        memoriesShared: !!progress.memoriesSharedAt,
        expensesSettled: !!progress.expensesSettledAt
      }
      
      return handleCORS(NextResponse.json({
        steps,
        timestamps: {
          accommodationChosenAt: progress.accommodationChosenAt,
          prepStartedAt: progress.prepStartedAt,
          memoriesSharedAt: progress.memoriesSharedAt,
          expensesSettledAt: progress.expensesSettledAt
        },
        canEdit: true
      }))
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

    // ============ STAY REQUIREMENTS & ACCOMMODATION ROUTES ============
    
    // Get stay requirements - GET /api/trips/:tripId/stays
    if (route.match(/^\/trips\/[^/]+\/stays$/) && method === 'GET') {
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
      
      const stays = await db.collection('stay_requirements')
        .find({ tripId, status: { $ne: 'inactive' } })
        .sort({ startDate: 1 })
        .toArray()
      
      return handleCORS(NextResponse.json(stays))
    }
    
    // Sync stay requirements - POST /api/trips/:tripId/stays/sync
    if (route.match(/^\/trips\/[^/]+\/stays\/sync$/) && method === 'POST') {
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
      
      // Only trip creator or circle owner can sync
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can sync stay requirements' },
          { status: 403 }
        ))
      }
      
      // Get latest itinerary version
      const latestVersion = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })
      
      if (!latestVersion || !latestVersion.content) {
        return handleCORS(NextResponse.json(
          { error: 'No itinerary found. Generate an itinerary first.' },
          { status: 400 }
        ))
      }
      
      const { syncStayRequirements } = await import('@/lib/itinerary/deriveStayRequirements.js')
      const syncResult = await syncStayRequirements({
        tripId,
        itinerary: latestVersion.content,
        db,
        fallbackStartDate: trip.lockedStartDate || trip.startDate,
        fallbackEndDate: trip.lockedEndDate || trip.endDate,
        fallbackDestination: trip.description || trip.name
      })
      
      return handleCORS(NextResponse.json(syncResult))
    }
    
    // Get accommodation options - GET /api/trips/:tripId/accommodations?stayId=...
    if (route.match(/^\/trips\/[^/]+\/accommodations$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const searchParams = request.nextUrl.searchParams
      const stayId = searchParams.get('stayId')
      
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
      
      const query = { tripId }
      if (stayId) {
        query.stayRequirementId = stayId
      }
      
      const options = await db.collection('accommodation_options')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()
      
      // Get user info for addedBy
      const userIds = [...new Set(options.map(o => o.addedByUserId).filter(Boolean))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      // Phase 7: Get votes for each option
      const votes = await db.collection('accommodation_votes')
        .find({ tripId })
        .toArray()

      // Get voter user info
      const voterIds = [...new Set(votes.map(v => v.votedBy).filter(Boolean))]
      const allUserIds = [...new Set([...userIds, ...voterIds])]
      const allUsers = await db.collection('users')
        .find({ id: { $in: allUserIds } })
        .toArray()

      // Check if current user has voted
      const userVote = votes.find(v => v.votedBy === auth.user.id)

      const optionsWithUsers = options.map(option => {
        const addedByUser = allUsers.find(u => u.id === option.addedByUserId)
        const optionVotes = votes.filter(v => v.optionId === option.id)
        // Get voter names for this option
        const voters = optionVotes.map(v => {
          const voter = allUsers.find(u => u.id === v.votedBy)
          return voter ? { id: voter.id, name: voter.name } : null
        }).filter(Boolean)

        return {
          ...option,
          addedBy: addedByUser ? { id: addedByUser.id, name: addedByUser.name } : null,
          voteCount: optionVotes.length,
          voters,
          userVoted: userVote?.optionId === option.id
        }
      })

      return handleCORS(NextResponse.json(optionsWithUsers))
    }

    // Create accommodation option - POST /api/trips/:tripId/accommodations
    if (route.match(/^\/trips\/[^/]+\/accommodations$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { stayRequirementId, source, title, url, priceRange, sleepCapacity, notes } = body
      
      if (!title || !title.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        ))
      }
      
      if (!source || !['AIRBNB', 'BOOKING', 'VRBO', 'MANUAL', 'OTHER'].includes(source)) {
        return handleCORS(NextResponse.json(
          { error: 'Valid source is required (AIRBNB, BOOKING, VRBO, MANUAL, OTHER)' },
          { status: 400 }
        ))
      }
      
      if (source !== 'MANUAL' && !url) {
        return handleCORS(NextResponse.json(
          { error: 'URL is required for non-manual sources' },
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

      // Verify stay requirement exists if provided
      if (stayRequirementId) {
        const stay = await db.collection('stay_requirements').findOne({
          id: stayRequirementId,
          tripId
        })
        if (!stay) {
          return handleCORS(NextResponse.json(
            { error: 'Stay requirement not found' },
            { status: 404 }
          ))
        }
      }
      
      const option = {
        id: uuidv4(),
        tripId,
        stayRequirementId: stayRequirementId || null,
        source,
        title: title.trim(),
        url: url?.trim() || null,
        priceRange: priceRange?.trim() || null,
        sleepCapacity: sleepCapacity ? parseInt(sleepCapacity) : null,
        notes: notes?.trim() || null,
        addedByUserId: auth.user.id,
        status: 'shortlisted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('accommodation_options').insertOne(option)
      
      // Emit chat event for accommodation added
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'accommodation_added',
        text: `${auth.user.name} added an accommodation option: ${option.title}`,
        metadata: {
          optionId: option.id,
          stayRequirementId: stayRequirementId,
          source: source
        }
      })
      
      // Get user info
      const user = await db.collection('users').findOne({ id: auth.user.id })
      
      return handleCORS(NextResponse.json({
        ...option,
        addedBy: user ? { id: user.id, name: user.name } : null
      }))
    }

    // Vote for accommodation option - POST /api/trips/:tripId/accommodations/:optionId/vote
    // Phase 7: Constrained accommodation voting
    if (route.match(/^\/trips\/[^/]+\/accommodations\/[^/]+\/vote$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const optionId = path[3]

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

      // Check user is an active traveler (handles both collaborative and hosted trips)
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip' },
          { status: 403 }
        ))
      }

      const option = await db.collection('accommodation_options').findOne({
        id: optionId,
        tripId
      })

      if (!option) {
        return handleCORS(NextResponse.json(
          { error: 'Accommodation option not found' },
          { status: 404 }
        ))
      }

      // Check if user has already voted for any option in this trip
      const existingVote = await db.collection('accommodation_votes').findOne({
        tripId,
        votedBy: auth.user.id
      })

      if (existingVote) {
        return handleCORS(NextResponse.json(
          { error: 'You have already voted for an accommodation option' },
          { status: 400 }
        ))
      }

      // Create the vote
      const vote = {
        id: `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tripId,
        optionId,
        votedBy: auth.user.id,
        createdAt: new Date().toISOString()
      }

      await db.collection('accommodation_votes').insertOne(vote)

      // Update option vote count
      const voteCount = await db.collection('accommodation_votes').countDocuments({
        tripId,
        optionId
      })

      await db.collection('accommodation_options').updateOne(
        { id: optionId },
        { $set: { votes: voteCount, updatedAt: new Date().toISOString() } }
      )

      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      const user = await db.collection('users').findOne({ id: auth.user.id })
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'accommodation_vote',
        text: `👍 ${user?.name || 'Someone'} voted for "${option.title}"`,
        metadata: { optionId, voteCount }
      })

      return handleCORS(NextResponse.json({ message: 'Vote recorded', voteCount }))
    }

    // Select accommodation option - POST /api/trips/:tripId/accommodations/:optionId/select
    if (route.match(/^\/trips\/[^/]+\/accommodations\/[^/]+\/select$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const optionId = path[3]
      
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

      // Only trip creator or circle owner can select
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can select an accommodation' },
          { status: 403 }
        ))
      }

      const option = await db.collection('accommodation_options').findOne({
        id: optionId,
        tripId
      })

      if (!option) {
        return handleCORS(NextResponse.json(
          { error: 'Accommodation option not found' },
          { status: 404 }
        ))
      }

      // Unselect any other options for the same stay requirement
      if (option.stayRequirementId) {
        await db.collection('accommodation_options').updateMany(
          {
            tripId,
            stayRequirementId: option.stayRequirementId,
            id: { $ne: optionId },
            status: 'selected'
          },
          { $set: { status: 'shortlisted', updatedAt: new Date().toISOString() } }
        )
        
        // Mark stay requirement as covered
        await db.collection('stay_requirements').updateOne(
          { id: option.stayRequirementId },
          { $set: { status: 'covered', updatedAt: new Date().toISOString() } }
        )
      }
      
      // Select this option
      await db.collection('accommodation_options').updateOne(
        { id: optionId },
        { $set: { status: 'selected', updatedAt: new Date().toISOString() } }
      )
      
      // Check if all stay requirements now have selected accommodations
      const { computeAccommodationDone } = await import('@/lib/trips/computeAccommodationDone.js')
      const accommodationDone = await computeAccommodationDone(db, tripId)
      
      // Auto-update progress if accommodation is now complete
      if (accommodationDone) {
        let progress = await db.collection('trip_progress').findOne({ tripId })
        if (!progress) {
          progress = {
            tripId,
            accommodationChosenAt: null,
            prepStartedAt: null,
            memoriesSharedAt: null,
            expensesSettledAt: null
          }
          await db.collection('trip_progress').insertOne(progress)
        }
        
        if (!progress.accommodationChosenAt) {
          await db.collection('trip_progress').updateOne(
            { tripId },
            { $set: { accommodationChosenAt: new Date().toISOString() } }
          )
        }
      }
      
      // Emit chat event for accommodation selected
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'accommodation_selected',
        text: `✅ ${option.title} confirmed as accommodation${option.stayRequirementId ? ' for this stay segment' : ''}. Move forward with booking when everyone's aligned.`,
        metadata: {
          optionId: option.id,
          stayRequirementId: option.stayRequirementId,
          source: option.source
        }
      })
      
      return handleCORS(NextResponse.json({ message: 'Accommodation selected' }))
    }

    // ============ PREP ROUTES ============
    
    // Get prep data - GET /api/trips/:tripId/prep
    if (route.match(/^\/trips\/[^/]+\/prep$/) && method === 'GET') {
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
      
      // Get prep status from trip
      const prepStatus = trip.prepStatus || 'not_started'
      
      // Get transport items
      const transportItems = await db.collection('transport_items')
        .find({ tripId })
        .sort({ departAt: 1, createdAt: 1 })
        .toArray()
      
      // Get prep items (packing and documents)
      const prepItems = await db.collection('prep_items')
        .find({ tripId })
        .sort({ category: 1, createdAt: 1 })
        .toArray()
      
      const packingItems = prepItems.filter(item => item.category === 'packing')
      const documentItems = prepItems.filter(item => item.category === 'documents')
      
      return handleCORS(NextResponse.json({
        prepStatus,
        transportItems: transportItems.map(({ _id, ...rest }) => rest),
        packingItems: packingItems.map(({ _id, ...rest }) => rest),
        documentItems: documentItems.map(({ _id, ...rest }) => rest)
      }))
    }
    
    // Create/update transport item - POST /api/trips/:tripId/prep/transport
    if (route.match(/^\/trips\/[^/]+\/prep\/transport$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { mode, fromLocation, toLocation, departAt, arriveAt, bookingRef, provider, link, notes, status } = body
      
      if (!fromLocation || !fromLocation.trim() || !toLocation || !toLocation.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'From and To locations are required' },
          { status: 400 }
        ))
      }
      
      if (!mode || !['flight', 'train', 'bus', 'car', 'other'].includes(mode)) {
        return handleCORS(NextResponse.json(
          { error: 'Valid mode is required (flight, train, bus, car, other)' },
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
      
      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }
      
      // Generate title
      const title = `Transport: ${fromLocation.trim()} → ${toLocation.trim()}`
      
      const transportItem = {
        id: uuidv4(),
        tripId,
        mode,
        fromLocation: fromLocation.trim(),
        toLocation: toLocation.trim(),
        departAt: departAt || null,
        arriveAt: arriveAt || null,
        bookingRef: bookingRef?.trim() || null,
        provider: provider?.trim() || null,
        link: link?.trim() || null,
        notes: notes?.trim() || null,
        ownerUserId: auth.user.id,
        status: status || 'planned',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('transport_items').insertOne(transportItem)
      
      // Update trip prepStatus to in_progress if currently not_started
      if (trip.prepStatus === 'not_started' || !trip.prepStatus) {
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { prepStatus: 'in_progress' } }
        )
      }
      
      // Emit chat event if status is booked
      if (status === 'booked') {
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'transport_booked',
          text: `✈️ ${auth.user.name} booked transport: ${fromLocation} → ${toLocation}`,
          metadata: {
            transportItemId: transportItem.id,
            mode: mode
          }
        })
      }
      
      return handleCORS(NextResponse.json(transportItem))
    }
    
    // Create/update prep checklist item - POST /api/trips/:tripId/prep/checklist
    if (route.match(/^\/trips\/[^/]+\/prep\/checklist$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { category, title, quantity, notes } = body
      
      if (!title || !title.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        ))
      }
      
      if (!category || !['packing', 'documents', 'other'].includes(category)) {
        return handleCORS(NextResponse.json(
          { error: 'Valid category is required (packing, documents, other)' },
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
      
      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }
      
      const prepItem = {
        id: uuidv4(),
        tripId,
        category,
        title: title.trim(),
        quantity: quantity ? parseInt(quantity) : null,
        notes: notes?.trim() || null,
        ownerUserId: auth.user.id,
        status: 'todo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      
      await db.collection('prep_items').insertOne(prepItem)
      
      // Update trip prepStatus to in_progress if currently not_started
      if (trip.prepStatus === 'not_started' || !trip.prepStatus) {
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { prepStatus: 'in_progress' } }
        )

        // Emit chat event for prep phase started (first item added)
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'milestone',
          text: `📋 ${auth.user.name} started trip preparation. Add your own items when you're ready.`,
          metadata: {
            key: 'prep_started'
          }
        })
      }

      return handleCORS(NextResponse.json(prepItem))
    }
    
    // Update prep checklist item - PATCH /api/trips/:tripId/prep/checklist/:itemId
    if (route.match(/^\/trips\/[^/]+\/prep\/checklist\/[^/]+$/) && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const itemId = path[3]
      const body = await request.json()
      const { status, title, quantity, notes } = body
      
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
      
      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }
      
      const item = await db.collection('prep_items').findOne({
        id: itemId,
        tripId
      })
      
      if (!item) {
        return handleCORS(NextResponse.json(
          { error: 'Prep item not found' },
          { status: 404 }
        ))
      }
      
      // Update fields
      const updateFields = { updatedAt: new Date().toISOString() }
      if (status !== undefined) updateFields.status = status
      if (title !== undefined) updateFields.title = title.trim()
      if (quantity !== undefined) updateFields.quantity = quantity ? parseInt(quantity) : null
      if (notes !== undefined) updateFields.notes = notes?.trim() || null
      
      await db.collection('prep_items').updateOne(
        { id: itemId },
        { $set: updateFields }
      )
      
      return handleCORS(NextResponse.json({ message: 'Prep item updated' }))
    }

    // Delete transport item - DELETE /api/trips/:tripId/prep/transport/:transportId
    if (route.match(/^\/trips\/[^/]+\/prep\/transport\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const transportId = path[3]

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

      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }

      const transportItem = await db.collection('transport_items').findOne({
        id: transportId,
        tripId
      })

      if (!transportItem) {
        return handleCORS(NextResponse.json(
          { error: 'Transport item not found' },
          { status: 404 }
        ))
      }

      // Only item creator or trip leader can delete
      const isTripLeader = trip.createdBy === auth.user.id
      const isItemOwner = transportItem.ownerUserId === auth.user.id

      if (!isItemOwner && !isTripLeader) {
        return handleCORS(NextResponse.json(
          { error: 'Only the item creator or trip leader can delete this item' },
          { status: 403 }
        ))
      }

      await db.collection('transport_items').deleteOne({ id: transportId })

      return handleCORS(NextResponse.json({ message: 'Transport item deleted' }))
    }

    // Delete checklist item - DELETE /api/trips/:tripId/prep/checklist/:itemId
    if (route.match(/^\/trips\/[^/]+\/prep\/checklist\/[^/]+$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const itemId = path[3]

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

      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }

      const prepItem = await db.collection('prep_items').findOne({
        id: itemId,
        tripId
      })

      if (!prepItem) {
        return handleCORS(NextResponse.json(
          { error: 'Checklist item not found' },
          { status: 404 }
        ))
      }

      // Only item creator or trip leader can delete
      const isTripLeader = trip.createdBy === auth.user.id
      const isItemOwner = prepItem.ownerUserId === auth.user.id

      if (!isItemOwner && !isTripLeader) {
        return handleCORS(NextResponse.json(
          { error: 'Only the item creator or trip leader can delete this item' },
          { status: 403 }
        ))
      }

      await db.collection('prep_items').deleteOne({ id: itemId })

      return handleCORS(NextResponse.json({ message: 'Checklist item deleted' }))
    }

    // Generate prep suggestions - POST /api/trips/:tripId/prep/suggestions
    if (route.match(/^\/trips\/[^/]+\/prep\/suggestions$/) && method === 'POST') {
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
      
      // Check if user is an active traveler
      const userIsActiveTraveler = await isActiveTraveler(db, trip, auth.user.id)
      if (!userIsActiveTraveler) {
        return handleCORS(NextResponse.json(
          { error: 'You are not an active traveler for this trip', code: 'USER_NOT_TRAVELER' },
          { status: 403 }
        ))
      }
      
      // Get latest itinerary version
      const latestVersion = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })
      
      if (!latestVersion || !latestVersion.content) {
        return handleCORS(NextResponse.json(
          { error: 'No itinerary found. Generate an itinerary first.' },
          { status: 400 }
        ))
      }
      
      // Derive suggestions
      const { derivePrepSuggestionsFromItinerary } = await import('@/lib/prep/derivePrepSuggestionsFromItinerary.js')
      const suggestions = derivePrepSuggestionsFromItinerary({
        itinerary: latestVersion.content,
        fallbackStartDate: trip.lockedStartDate || trip.startDate
      })
      
      let created = 0
      let skipped = 0
      
      // Insert suggestions (idempotent by dedupeKey)
      for (const suggestion of suggestions) {
        const existing = await db.collection('transport_items').findOne({
          tripId,
          dedupeKey: suggestion.dedupeKey
        })
        
        if (!existing) {
          const transportItem = {
            id: uuidv4(),
            tripId,
            ...suggestion,
            ownerUserId: auth.user.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          
          await db.collection('transport_items').insertOne(transportItem)
          created++
        } else {
          skipped++
        }
      }
      
      // Update trip prepStatus to in_progress if currently not_started
      if (trip.prepStatus === 'not_started' || !trip.prepStatus) {
        await db.collection('trips').updateOne(
          { id: tripId },
          { $set: { prepStatus: 'in_progress' } }
        )
      }
      
      // Emit chat event
      if (created > 0) {
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'prep_suggestions_generated',
          text: `✨ Generated ${created} transport suggestion${created !== 1 ? 's' : ''} from itinerary`,
          metadata: {
            created,
            skipped
          }
        })
      }
      
      return handleCORS(NextResponse.json({ created, skipped }))
    }
    
    // Mark prep complete - POST /api/trips/:tripId/prep/markComplete
    if (route.match(/^\/trips\/[^/]+\/prep\/markComplete$/) && method === 'POST') {
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
      
      // Only trip creator or circle owner can mark complete
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can mark prep complete' },
          { status: 403 }
        ))
      }
      
      // Update trip prepStatus
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { prepStatus: 'complete' } }
      )
      
      // Update progress prepStartedAt if not already set
      let progress = await db.collection('trip_progress').findOne({ tripId })
      if (!progress) {
        progress = {
          tripId,
          accommodationChosenAt: null,
          prepStartedAt: null,
          memoriesSharedAt: null,
          expensesSettledAt: null
        }
        await db.collection('trip_progress').insertOne(progress)
      }
      
      if (!progress.prepStartedAt) {
        await db.collection('trip_progress').updateOne(
          { tripId },
          { $set: { prepStartedAt: new Date().toISOString() } }
        )
      }
      
      // Emit chat event
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'milestone',
        text: `✅ Trip preparation marked as complete! Ready to go! 🎒`,
        metadata: {
          key: 'prep_complete'
        }
      })
      
      return handleCORS(NextResponse.json({ message: 'Prep marked as complete' }))
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
      const { text } = body
      
      if (!text || !text.trim()) {
        return handleCORS(NextResponse.json(
          { error: 'Idea text is required' },
          { status: 400 }
        ))
      }
      
      // Character limit: 120
      if (text.trim().length > 120) {
        return handleCORS(NextResponse.json(
          { error: 'Idea text must be 120 characters or less' },
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
      
      // Guard: Must be locked (dates locked)
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary ideas can only be added after dates are locked' },
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
      
      // Check if user is active participant (hasn't left)
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }
      // If no participant record exists for collaborative trips, user is implicitly active (backward compatibility)
      
      // Enforce max 3 ideas per user per trip
      const existingIdeas = await db.collection('itinerary_ideas')
        .find({ tripId, authorUserId: auth.user.id })
        .toArray()
      
      if (existingIdeas.length >= 3) {
        return handleCORS(NextResponse.json(
          { error: 'Maximum 3 ideas per user. Delete an existing idea to submit a new one.' },
          { status: 400 }
        ))
      }
      
      const idea = {
        id: uuidv4(),
        tripId,
        authorUserId: auth.user.id,
        text: text.trim(),
        likes: [], // Array of userIds who liked this idea
        createdAt: new Date().toISOString()
      }
      
      await db.collection('itinerary_ideas').insertOne(idea)
      
      // Emit chat event for itinerary idea submission
      const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
      await emitTripChatEvent({
        tripId,
        circleId: trip.circleId,
        actorUserId: auth.user.id,
        subtype: 'itinerary_idea',
        text: `${auth.user.name} added an itinerary idea`,
        metadata: {
          ideaId: idea.id,
          href: `/trips/${tripId}?tab=itinerary`
        },
        dedupeKey: `idea:${idea.id}`
      })
      
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
        .toArray()
      
      // Get authors
      const authorIds = [...new Set(ideas.map(i => i.authorUserId || i.authorId))]
      const authors = await db.collection('users')
        .find({ id: { $in: authorIds } })
        .toArray()
      
      const ideasWithAuthors = ideas.map(idea => {
        const { _id, ...rest } = idea
        const authorUserId = idea.authorUserId || idea.authorId
        const author = authors.find(a => a.id === authorUserId)
        const likes = Array.isArray(idea.likes) ? idea.likes : []
        const likeCount = likes.length
        
        return {
          id: idea.id,
          tripId: idea.tripId,
          authorUserId,
          text: idea.text || idea.title || '', // Support both old and new format
          likes,
          likeCount,
          createdAt: idea.createdAt,
          author: author ? { id: author.id, name: author.name } : null,
          isAuthor: authorUserId === auth.user.id,
          userLiked: likes.includes(auth.user.id)
        }
      })
      
      // Sort by like count (desc), then by recency (desc)
      ideasWithAuthors.sort((a, b) => {
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount
        }
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
      
      return handleCORS(NextResponse.json(ideasWithAuthors))
    }
    
    // Like/unlike itinerary idea - POST /api/trips/:tripId/itinerary/ideas/:ideaId/like
    if (route.match(/^\/trips\/[^/]+\/itinerary\/ideas\/[^/]+\/like$/) && method === 'POST') {
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
      
      // Get current likes array (support both old and new format)
      const currentLikes = Array.isArray(idea.likes) ? idea.likes : []
      const userLiked = currentLikes.includes(auth.user.id)
      
      // Toggle like: remove if present, add if absent
      const updatedLikes = userLiked
        ? currentLikes.filter(userId => userId !== auth.user.id)
        : [...currentLikes, auth.user.id]
      
      await db.collection('itinerary_ideas').updateOne(
        { id: ideaId },
        { $set: { likes: updatedLikes } }
      )
      
      return handleCORS(NextResponse.json({ 
        message: userLiked ? 'Idea unliked' : 'Idea liked',
        likes: updatedLikes,
        likeCount: updatedLikes.length
      }))
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

      // Return versions with metadata for version limit enforcement
      return handleCORS(NextResponse.json({
        versions: versionsWithCreators,
        versionCount: versions.length,
        maxVersions: ITINERARY_CONFIG.MAX_VERSIONS,
        canRevise: versions.length < ITINERARY_CONFIG.MAX_VERSIONS
      }))
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
      const body = await request.json().catch(() => ({}))
      const forceGenerate = body.forceGenerate === true
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      // Guard: Must be locked with valid dates
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary can only be generated for locked trips' },
          { status: 400 }
        ))
      }
      
      // Validate locked dates exist
      const lockedStartDate = trip.lockedStartDate || trip.startDate
      const lockedEndDate = trip.lockedEndDate || trip.endDate
      
      if (!lockedStartDate || !lockedEndDate) {
        return handleCORS(NextResponse.json(
          { error: 'Trip must have locked start and end dates to generate itinerary' },
          { status: 400 }
        ))
      }
      
      // Build canonical date list
      const { buildTripDateList } = await import('@/lib/itinerary/buildTripDateList.js')
      let dateList
      try {
        dateList = buildTripDateList(lockedStartDate, lockedEndDate)
      } catch (error) {
        return handleCORS(NextResponse.json(
          { error: `Invalid trip dates: ${error.message}` },
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

      // LLM disabled: fail gracefully
      if (!process.env.OPENAI_API_KEY) {
        return handleCORS(NextResponse.json(
          { error: 'AI features are disabled. Ask an admin to set OPENAI_API_KEY to enable itinerary generation.' },
          { status: 503 }
        ))
      }
      
      // Only allow generate if no versions exist (use revise for subsequent versions)
      const existingVersionCount = await db.collection('itinerary_versions')
        .countDocuments({ tripId })

      if (existingVersionCount > 0) {
        return handleCORS(NextResponse.json(
          {
            error: 'Itinerary already generated. Use revise endpoint to create new versions.',
            code: 'ITINERARY_EXISTS'
          },
          { status: 400 }
        ))
      }
      
      // Get top ideas by priority
      const ideas = await db.collection('itinerary_ideas')
        .find({ tripId })
        .sort({ priority: -1, createdAt: -1 })
        .limit(10)
        .toArray()

      const destinationHint = (trip.destinationHint || '').trim()
      const hasIdeas = ideas.length > 0
      const hasDestinationHint = destinationHint.length > 0

      if (!forceGenerate && (!hasIdeas || !hasDestinationHint)) {
        return handleCORS(NextResponse.json(
          { error: 'Add a destination hint or at least one idea before generating, or confirm to generate anyway.' },
          { status: 400 }
        ))
      }

      // Update status to drafting
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { itineraryStatus: 'drafting' } }
      )
      
      try {
        
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
          destination: destinationHint || trip.description || trip.name,
          startDate: lockedStartDate,
          endDate: lockedEndDate,
          dateList, // Pass canonical date list
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
        
        // Sync stay requirements from itinerary
        const { syncStayRequirements } = await import('@/lib/itinerary/deriveStayRequirements.js')
        const syncResult = await syncStayRequirements({
          tripId,
          itinerary: itineraryContent,
          db,
          fallbackStartDate: trip.lockedStartDate || trip.startDate,
          fallbackEndDate: trip.lockedEndDate || trip.endDate,
          fallbackDestination: trip.description || trip.name
        })

        // Build stay summary for chat
        const stays = await db.collection('stay_requirements')
          .find({ tripId, status: { $ne: 'inactive' } })
          .sort({ startDate: 1 })
          .toArray()
        
        const staySummary = stays.length > 0
          ? stays.map(s => `${s.locationName} (${s.nights} night${s.nights !== 1 ? 's' : ''})`).join(', ')
          : 'No stay segments identified'

        // Emit chat event for itinerary generated
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        await emitTripChatEvent({
          tripId,
          circleId: trip.circleId,
          actorUserId: auth.user.id,
          subtype: 'milestone',
          text: `✨ Itinerary generated! Review and share feedback in the Itinerary tab.`,
          metadata: {
            key: 'itinerary_generated',
            version: version.version
          }
        })

        // Emit chat event for stay requirements synced
        if (syncResult.created > 0 || syncResult.updated > 0) {
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: null,
            subtype: 'stay_requirements_synced',
            text: `🏨 Accommodation for this trip: ${staySummary}. Browse options when you're ready.`,
            metadata: {
              segments: stays.map(s => ({
                locationName: s.locationName,
                startDate: s.startDate,
                endDate: s.endDate,
                nights: s.nights
              }))
            }
          })
        }
        
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
      
      // Check if user is active participant (hasn't left)
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })
      
      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }
      // If no participant record exists for collaborative trips, user is implicitly active (backward compatibility)
      
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

    // Submit reaction - POST /api/trips/:tripId/itinerary/versions/:versionId/reactions
    if (route.match(/^\/trips\/[^/]+\/itinerary\/versions\/[^/]+\/reactions$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const versionId = path[4]

      const body = await request.json()
      const { category, reactionKey } = body

      if (!category || !reactionKey) {
        return handleCORS(NextResponse.json(
          { error: 'category and reactionKey are required' },
          { status: 400 }
        ))
      }

      // Validate category
      const validCategories = ['pace', 'focus', 'budget', 'logistics', 'sentiment']
      if (!validCategories.includes(category)) {
        return handleCORS(NextResponse.json(
          { error: `Invalid category. Must be one of: ${validCategories.join(', ')}` },
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

      // Check active participant status
      const userParticipant = await db.collection('trip_participants').findOne({
        tripId,
        userId: auth.user.id
      })

      if (userParticipant) {
        const status = userParticipant.status || 'active'
        if (status !== 'active') {
          return handleCORS(NextResponse.json(
            { error: 'You have left this trip.' },
            { status: 403 }
          ))
        }
      }

      // Find itinerary version
      const version = await db.collection('itinerary_versions').findOne({ id: versionId, tripId })
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary version not found' },
          { status: 404 }
        ))
      }

      // For single-constraint categories (pace, budget), remove existing reactions in that category
      if (category === 'pace' || category === 'budget') {
        await db.collection('itinerary_reactions').deleteMany({
          tripId,
          itineraryVersion: version.version,
          userId: auth.user.id,
          category
        })
      }

      // Insert new reaction
      const reaction = {
        id: uuidv4(),
        tripId,
        itineraryVersion: version.version,
        userId: auth.user.id,
        category,
        reactionKey,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await db.collection('itinerary_reactions').insertOne(reaction)

      // Return without MongoDB _id
      const { _id, ...reactionResponse } = reaction
      return handleCORS(NextResponse.json(reactionResponse))
    }

    // Get reactions for version - GET /api/trips/:tripId/itinerary/versions/:versionId/reactions
    if (route.match(/^\/trips\/[^/]+\/itinerary\/versions\/[^/]+\/reactions$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const versionId = path[4]

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

      // Find itinerary version
      const version = await db.collection('itinerary_versions').findOne({ id: versionId, tripId })
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary version not found' },
          { status: 404 }
        ))
      }

      const reactions = await db.collection('itinerary_reactions')
        .find({ tripId, itineraryVersion: version.version })
        .sort({ createdAt: 1 })
        .toArray()

      // Get user info for reactions
      const userIds = [...new Set(reactions.map(r => r.userId))]
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()

      const reactionsWithUsers = reactions.map(reaction => {
        const { _id, ...rest } = reaction
        const user = users.find(u => u.id === reaction.userId)
        return {
          ...rest,
          user: user ? { id: user.id, name: user.name } : null
        }
      })

      return handleCORS(NextResponse.json(reactionsWithUsers))
    }

    // Delete reaction - DELETE /api/trips/:tripId/itinerary/versions/:versionId/reactions
    if (route.match(/^\/trips\/[^/]+\/itinerary\/versions\/[^/]+\/reactions$/) && method === 'DELETE') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }

      const tripId = path[1]
      const versionId = path[4]
      const searchParams = request.nextUrl.searchParams
      const reactionKey = searchParams.get('reactionKey')

      if (!reactionKey) {
        return handleCORS(NextResponse.json(
          { error: 'reactionKey parameter is required' },
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

      // Find itinerary version
      const version = await db.collection('itinerary_versions').findOne({ id: versionId, tripId })
      if (!version) {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary version not found' },
          { status: 404 }
        ))
      }

      // Delete user's reaction with this key
      const result = await db.collection('itinerary_reactions').deleteOne({
        tripId,
        itineraryVersion: version.version,
        userId: auth.user.id,
        reactionKey
      })

      if (result.deletedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: 'Reaction not found' },
          { status: 404 }
        ))
      }

      return handleCORS(NextResponse.json({ success: true }))
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
      
      // Guard: Must be locked with valid dates
      if (trip.status !== 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Itinerary can only be revised for locked trips' },
          { status: 400 }
        ))
      }
      
      // Validate locked dates exist
      const lockedStartDate = trip.lockedStartDate || trip.startDate
      const lockedEndDate = trip.lockedEndDate || trip.endDate
      
      if (!lockedStartDate || !lockedEndDate) {
        return handleCORS(NextResponse.json(
          { error: 'Trip must have locked start and end dates to revise itinerary' },
          { status: 400 }
        ))
      }
      
      // Build canonical date list
      const { buildTripDateList } = await import('@/lib/itinerary/buildTripDateList.js')
      let dateList
      try {
        dateList = buildTripDateList(lockedStartDate, lockedEndDate)
      } catch (error) {
        return handleCORS(NextResponse.json(
          { error: `Invalid trip dates: ${error.message}` },
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

      // LLM disabled: fail gracefully
      if (!process.env.OPENAI_API_KEY) {
        return handleCORS(NextResponse.json(
          { error: 'AI features are disabled. Ask an admin to set OPENAI_API_KEY to enable itinerary revisions.' },
          { status: 503 }
        ))
      }
      
      // Get latest version and count total versions
      const latestVersion = await db.collection('itinerary_versions')
        .findOne({ tripId }, { sort: { version: -1 } })

      if (!latestVersion) {
        return handleCORS(NextResponse.json(
          {
            error: 'No itinerary version found. Generate an initial itinerary first.',
            code: 'NO_ITINERARY'
          },
          { status: 400 }
        ))
      }

      // Check version limit
      const versionCount = await db.collection('itinerary_versions')
        .countDocuments({ tripId })

      if (versionCount >= ITINERARY_CONFIG.MAX_VERSIONS) {
        return handleCORS(NextResponse.json(
          {
            error: `Maximum of ${ITINERARY_CONFIG.MAX_VERSIONS} itinerary versions reached. This trip's itinerary is now finalized.`,
            code: 'VERSION_LIMIT_REACHED',
            maxVersions: ITINERARY_CONFIG.MAX_VERSIONS,
            currentVersions: versionCount
          },
          { status: 400 }
        ))
      }

      // Get feedback for latest version
      const feedbackMessages = await db.collection('itinerary_feedback')
        .find({ tripId, itineraryVersion: latestVersion.version })
        .sort({ createdAt: 1 })
        .toArray()

      // Get reactions for latest version
      const reactions = await db.collection('itinerary_reactions')
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

      // Get recent chat messages since last version (for context in revision)
      // Only include non-system messages that might contain itinerary feedback
      const recentChatMessages = await db.collection('trip_messages')
        .find({
          tripId,
          createdAt: { $gt: latestVersion.createdAt },
          isSystem: { $ne: true }
        })
        .sort({ createdAt: 1 })
        .limit(30)
        .toArray()

      // Update status to revising
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { itineraryStatus: 'revising' } }
      )

      try {
        // Summarize feedback WITH reactions (reactions as hard constraints) AND chat messages
        const feedbackSummary = await summarizeFeedback(feedbackMessages, reactions, recentChatMessages)
        
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
          startDate: lockedStartDate,
          endDate: lockedEndDate,
          dateList // Pass canonical date list to preserve exact date range
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

        // Sync stay requirements from revised itinerary
        const { syncStayRequirements } = await import('@/lib/itinerary/deriveStayRequirements.js')
        const syncResult = await syncStayRequirements({
          tripId,
          itinerary: revisedContent,
          db,
          fallbackStartDate: trip.lockedStartDate || trip.startDate,
          fallbackEndDate: trip.lockedEndDate || trip.endDate,
          fallbackDestination: trip.description || trip.name
        })

        // Build stay summary for chat
        const stays = await db.collection('stay_requirements')
          .find({ tripId, status: { $ne: 'inactive' } })
          .sort({ startDate: 1 })
          .toArray()
        
        const staySummary = stays.length > 0
          ? stays.map(s => `${s.locationName} (${s.nights} night${s.nights !== 1 ? 's' : ''})`).join(', ')
          : 'No stay segments identified'
        
        // Emit chat event for itinerary revised (different message if final version)
        const { emitTripChatEvent } = await import('@/lib/chat/emitTripChatEvent.js')
        const isFinalVersion = newVersion.version >= ITINERARY_CONFIG.MAX_VERSIONS

        if (isFinalVersion) {
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: auth.user.id,
            subtype: 'milestone',
            text: `📋 Final itinerary version created (v${newVersion.version}). The plan is now set!`,
            metadata: {
              key: 'itinerary_finalized',
              version: newVersion.version,
              maxVersions: ITINERARY_CONFIG.MAX_VERSIONS
            }
          })
        } else {
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: auth.user.id,
            subtype: 'milestone',
            text: `✨ Itinerary updated to version ${newVersion.version}. Review the changes in the Itinerary tab.`,
            metadata: {
              key: 'itinerary_revised',
              version: newVersion.version
            }
          })
        }

        // Emit chat event for stay requirements synced if changed
        if (syncResult.created > 0 || syncResult.updated > 0) {
          await emitTripChatEvent({
            tripId,
            circleId: trip.circleId,
            actorUserId: null,
            subtype: 'stay_requirements_synced',
            text: `🏨 Accommodation for this trip: ${staySummary}. Browse options when you're ready.`,
            metadata: {
              segments: stays.map(s => ({
                locationName: s.locationName,
                startDate: s.startDate,
                endDate: s.endDate,
                nights: s.nights
              }))
            }
          })
        }
        
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

    // ============ USER PRIVACY ROUTES ============
    
    // Get current user's privacy settings - GET /api/users/me/privacy
    if (route === '/users/me/privacy' && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const privacy = getUserPrivacyWithDefaults(auth.user)
      return handleCORS(NextResponse.json({ privacy }))
    }
    
    // Update current user's privacy settings - PATCH /api/users/me/privacy
    if (route === '/users/me/privacy' && method === 'PATCH') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const body = await request.json()
      
      // Validate enum values
      const validProfileVisibility = ['circle', 'public', 'private']
      const validTripsVisibility = ['circle', 'public', 'private']
      const validShowTripDetailsLevel = ['limited', 'full']
      
      const allowedKeys = ['profileVisibility', 'tripsVisibility', 'allowTripJoinRequests', 'showTripDetailsLevel']
      const updateData = {}
      
      for (const key of Object.keys(body)) {
        if (!allowedKeys.includes(key)) {
          return handleCORS(NextResponse.json(
            { error: `Unknown key: ${key}` },
            { status: 400 }
          ))
        }
        
        if (key === 'profileVisibility') {
          if (!validProfileVisibility.includes(body[key])) {
            return handleCORS(NextResponse.json(
              { error: `Invalid profileVisibility: ${body[key]}. Must be one of: ${validProfileVisibility.join(', ')}` },
              { status: 400 }
            ))
          }
          updateData[`privacy.${key}`] = body[key]
        } else if (key === 'tripsVisibility') {
          if (!validTripsVisibility.includes(body[key])) {
            return handleCORS(NextResponse.json(
              { error: `Invalid tripsVisibility: ${body[key]}. Must be one of: ${validTripsVisibility.join(', ')}` },
              { status: 400 }
            ))
          }
          updateData[`privacy.${key}`] = body[key]
        } else if (key === 'allowTripJoinRequests') {
          if (typeof body[key] !== 'boolean') {
            return handleCORS(NextResponse.json(
              { error: `Invalid allowTripJoinRequests: must be boolean` },
              { status: 400 }
            ))
          }
          updateData[`privacy.${key}`] = body[key]
        } else if (key === 'showTripDetailsLevel') {
          if (!validShowTripDetailsLevel.includes(body[key])) {
            return handleCORS(NextResponse.json(
              { error: `Invalid showTripDetailsLevel: ${body[key]}. Must be one of: ${validShowTripDetailsLevel.join(', ')}` },
              { status: 400 }
            ))
          }
          updateData[`privacy.${key}`] = body[key]
        }
      }
      
      if (Object.keys(updateData).length === 0) {
        return handleCORS(NextResponse.json(
          { error: 'No valid fields to update' },
          { status: 400 }
        ))
      }
      
      // Update user document
      await db.collection('users').updateOne(
        { id: auth.user.id },
        { $set: updateData }
      )
      
      // Fetch updated user to return privacy with defaults
      const updatedUser = await db.collection('users').findOne({ id: auth.user.id })
      const privacy = getUserPrivacyWithDefaults(updatedUser)
      
      return handleCORS(NextResponse.json({ privacy }))
    }
    
    // Get user profile (safe) - GET /api/users/:userId/profile
    if (route.match(/^\/users\/[^/]+\/profile$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const userId = path[1]
      const viewerId = auth.user.id
      const ownerId = userId
      
      // Fetch owner user
      const owner = await db.collection('users').findOne({ id: ownerId })
      if (!owner) {
        return handleCORS(NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        ))
      }
      
      // Always allow if viewing own profile
      if (viewerId === ownerId) {
        const privacy = getUserPrivacyWithDefaults(owner)
        const sharedCircleIds = await getSharedCircleIds(db, viewerId, ownerId)
        const sharedCircles = await Promise.all(
          sharedCircleIds.map(async (circleId) => {
            const circle = await db.collection('circles').findOne({ id: circleId })
            return circle ? { id: circle.id, name: circle.name } : null
          })
        )
        
        return handleCORS(NextResponse.json({
          id: owner.id,
          name: owner.name,
          avatarUrl: owner.avatarUrl || null,
          sharedCircles: sharedCircles.filter(c => c !== null),
          privacySummary: {
            tripsVisibility: privacy.tripsVisibility,
            allowTripJoinRequests: privacy.allowTripJoinRequests,
            showTripDetailsLevel: privacy.showTripDetailsLevel
          }
        }))
      }
      
      // Check access based on privacy settings
      const privacy = getUserPrivacyWithDefaults(owner)
      let canViewProfile = false
      
      if (privacy.profileVisibility === 'public') {
        canViewProfile = true
      } else if (privacy.profileVisibility === 'circle') {
        const sharedCircleIds = await getSharedCircleIds(db, viewerId, ownerId)
        canViewProfile = sharedCircleIds.length > 0
      } else if (privacy.profileVisibility === 'private') {
        canViewProfile = false
      }
      
      if (!canViewProfile) {
        return handleCORS(NextResponse.json(
          { error: 'This profile is private.' },
          { status: 403 }
        ))
      }
      
      // User can view profile - return safe profile
      const sharedCircleIds = await getSharedCircleIds(db, viewerId, ownerId)
      const sharedCircles = await Promise.all(
        sharedCircleIds.map(async (circleId) => {
          const circle = await db.collection('circles').findOne({ id: circleId })
          return circle ? { id: circle.id, name: circle.name } : null
        })
      )
      
      return handleCORS(NextResponse.json({
        id: owner.id,
        name: owner.name,
        avatarUrl: owner.avatarUrl || null,
        sharedCircles: sharedCircles.filter(c => c !== null),
        privacySummary: {
          tripsVisibility: privacy.tripsVisibility,
          allowTripJoinRequests: privacy.allowTripJoinRequests,
          showTripDetailsLevel: privacy.showTripDetailsLevel
        }
      }))
    }
    
    // Get user's upcoming trips - GET /api/users/:userId/upcoming-trips
    if (route.match(/^\/users\/[^/]+\/upcoming-trips$/) && method === 'GET') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const userId = path[1]
      const viewerId = auth.user.id
      const targetId = userId
      
      // Fetch target user
      const target = await db.collection('users').findOne({ id: targetId })
      if (!target) {
        return handleCORS(NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        ))
      }
      
      // Check tripsVisibility privacy
      // IMPORTANT: For self-views (viewerId === targetId), always allow access
      // The user's own privacy setting does NOT prevent them from seeing their own trips
      const privacy = getUserPrivacyWithDefaults(target)
      let canViewTrips = false
      
      if (viewerId === targetId) {
        // Self-view: user always sees their own trips regardless of privacy setting
        canViewTrips = true
      } else if (privacy.tripsVisibility === 'public') {
        canViewTrips = true
      } else if (privacy.tripsVisibility === 'circle') {
        const sharedCircleIds = await getSharedCircleIds(db, viewerId, targetId)
        canViewTrips = sharedCircleIds.length > 0
      } else if (privacy.tripsVisibility === 'private') {
        // Target user's privacy is 'private' - only they can see their trips
        canViewTrips = false
      }
      
      if (!canViewTrips) {
        return handleCORS(NextResponse.json(
          { error: 'Upcoming trips are private.' },
          { status: 403 }
        ))
      }
      
      // Get shared circles (for filtering trips)
      const sharedCircleIds = await getSharedCircleIds(db, viewerId, targetId)
      
      if (sharedCircleIds.length === 0) {
        // No shared circles - return empty list (circle-first MVP)
        return handleCORS(NextResponse.json({ trips: [] }))
      }
      
      // Get all trips in shared circles
      const allTrips = await db.collection('trips')
        .find({ circleId: { $in: sharedCircleIds } })
        .toArray()
      
      // Filter to upcoming trips (endDate >= today - 1 day)
      const today = new Date()
      today.setDate(today.getDate() - 1)
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]
      
      const upcomingTrips = allTrips.filter(trip => {
        const endDate = trip.lockedEndDate || trip.endDate
        return endDate && endDate >= todayStr
      })
      
      // Get all trip_participants for these trips
      const tripIds = upcomingTrips.map(t => t.id)
      const allParticipants = await db.collection('trip_participants')
        .find({ tripId: { $in: tripIds } })
        .toArray()
      
      // Get circle memberships for collaborative trips
      const circleMembershipsMap = new Map()
      for (const circleId of sharedCircleIds) {
        const memberships = await db.collection('memberships')
          .find({ circleId })
          .toArray()
        circleMembershipsMap.set(circleId, new Set(memberships.map(m => m.userId)))
      }
      
      // Filter trips where target user is an active traveler (before privacy filtering)
      const tripsWithActiveTarget = upcomingTrips.filter(trip => {
        const circleMemberUserIds = circleMembershipsMap.get(trip.circleId) || new Set()
        const tripParticipants = allParticipants.filter(p => p.tripId === trip.id)
        const statusByUserId = new Map()
        tripParticipants.forEach(p => {
          statusByUserId.set(p.userId, p.status || 'active')
        })
        
        if (trip.type === 'collaborative') {
          // Collaborative: circle members are base, trip_participants are overrides
          if (!circleMemberUserIds.has(targetId)) {
            return false // Not a circle member
          }
          const status = statusByUserId.get(targetId) || 'active'
          return status === 'active' // Active if no override or explicitly active
        } else {
          // Hosted: trip_participants is authoritative
          const participant = tripParticipants.find(p => p.userId === targetId)
          if (!participant) {
            return false // No participant record
          }
          const status = participant.status || 'active'
          return status === 'active'
        }
      })
      
      // Get circle names for response
      const circles = await db.collection('circles')
        .find({ id: { $in: sharedCircleIds } })
        .toArray()
      const circleMap = new Map(circles.map(c => [c.id, c.name]))
      
      // Apply profile privacy (only for other-user profile views)
      // In self contexts, no privacy filtering is applied
      const { applyProfileTripPrivacy } = await import('@/lib/trips/applyProfileTripPrivacy.js')
      const context = viewerId === targetId ? 'SELF_PROFILE' : 'PROFILE_VIEW'
      const { filteredTrips, applyDetailsLevel } = await applyProfileTripPrivacy({
        viewerId,
        ownerId: targetId,
        ownerPrivacy: privacy,
        trips: tripsWithActiveTarget,
        context
      })
      
      // Calculate activeTravelerCount and viewerIsTraveler for each trip
      const tripsWithCounts = await Promise.all(
        filteredTrips.map(async (trip) => {
          const circleMemberUserIds = circleMembershipsMap.get(trip.circleId) || new Set()
          const tripParticipants = allParticipants.filter(p => p.tripId === trip.id)
          
          let activeTravelerCount
          if (trip.type === 'collaborative') {
            // Start with circle members
            let activeCount = circleMemberUserIds.size
            // Subtract those who left/removed
            tripParticipants.forEach(p => {
              const status = p.status || 'active'
              if ((status === 'left' || status === 'removed') && circleMemberUserIds.has(p.userId)) {
                activeCount--
              }
            })
            activeTravelerCount = activeCount
          } else {
            // Hosted: count active participants
            activeTravelerCount = tripParticipants.filter(p => {
              const status = p.status || 'active'
              return status === 'active'
            }).length
          }
          
          // Determine if viewer is a traveler on this trip
          let viewerIsTraveler = false
          if (trip.type === 'collaborative') {
            // Collaborative: viewer is a traveler if they're a circle member and not left/removed
            if (circleMemberUserIds.has(viewerId)) {
              const viewerStatus = tripParticipants.find(p => p.userId === viewerId)
              const status = viewerStatus?.status || 'active'
              viewerIsTraveler = status === 'active'
            }
          } else {
            // Hosted: viewer is a traveler if they have an active participant record
            const viewerParticipant = tripParticipants.find(p => p.userId === viewerId)
            if (viewerParticipant) {
              const status = viewerParticipant.status || 'active'
              viewerIsTraveler = status === 'active'
            }
          }
          
          // Apply Trip Details Level only in profile views for non-owners
          // If applyDetailsLevel is true, return limited metadata
          const tripData = {
            id: trip.id,
            name: trip.name,
            circleId: trip.circleId,
            circleName: circleMap.get(trip.circleId) || 'Unknown Circle',
            status: trip.status || (trip.type === 'hosted' ? 'locked' : 'proposed'),
            activeTravelerCount,
            viewerIsTraveler
          }
          
          // Only include dates if full details or viewer is traveler/owner
          if (!applyDetailsLevel || viewerIsTraveler || trip.createdBy === viewerId) {
            tripData.startDate = trip.lockedStartDate || trip.startDate || null
            tripData.endDate = trip.lockedEndDate || trip.endDate || null
          }
          
          return tripData
        })
      )
      
      return handleCORS(NextResponse.json({ trips: tripsWithCounts }))
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
