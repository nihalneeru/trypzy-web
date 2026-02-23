'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import Image from 'next/image'
import { toast } from 'sonner'

// API Helper
const api = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [betaSecret, setBetaSecret] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [isOAuthReturn, setIsOAuthReturn] = useState(false)
  const loadingTimeoutRef = useRef(null)

  // Detect OAuth return vs fresh visit (client-only, avoids hydration mismatch)
  useEffect(() => {
    setIsOAuthReturn(!!sessionStorage.getItem('login_beta_secret'))
    setInitialized(true)
  }, [])

  // Persist returnTo in localStorage so it survives the OAuth round-trip
  useEffect(() => {
    const returnTo = searchParams.get('returnTo')
    if (returnTo && returnTo.startsWith('/')) {
      localStorage.setItem('tripti_pending_return_to', returnTo)
    }
  }, [searchParams])

  // Handle error query params from auth callbacks
  useEffect(() => {
    const error = searchParams.get('error')
    if (!error) return

    // Log actual error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Auth] Error from callback:', error)
    }

    if (error === 'AccountExists') {
      toast.error('An account already exists with that email. Please log in.')
    } else if (error === 'CallbackError') {
      toast.error('Something went wrong during sign in. Please try again.')
    } else {
      // Show actual error in development, generic message in production
      const message = process.env.NODE_ENV === 'development'
        ? `Auth error: ${error}`
        : 'Authentication failed. Please try again.'
      toast.error(message)
    }

    // Clean up URL
    window.history.replaceState({}, '', '/login')
  }, [searchParams, router])

  // Handle OAuth callback and already-authenticated users
  useEffect(() => {
    // Check for auth errors in session
    if (status === 'authenticated' && session?.error) {
      toast.error(session.error)
      return
    }

    const storedSecret = sessionStorage.getItem('login_beta_secret')

    if (status === 'authenticated' && session?.accessToken) {
      // Always store credentials when authenticated (ensures token is available after redirect)
      localStorage.setItem('tripti_token', session.accessToken)
      localStorage.setItem('tripti_user', JSON.stringify({
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      }))

      // Determine redirect destination: URL param > localStorage > dashboard
      const urlReturnTo = searchParams.get('returnTo')
      const storedReturnTo = localStorage.getItem('tripti_pending_return_to')
      const returnTo = urlReturnTo || storedReturnTo
      const destination = returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard'

      if (storedSecret) {
        sessionStorage.removeItem('login_beta_secret')
        document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }

      // If destination is a join page, handle the join here (token is guaranteed available)
      // then redirect to the trip/circle directly — avoids token timing issues on the join page
      // Guard: localStorage flag survives React StrictMode remounts (refs don't)
      const joinMatch = destination.match(/^\/join\/([^?]+)/)
      if (joinMatch && !localStorage.getItem('tripti_join_in_progress')) {
        localStorage.setItem('tripti_join_in_progress', '1')
        // Clear auto-join signals BEFORE the call so the join page won't also try
        localStorage.removeItem('tripti_pending_return_to')
        document.cookie = 'pendingCircleInvite=; path=/; max-age=0'

        const joinCode = joinMatch[1].trim().toUpperCase()
        const joinUrl = new URL(destination, window.location.origin)
        const tripId = joinUrl.searchParams.get('tripId')
        const refUserId = joinUrl.searchParams.get('ref')

        fetch('/api/circles/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.accessToken}`
          },
          body: JSON.stringify({
            inviteCode: joinCode,
            ...(tripId ? { tripId } : {}),
            ...(refUserId ? { invitedBy: refUserId } : {})
          })
        })
          .then(res => res.json())
          .then(data => {
            localStorage.removeItem('tripti_join_in_progress')
            const redirectTripId = data.tripId || tripId
            if (redirectTripId) {
              router.replace(`/trips/${redirectTripId}`)
            } else if (data.circleId) {
              router.replace(`/circles/${data.circleId}`)
            } else {
              router.replace('/dashboard')
            }
          })
          .catch(() => {
            localStorage.removeItem('tripti_join_in_progress')
            // On failure, fall through to the join page
            router.replace(destination)
          })
        return
      }

      router.replace(destination)
    }
  }, [session, status, router])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  const handleGoogleSignIn = async () => {
    if (!betaSecret.trim()) {
      toast.error('Please enter the private beta secret phrase')
      return
    }

    setGoogleLoading(true)

    // Set a timeout to reset loading state if OAuth flow is interrupted
    loadingTimeoutRef.current = setTimeout(() => {
      setGoogleLoading(false)
      toast.error('Sign in was interrupted. Please try again.')
    }, 60000) // 60 second timeout

    try {
      // Validate secret phrase first
      const response = await api('/auth/validate-beta-secret', {
        method: 'POST',
        body: JSON.stringify({ secret: betaSecret })
      })

      if (!response.valid) {
        toast.error('Invalid private beta secret phrase')
        clearTimeout(loadingTimeoutRef.current)
        setGoogleLoading(false)
        return
      }

      // Store secret in sessionStorage to verify in callback
      sessionStorage.setItem('login_beta_secret', betaSecret)

      // Set auth mode cookie for server-side validation
      // Use SameSite=Lax to ensure cookie survives OAuth redirect
      document.cookie = 'tripti_auth_mode=login; path=/; SameSite=Lax'

      // Initiate Google OAuth sign-in
      // Use /login as callback so we can handle the session sync here
      // Include returnTo in callbackUrl so it survives the OAuth round-trip in the URL itself
      const pendingReturnTo = localStorage.getItem('tripti_pending_return_to')
      const callbackUrl = pendingReturnTo
        ? `/login?returnTo=${encodeURIComponent(pendingReturnTo)}`
        : '/login'
      await signIn('google', {
        callbackUrl,
        redirect: true,
      })
    } catch (error) {
      // Clear sessionStorage on error
      sessionStorage.removeItem('login_beta_secret')
      clearTimeout(loadingTimeoutRef.current)
      toast.error(error.message || 'Failed to sign in with Google')
      setGoogleLoading(false)
    }
  }

  // Before useEffect runs, show spinner (matches server render = no hydration error).
  // After useEffect: OAuth return → keep spinner until redirect; fresh visit → show form.
  if (!initialized || (isOAuthReturn && status !== 'unauthenticated')) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4" aria-live="polite">
        <div className="text-center" role="status">
          <div className="flex items-center justify-center mb-4">
            <TriptiLogo variant="full" className="h-10 w-auto" />
          </div>
          <BrandedSpinner size="lg" className="mx-auto mb-3" />
          <p className="text-[#6B7280] text-sm">{isOAuthReturn ? 'Signing you in...' : ''}</p>
        </div>
      </div>
    )
  }

  return (
    <main id="main-content" className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <TriptiLogo variant="full" className="h-10 w-auto" />
          </div>
          <p className="text-[#6B7280]">Nifty plans. Happy circles.</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in to continue planning
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="beta-secret">Beta access code</Label>
                <Input
                  id="beta-secret"
                  type="text"
                  value={betaSecret}
                  onChange={(e) => setBetaSecret(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && betaSecret.trim() && !googleLoading) {
                      handleGoogleSignIn()
                    }
                  }}
                  placeholder="Enter your beta access code"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Ask a friend or check your invite for the code
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || !betaSecret.trim()}
              >
                {googleLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 shrink-0 animate-spin">
                      <Image
                        src="/brand/tripti-icon.svg"
                        alt="Loading"
                        width={20}
                        height={20}
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>Sign in with Google</span>
                  </div>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                By signing in, you agree to our{' '}
                <a href="/terms" className="underline">Terms of Use</a>
                {' '}and{' '}
                <a href="/privacy" className="underline">Privacy Policy</a>.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.push('/signup')}
            >
              Don't have an account? Sign up
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams (required by Next.js 14)
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <BrandedSpinner size="lg" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
