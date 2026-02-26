'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Users, Calendar, MapPin, Shield, UserPlus, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { AppHeader } from '@/components/common/AppHeader'
import { circlePageHref } from '@/lib/navigation/routes'

const api = async (endpoint, options = {}, token) => {
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Request failed')
  }
  
  return response.json()
}

// Helper to get initials
function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Format date range
function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return 'Dates not locked'
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  
  return `${startFormatted} - ${endFormatted}`
}

export default function MemberProfilePage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.userId

  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState(null)
  const [profile, setProfile] = useState(null)
  const [trips, setTrips] = useState([])
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [tripsError, setTripsError] = useState(null)
  const [joinRequestStatuses, setJoinRequestStatuses] = useState({}) // tripId -> status
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [joinMessage, setJoinMessage] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)
  
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('tripti_user')
      if (storedUser) setUserName(JSON.parse(storedUser).name)
    } catch {}
  }, [])

  useEffect(() => {
    loadProfile()
  }, [userId])
  
  useEffect(() => {
    if (profile && !profileError) {
      loadUpcomingTrips()
    }
  }, [profile, profileError])
  
  const loadProfile = async () => {
    setLoading(true)
    setProfileError(null)
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) {
        router.push('/')
        return
      }
      
      const data = await api(`/users/${userId}/profile`, { method: 'GET' }, token)
      setProfile(data)
    } catch (error) {
      if (error.message?.includes('Unauthorized')) {
        localStorage.removeItem('tripti_token')
        localStorage.removeItem('tripti_user')
        router.replace('/')
        return
      }
      setProfileError(error.message || 'Failed to load profile')
      if (error.message?.includes('private')) {
        // Keep error message for display
      }
    } finally {
      setLoading(false)
    }
  }
  
  const loadUpcomingTrips = async () => {
    setLoadingTrips(true)
    setTripsError(null)
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) {
        return
      }
      
      const data = await api(`/users/${userId}/upcoming-trips`, { method: 'GET' }, token)
      setTrips(data.trips || [])
      
      // Load join request statuses for each trip (only for trips where viewer is NOT already a traveler)
      const statuses = {}
      await Promise.all(
        data.trips
          .filter(trip => !trip.viewerIsTraveler) // Only check status for trips viewer is not on
          .map(async (trip) => {
            try {
              const statusData = await api(`/trips/${trip.id}/join-requests/me`, { method: 'GET' }, token)
              statuses[trip.id] = statusData.status
            } catch (err) {
              // If error, assume no request
              statuses[trip.id] = 'none'
            }
          })
      )
      setJoinRequestStatuses(statuses)
    } catch (error) {
      setTripsError(error.message || 'Failed to load upcoming trips')
      if (error.message.includes('private')) {
        // Keep error message for display
      }
    } finally {
      setLoadingTrips(false)
    }
  }
  
  const handleTripClick = (trip, e) => {
    // Don't navigate if clicking the join button
    if (e?.target?.closest('.join-button-container')) {
      return
    }
    
    // Privacy check: Only allow navigation if viewer is a traveler on this trip
    const viewerIsTraveler = trip.viewerIsTraveler === true
    const isViewerTraveler = isViewingOwnProfile || viewerIsTraveler
    
    if (!isViewerTraveler) {
      // Viewer is not a traveler - don't navigate (privacy protection)
      return
    }
    
    router.push(`/trips/${trip.id}`)
  }
  
  const handleRequestJoin = (trip) => {
    setSelectedTrip(trip)
    setJoinMessage('')
    setShowJoinDialog(true)
  }
  
  const submitJoinRequest = async () => {
    if (!selectedTrip) return
    
    setSubmittingRequest(true)
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) {
        toast.error('Please log in to request to join')
        return
      }
      
      await api(`/trips/${selectedTrip.id}/join-requests`, {
        method: 'POST',
        body: JSON.stringify({ message: joinMessage.trim() || null })
      }, token)
      
      toast.success('Join request submitted!')
      setShowJoinDialog(false)
      setJoinMessage('')
      
      // Update status for this trip
      setJoinRequestStatuses(prev => ({
        ...prev,
        [selectedTrip.id]: 'pending'
      }))
    } catch (error) {
      // If already active participant, update status
      if (error.message.includes('already an active participant')) {
        setJoinRequestStatuses(prev => ({
          ...prev,
          [selectedTrip.id]: 'approved'
        }))
        toast.info('You are already on this trip')
      } else {
        toast.error(error.message || 'Failed to submit join request')
      }
    } finally {
      setSubmittingRequest(false)
    }
  }
  
  // Get current user ID from token (decode JWT)
  const getCurrentUserId = () => {
    try {
      const token = localStorage.getItem('tripti_token')
      if (!token) return null
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.userId
    } catch {
      return null
    }
  }
  
  const currentUserId = getCurrentUserId()
  const isViewingOwnProfile = currentUserId === userId
  
  if (loading) {
    return (
      <div className="min-h-screen bg-brand-sand/30 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-brand-carbon/70">Loading profile...</p>
        </div>
      </div>
    )
  }
  
  if (profileError) {
    return (
      <div className="min-h-screen bg-brand-sand/30">
        <AppHeader userName={userName} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 text-brand-carbon/40 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-brand-carbon mb-2">Profile Private</h2>
              <p className="text-brand-carbon/70">{profileError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  
  if (!profile) {
    return null
  }
  
  // Generate a consistent gradient from the profile name
  const nameHash = (profile?.name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const gradientAngle = nameHash % 360
  const hue = nameHash % 360

  return (
    <div className="min-h-screen bg-brand-sand/30">
      <AppHeader userName={userName} />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-brand-carbon/60 hover:text-brand-carbon mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {/* Profile Header with gradient banner */}
        <Card className="mb-6 overflow-hidden">
          <div
            className="h-20 sm:h-24"
            style={{
              background: `linear-gradient(${gradientAngle}deg, hsl(${hue}, 40%, 85%), hsl(${(hue + 60) % 360}, 35%, 80%))`
            }}
          />
          <CardContent className="relative pt-0 pb-5 px-5">
            <div className="flex items-end gap-4 -mt-8">
              <Avatar className="h-16 w-16 ring-4 ring-white shadow-sm">
                {profile.avatarUrl && (
                  <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                )}
                <AvatarFallback className="text-lg bg-brand-blue text-white">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 pb-1">
                <h1 className="text-xl font-bold text-brand-carbon">{profile.name}</h1>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-4 text-sm text-brand-carbon/70">
              {profile.sharedCircles && profile.sharedCircles.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-brand-blue" />
                  {profile.sharedCircles.length} shared {profile.sharedCircles.length === 1 ? 'circle' : 'circles'}
                </span>
              )}
              {trips.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-brand-blue" />
                  {trips.length} shared {trips.length === 1 ? 'trip' : 'trips'}
                </span>
              )}
            </div>

            {/* Shared Circles badges */}
            {profile.sharedCircles && profile.sharedCircles.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                {profile.sharedCircles.map((circle) => (
                  <Link
                    key={circle.id}
                    href={circlePageHref(circle.id)}
                    prefetch={false}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-secondary/80 transition-colors text-xs"
                    >
                      {circle.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Upcoming Trips Section */}
        <div>
          <h2 className="text-base font-semibold text-brand-carbon mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-blue" />
            Upcoming Trips
          </h2>
          {loadingTrips ? (
            <div className="text-center py-8">
              <BrandedSpinner size="md" className="mx-auto mb-2" />
              <p className="text-sm text-brand-carbon/70">Loading trips...</p>
            </div>
          ) : tripsError ? (
            <div className="text-center py-8">
              <Shield className="h-8 w-8 text-brand-carbon/40 mx-auto mb-2" />
              <p className="text-sm text-brand-carbon/70">{tripsError}</p>
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-10">
              <div className="relative mx-auto mb-4 w-12 h-12">
                <div className="absolute inset-0 rounded-full bg-brand-sand animate-pulse" />
                <MapPin className="absolute inset-0 m-auto h-5 w-5 text-brand-carbon/40" />
              </div>
              <p className="text-sm text-brand-carbon/60">No trips on the horizon yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trips.map((trip) => {
                const viewerIsTraveler = trip.viewerIsTraveler === true
                const requestStatus = joinRequestStatuses[trip.id] || 'none'
                const showJoinButton = !isViewingOwnProfile &&
                                       !viewerIsTraveler &&
                                       profile?.privacySummary?.allowTripJoinRequests !== false &&
                                       (requestStatus === 'none' || requestStatus === 'rejected')
                const showPending = requestStatus === 'pending'
                const showOnTrip = isViewingOwnProfile || viewerIsTraveler
                const isClickable = showOnTrip

                const statusLabel = trip.status === 'locked' ? 'Finalized' :
                                    trip.status === 'voting' ? 'Voting' :
                                    trip.status === 'scheduling' ? 'Scheduling' :
                                    trip.status === 'proposed' ? 'Proposed' : trip.status
                const statusColor = trip.status === 'locked'
                  ? 'bg-brand-blue/10 text-brand-blue'
                  : 'bg-brand-sand/50 text-brand-carbon/70'

                return (
                  <div
                    key={trip.id}
                    className={`rounded-lg border bg-white p-3.5 transition-all ${isClickable ? 'cursor-pointer hover:shadow-sm hover:border-brand-blue/20' : ''}`}
                    onClick={isClickable ? (e) => handleTripClick(trip, e) : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-brand-carbon mb-1 truncate">{trip.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-brand-carbon/60">
                          <span>{trip.activeTravelerCount} {trip.activeTravelerCount === 1 ? 'person' : 'people'}</span>
                          <span className="text-brand-carbon/30">·</span>
                          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {showJoinButton && (
                          <div className="join-button-container">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRequestJoin(trip)
                              }}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Join
                            </Button>
                          </div>
                        )}
                        {showPending && (
                          <span className="text-xs text-brand-carbon/60">Pending</span>
                        )}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Join Request Dialog */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Request to join {selectedTrip?.name}
              </DialogTitle>
              <DialogDescription>
                Send a message to the Trip Leader (optional)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Add a message..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJoinDialog(false)} disabled={submittingRequest}>
                Cancel
              </Button>
              <Button onClick={submitJoinRequest} disabled={submittingRequest}>
                {submittingRequest ? 'Submitting...' : 'Send Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
