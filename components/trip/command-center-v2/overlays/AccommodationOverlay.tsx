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
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/app/HomeClient'

// Constants
const MAX_OPTIONS_PER_USER = 2

interface AccommodationOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
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
  setHasUnsavedChanges
}: AccommodationOverlayProps) {
  // Data state
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([])
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

  // Load accommodations
  const loadData = useCallback(async () => {
    if (!trip?.id || trip.status !== 'locked') return

    setLoading(true)
    setError(null)
    try {
      const data = await api(`/trips/${trip.id}/accommodations`, { method: 'GET' }, token)
      setAccommodations(data || [])
    } catch (err: any) {
      console.error('Failed to load accommodation data:', err)
      setError(err.message || 'Failed to load accommodation data')
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
      toast.error(`You can only submit ${MAX_OPTIONS_PER_USER} accommodation options`)
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

      toast.success('Accommodation option added!')
      resetForm()
      await loadData()
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.message || 'Failed to add accommodation option')
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
      toast.error(err.message || 'Failed to delete option')
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

      toast.success('Vote recorded')
      await loadData()
      onRefresh?.()
    } catch (err: any) {
      toast.error(err.message || 'Failed to vote')
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

      toast.success('Accommodation selected!')
      setShowSelectConfirm(false)
      setOptionToSelect(null)
      await loadData()
      onRefresh?.(result?.trip || undefined)
    } catch (err: any) {
      toast.error(err.message || 'Failed to select accommodation')
    } finally {
      setSelecting(false)
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
        <p className="text-gray-500">Loading accommodation options...</p>
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

  return (
    <div className="space-y-6">
      {/* Inline Add Form */}
      {canAddMore ? (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-medium text-gray-500">
              Suggest an accommodation option ({userOptionCount}/{MAX_OPTIONS_PER_USER} submitted)
            </p>
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Option name (e.g., Cozy apartment in city center)"
              className="text-sm"
              disabled={viewerIsReadOnly || adding}
            />
            <Input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="Link (optional - Airbnb, Booking, etc.)"
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
              placeholder="Notes (optional - why you like this option, amenities, etc.)"
              className="text-sm min-h-[60px] resize-none"
              disabled={viewerIsReadOnly || adding}
            />
            <Button
              onClick={handleAdd}
              disabled={viewerIsReadOnly || adding || !formTitle.trim()}
              className="w-full"
              size="sm"
            >
              {adding ? 'Submitting...' : 'Submit Option'}
            </Button>
          </CardContent>
        </Card>
      ) : !accommodationConfirmed && userOptionCount >= MAX_OPTIONS_PER_USER ? (
        <div className="text-center py-3 px-2 bg-gray-50 rounded-lg border">
          <p className="text-sm text-gray-600">
            You've submitted {MAX_OPTIONS_PER_USER} options
          </p>
        </div>
      ) : null}

      {/* Selected Accommodation Banner */}
      {selectedOption && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <Check className="h-5 w-5" />
            <span className="font-medium">Accommodation Confirmed</span>
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
          All Options ({accommodations.length})
        </h3>
        <ScrollArea className="h-[350px]">
          {accommodations.length === 0 ? (
            <div className="text-center py-8">
              <Home className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 mb-1 text-sm">No options submitted yet</p>
              <p className="text-xs text-gray-400">
                Share an accommodation option for the group to vote on
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
                              className="bg-green-600 hover:bg-green-700"
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
            <AlertDialogTitle>Confirm Selection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to select this accommodation? This will mark it as the chosen option for the trip.
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
