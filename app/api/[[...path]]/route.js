import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

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

// Consensus Algorithm - MUST BE DETERMINISTIC
// Available = +1, Maybe = +0.5, Unavailable = 0
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
      
      return handleCORS(NextResponse.json({
        ...circle,
        members: membersWithRoles,
        trips: trips.map(({ _id, ...rest }) => rest),
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
      
      const trip = {
        id: uuidv4(),
        circleId,
        name,
        description: description || '',
        type, // 'collaborative' or 'hosted'
        startDate, // YYYY-MM-DD
        endDate,   // YYYY-MM-DD
        duration: duration || 3,
        status: type === 'hosted' ? 'locked' : 'scheduling', // scheduling, voting, locked
        lockedStartDate: type === 'hosted' ? startDate : null,
        lockedEndDate: type === 'hosted' ? endDate : null,
        createdBy: auth.user.id,
        createdAt: new Date().toISOString()
      }
      
      await db.collection('trips').insertOne(trip)
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId: trip.id,
        userId: null,
        content: `Trip "${name}" was created by ${auth.user.name}`,
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
      
      // Get participants (for hosted trips)
      const participants = await db.collection('trip_participants')
        .find({ tripId })
        .toArray()
      
      // Get participant user details
      const participantUserIds = participants.map(p => p.userId)
      const participantUsers = await db.collection('users')
        .find({ id: { $in: participantUserIds } })
        .toArray()
      
      // Calculate consensus options
      const consensusOptions = trip.status !== 'locked' && trip.type === 'collaborative'
        ? calculateConsensus(availabilities, trip.startDate, trip.endDate, trip.duration)
        : []
      
      // Get user's availability
      const userAvailability = availabilities.filter(a => a.userId === auth.user.id)
      
      // Get user's vote
      const userVote = votes.find(v => v.userId === auth.user.id)
      
      // Check if user is participant (for hosted trips)
      const isParticipant = participants.some(p => p.userId === auth.user.id)
      
      // Get circle info
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      return handleCORS(NextResponse.json({
        ...trip,
        circle: circle ? { id: circle.id, name: circle.name, ownerId: circle.ownerId } : null,
        availabilities: availabilities.map(({ _id, ...rest }) => rest),
        userAvailability: userAvailability.map(({ _id, ...rest }) => rest),
        votes: votes.map(({ _id, ...rest }) => rest),
        userVote: userVote ? { optionKey: userVote.optionKey } : null,
        consensusOptions,
        participants: participantUsers.map(u => ({ id: u.id, name: u.name })),
        isParticipant,
        isCreator: trip.createdBy === auth.user.id,
        canLock: (trip.createdBy === auth.user.id || circle?.ownerId === auth.user.id) && trip.status === 'voting'
      }))
    }
    
    // Submit availability - POST /api/trips/:id/availability
    if (route.match(/^\/trips\/[^/]+\/availability$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { availabilities } = body // Array of { day: 'YYYY-MM-DD', status: 'available'|'maybe'|'unavailable' }
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      if (trip.status === 'locked') {
        return handleCORS(NextResponse.json(
          { error: 'Trip dates are already locked' },
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
      
      // Delete existing availability for this user/trip
      await db.collection('availabilities').deleteMany({
        tripId,
        userId: auth.user.id
      })
      
      // Insert new availabilities
      const newAvailabilities = availabilities.map(a => ({
        id: uuidv4(),
        tripId,
        userId: auth.user.id,
        day: a.day,
        status: a.status,
        createdAt: new Date().toISOString()
      }))
      
      if (newAvailabilities.length > 0) {
        await db.collection('availabilities').insertMany(newAvailabilities)
      }
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `${auth.user.name} submitted their availability`,
        isSystem: true,
        createdAt: new Date().toISOString()
      })
      
      return handleCORS(NextResponse.json({ message: 'Availability saved', availabilities: newAvailabilities }))
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
      
      if (trip.status !== 'scheduling') {
        return handleCORS(NextResponse.json(
          { error: 'Voting can only be opened during scheduling phase' },
          { status: 400 }
        ))
      }
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { $set: { status: 'voting' } }
      )
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `Voting is now open! Choose your preferred dates.`,
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
      
      if (trip.status !== 'voting') {
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
    
    // Lock trip - POST /api/trips/:id/lock
    if (route.match(/^\/trips\/[^/]+\/lock$/) && method === 'POST') {
      const auth = await requireAuth(request)
      if (auth.error) {
        return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
      }
      
      const tripId = path[1]
      const body = await request.json()
      const { optionKey } = body
      
      const trip = await db.collection('trips').findOne({ id: tripId })
      if (!trip) {
        return handleCORS(NextResponse.json(
          { error: 'Trip not found' },
          { status: 404 }
        ))
      }
      
      const circle = await db.collection('circles').findOne({ id: trip.circleId })
      
      // Only trip creator or circle owner can lock
      if (trip.createdBy !== auth.user.id && circle?.ownerId !== auth.user.id) {
        return handleCORS(NextResponse.json(
          { error: 'Only the trip creator or circle owner can lock the trip' },
          { status: 403 }
        ))
      }
      
      if (trip.status !== 'voting') {
        return handleCORS(NextResponse.json(
          { error: 'Trip can only be locked during voting phase' },
          { status: 400 }
        ))
      }
      
      const [lockedStartDate, lockedEndDate] = optionKey.split('_')
      
      await db.collection('trips').updateOne(
        { id: tripId },
        { 
          $set: { 
            status: 'locked',
            lockedStartDate,
            lockedEndDate
          } 
        }
      )
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `Trip dates locked! ${lockedStartDate} to ${lockedEndDate}`,
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
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `${auth.user.name} joined the trip!`,
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
      
      // Add system message
      await db.collection('trip_messages').insertOne({
        id: uuidv4(),
        tripId,
        userId: null,
        content: `${auth.user.name} left the trip`,
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
      const { mediaUrls, caption, tripId, discoverable, destinationText } = body
      
      // Validate mediaUrls
      if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0 || mediaUrls.length > 5) {
        return handleCORS(NextResponse.json(
          { error: 'Posts require 1-5 images' },
          { status: 400 }
        ))
      }
      
      // If tripId provided, verify it belongs to this circle
      if (tripId) {
        const trip = await db.collection('trips').findOne({ id: tripId, circleId })
        if (!trip) {
          return handleCORS(NextResponse.json(
            { error: 'Trip not found in this circle' },
            { status: 400 }
          ))
        }
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
    
    // Get discoverable posts - GET /api/discover/posts (public, read-only)
    if (route === '/discover/posts' && method === 'GET') {
      const url = new URL(request.url)
      const search = url.searchParams.get('search')?.toLowerCase() || ''
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = 20
      const skip = (page - 1) * limit
      
      // Build query for discoverable posts only
      const query = { discoverable: true }
      
      // Optional search by destination or caption
      if (search) {
        query.$or = [
          { destinationText: { $regex: search, $options: 'i' } },
          { caption: { $regex: search, $options: 'i' } }
        ]
      }
      
      const posts = await db.collection('posts')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray()
      
      const totalCount = await db.collection('posts').countDocuments(query)
      
      // Get user details (only name for public display)
      const userIds = [...new Set(posts.map(p => p.userId))]
      const tripIds = [...new Set(posts.filter(p => p.tripId).map(p => p.tripId))]
      
      const users = await db.collection('users')
        .find({ id: { $in: userIds } })
        .toArray()
      
      const trips = tripIds.length > 0 
        ? await db.collection('trips').find({ id: { $in: tripIds } }).toArray()
        : []
      
      const postsForDiscover = posts.map(post => ({
        id: post.id,
        caption: post.caption,
        mediaUrls: post.mediaUrls || [],
        destinationText: post.destinationText,
        createdAt: post.createdAt,
        authorName: users.find(u => u.id === post.userId)?.name || 'Anonymous',
        tripName: post.tripId && trips.find(t => t.id === post.tripId)?.name || null
      }))
      
      return handleCORS(NextResponse.json({
        posts: postsForDiscover,
        pagination: {
          page,
          limit,
          total: totalCount,
          hasMore: skip + posts.length < totalCount
        }
      }))
    }
    
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
