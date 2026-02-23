'use client'

import { useState, useEffect, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  Calendar,
  MapPin,
  Shield,
  UserPlus,
  User,
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'

// Types
interface MemberProfileOverlayProps {
  memberId: string
  token: string
  currentUserId: string
  onClose: () => void
  onRequestToJoin?: (tripId: string) => void
}

interface MemberProfile {
  id: string
  name: string
  avatarUrl?: string
  memberSince?: string
  sharedCircles?: Array<{
    id: string
    name: string
  }>
  privacySummary?: {
    tripsVisibility: 'public' | 'circle' | 'private'
    allowTripJoinRequests: boolean
  }
}

interface Trip {
  id: string
  name: string
  circleId: string
  circleName: string
  startDate?: string
  endDate?: string
  status: string
  activeTravelerCount: number
  viewerIsTraveler: boolean
}

type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'rejected'

// API helper
const api = async (endpoint: string, options: RequestInit = {}, token: string) => {
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
function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Format date range
function formatDateRange(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return 'Dates not locked'

  const start = new Date(startDate)
  const end = new Date(endDate)

  const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return `${startFormatted} - ${endFormatted}`
}

// Format member since date
function formatMemberSince(dateString?: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Generate a consistent color based on name
function getAvatarColor(name: string): string {
  const colors = [
    'bg-red-100 text-red-700',
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-yellow-100 text-yellow-700',
    'bg-purple-100 text-purple-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
    'bg-orange-100 text-orange-700',
  ]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

/**
 * MemberProfileOverlay - Shows a member's profile in the overlay
 *
 * Features:
 * - Profile header with avatar, name, and member since date
 * - Shared circles indicator
 * - Upcoming trips (respecting privacy)
 * - Request to join functionality
 * - "This is you" indicator for own profile
 */
export function MemberProfileOverlay({
  memberId,
  token,
  currentUserId,
  onClose,
  onRequestToJoin
}: MemberProfileOverlayProps) {
  // State
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<MemberProfile | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [tripsError, setTripsError] = useState<string | null>(null)
  const [joinRequestStatuses, setJoinRequestStatuses] = useState<Record<string, JoinRequestStatus>>({})
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [joinMessage, setJoinMessage] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

  const isViewingOwnProfile = currentUserId === memberId

  // Load profile
  const loadProfile = useCallback(async () => {
    setLoading(true)
    setProfileError(null)
    try {
      const data = await api(`/users/${memberId}/profile`, { method: 'GET' }, token)
      setProfile(data)
    } catch (error: any) {
      setProfileError(error.message || 'Couldn\'t load profile — try again')
    } finally {
      setLoading(false)
    }
  }, [memberId, token])

  // Load upcoming trips
  const loadUpcomingTrips = useCallback(async () => {
    setLoadingTrips(true)
    setTripsError(null)
    try {
      const data = await api(`/users/${memberId}/upcoming-trips`, { method: 'GET' }, token)
      setTrips(data.trips || [])

      // Load join request statuses for each trip (only for trips where viewer is NOT already a traveler)
      const statuses: Record<string, JoinRequestStatus> = {}
      await Promise.all(
        data.trips
          .filter((trip: Trip) => !trip.viewerIsTraveler)
          .map(async (trip: Trip) => {
            try {
              const statusData = await api(`/trips/${trip.id}/join-requests/me`, { method: 'GET' }, token)
              statuses[trip.id] = statusData.status
            } catch {
              statuses[trip.id] = 'none'
            }
          })
      )
      setJoinRequestStatuses(statuses)
    } catch (error: any) {
      setTripsError(error.message || 'Couldn\'t load trips — try again')
    } finally {
      setLoadingTrips(false)
    }
  }, [memberId, token])

  // Load data on mount
  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  // Load trips after profile loads
  useEffect(() => {
    if (profile && !profileError) {
      loadUpcomingTrips()
    }
  }, [profile, profileError, loadUpcomingTrips])

  // Handle request to join
  const handleRequestJoin = (trip: Trip) => {
    setSelectedTrip(trip)
    setJoinMessage('')
    setShowJoinDialog(true)
  }

  // Submit join request
  const submitJoinRequest = async () => {
    if (!selectedTrip) return

    setSubmittingRequest(true)
    try {
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

      // Notify parent if callback provided
      onRequestToJoin?.(selectedTrip.id)
    } catch (error: any) {
      if (error.message.includes('already an active participant')) {
        setJoinRequestStatuses(prev => ({
          ...prev,
          [selectedTrip.id]: 'approved'
        }))
        toast.info('You are already on this trip')
      } else {
        toast.error(error.message || 'Couldn\'t send request — try again')
      }
    } finally {
      setSubmittingRequest(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        {/* Profile header skeleton */}
        <div className="flex items-start gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>

        {/* Shared circles skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          </CardContent>
        </Card>

        {/* Trips skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (profileError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Shield className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-brand-carbon mb-2">Profile Private</h3>
        <p className="text-gray-600 max-w-sm">{profileError}</p>
      </div>
    )
  }

  if (!profile) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="flex items-start gap-4">
        <Avatar className="h-20 w-20">
          {profile.avatarUrl && (
            <AvatarImage src={profile.avatarUrl} alt={profile.name} />
          )}
          <AvatarFallback className={`text-xl ${getAvatarColor(profile.name)}`}>
            {getInitials(profile.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold text-brand-carbon truncate">{profile.name}</h2>
            {isViewingOwnProfile && (
              <Badge variant="secondary" className="shrink-0">
                <User className="h-3 w-3 mr-1" />
                This is you
              </Badge>
            )}
          </div>

          {profile.memberSince && (
            <p className="text-sm text-gray-500 mb-2">
              Member since {formatMemberSince(profile.memberSince)}
            </p>
          )}

          {/* Privacy Summary */}
          {profile.privacySummary && (
            <div className="text-xs text-gray-500">
              Trips visibility: {
                profile.privacySummary.tripsVisibility === 'public' ? 'Public' :
                profile.privacySummary.tripsVisibility === 'circle' ? 'Circle members only' :
                'Private'
              }
            </div>
          )}
        </div>
      </div>

      {/* Shared Circles */}
      {profile.sharedCircles && profile.sharedCircles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Shared Circles
            </CardTitle>
            <CardDescription>
              You&apos;re both in {profile.sharedCircles.length} circle{profile.sharedCircles.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {profile.sharedCircles.map((circle) => (
                <Badge
                  key={circle.id}
                  variant="secondary"
                  className="cursor-default"
                >
                  {circle.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Trips Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Trips
          </CardTitle>
          <CardDescription>
            {isViewingOwnProfile
              ? 'Trips you are participating in'
              : 'Trips this member is participating in'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTrips ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-600">Loading trips...</span>
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

                return (
                  <div
                    key={trip.id}
                    className="p-4 border rounded-lg bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm mb-1 truncate">{trip.name}</h4>
                        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
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

                      <div className="flex items-center gap-2 shrink-0">
                        {showJoinButton && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRequestJoin(trip)}
                            className="text-xs"
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            Request to join
                          </Button>
                        )}
                        {showPending && (
                          <Badge variant="secondary" className="text-xs">Request pending</Badge>
                        )}
                        {showRejected && (
                          <Badge variant="outline" className="text-xs text-gray-500">Request declined</Badge>
                        )}
                        {showOnTrip && (
                          <Badge variant="default" className="text-xs">On this trip</Badge>
                        )}
                        <Badge variant={trip.status === 'locked' ? 'default' : 'secondary'} className="text-xs">
                          {trip.status === 'locked' ? 'Dates set' :
                           trip.status === 'voting' ? 'Voting' :
                           trip.status === 'scheduling' ? 'Picking dates' :
                           trip.status === 'proposed' ? 'New' : trip.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
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
              Say hi or let the leader know why you'd like to join (optional)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Say hi or mention why you'd like to join"
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
              {submittingRequest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Send Request'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MemberProfileOverlay
