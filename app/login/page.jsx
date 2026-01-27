'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [betaSecret, setBetaSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    const token = localStorage.getItem('trypzy_token')
    if (token) {
      router.replace('/dashboard')
    }
  }, [router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })

      localStorage.setItem('trypzy_token', data.token)
      localStorage.setItem('trypzy_user', JSON.stringify(data.user))
      toast.success('Welcome back!')

      router.replace('/dashboard')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (!betaSecret.trim()) {
      toast.error('Please enter the private beta secret phrase')
      return
    }

    setGoogleLoading(true)

    try {
      // Validate secret phrase first
      const response = await api('/auth/validate-beta-secret', {
        method: 'POST',
        body: JSON.stringify({ secret: betaSecret })
      })

      if (!response.valid) {
        toast.error('Invalid private beta secret phrase')
        setGoogleLoading(false)
        return
      }

      // Store secret in sessionStorage to verify in callback
      sessionStorage.setItem('login_beta_secret', betaSecret)

      // Set auth mode cookie for server-side validation
      document.cookie = 'trypzy_auth_mode=login; parse=true; path=/'

      // Initiate Google OAuth sign-in
      await signIn('google', {
        callbackUrl: '/dashboard', // Direct to dashboard for login
        redirect: true,
      })
    } catch (error) {
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
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>
              Sign in to continue planning
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  data-testid="login-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  data-testid="login-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                {loading ? (
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
                    <span>Loading...</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="beta-secret">Private Beta Secret Phrase</Label>
                <Input
                  id="beta-secret"
                  type="text"
                  value={betaSecret}
                  onChange={(e) => setBetaSecret(e.target.value)}
                  placeholder="Enter private beta secret"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Required for Google sign-in during private beta
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
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
