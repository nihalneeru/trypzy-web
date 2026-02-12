const { MongoClient } = require('mongodb')
const { v4: uuidv4 } = require('uuid')
const bcrypt = require('bcryptjs')

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'tripti'

async function seedDiscover() {
  if (!MONGO_URL) {
    console.error('MONGO_URL environment variable is required')
    process.exit(1)
  }

  const client = new MongoClient(MONGO_URL)
  
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    
    console.log('🌱 Seeding discover posts...')
    
    // Check if seed users already exist
    const existingSeedUser1 = await db.collection('users').findOne({ email: 'alex.traveler@example.com' })
    const existingSeedUser2 = await db.collection('users').findOne({ email: 'sam.explorer@example.com' })
    
    let user1, user2
    
    if (!existingSeedUser1) {
      const hashedPassword1 = await bcrypt.hash('password123', 10)
      user1 = {
        id: uuidv4(),
        email: 'alex.traveler@example.com',
        password: hashedPassword1,
        name: 'Alex',
        createdAt: new Date().toISOString()
      }
      await db.collection('users').insertOne(user1)
      console.log('✅ Created seed user: Alex')
    } else {
      user1 = existingSeedUser1
      console.log('ℹ️  Seed user Alex already exists')
    }
    
    if (!existingSeedUser2) {
      const hashedPassword2 = await bcrypt.hash('password123', 10)
      user2 = {
        id: uuidv4(),
        email: 'sam.explorer@example.com',
        password: hashedPassword2,
        name: 'Sam',
        createdAt: new Date().toISOString()
      }
      await db.collection('users').insertOne(user2)
      console.log('✅ Created seed user: Sam')
    } else {
      user2 = existingSeedUser2
      console.log('ℹ️  Seed user Sam already exists')
    }
    
    // Create or find seed circles
    let circle1 = await db.collection('circles').findOne({ name: 'Adventure Seekers' })
    let circle2 = await db.collection('circles').findOne({ name: 'Weekend Warriors' })
    
    if (!circle1) {
      circle1 = {
        id: uuidv4(),
        name: 'Adventure Seekers',
        description: 'Exploring the world one trip at a time',
        ownerId: user1.id,
        inviteCode: 'SEED01',
        createdAt: new Date().toISOString()
      }
      await db.collection('circles').insertOne(circle1)
      
      // Add memberships
      await db.collection('memberships').insertOne({
        userId: user1.id,
        circleId: circle1.id,
        role: 'owner',
        joinedAt: new Date().toISOString()
      })
      console.log('✅ Created seed circle: Adventure Seekers')
    } else {
      console.log('ℹ️  Seed circle Adventure Seekers already exists')
    }
    
    if (!circle2) {
      circle2 = {
        id: uuidv4(),
        name: 'Weekend Warriors',
        description: 'Quick getaways and weekend adventures',
        ownerId: user2.id,
        inviteCode: 'SEED02',
        createdAt: new Date().toISOString()
      }
      await db.collection('circles').insertOne(circle2)
      
      // Add memberships
      await db.collection('memberships').insertOne({
        userId: user2.id,
        circleId: circle2.id,
        role: 'owner',
        joinedAt: new Date().toISOString()
      })
      console.log('✅ Created seed circle: Weekend Warriors')
    } else {
      console.log('ℹ️  Seed circle Weekend Warriors already exists')
    }
    
    // Create seed trips (optional, for some posts)
    const today = new Date()
    const trip1Date = new Date(today)
    trip1Date.setDate(today.getDate() + 30)
    const trip1EndDate = new Date(trip1Date)
    trip1EndDate.setDate(trip1Date.getDate() + 3)
    
    let trip1 = await db.collection('trips').findOne({ circleId: circle1.id, name: 'Beach Paradise' })
    if (!trip1) {
      trip1 = {
        id: uuidv4(),
        circleId: circle1.id,
        name: 'Beach Paradise',
        description: 'Sun, sand, and relaxation',
        type: 'collaborative',
        startDate: trip1Date.toISOString().split('T')[0],
        endDate: trip1EndDate.toISOString().split('T')[0],
        duration: 3,
        status: 'locked',
        lockedStartDate: trip1Date.toISOString().split('T')[0],
        lockedEndDate: trip1EndDate.toISOString().split('T')[0],
        createdBy: user1.id,
        createdAt: new Date().toISOString()
      }
      await db.collection('trips').insertOne(trip1)
      console.log('✅ Created seed trip: Beach Paradise')
    }
    
    const trip2Date = new Date(today)
    trip2Date.setDate(today.getDate() + 60)
    const trip2EndDate = new Date(trip2Date)
    trip2EndDate.setDate(trip2Date.getDate() + 4)
    
    let trip2 = await db.collection('trips').findOne({ circleId: circle2.id, name: 'Mountain Escape' })
    if (!trip2) {
      trip2 = {
        id: uuidv4(),
        circleId: circle2.id,
        name: 'Mountain Escape',
        description: 'Hiking and nature',
        type: 'collaborative',
        startDate: trip2Date.toISOString().split('T')[0],
        endDate: trip2EndDate.toISOString().split('T')[0],
        duration: 4,
        status: 'locked',
        lockedStartDate: trip2Date.toISOString().split('T')[0],
        lockedEndDate: trip2EndDate.toISOString().split('T')[0],
        createdBy: user2.id,
        createdAt: new Date().toISOString()
      }
      await db.collection('trips').insertOne(trip2)
      console.log('✅ Created seed trip: Mountain Escape')
    }
    
    // Check if seed posts already exist (to avoid duplicates)
    const existingSeedPosts = await db.collection('posts').find({ 
      caption: { $regex: /^\[SEED\]/ }
    }).toArray()
    
    if (existingSeedPosts.length > 0) {
      console.log(`ℹ️  Found ${existingSeedPosts.length} existing seed posts. Skipping creation to avoid duplicates.`)
      console.log('   To reseed, delete existing seed posts first or reset the database.')
      await client.close()
      return
    }
    
    // Create seed discover posts - mix of global and circle-scoped
    const seedPosts = [
      // Global posts (discoverScope="global", circleId=null)
      {
        id: uuidv4(),
        circleId: null,
        tripId: null,
        userId: user1.id,
        mediaUrls: ['/uploads/sample_beach.png'],
        caption: '[SEED] Just got back from the most amazing beach trip! Clear waters and white sand beaches. Perfect for a weekend getaway.',
        discoverable: true,
        discoverScope: 'global',
        destinationText: 'Tropical Beach',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
      },
      {
        id: uuidv4(),
        circleId: null,
        tripId: null,
        userId: user2.id,
        mediaUrls: ['/uploads/sample_mountain.png'],
        caption: '[SEED] Mountain hiking was incredible! The views were absolutely breathtaking. Highly recommend this trail.',
        discoverable: true,
        discoverScope: 'global',
        destinationText: 'Mountain Range',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
      },
      {
        id: uuidv4(),
        circleId: null,
        tripId: null,
        userId: user1.id,
        mediaUrls: ['/uploads/sample_beach.png'],
        caption: '[SEED] Sunset by the ocean. There\'s nothing quite like it.',
        discoverable: true,
        discoverScope: 'global',
        destinationText: 'Coastal Town',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
      },
      // Circle-scoped posts (discoverScope="circle", circleId set)
      {
        id: uuidv4(),
        circleId: circle1.id,
        tripId: trip1?.id || null,
        userId: user1.id,
        mediaUrls: ['/uploads/sample_beach.png'],
        caption: '[SEED] Circle-only: Our Adventure Seekers beach trip was amazing! Sharing with just our group.',
        discoverable: true,
        discoverScope: 'circle',
        destinationText: 'Private Beach Trip',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString() // 6 days ago
      },
      {
        id: uuidv4(),
        circleId: circle2.id,
        tripId: trip2?.id || null,
        userId: user2.id,
        mediaUrls: ['/uploads/sample_mountain.png'],
        caption: '[SEED] Circle-only: Weekend Warriors mountain escape! This was our best trip yet.',
        discoverable: true,
        discoverScope: 'circle',
        destinationText: 'Mountain Escape',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() // 4 days ago
      },
      {
        id: uuidv4(),
        circleId: circle1.id,
        tripId: null,
        userId: user1.id,
        mediaUrls: ['/uploads/sample_beach.png', '/uploads/sample_mountain.png'],
        caption: '[SEED] Circle-only: Beach to mountain adventure with Adventure Seekers!',
        discoverable: true,
        discoverScope: 'circle',
        destinationText: 'Diverse Adventure',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        id: uuidv4(),
        circleId: null,
        tripId: null,
        userId: user2.id,
        mediaUrls: ['/uploads/sample_mountain.png'],
        caption: '[SEED] Early morning hike rewarded us with stunning views. Worth the 5am alarm!',
        discoverable: true,
        discoverScope: 'global',
        destinationText: 'Scenic Overlook',
        itineraryId: null,
        itineraryMode: null,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      }
    ]
    
    await db.collection('posts').insertMany(seedPosts)
    console.log(`✅ Created ${seedPosts.length} seed discover posts`)
    
    console.log('\n✨ Seeding complete!')
    console.log('\nSeed accounts you can use:')
    console.log('  - alex.traveler@example.com / password123')
    console.log('  - sam.explorer@example.com / password123')
    console.log('\nVisit /discover to see the seed posts!')
    
  } catch (error) {
    console.error('❌ Error seeding:', error)
    throw error
  } finally {
    await client.close()
  }
}

// Run if called directly
if (require.main === module) {
  seedDiscover()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}

module.exports = { seedDiscover }

