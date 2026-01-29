import { NextResponse } from 'next/server'

// Helper function to handle CORS
export function handleCORS(response) {
  const origins = process.env.CORS_ORIGINS
  if (!origins && process.env.NODE_ENV === 'production') {
    console.error('CORS_ORIGINS environment variable must be set in production')
    // In production, don't set permissive CORS - let browser enforce same-origin
  } else {
    response.headers.set('Access-Control-Allow-Origin', origins || 'http://localhost:3000')
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

