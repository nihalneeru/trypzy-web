import { NextResponse } from 'next/server'
import { handleCORS, OPTIONS as handleOPTIONS } from '@/lib/server/cors.js'

// OPTIONS handler for CORS preflight
export { handleOPTIONS as OPTIONS }

// POST /api/seed/discover - Seed discover posts (dev only)
export async function POST() {
  // Only allow in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return handleCORS(NextResponse.json(
      { error: 'Seeding is only available in development' },
      { status: 403 }
    ))
  }
  
  try {
    // Use child_process to run the seed script
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    
    await execAsync('node scripts/seed-discover.js')
    return handleCORS(NextResponse.json({ message: 'Seed data created successfully' }))
  } catch (error) {
    console.error('Seeding error:', error)
    return handleCORS(NextResponse.json(
      { error: 'Failed to seed data', details: error.message },
      { status: 500 }
    ))
  }
}

