'use client'

import { Suspense, useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
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

  // Handle error query params from auth callbacks
  useEffect(() => {
    const error = searchParams.get('error')
    if (!error) return

    // Log actual error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('[Auth] Error from callback:', error)
    }

    if (error === 'AccountNotFound') {
      toast.error('No account found with that email. Redirecting to sign up...')
      setTimeout(() => router.replace('/signup'), 1500)
      return // Don't clean URL, we're redirecting
    } else if (error === 'AccountExists') {
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
      if (storedSecret) {
        // Just completed login flow - store credentials and redirect
        localStorage.setItem('trypzy_token', session.accessToken)
        localStorage.setItem('trypzy_user', JSON.stringify({
          id: session.user.id,
          email: session.user.email,
          name: session.user.name
        }))
        // Clear beta secret from sessionStorage
        sessionStorage.removeItem('login_beta_secret')
        // Clear auth mode cookie
        document.cookie = 'trypzy_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        // Redirect to dashboard
        router.replace('/dashboard')
      } else {
        // User is already logged in and just visiting login page - redirect to dashboard
        router.replace('/dashboard')
      }
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
      document.cookie = 'trypzy_auth_mode=login; path=/; SameSite=Lax'

      // Initiate Google OAuth sign-in
      // Use /login as callback so we can handle the session sync here
      await signIn('google', {
        callbackUrl: '/login',
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
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-4">
            <TrypzyLogo variant="full" className="h-10 w-auto" />
          </div>
          <BrandedSpinner size="lg" className="mx-auto mb-3" />
          <p className="text-[#6B7280] text-sm">{isOAuthReturn ? 'Signing you in...' : ''}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <TrypzyLogo variant="full" className="h-10 w-auto" />
          </div>
          <p className="text-[#6B7280]">Trips made easy</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
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
                        src="/brand/trypzy-icon.png"
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
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
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
    </div>
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
