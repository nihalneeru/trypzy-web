'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Home,
  Plus,
  ExternalLink,
  Check,
  Lock,
  ThumbsUp,
  MapPin,
  Calendar,
  Users,
  DollarSign,
  AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/app/HomeClient'
import { buildAirbnbSearchUrl } from '@/lib/accommodations/buildAirbnbSearchUrl'

interface AccommodationOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

interface Stay {
  id: string
  locationName: string
  startDate: string
  endDate: string
  nights: number
  status: 'pending' | 'outdated' | 'covered'
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
  status: 'proposed' | 'voted' | 'selected'
  voteCount?: number
  userVoted?: boolean
  addedBy?: {
    id: string
    name: string
  }
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

// Initial form state
const getInitialFormState = () => ({
  source: 'AIRBNB',
  title: '',
  url: '',
  priceRange: '',
  sleepCapacity: '',
  notes: ''
})

export function AccommodationOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: AccommodationOverlayProps) {
  // Data state
  const [stays, setStays] = useState<Stay[]>([])
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([])
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSelectConfirm, setShowSelectConfirm] = useState(false)
  const [optionToSelect, setOptionToSelect] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState(getInitialFormState())
  const [formTouched, setFormTouched] = useState(false)

  // Action loading states
  const [adding, setAdding] = useState(false)
  const [voting, setVoting] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)

  const isTripLeader = trip?.createdBy === user?.id || trip?.viewer?.isTripLeader

  // Track unsaved changes
  useEffect(() => {
    const hasChanges = formTouched && (
      formData.title.trim() !== '' ||
      formData.url.trim() !== '' ||
      formData.priceRange.trim() !== '' ||
      formData.sleepCapacity !== '' ||
      formData.notes.trim() !== ''
    )
    setHasUnsavedChanges(hasChanges)
  }, [formData, formTouched, setHasUnsavedChanges])

  // Load stays and accommodations
  const loadData = useCallback(async () => {
    if (!trip?.id || trip.status !== 'locked') return

    setLoading(true)
    try {
      const [staysData, accommodationsData] = await Promise.all([
        api(`/trips/${trip.id}/stays`, { method: 'GET' }, token),
        api(`/trips/${trip.id}/accommodations`, { method: 'GET' }, token)
      ])

      setStays(staysData || [])
      setAccommodations(accommodationsData || [])

      // Auto-select first stay if none selected
      if (!selectedStayId && staysData && staysData.length > 0) {
        setSelectedStayId(staysData[0].id)
      }
    } catch (error) {
      console.error('Failed to load accommodation data:', error)
      toast.error('Failed to load accommodation data')
    } finally {
      setLoading(false)
    }
  }, [trip?.id, trip?.status, token, selectedStayId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Format date range for display
  const formatDateRange = (startDate: string, endDate: string) => {
    if (!startDate) return 'Dates TBD'
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : null

    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!end) return startStr

    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${startStr} - ${endStr}`
  }

  // Get stay status badge
  const getStayStatusBadge = (stay: Stay, options: AccommodationOption[]) => {
    const stayOptions = options.filter(a => a.stayRequirementId === stay.id)
    const hasSelected = stayOptions.some(a => a.status === 'selected')

    if (hasSelected) {
      return (
        <Badge variant="default" className="text-xs bg-green-600">
          <Check className="h-3 w-3 mr-1" />
          Covered
        </Badge>
      )
    }

    if (stay.status === 'outdated') {
      return <Badge variant="outline" className="text-xs">Outdated</Badge>
    }

    if (stayOptions.length === 0) {
      return <Badge variant="secondary" className="text-xs">Needs options</Badge>
    }

    return <Badge variant="secondary" className="text-xs">Not decided</Badge>
  }

  // Handle form field change
  const handleFormChange = (field: string, value: string) => {
    setFormTouched(true)
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Reset form
  const resetForm = () => {
    setFormData(getInitialFormState())
    setFormTouched(false)
    setHasUnsavedChanges(false)
  }

  // Handle add accommodation
  const handleAddAccommodation = async () => {
    if (!formData.title.trim()) {
      toast.error('Title is required')
      return
    }

    if (formData.source !== 'MANUAL' && !formData.url.trim()) {
      toast.error('URL is required for non-manual entries')
      return
    }

    setAdding(true)
    try {
      await api(`/trips/${trip.id}/accommodations`, {
        method: 'POST',
        body: JSON.stringify({
          stayRequirementId: selectedStayId || null,
          source: formData.source,
          title: formData.title.trim(),
          url: formData.url.trim() || null,
          priceRange: formData.priceRange.trim() || null,
          sleepCapacity: formData.sleepCapacity ? parseInt(formData.sleepCapacity) : null,
          notes: formData.notes.trim() || null
        })
      }, token)

      toast.success('Accommodation option added')
      setShowAddDialog(false)
      resetForm()
      loadData()
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to add accommodation:', error)
      toast.error(error.message || 'Failed to add accommodation')
    } finally {
      setAdding(false)
    }
  }

  // Handle vote
  const handleVote = async (optionId: string) => {
    if (voting) return

    setVoting(optionId)
    try {
      await api(`/trips/${trip.id}/accommodations/${optionId}/vote`, {
        method: 'POST'
      }, token)

      toast.success('Vote recorded')
      loadData()
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to vote:', error)
      toast.error(error.message || 'Failed to vote')
    } finally {
      setVoting(null)
    }
  }

  // Handle select accommodation
  const handleSelectClick = (optionId: string) => {
    setOptionToSelect(optionId)
    setShowSelectConfirm(true)
  }

  const handleConfirmSelect = async () => {
    if (!optionToSelect) return

    setSelecting(true)
    try {
      await api(`/trips/${trip.id}/accommodations/${optionToSelect}/select`, {
        method: 'POST'
      }, token)

      toast.success('Accommodation selected')
      setShowSelectConfirm(false)
      setOptionToSelect(null)
      loadData()
      onRefresh?.()
    } catch (error: any) {
      console.error('Failed to select accommodation:', error)
      toast.error(error.message || 'Failed to select accommodation')
    } finally {
      setSelecting(false)
    }
  }

  // Handle Airbnb search
  const handleAirbnbSearch = (stay: Stay) => {
    const url = buildAirbnbSearchUrl({
      locationName: stay.locationName,
      startDate: stay.startDate,
      endDate: stay.endDate
    })
    window.open(url, '_blank')
  }

  // Get options for selected stay
  const selectedStay = useMemo(() =>
    stays.find(s => s.id === selectedStayId),
    [stays, selectedStayId]
  )

  const stayAccommodations = useMemo(() => {
    if (selectedStayId) {
      return accommodations.filter(a => a.stayRequirementId === selectedStayId)
    }
    return accommodations.filter(a => !a.stayRequirementId)
  }, [accommodations, selectedStayId])

  const selectedAccommodation = useMemo(() =>
    stayAccommodations.find(a => a.status === 'selected'),
    [stayAccommodations]
  )

  // Get source icon/color
  const getSourceBadgeClass = (source: string) => {
    switch (source) {
      case 'AIRBNB':
        return 'bg-rose-100 text-rose-700'
      case 'BOOKING':
        return 'bg-blue-100 text-blue-700'
      case 'VRBO':
        return 'bg-indigo-100 text-indigo-700'
      case 'MANUAL':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  // Trip not locked - show message
  if (trip.status !== 'locked') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Dates Not Locked</h3>
        <p className="text-gray-500 max-w-sm">
          Accommodation planning is only available after dates are locked.
          Complete the scheduling phase first.
        </p>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BrandedSpinner size="md" className="mb-4" />
        <p className="text-gray-500">Loading accommodation data...</p>
      </div>
    )
  }

  // No stays added yet
  if (stays.length === 0) {
    // Build a generic Airbnb search URL based on trip dates and destination
    const tripDestination = trip.destinationHint || trip.destination || ''
    const tripStart = trip.lockedStartDate || trip.startDate
    const tripEnd = trip.lockedEndDate || trip.endDate

    const handleSearchAccommodation = () => {
      if (tripStart && tripEnd) {
        const url = buildAirbnbSearchUrl({
          locationName: tripDestination,
          startDate: tripStart,
          endDate: tripEnd
        })
        window.open(url, '_blank')
      } else {
        toast.error('Lock trip dates first to search for accommodation')
      }
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Home className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Stays Added Yet</h3>
        <p className="text-gray-500 max-w-sm mb-6">
          Accommodation requirements will be automatically generated based on your trip itinerary.
          You can also search for stays manually.
        </p>
        <Button
          onClick={handleSearchAccommodation}
          className="bg-brand-red hover:bg-brand-red/90 text-white"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Search on Airbnb
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stays List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Stays by Location
        </h3>
        <div className="space-y-2">
          {stays.map((stay) => {
            const isSelected = stay.id === selectedStayId

            return (
              <Card
                key={stay.id}
                onClick={() => setSelectedStayId(stay.id)}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'border-brand-blue bg-brand-sand ring-1 ring-brand-blue'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
                        <h4 className="font-medium text-sm truncate">{stay.locationName}</h4>
                        {getStayStatusBadge(stay, accommodations)}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDateRange(stay.startDate, stay.endDate)}
                        </span>
                        <span>{stay.nights} night{stay.nights !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Selected Stay Options */}
      {selectedStay && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Options for {selectedStay.locationName}
            </h3>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>

            {selectedStay.startDate && selectedStay.endDate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAirbnbSearch(selectedStay)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Search on Airbnb
              </Button>
            )}
          </div>

          {/* Options list */}
          {stayAccommodations.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Home className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">No options added yet</p>
                <p className="text-xs text-gray-400">
                  Add accommodation options for the group to vote on
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {stayAccommodations.map((option) => {
                const isSelected = option.status === 'selected'
                const hasVoted = option.userVoted
                const voteCount = option.voteCount || 0

                return (
                  <Card
                    key={option.id}
                    className={isSelected ? 'border-green-500 bg-green-50' : ''}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Title and badges */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="font-medium">{option.title}</h4>
                            {isSelected && (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Selected
                              </Badge>
                            )}
                            <Badge className={getSourceBadgeClass(option.source)}>
                              {option.source}
                            </Badge>
                          </div>

                          {/* Added by */}
                          {option.addedBy && (
                            <p className="text-xs text-gray-500 mb-2">
                              Added by {option.addedBy.name}
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

                          {/* Vote count */}
                          {voteCount > 0 && (
                            <div className="mt-2 flex items-center gap-1 text-sm text-gray-600">
                              <ThumbsUp className="h-3 w-3" />
                              <span>{voteCount} vote{voteCount !== 1 ? 's' : ''}</span>
                              {hasVoted && (
                                <Badge variant="outline" className="text-xs ml-2">
                                  You voted
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 shrink-0">
                          {!isSelected && !hasVoted && (
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

                          {!isSelected && isTripLeader && (
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleSelectClick(option.id)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Select
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

          {/* Selected accommodation summary */}
          {selectedAccommodation && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 text-green-800 mb-2">
                <Check className="h-5 w-5" />
                <span className="font-medium">Accommodation Confirmed</span>
              </div>
              <h4 className="font-medium text-gray-900">{selectedAccommodation.title}</h4>
              {selectedAccommodation.priceRange && (
                <p className="text-sm text-gray-600 mt-1">{selectedAccommodation.priceRange}</p>
              )}
              {selectedAccommodation.url && (
                <a
                  href={selectedAccommodation.url}
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
        </div>
      )}

      {/* Add Accommodation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        if (!open && formTouched) {
          // Let the parent handle unsaved changes
          setShowAddDialog(false)
        } else {
          setShowAddDialog(open)
          if (!open) {
            resetForm()
          }
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Accommodation Option</DialogTitle>
            <DialogDescription>
              Share an accommodation option for {selectedStay?.locationName || 'this stay'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Source */}
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select
                value={formData.source}
                onValueChange={(value) => handleFormChange('source', value)}
              >
                <SelectTrigger id="source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AIRBNB">Airbnb</SelectItem>
                  <SelectItem value="BOOKING">Booking.com</SelectItem>
                  <SelectItem value="VRBO">VRBO</SelectItem>
                  <SelectItem value="MANUAL">Manual Entry</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleFormChange('title', e.target.value)}
                placeholder="e.g., Cozy apartment in city center"
              />
            </div>

            {/* URL (conditional) */}
            {formData.source !== 'MANUAL' && (
              <div className="space-y-2">
                <Label htmlFor="url">
                  URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => handleFormChange('url', e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}

            {/* Price Range */}
            <div className="space-y-2">
              <Label htmlFor="priceRange">Price Range (optional)</Label>
              <Input
                id="priceRange"
                value={formData.priceRange}
                onChange={(e) => handleFormChange('priceRange', e.target.value)}
                placeholder="e.g., $100-150/night"
              />
            </div>

            {/* Sleep Capacity */}
            <div className="space-y-2">
              <Label htmlFor="sleepCapacity">Sleep Capacity (optional)</Label>
              <Input
                id="sleepCapacity"
                type="number"
                min="1"
                value={formData.sleepCapacity}
                onChange={(e) => handleFormChange('sleepCapacity', e.target.value)}
                placeholder="Number of guests"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                placeholder="Additional details about this option..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false)
                resetForm()
              }}
              disabled={adding}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddAccommodation}
              disabled={adding || !formData.title.trim() || (formData.source !== 'MANUAL' && !formData.url.trim())}
            >
              {adding ? (
                <>
                  <BrandedSpinner size="sm" className="mr-2" />
                  Adding...
                </>
              ) : (
                'Add Option'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Confirmation Dialog */}
      <AlertDialog open={showSelectConfirm} onOpenChange={setShowSelectConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Selection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to select this accommodation? This will mark it as the chosen option for this stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={selecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSelect}
              disabled={selecting}
              className="bg-green-600 hover:bg-green-700"
            >
              {selecting ? 'Selecting...' : 'Confirm Selection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
