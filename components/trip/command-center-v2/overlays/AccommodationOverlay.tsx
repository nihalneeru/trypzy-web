'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Home,
  Check,
  Lock,
  ThumbsUp,
  Users,
  DollarSign,
  ExternalLink,
  Trash2,
  AlertTriangle,
  MapPin,
  Calendar,
  Search,
  Lightbulb
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

// Constants
const MAX_OPTIONS_PER_USER = 2

interface AccommodationOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
  onOpenOverlay?: (overlay: string) => void
}

interface AccommodationOption {
  id: string
  stayRequirementId: string | null
  title: string
  source: string
  url?: string
  priceRange?: string
  sleepCapacity?: number
  notes?: string
  status: 'shortlisted' | 'proposed' | 'voted' | 'selected'
  voteCount?: number
  userVoted?: boolean
  voters?: Array<{ id: string; name: string }>
  addedBy?: {
    id: string
    name: string
  }
  addedByUserId?: string
}

interface StayRequirement {
  id: string
  tripId: string
  locationName: string
  startDate: string | null
  endDate: string | null
  nights: number
  status: 'pending' | 'covered' | 'inactive' | 'outdated'
}

// Build Airbnb search URL from stay requirements
function buildAirbnbSearchUrl({ locationName, startDate, endDate }: {
  locationName: string
  startDate?: string | null
  endDate?: string | null
}): string {
  if (!locationName) {
    return 'https://www.airbnb.com'
  }

  // Clean location name - remove words like "hotel", "hostel", "resort" for better search
  const cleanLocation = locationName
    .replace(/\b(hotel|hostel|resort|airbnb|inn|lodge|motel|bnb|accommodation)\b/gi, '')
    .trim()

  const params = new URLSearchParams()
  params.append('query', cleanLocation || locationName)

  if (startDate) {
    params.append('checkin', startDate)
  }
  if (endDate) {
    params.append('checkout', endDate)
  }

  return `https://www.airbnb.com/s/homes?${params.toString()}`
}

// Check if a location name looks like actual accommodation vs activity/restaurant
function isLikelyAccommodation(locationName: string): boolean {
  const lowerName = locationName.toLowerCase()

  // Positive indicators - looks like accommodation
  const accommodationKeywords = ['hotel', 'hostel', 'resort', 'airbnb', 'inn', 'lodge', 'motel', 'bnb', 'villa', 'apartment', 'stay', 'guesthouse']
  if (accommodationKeywords.some(k => lowerName.includes(k))) {
    return true
  }

  // Negative indicators - looks like activity/restaurant
  const activityKeywords = ['restaurant', 'grill', 'cafe', 'bar', 'museum', 'park', 'beach', 'market', 'tour', 'temple', 'church', 'hole', 'falls', 'ruins', 'zoo', 'aquarium']
  if (activityKeywords.some(k => lowerName.includes(k))) {
    return false
  }

  // Default: assume it could be a location/city name (accommodation)
  return true
}

// API Helper
const api = async (endpoint: string, options: any = {}, token: string | null = null) => {
  const headers: Record<string, string> = {}

  if (options.body) {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return await response.json()
}

export function AccommodationOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges,
  onOpenOverlay
}: AccommodationOverlayProps) {
  // Data state
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([])
  const [stayRequirements, setStayRequirements] = useState<StayRequirement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Inline form state
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Action loading states
  const [adding, setAdding] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Confirm dialogs
  const [showSelectConfirm, setShowSelectConfirm] = useState(false)
  const [optionToSelect, setOptionToSelect] = useState<string | null>(null)

  // Derived
  const isTripLeader = trip?.createdBy === user?.id || trip?.viewer?.isTripLeader
  const viewer = trip?.viewer || {}
  const isCancelled = trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'
  const viewerIsReadOnly =
    !viewer.isActiveParticipant ||
    viewer.participantStatus === 'left' ||
    isCancelled

  // Track unsaved changes for inline form
  useEffect(() => {
    const hasChanges = formTitle.trim().length > 0 || formUrl.trim().length > 0 || formNotes.trim().length > 0
    setHasUnsavedChanges(hasChanges)
  }, [formTitle, formUrl, formNotes, setHasUnsavedChanges])

  // Check if any option is already selected (phase complete = read-only)
  const selectedOption = useMemo(
    () => accommodations.find(a => a.status === 'selected'),
    [accommodations]
  )
  const accommodationConfirmed = !!selectedOption

  // Count user's options
  const userOptionCount = useMemo(() => {
    if (!user?.id) return 0
    return accommodations.filter(
      a => a.addedByUserId === user.id || a.addedBy?.id === user.id
    ).length
  }, [accommodations, user?.id])

  const canAddMore = userOptionCount < MAX_OPTIONS_PER_USER && !viewerIsReadOnly && !accommodationConfirmed

  // Load accommodations and stay requirements
  const loadData = useCallback(async () => {
    if (!trip?.id || trip.status !== 'locked') return

    setLoading(true)
    setError(null)
    try {
      // Fetch both in parallel
      const [accommodationsData, staysData] = await Promise.all([
        api(`/trips/${trip.id}/accommodations`, { method: 'GET' }, token),
        api(`/trips/${trip.id}/stays`, { method: 'GET' }, token).catch(() => [])
      ])
      setAccommodations(accommodationsData || [])
      setStayRequirements(staysData || [])
    } catch (err: any) {
      console.error('Failed to load accommodation data:', err)
      setError(err.message || 'Couldn\'t load stay options — try again')
    } finally {
      setLoading(false)
    }
  }, [trip?.id, trip?.status, token])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Reset form
  const resetForm = () => {
    setFormTitle('')
    setFormUrl('')
    setFormPrice('')
    setFormNotes('')
    setHasUnsavedChanges(false)
  }

  // Handle add accommodation (inline form)
  const handleAdd = async () => {
    if (!formTitle.trim() || adding || viewerIsReadOnly) return
    if (userOptionCount >= MAX_OPTIONS_PER_USER) {
      toast.error(`You can add up to ${MAX_OPTIONS_PER_USER} stay options`)
      return
    }

    setAdding(true)
    try {
      await api(`/trips/${trip.id}/accommodations`, {
        method: 'POST',
        body: JSON.stringify({
          title: formTitle.trim(),
          url: formUrl.trim() || null,
          priceRange: formPrice.trim() || null,
          notes: formNotes.trim() || null,
          source: 'OTHER'
        })
      }, token)

      toast.success('Stay option added!')
      resetForm()
      await loadData()
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not add option — please try again')
    } finally {
      setAdding(false)
    }
  }

  // Handle delete
  const handleDelete = async (optionId: string) => {
    if (deleting) return

    setDeleting(optionId)
    try {
      await api(`/trips/${trip.id}/accommodations/${optionId}`, {
        method: 'DELETE'
      }, token)

      toast.success('Option removed')
      await loadData()
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not delete option — please try again')
    } finally {
      setDeleting(null)
    }
  }

  // Handle vote
  const handleVote = async (optionId: string) => {
    if (voting || viewerIsReadOnly) return

    setVoting(optionId)
    try {
      await api(`/trips/${trip.id}/accommodations/${optionId}/vote`, {
        method: 'POST'
      }, token)

      toast.success('Vote saved')
      await loadData()
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.message || 'Could not save vote — please try again')
    } finally {
      setVoting(null)
    }
  }

  // Handle select (leader only)
  const handleSelectClick = (optionId: string) => {
    setOptionToSelect(optionId)
    setShowSelectConfirm(true)
  }

  const handleConfirmSelect = async () => {
    if (!optionToSelect) return

    setSelecting(true)
    try {
      const result = await api(`/trips/${trip.id}/accommodations/${optionToSelect}/select`, {
        method: 'POST'
      }, token)

      toast.success('Stay confirmed!')
      setShowSelectConfirm(false)
      setOptionToSelect(null)
      await loadData()
      onRefresh?.(result?.trip || undefined)
    } catch (err: any) {
      toast.error(err.message || 'Couldn\'t confirm stay — try again')
    } finally {
      setSelecting(false)
    }
  }

  // Trip not locked - show message
  if (trip.status !== 'locked') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-brand-carbon mb-2">Dates not confirmed yet</h3>
        <p className="text-gray-500 max-w-sm">
          Stay options open up once your dates are confirmed.
        </p>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BrandedSpinner size="md" className="mb-4" />
        <p className="text-gray-500">Loading stay options...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { setError(null); loadData() }}>
          Try again
        </Button>
      </div>
    )
  }

  // Format date for display (e.g., "Mar 13")
  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const hasItinerary = trip.itineraryStatus === 'selected' || trip.itineraryStatus === 'published'
  const showItineraryNudge = !hasItinerary && stayRequirements.length === 0 && accommodations.length === 0 && !accommodationConfirmed

  return (
    <div className="space-y-6 p-4">
      {/* Itinerary nudge — shown when no itinerary and no stays yet */}
      {showItineraryNudge && (
        <Card className="bg-brand-sand/40 border-brand-sand">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="h-4 w-4 text-brand-blue mt-0.5 shrink-0" />
              <div>
                {isTripLeader ? (
                  <>
                    <p className="text-sm font-medium text-brand-carbon">Want personalized stay suggestions?</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Generate your itinerary first — it'll suggest locations based on your group's plans.
                    </p>
                    {onOpenOverlay && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        onClick={() => onOpenOverlay('itinerary')}
                      >
                        Generate itinerary →
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-brand-carbon">Want personalized stay suggestions?</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Ask your leader to generate the itinerary — it'll suggest stays based on your group's plans.
                      You can add options anytime.
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stay Requirements Guidance (from itinerary) */}
      {stayRequirements.length > 0 && !accommodationConfirmed && (() => {
        // Filter to only show likely accommodation locations (not restaurants/activities)
        const accommodationStays = stayRequirements.filter(s => isLikelyAccommodation(s.locationName))

        // If no valid stays found, show trip destination as fallback
        const staysToShow = accommodationStays.length > 0
          ? accommodationStays
          : trip.destinationHint
            ? [{
                id: 'fallback',
                tripId: trip.id,
                locationName: trip.destinationHint,
                startDate: trip.lockedStartDate || trip.startDate,
                endDate: trip.lockedEndDate || trip.endDate,
                nights: Math.max(1, Math.ceil((new Date(trip.lockedEndDate || trip.endDate).getTime() - new Date(trip.lockedStartDate || trip.startDate).getTime()) / (1000 * 60 * 60 * 24))),
                status: 'pending' as const
              }]
            : []

        if (staysToShow.length === 0) return null

        return (
        <Card className="bg-brand-sand/30 border-brand-sand">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-brand-blue" />
              <span className="text-sm font-medium text-brand-carbon">Based on your itinerary</span>
            </div>
            <div className="space-y-3">
              {staysToShow.map((stay) => {
                const startFormatted = formatShortDate(stay.startDate)
                const endFormatted = formatShortDate(stay.endDate)
                const dateRange = startFormatted && endFormatted
                  ? `${startFormatted} – ${endFormatted}`
                  : startFormatted || 'Dates TBD'

                const airbnbUrl = buildAirbnbSearchUrl({
                  locationName: stay.locationName,
                  startDate: stay.startDate,
                  endDate: stay.endDate
                })

                return (
                  <div
                    key={stay.id}
                    className="flex items-center justify-between gap-3 p-2 bg-white rounded-md border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 capitalize truncate">
                        {stay.locationName}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {dateRange}
                        </span>
                        <span>{stay.nights} night{stay.nights !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <a
                      href={airbnbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-brand-blue hover:underline shrink-0"
                    >
                      <Search className="h-3 w-3" />
                      Search Airbnb
                    </a>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Add accommodation options below for the group to vote on.
            </p>
          </CardContent>
        </Card>
        )
      })()}

      {/* Inline Add Form */}
      {canAddMore ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">
              Add a stay option ({userOptionCount}/{MAX_OPTIONS_PER_USER} added)
            </p>
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Stay name (e.g., cozy apartment in city center)"
              className="text-sm"
              disabled={viewerIsReadOnly || adding}
            />
            <Input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="Link (optional — Airbnb, Booking, etc.)"
              className="text-sm"
              type="url"
              disabled={viewerIsReadOnly || adding}
            />
            <div className="flex gap-2">
              <Input
                value={formPrice}
                onChange={(e) => setFormPrice(e.target.value)}
                placeholder="Price range (optional)"
                className="text-sm flex-1"
                disabled={viewerIsReadOnly || adding}
              />
            </div>
            <Textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Notes (optional — why you like this, amenities, etc.)"
              className="text-sm min-h-[60px] resize-none"
              disabled={viewerIsReadOnly || adding}
            />
            <Button
              onClick={handleAdd}
              disabled={viewerIsReadOnly || adding || !formTitle.trim()}
              className="w-full"
              size="sm"
            >
              {adding ? 'Adding...' : 'Add stay'}
            </Button>
          </CardContent>
        </Card>
      ) : !accommodationConfirmed && userOptionCount >= MAX_OPTIONS_PER_USER ? (
        <div className="text-center py-3 px-2 bg-gray-50 rounded-lg border">
          <p className="text-sm text-gray-600">
            You've added {MAX_OPTIONS_PER_USER} options
          </p>
        </div>
      ) : null}

      {/* Selected Accommodation Banner */}
      {selectedOption && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <Check className="h-5 w-5" />
            <span className="font-medium">Stay confirmed</span>
          </div>
          <h4 className="font-medium text-gray-900">{selectedOption.title}</h4>
          {selectedOption.priceRange && (
            <p className="text-sm text-gray-600 mt-1">{selectedOption.priceRange}</p>
          )}
          {selectedOption.url && (
            <a
              href={selectedOption.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-blue hover:underline mt-2 inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View listing
            </a>
          )}
        </div>
      )}

      {/* Options List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Stay options ({accommodations.length})
        </h3>
        <ScrollArea className="h-[250px] md:h-[350px]">
          {accommodations.length === 0 ? (
            <div className="text-center py-8">
              <Home className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-1 text-sm">No stays yet</p>
              <p className="text-xs text-gray-400">
                Add a stay option to help the group decide
              </p>
            </div>
          ) : (
            <div className="space-y-3 pr-2">
              {accommodations.map((option) => {
                const isSelected = option.status === 'selected'
                const hasVoted = option.userVoted
                const voteCount = option.voteCount || 0
                const isOwnOption = option.addedByUserId === user?.id || option.addedBy?.id === user?.id

                return (
                  <Card
                    key={option.id}
                    className={isSelected ? 'border-green-500 bg-green-50' : ''}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Title and badges */}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className="font-medium text-sm">{option.title}</h4>
                            {isSelected && (
                              <Badge variant="default" className="bg-green-600 text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Selected
                              </Badge>
                            )}
                          </div>

                          {/* Added by */}
                          {option.addedBy && (
                            <p className="text-xs text-gray-500 mb-2">
                              Added by {isOwnOption ? 'you' : option.addedBy.name}
                            </p>
                          )}

                          {/* Details */}
                          <div className="space-y-1 mb-2">
                            {option.priceRange && (
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {option.priceRange}
                              </p>
                            )}
                            {option.sleepCapacity && (
                              <p className="text-sm text-gray-600 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Sleeps {option.sleepCapacity}
                              </p>
                            )}
                            {option.notes && (
                              <p className="text-sm text-gray-600">{option.notes}</p>
                            )}
                          </div>

                          {/* URL link */}
                          {option.url && (
                            <a
                              href={option.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-brand-blue hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View listing
                            </a>
                          )}

                          {/* Vote count and voters */}
                          {voteCount > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <ThumbsUp className="h-3 w-3" />
                                <span>{voteCount} vote{voteCount !== 1 ? 's' : ''}</span>
                                {hasVoted && (
                                  <Badge variant="outline" className="text-xs ml-2">
                                    You voted
                                  </Badge>
                                )}
                              </div>
                              {option.voters && option.voters.length > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Voted by: {option.voters.map(v => v.name).join(', ')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 shrink-0">
                          {/* Vote button (hidden after accommodation confirmed) */}
                          {!isSelected && !hasVoted && !viewerIsReadOnly && !accommodationConfirmed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleVote(option.id)}
                              disabled={voting === option.id}
                            >
                              {voting === option.id ? (
                                <BrandedSpinner size="sm" />
                              ) : (
                                <>
                                  <ThumbsUp className="h-4 w-4 mr-1" />
                                  Vote
                                </>
                              )}
                            </Button>
                          )}

                          {/* Select button (leader only, hidden after confirmed) */}
                          {!isSelected && isTripLeader && !accommodationConfirmed && (
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => handleSelectClick(option.id)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Select
                            </Button>
                          )}

                          {/* Delete button (own options only, hidden after confirmed) */}
                          {isOwnOption && !isSelected && !viewerIsReadOnly && !accommodationConfirmed && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-gray-400 hover:text-red-600"
                              onClick={() => handleDelete(option.id)}
                              disabled={deleting === option.id}
                              aria-label="Delete accommodation option"
                            >
                              {deleting === option.id ? (
                                <BrandedSpinner size="sm" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Select Confirmation Dialog */}
      <AlertDialog open={showSelectConfirm} onOpenChange={setShowSelectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this stay?</AlertDialogTitle>
            <AlertDialogDescription>
              This will be your group's stay for the trip. Everyone will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSelect}
              disabled={selecting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {selecting ? 'Confirming...' : 'Confirm stay'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
