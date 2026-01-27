'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { AppHeader } from '@/components/common/AppHeader'
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
      <AppHeader userName={user?.name} activePage="discover" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <DiscoverFeed token={token} circles={circles} />
      </div>
    </div>
  )
}
