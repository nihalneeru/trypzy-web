import { NextResponse } from 'next/server'

// EU/EEA country codes (27 EU + 3 EEA + UK)
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', // EEA
  'GB', // UK (GDPR-equivalent)
])

export function middleware(request) {
  const response = NextResponse.next()

  // Only set on first visit (don't override if cookie consent already given)
  if (!request.cookies.has('tripti_cookie_consent')) {
    const country = request.headers.get('x-vercel-ip-country') || ''
    if (EU_COUNTRIES.has(country)) {
      response.cookies.set('tripti_geo_eu', '1', {
        httpOnly: false,
        maxAge: 60 * 60 * 24, // 24h — rechecked daily
        path: '/',
        sameSite: 'lax',
      })
    }
  }

  return response
}

export const config = {
  matcher: [
    // Match all pages except static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico|icon-|apple-touch-icon|brand/).*)',
  ],
}
