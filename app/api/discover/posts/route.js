import { NextRequest, NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/server/db.js'
import { requireAuth, getUserFromToken } from '@/lib/server/auth.js'
import { handleCORS, OPTIONS as handleOPTIONS } from '@/lib/server/cors.js'
import { v4 as uuidv4 } from 'uuid'
import { writeFile, mkdir, access } from 'fs/promises'
import { join } from 'path'

// Escape special regex characters to prevent ReDoS attacks
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// OPTIONS handler for CORS preflight
export { handleOPTIONS as OPTIONS }

// GET /api/discover/posts - Get discoverable posts with scope-based filtering
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') || 'global' // default to global
    const circleId = url.searchParams.get('circleId')
    const search = url.searchParams.get('search')?.toLowerCase() || ''
    const page = parseInt(url.searchParams.get('page') || '1')
    const limit = 20
    const skip = (page - 1) * limit
    
    const db = await connectToMongo()
    
    // Get current user if authenticated (for isAuthor flag)
    const currentUser = await getUserFromToken(request)
    
    // Build query for discoverable posts only
    const query = { discoverable: true }
    
    // Scope-based filtering
    if (scope === 'global') {
      // Global feed: only posts with discoverScope="global" and circleId=null
      query.discoverScope = 'global'
      query.circleId = null
    } else if (scope === 'circle') {
      // Circle feed: requires authentication and membership validation
      const user = await getUserFromToken(request)
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: 'Authentication required for circle feed' },
          { status: 401 }
        ))
      }
      
      if (!circleId) {
        return handleCORS(NextResponse.json(
          { error: 'circleId is required for circle scope' },
          { status: 400 }
        ))
      }
      
      // Verify membership
      const membership = await db.collection('memberships').findOne({
        userId: user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You must be a member of this circle to view its feed' },
          { status: 403 }
        ))
      }
      
      // Circle feed: posts with discoverScope="circle" and matching circleId
      query.discoverScope = 'circle'
      query.circleId = circleId
    } else {
      return handleCORS(NextResponse.json(
        { error: 'Invalid scope. Must be "global" or "circle"' },
        { status: 400 }
      ))
    }
    
    // Optional search by destination or caption (escape regex to prevent ReDoS)
    if (search) {
      const escapedSearch = escapeRegex(search)
      query.$or = [
        { destinationText: { $regex: escapedSearch, $options: 'i' } },
        { caption: { $regex: escapedSearch, $options: 'i' } }
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
    const itineraryIds = [...new Set(posts.filter(p => p.itineraryId).map(p => p.itineraryId))]
    
    const users = await db.collection('users')
      .find({ id: { $in: userIds } })
      .toArray()
    
    const trips = tripIds.length > 0 
      ? await db.collection('trips').find({ id: { $in: tripIds } }).toArray()
      : []
    
    // Fetch itinerary data for posts that have attached itineraries
    let itineraries = []
    let itineraryItems = []
    if (itineraryIds.length > 0) {
      itineraries = await db.collection('itineraries')
        .find({ id: { $in: itineraryIds } })
        .toArray()
      itineraryItems = await db.collection('itinerary_items')
        .find({ itineraryId: { $in: itineraryIds } })
        .sort({ day: 1, order: 1 })
        .toArray()
    }
    
    const postsForDiscover = posts.map(post => {
      const trip = post.tripId ? trips.find(t => t.id === post.tripId) : null
      const itinerary = post.itineraryId ? itineraries.find(i => i.id === post.itineraryId) : null
      const items = post.itineraryId ? itineraryItems.filter(i => i.itineraryId === post.itineraryId) : []
      
      // Build itinerary snapshot if attached
      let itinerarySnapshot = null
      if (itinerary && items.length > 0) {
        // Group items by day
        const dayMap = new Map()
        items.forEach(item => {
          if (!dayMap.has(item.day)) {
            dayMap.set(item.day, [])
          }
          dayMap.get(item.day).push(item)
        })
        
        const tripLength = Math.max(...items.map(i => i.day))
        
        // Build day summaries
        const days = []
        for (let d = 1; d <= tripLength; d++) {
          const dayItems = dayMap.get(d) || []
          // For highlights mode, show top 3 per day; for full, show all
          const displayItems = post.itineraryMode === 'highlights' 
            ? dayItems.slice(0, 3)
            : dayItems
          
          days.push({
            dayNumber: d,
            items: displayItems.map(item => ({
              id: item.id,
              title: item.title,
              timeBlock: item.timeBlock,
              notes: item.notes,
              locationText: item.locationText
            })),
            totalItems: dayItems.length,
            hasMore: post.itineraryMode === 'highlights' && dayItems.length > 3
          })
        }
        
        itinerarySnapshot = {
          itineraryId: itinerary.id,
          tripId: post.tripId,
          style: itinerary.title,
          tripLength,
          totalActivities: items.length,
          mode: post.itineraryMode || 'highlights',
          days
        }
      }
      
        return {
          id: post.id,
          caption: post.caption,
          mediaUrls: post.mediaUrls || [],
          destinationText: post.destinationText,
          createdAt: post.createdAt,
          authorName: users.find(u => u.id === post.userId)?.name || 'Anonymous',
          userId: post.userId, // Include userId for authorization checks
          isAuthor: currentUser && currentUser.id === post.userId, // Check if current user is author
          tripName: trip?.name || null,
          tripId: post.tripId,
          hasItinerary: !!itinerary,
          itinerarySnapshot
        }
    })
    
    return handleCORS(NextResponse.json({
      posts: postsForDiscover,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore: skip + posts.length < totalCount
      }
    }))
  } catch (error) {
    console.error('Error fetching discover posts:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    ))
  }
}

// POST /api/discover/posts - Create discover post (authenticated, multipart/form-data)
export async function POST(request) {
  try {
    // Authentication check
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }
    
    // Parse multipart/form-data
    const formData = await request.formData()
    const scope = formData.get('scope')
    const circleId = formData.get('circleId')
    const tripId = formData.get('tripId')
    const caption = formData.get('caption')
    const images = formData.getAll('images') // Multiple files
    
    // Validate scope
    if (!scope || (scope !== 'global' && scope !== 'circle')) {
      return handleCORS(NextResponse.json(
        { error: 'scope must be "global" or "circle"' },
        { status: 400 }
      ))
    }
    
    // Validate scope rules
    if (scope === 'global') {
      // Global scope: circleId must be null
      if (circleId) {
        return handleCORS(NextResponse.json(
          { error: 'circleId must be null for global scope' },
          { status: 400 }
        ))
      }
      // tripId not allowed for global scope
      if (tripId) {
        return handleCORS(NextResponse.json(
          { error: 'tripId is not allowed for global scope' },
          { status: 400 }
        ))
      }
    } else if (scope === 'circle') {
      // Circle scope: circleId required
      if (!circleId) {
        return handleCORS(NextResponse.json(
          { error: 'circleId is required for circle scope' },
          { status: 400 }
        ))
      }
      
      const db = await connectToMongo()
      
      // Verify membership
      const membership = await db.collection('memberships').findOne({
        userId: auth.user.id,
        circleId
      })
      
      if (!membership) {
        return handleCORS(NextResponse.json(
          { error: 'You must be a member of this circle to create a discover post' },
          { status: 403 }
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
    }
    
    // Validate images
    if (!images || images.length === 0 || images.length > 5) {
      return handleCORS(NextResponse.json(
        { error: 'Posts require 1-5 images' },
        { status: 400 }
      ))
    }
    
    // Validate file types and sizes
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const maxSize = 5 * 1024 * 1024 // 5MB
    
    for (const file of images) {
      if (!allowedTypes.includes(file.type)) {
        return handleCORS(NextResponse.json(
          { error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, WebP` },
          { status: 400 }
        ))
      }
      if (file.size > maxSize) {
        return handleCORS(NextResponse.json(
          { error: `File ${file.name} is too large. Maximum size is 5MB` },
          { status: 400 }
        ))
      }
    }
    
    // Ensure uploads directory exists
    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    try {
      await access(uploadsDir)
    } catch {
      await mkdir(uploadsDir, { recursive: true })
    }
    
    // Save files and collect URLs
    const mediaUrls = []
    for (const file of images) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const filename = `${uuidv4()}.${ext}`
      const filePath = join(uploadsDir, filename)
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(filePath, buffer)
      mediaUrls.push(`/uploads/${filename}`)
    }
    
    const db = await connectToMongo()
    
    // Create post with discoverable=true and discoverScope
    const post = {
      id: uuidv4(),
      circleId: scope === 'circle' ? circleId : null,
      tripId: scope === 'circle' && tripId ? tripId : null,
      userId: auth.user.id,
      mediaUrls,
      caption: caption?.trim() || null,
      discoverable: true, // Always true for discover posts
      discoverScope: scope, // "global" or "circle"
      destinationText: null,
      itineraryId: null,
      itineraryMode: null,
      createdAt: new Date().toISOString()
    }
    
    await db.collection('posts').insertOne(post)
    
    return handleCORS(NextResponse.json({
      ...post,
      author: { id: auth.user.id, name: auth.user.name },
      isAuthor: true
    }))
  } catch (error) {
    console.error('Error creating discover post:', error)
    return handleCORS(NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    ))
  }
}

