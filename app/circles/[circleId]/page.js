'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { TripCard } from '@/components/dashboard/TripCard'
import { sortTrips } from '@/lib/dashboard/sortTrips'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Users, MapPin } from 'lucide-react'
import { BrandedSpinner } from '@/app/HomeClient'
import Link from 'next/link'
import Image from 'next/image'

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

/**
 * Circle Detail Page
 * Uses the exact same TripCard component and data shape as dashboard
 */
export default function CircleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const circleId = params?.circleId
  const [circle, setCircle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [token, setToken] = useState(null)
  
  useEffect(() => {
    const loadCircle = async () => {
      try {
        const tokenValue = localStorage.getItem('trypzy_token')
        
        if (!tokenValue) {
          router.push('/')
          return
        }
        
        setToken(tokenValue)
        
        const data = await api(`/circles/${circleId}`, { method: 'GET' }, tokenValue)
        setCircle(data)
      } catch (err) {
        console.error('Circle detail error:', err)
        setError(err.message)
        // If unauthorized, redirect to login
        if (err.message.includes('Unauthorized') || err.message.includes('not a member')) {
          router.push('/dashboard')
        }
      } finally {
        setLoading(false)
      }
    }
    
    if (circleId) {
      loadCircle()
    }
  }, [circleId, router])
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading circle...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="py-8 px-6">
            <p className="text-red-600">Error loading circle: {error}</p>
            <Button onClick={() => router.push('/dashboard')} className="mt-4">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (!circle) {
    return null
  }
  
  // Sort trips using the same function as dashboard
  const sortedTrips = sortTrips(circle.trips || [])
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center">
              <Image
                src="/brand/trypzy-logo.png"
                alt="Trypzy"
                width={140}
                height={40}
                className="h-8 w-auto object-contain"
                unoptimized
                priority
              />
              <span className="sr-only">Trypzy</span>
            </Link>
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Circle Header */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-600" />
                <h1 className="text-2xl font-semibold">{circle.name}</h1>
              </div>
            </div>
          </CardHeader>
        </Card>
        
        {/* Trips Section */}
        {sortedTrips.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No trips yet</h3>
              <p className="text-gray-500 mb-4">Create a trip to start planning with your circle</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedTrips.map((trip) => (
              <TripCard key={trip.id} trip={trip} circleId={circle.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
