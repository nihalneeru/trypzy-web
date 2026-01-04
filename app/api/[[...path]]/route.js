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
