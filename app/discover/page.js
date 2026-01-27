'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, LogOut, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandedSpinner } from '@/app/HomeClient'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { DiscoverFeed } from '@/components/discover/DiscoverFeed'

export default function DiscoverPage() {
  const router = useRouter()

  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)
  const [circles, setCircles] = useState([])
  const [loading, setLoading] = useState(true)

  // Auth check + data fetch
  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('trypzy_token') : null
    const storedUser = typeof window !== 'undefined' ? localStorage.getItem('trypzy_user') : null

    if (!storedToken || !storedUser) {
      router.replace('/')
      return
    }

    let parsed
    try {
      parsed = JSON.parse(storedUser)
    } catch {
      router.replace('/')
      return
    }

    setToken(storedToken)
    setUser(parsed)

    // Fetch circles from dashboard endpoint
    const loadCircles = async () => {
      try {
        const res = await fetch('/api/dashboard', {
          headers: { Authorization: `Bearer ${storedToken}` },
        })

        if (res.status === 401) {
          localStorage.removeItem('trypzy_token')
          localStorage.removeItem('trypzy_user')
          router.replace('/')
          return
        }

        if (res.ok) {
          const data = await res.json()
          setCircles(
            (data.circles || []).map((c) => ({ id: c.id, name: c.name }))
          )
        }
      } catch {
        // Circles are optional for discover — proceed without them
      } finally {
        setLoading(false)
      }
    }

    loadCircles()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    router.replace('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-brand-carbon/60">Loading Discover...</p>
        </div>
      </div>
    )
  }

  if (!token) return null

  return (
    <div className="min-h-screen bg-gray-50" data-testid="discover-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="flex items-center" data-testid="logo-home">
                <TrypzyLogo variant="full" className="h-8 w-auto" />
                <span className="sr-only">Trypzy</span>
              </Link>
              <div className="flex items-center gap-1 ml-2 md:ml-8">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/dashboard')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Circles
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push('/discover')}
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
        <DiscoverFeed token={token} circles={circles} />
      </div>
    </div>
  )
}
