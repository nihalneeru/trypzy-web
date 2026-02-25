'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AppHeader } from '@/components/common/AppHeader'
import { CircleBubbleSection } from '@/components/dashboard/CircleBubbleSection'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { JoinCircleDialog } from '@/components/dashboard/JoinCircleDialog'
import { Button } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'

// API Helper with single retry for network errors (same as dashboard)
const api = async (endpoint, options = {}, token = null, { retry = true } = {}) => {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    })

    const data = await response.json()

    if (!response.ok) {
      const err = new Error(data.error || 'Something went wrong')
      err.status = response.status
      throw err
    }

    return data
  } catch (err) {
    if (retry && err instanceof TypeError) {
      await new Promise(r => setTimeout(r, 1500))
      return api(endpoint, options, token, { retry: false })
    }
    throw err
  }
}

export default function CirclesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [circles, setCircles] = useState(null)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showJoinCircle, setShowJoinCircle] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return

    const loadData = async () => {
      try {
        // Get token from localStorage or session
        let tokenValue = localStorage.getItem('tripti_token')

        if (!tokenValue && status === 'authenticated' && session?.accessToken) {
          tokenValue = session.accessToken
        }

        if (!tokenValue) {
          if (status === 'unauthenticated') {
            router.replace('/login')
          }
          return
        }

        const data = await api('/dashboard', { method: 'GET' }, tokenValue)
        setCircles(data.circles || [])
        setUser(data.user || null)
        setToken(tokenValue)
        loadedRef.current = true
      } catch (err) {
        console.error('Failed to load circles:', err)
        if (err?.status === 401 || err?.message?.includes('Unauthorized')) {
          localStorage.removeItem('tripti_token')
          localStorage.removeItem('tripti_user')
          router.replace('/')
        }
      } finally {
        setLoading(false)
      }
    }

    // If we have a localStorage token, load immediately.
    // Only wait for useSession when no localStorage token.
    const hasLocalToken = typeof window !== 'undefined' && localStorage.getItem('tripti_token')
    if (hasLocalToken || status !== 'loading') {
      loadData()
    }
  }, [router, session, status])

  const reloadCircles = async () => {
    try {
      const tokenValue = localStorage.getItem('tripti_token')
      if (!tokenValue) return
      const data = await api('/dashboard', { method: 'GET' }, tokenValue)
      setCircles(data.circles || [])
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <AppHeader activePage="circles" />
        <div className="flex items-center justify-center py-20">
          <BrandedSpinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <AppHeader userName={user?.name} activePage="circles" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-brand-carbon">Your Circles</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJoinCircle(true)}
            className="text-sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Join a circle
          </Button>
        </div>

        {/* Circles grid */}
        {circles && circles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center">
            {circles.map((circle) => (
              <CircleBubbleSection
                key={circle.id}
                circle={circle}
                token={token}
                currentUserId={user?.id}
                onTripCreated={reloadCircles}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-brand-sand flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-brand-blue" />
            </div>
            <h2 className="text-lg font-semibold text-brand-carbon mb-2">No circles yet</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              Circles are your friend groups. Create a trip to start a circle, or join one with an invite code.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => router.push('/dashboard')}
                className="bg-brand-red hover:bg-brand-red/90 text-white"
              >
                Plan a trip
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowJoinCircle(true)}
              >
                Join a circle
              </Button>
            </div>
          </div>
        )}
      </main>

      {token && (
        <JoinCircleDialog
          open={showJoinCircle}
          onOpenChange={setShowJoinCircle}
          onSuccess={reloadCircles}
          token={token}
        />
      )}
    </div>
  )
}
