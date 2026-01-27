'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Users, Calendar, MapPin, ArrowLeft, Shield, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
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
  const searchParams = useSearchParams()
  const userId = params.userId
  
  const [loading, setLoading] = useState(true)
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
      const token = localStorage.getItem('trypzy_token')
      if (!token) {
        router.push('/')
        return
      }
      
      const data = await api(`/users/${userId}/profile`, { method: 'GET' }, token)
      setProfile(data)
    } catch (error) {
      setProfileError(error.message || 'Failed to load profile')
      if (error.message.includes('private')) {
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
      const token = localStorage.getItem('trypzy_token')
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
      const token = localStorage.getItem('trypzy_token')
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
      const token = localStorage.getItem('trypzy_token')
      if (!token) return null
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.userId
    } catch {
      return null
    }
  }
  
  const currentUserId = getCurrentUserId()
  const isViewingOwnProfile = currentUserId === userId
  
  // Handle back navigation
  const handleBack = () => {
    const returnTo = searchParams.get('returnTo')
    
    if (returnTo) {
      try {
        const decodedReturnTo = decodeURIComponent(returnTo)
        // Security: only allow relative paths starting with "/"
        if (decodedReturnTo.startsWith('/') && !decodedReturnTo.startsWith('//')) {
          router.push(decodedReturnTo)
          return
        }
      } catch (e) {
        // Invalid encoding, fall through to router.back()
      }
    }
    
    // Try browser back, fallback to dashboard
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }
  
  if (profileError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </button>
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Profile Private</h2>
              <p className="text-gray-600">{profileError}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }
  
  if (!profile) {
    return null
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back link */}
        <button
          onClick={handleBack}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </button>
        
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                {profile.avatarUrl && (
                  <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                )}
                <AvatarFallback className="text-lg">
                  {getInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{profile.name}</h1>
                
                {/* Shared Circles */}
                {profile.sharedCircles && profile.sharedCircles.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Users className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Shared circles:</span>
                    {profile.sharedCircles.map((circle) => (
                        <Link
                          key={circle.id}
                          href={circlePageHref(circle.id)}
                          prefetch={false}
                        >
                          <Badge
                            variant="secondary"
                            className="cursor-pointer hover:bg-secondary/80 transition-colors"
                          >
                            {circle.name}
                          </Badge>
                        </Link>
                    ))}
                  </div>
                )}
                
                {/* Privacy Summary */}
                {profile.privacySummary && (
                  <div className="text-xs text-gray-500">
                    Trips visibility: {profile.privacySummary.tripsVisibility === 'public' ? 'Public' : 
                                      profile.privacySummary.tripsVisibility === 'circle' ? 'Circle members only' : 
                                      'Private'}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Upcoming Trips Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Trips
            </CardTitle>
            <CardDescription>
              Trips this member is actively participating in
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTrips ? (
              <div className="text-center py-8">
                <BrandedSpinner size="md" className="mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading trips...</p>
              </div>
            ) : tripsError ? (
              <div className="text-center py-8">
                <Shield className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">{tripsError}</p>
              </div>
            ) : trips.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">No upcoming trips</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trips.map((trip) => {
                  // Use viewerIsTraveler from trip data (computed server-side)
                  const viewerIsTraveler = trip.viewerIsTraveler === true
                  const requestStatus = joinRequestStatuses[trip.id] || 'none'
                  
                  // Only show "Request to join" if:
                  // - Not viewing own profile
                  // - Viewer is NOT already a traveler
                  // - Privacy allows join requests
                  // - No pending request exists (or request was rejected)
                  const showJoinButton = !isViewingOwnProfile && 
                                         !viewerIsTraveler &&
                                         profile?.privacySummary?.allowTripJoinRequests !== false &&
                                         (requestStatus === 'none' || requestStatus === 'rejected')
                  const showPending = requestStatus === 'pending'
                  const showRejected = requestStatus === 'rejected' && !showJoinButton
                  const showOnTrip = isViewingOwnProfile || viewerIsTraveler
                  
                  // Privacy: Only make trip card clickable if viewer is a traveler
                  const isClickable = showOnTrip
                  
                  return (
                    <Card 
                      key={trip.id}
                      className={isClickable ? "cursor-pointer hover:shadow-md transition-shadow" : "cursor-default"}
                      onClick={isClickable ? (e) => handleTripClick(trip, e) : undefined}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-base mb-1">{trip.name}</h3>
                            <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {trip.activeTravelerCount} {trip.activeTravelerCount === 1 ? 'person' : 'people'}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {trip.circleName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDateRange(trip.startDate, trip.endDate)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {showJoinButton && (
                              <div className="join-button-container">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRequestJoin(trip)
                                  }}
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Request to join
                                </Button>
                              </div>
                            )}
                            {showPending && (
                              <Badge variant="secondary">Request pending</Badge>
                            )}
                            {showRejected && (
                              <Badge variant="outline" className="text-gray-500">Request declined</Badge>
                            )}
                            {isViewingOwnProfile && (
                              <Badge variant="default">On this trip</Badge>
                            )}
                            <Badge variant={trip.status === 'locked' ? 'default' : 'secondary'}>
                              {trip.status === 'locked' ? 'Finalized' : 
                               trip.status === 'voting' ? 'Voting' :
                               trip.status === 'scheduling' ? 'Scheduling' :
                               trip.status === 'proposed' ? 'Proposed' : trip.status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
        
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
