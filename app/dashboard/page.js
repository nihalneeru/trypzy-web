'use client'

import { useState, useEffect } from 'react'
import { GlobalNotifications } from '@/components/dashboard/GlobalNotifications'
import { CircleSection } from '@/components/dashboard/CircleSection'
import { CreateCircleDialog } from '@/components/dashboard/CreateCircleDialog'
import { JoinCircleDialog } from '@/components/dashboard/JoinCircleDialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users, UserPlus, LogOut, Sparkles } from 'lucide-react'
import { BrandedSpinner } from '@/app/HomeClient'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'

// API Helper
const api = async (endpoint, options = {}, token = null) => {
  const headers = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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

// Dashboard Page
// NOTE: /dashboard is the canonical post-login landing page.
// All authenticated users should land here after login.
export default function DashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  
  // Dialog states
  const [showCreateCircle, setShowCreateCircle] = useState(false)
  const [showJoinCircle, setShowJoinCircle] = useState(false)

  // Dev-only navigation tracing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] dashboard page mounted', { pathname, hasToken: !!token, hasUser: !!user })
    }
  }, [pathname, token, user])

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const tokenValue = localStorage.getItem('trypzy_token')
        const userValue = localStorage.getItem('trypzy_user')
        
        if (!tokenValue) {
          // Auth gate: redirect to login if not authenticated
          router.replace('/')
          return
        }
        
        setToken(tokenValue)
        if (userValue) {
          setUser(JSON.parse(userValue))
        }
        
        const data = await api('/dashboard', { method: 'GET' }, tokenValue)
        setDashboardData(data)
      } catch (err) {
        console.error('Dashboard error:', err)
        setError(err.message)
        // If unauthorized, redirect to login with clean URL
        if (err.message.includes('Unauthorized')) {
          router.replace('/')
        }
      } finally {
        setLoading(false)
      }
    }
    
    loadDashboard()
  }, [router])

  const reloadDashboard = async () => {
    try {
      const tokenValue = localStorage.getItem('trypzy_token')
      if (!tokenValue) return
      
      const data = await api('/dashboard', { method: 'GET' }, tokenValue)
      setDashboardData(data)
    } catch (err) {
      console.error('Dashboard reload error:', err)
    }
  }

  const handleCreateCircleSuccess = () => {
    reloadDashboard()
  }

  const handleJoinCircleSuccess = () => {
    reloadDashboard()
  }

  const handleLogout = () => {
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    // MVP policy: logout always goes to clean /login URL (which is / for this app)
    router.replace('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="py-8 px-6">
            <p className="text-red-600">Error loading dashboard: {error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!dashboardData) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="dashboard-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="flex items-center" data-testid="logo-home">
                <TrypzyLogo variant="full" className="h-8 w-auto" />
                <span className="sr-only">Trypzy</span>
              </Link>
              <div className="hidden md:flex items-center gap-1 ml-8">
                <Button 
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push('/dashboard')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Circles
                </Button>
                <Button 
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/?view=discover')}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Discover
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">Hi, {user?.name}</span>
              <Link 
                href="/settings/privacy"
                className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
              >
                Privacy
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>
        
        {/* Global Notifications */}
        <GlobalNotifications notifications={dashboardData.globalNotifications || []} />
        
        {/* Your Circles Heading */}
        {dashboardData.circles && dashboardData.circles.length > 0 && (
          <div className="flex items-center justify-between mb-6 mt-2 flex-wrap gap-3">
            <h2 className="text-2xl font-semibold text-gray-900">Your Circles</h2>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowJoinCircle(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Join Circle
              </Button>
              <Button 
                size="sm"
                onClick={() => setShowCreateCircle(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Circle
              </Button>
            </div>
          </div>
        )}
        
        {/* Circle Sections */}
        {dashboardData.circles && dashboardData.circles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-medium text-gray-900 mb-2">No circles yet</h2>
              <p className="text-gray-500 mb-4">Join or create a circle to start planning trips</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setShowCreateCircle(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create circle
                </Button>
                <Button variant="outline" onClick={() => setShowJoinCircle(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join circle
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          dashboardData.circles.map((circle) => (
            <CircleSection 
              key={circle.id} 
              circle={circle}
              token={token}
              onTripCreated={reloadDashboard}
            />
          ))
        )}
      </div>

      {/* Dialogs */}
      {token && (
        <>
          <CreateCircleDialog
            open={showCreateCircle}
            onOpenChange={setShowCreateCircle}
            onSuccess={handleCreateCircleSuccess}
            token={token}
          />
          <JoinCircleDialog
            open={showJoinCircle}
            onOpenChange={setShowJoinCircle}
            onSuccess={handleJoinCircleSuccess}
            token={token}
          />
        </>
      )}
    </div>
  )
}
