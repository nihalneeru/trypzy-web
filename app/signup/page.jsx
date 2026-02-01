'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
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

  // Check if response has content before parsing JSON
  const text = await response.text()
  if (!text) {
    throw new Error('Empty response from server')
  }

  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`)
  }

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data
}

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [betaSecret, setBetaSecret] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const loadingTimeoutRef = useRef(null)

  // Handle error query params from auth callbacks
  useEffect(() => {
    const error = searchParams.get('error')
    if (error === 'AccountNotFound') {
      toast.error('No account found with that email. Please sign up first.')
      // Clean up URL
      window.history.replaceState({}, '', '/signup')
    } else if (error === 'AccountExists') {
      toast.error('An account already exists with that email. Redirecting to login...')
      setTimeout(() => router.replace('/login'), 1500)
    } else if (error) {
      toast.error('Authentication failed. Please try again.')
      window.history.replaceState({}, '', '/signup')
    }
  }, [searchParams, router])

  // Handle OAuth callback - if we have a session with accessToken, store it and redirect
  useEffect(() => {
    // Check for auth errors in session
    if (status === 'authenticated' && session?.error) {
      toast.error(session.error)
      return
    }

    // Redirect already authenticated users (who didn't just complete signup flow)
    const storedSecret = sessionStorage.getItem('signup_beta_secret')

    if (status === 'authenticated' && session?.accessToken) {
      if (storedSecret) {
        // Just completed signup flow - store credentials and redirect
        localStorage.setItem('trypzy_token', session.accessToken)
        localStorage.setItem('trypzy_user', JSON.stringify({
          id: session.user.id,
          email: session.user.email,
          name: session.user.name
        }))
        // Clear beta secret from sessionStorage
        sessionStorage.removeItem('signup_beta_secret')
        // Clear auth mode cookie
        document.cookie = 'trypzy_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        // Redirect to dashboard
        router.replace('/dashboard')
      } else {
        // User is already logged in and just visiting signup page - redirect to dashboard
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

    // Set a timeout to reset loading state if OAuth flow is interrupted (e.g., popup blocked)
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
      sessionStorage.setItem('signup_beta_secret', betaSecret)

      // Set auth mode cookie for server-side validation
      // Use SameSite=Lax to ensure cookie survives OAuth redirect
      document.cookie = 'trypzy_auth_mode=signup; path=/; SameSite=Lax'

      // Initiate Google OAuth sign-in
      // NextAuth will handle the redirect and callback
      await signIn('google', {
        callbackUrl: '/signup',
        redirect: true,
      })

      // Note: When redirect is true, the page will redirect, so code below won't execute
    } catch (error) {
      // Clear sessionStorage on error
      sessionStorage.removeItem('signup_beta_secret')
      clearTimeout(loadingTimeoutRef.current)
      toast.error(error.message || 'Failed to sign in with Google')
      setGoogleLoading(false)
    }
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
            <CardTitle>Create Account</CardTitle>
            <CardDescription>
              Start planning trips with friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="beta-secret">Private Beta Secret Phrase</Label>
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
                  placeholder="Enter private beta secret"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Required during private beta
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
                    <span>Signing up...</span>
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
                    <span>Sign up with Google</span>
                  </div>
                )}
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.push('/login')}
            >
              Already have an account? Sign in
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
