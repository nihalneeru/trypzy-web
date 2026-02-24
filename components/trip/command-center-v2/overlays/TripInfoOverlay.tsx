'use client'

import { useState, useEffect } from 'react'
import { nativeShare, copyToClipboard } from '@/lib/native/share'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import {
  Users,
  Calendar,
  MapPin,
  Copy,
  Check,
  Pencil,
  X,
  AlertTriangle,
  Share2
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import Link from 'next/link'
import { circlePageHref } from '@/lib/navigation/routes'

interface TripInfoOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

export function TripInfoOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: TripInfoOverlayProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editForm, setEditForm] = useState({
    name: trip?.name || '',
    destinationHint: trip?.destinationHint || '',
    description: trip?.description || ''
  })

  // Share toggle state
  const [shareEnabled, setShareEnabled] = useState(trip?.shareVisibility === 'link_only')
  const [shareUrl, setShareUrl] = useState(
    trip?.shareId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/p/${trip.shareId}` : ''
  )
  const [sharingLoading, setSharingLoading] = useState(false)
  const [privacyBlocked, setPrivacyBlocked] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareConfirm, setShowShareConfirm] = useState(false)

  const isLeader = trip?.createdBy === user?.id
  const isLocked = trip?.status === 'locked'
  const inviteCode = trip?.circle?.inviteCode || trip?.inviteCode

  // Format date for display
  const formatDate = (dateStr: string) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  const createdDate = formatDate(trip?.createdAt)
  const participantCount = trip?.participantsWithStatus?.filter(
    (p: any) => (p.status || 'active') === 'active'
  )?.length || trip?.travelers?.length || 0

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return
    const result = await copyToClipboard(inviteCode)
    if (result === 'copied') {
      setCopied(true)
      toast.success('Invite code copied')
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('Couldn\'t copy invite code')
    }
  }

  // Share invite link via native share sheet, Web Share API, or clipboard fallback
  const handleInvite = async () => {
    if (!inviteCode) return

    const shareUrl = `${window.location.origin}/join/${inviteCode}?tripId=${trip.id}&ref=${user?.id || ''}`
    const shareText = `Join "${trip.name}" on Tripti.ai to plan the trip together!`

    const result = await nativeShare({ title: 'Tripti.ai Invite', text: shareText, url: shareUrl })
    if (result === 'copied') {
      toast.success('Invite link copied!')
    } else if (result === 'failed') {
      toast.error('Could not copy invite link')
    }
  }

  // Share toggle handlers
  const handleToggleSharing = async () => {
    if (sharingLoading || privacyBlocked) return

    // If enabling, show confirmation dialog first
    if (!shareEnabled) {
      setShowShareConfirm(true)
      return
    }

    // Disabling sharing
    await updateShareSettings('private')
  }

  const handleConfirmEnableSharing = async () => {
    setShowShareConfirm(false)
    await updateShareSettings('link_only')
  }

  const updateShareSettings = async (visibility: string) => {
    setSharingLoading(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/share-settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ shareVisibility: visibility })
      })

      if (!response.ok) {
        const err = await response.json()
        if (response.status === 403 && err.error?.includes('private trip visibility')) {
          setPrivacyBlocked(true)
          toast.error('A traveler\'s privacy settings prevent sharing')
          return
        }
        throw new Error(err.error || 'Could not update share settings')
      }

      const result = await response.json()
      const isEnabled = result.shareVisibility === 'link_only'
      setShareEnabled(isEnabled)

      if (isEnabled && result.shareUrl) {
        setShareUrl(`${window.location.origin}${result.shareUrl}`)
      }

      toast.success(isEnabled ? 'Trip sharing enabled' : 'Trip sharing disabled')
    } catch (err: any) {
      toast.error(err.message || 'Could not update share settings')
    } finally {
      setSharingLoading(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!shareUrl) return
    const result = await copyToClipboard(shareUrl)
    if (result === 'copied') {
      setShareCopied(true)
      toast.success('Share link copied')
      setTimeout(() => setShareCopied(false), 2000)
    } else {
      toast.error('Could not copy share link')
    }
  }

  const handleShareTrip = async () => {
    if (!shareUrl) return
    const shareText = `Check out "${trip.name}" on Tripti.ai!`
    const result = await nativeShare({ title: 'Tripti.ai Trip Preview', text: shareText, url: shareUrl })
    if (result === 'copied') {
      toast.success('Share link copied!')
    } else if (result === 'failed') {
      toast.error('Could not share link')
    }
  }

  const handleStartEdit = () => {
    setEditForm({
      name: trip?.name || '',
      destinationHint: trip?.destinationHint || '',
      description: trip?.description || ''
    })
    setIsEditing(true)
    // Note: hasUnsavedChanges is tracked by useEffect based on actual form changes
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setHasUnsavedChanges(false)
  }

  // Track actual form changes (matches pattern from other overlays)
  useEffect(() => {
    if (!isEditing) return

    const hasChanges =
      editForm.name.trim() !== (trip?.name || '').trim() ||
      editForm.destinationHint.trim() !== (trip?.destinationHint || '').trim() ||
      editForm.description.trim() !== (trip?.description || '').trim()

    setHasUnsavedChanges(hasChanges)
  }, [isEditing, editForm, trip?.name, trip?.destinationHint, trip?.description, setHasUnsavedChanges])

  const handleSave = async () => {
    if (!isLocked && !editForm.name.trim()) {
      toast.error('Trip name is required')
      return
    }

    setSaving(true)
    try {
      const body = isLocked
        ? { destinationHint: editForm.destinationHint.trim() || null }
        : {
            name: editForm.name.trim(),
            destinationHint: editForm.destinationHint.trim() || null,
            description: editForm.description.trim() || null
          }

      const response = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Couldn\'t update trip — try again')
      }

      const updatedTrip = await response.json()
      toast.success('Trip updated')
      setIsEditing(false)
      setHasUnsavedChanges(false)
      onRefresh(updatedTrip)
    } catch (err: any) {
      toast.error(err.message || 'Could not update trip — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
        <p className="text-sm text-gray-600">Trip data not available</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Trip Info Card */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          {/* Header with edit button */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditing && !isLocked ? (
                <div className="space-y-2">
                  <Label htmlFor="trip-name">Trip Name</Label>
                  <Input
                    id="trip-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Enter trip name"
                    className="text-lg font-semibold"
                  />
                </div>
              ) : (
                <h3 className="text-lg font-semibold text-brand-carbon">
                  {trip.name || 'Untitled Trip'}
                </h3>
              )}
            </div>
            {isLeader && !isEditing && !isLocked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartEdit}
                className="text-gray-500 hover:text-brand-blue"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Trip type badge */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={trip.type === 'hosted' ? 'border-amber-500 text-amber-700' : 'border-brand-blue text-brand-blue'}
            >
              {trip.type === 'hosted' ? 'Fixed dates' : 'Flexible dates'}
            </Badge>
            {isLocked && (
              <Badge variant="outline" className="border-brand-blue bg-brand-blue text-white">Dates Locked</Badge>
            )}
          </div>

          {/* Destination hint */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              <span>Destination</span>
              {isLeader && isLocked && !isEditing && (
                <button
                  onClick={handleStartEdit}
                  className="text-brand-blue hover:text-brand-blue/80"
                  aria-label="Edit destination"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
            {isEditing ? (
              <Input
                value={editForm.destinationHint}
                onChange={(e) => setEditForm({ ...editForm, destinationHint: e.target.value })}
                placeholder="e.g., Paris, Beach vacation, Ski trip"
                className="text-sm"
              />
            ) : (
              <p className="text-sm text-gray-700 pl-6">
                {trip.destinationHint || <span className="text-gray-400 italic">Not specified</span>}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            {isEditing && !isLocked ? (
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="Add a description for your trip..."
                  rows={3}
                  className="text-sm"
                />
              </div>
            ) : trip.description ? (
              <p className="text-sm text-gray-600">{trip.description}</p>
            ) : null}
          </div>

          {/* Edit buttons */}
          {isEditing && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                disabled={saving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !editForm.name.trim()}
                className="bg-brand-blue hover:bg-brand-blue/90 text-white"
              >
                {saving ? (
                  <>
                    <BrandedSpinner size="sm" className="mr-1" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Card */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Created date */}
          {createdDate && (
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Created {createdDate}</span>
            </div>
          )}

          {/* Circle link */}
          {trip.circle && (
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-gray-400" />
              <Link
                href={circlePageHref(trip.circleId || trip.circle?.id)}
                className="text-sm text-brand-blue hover:underline"
              >
                {trip.circle.name}
              </Link>
            </div>
          )}

          {/* Participant count */}
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              {participantCount} {participantCount === 1 ? 'traveler' : 'travelers'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Invite Code Card (if exists) */}
      {inviteCode && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Invite Code</p>
                <p className="text-lg font-mono text-brand-carbon">{inviteCode}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyInviteCode}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInvite}
              className="w-full mt-3 border-dashed border-brand-blue text-brand-blue hover:bg-brand-blue/5"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Share invite link
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Share Trip Section — leader only, locked trips */}
      {isLeader && isLocked && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-brand-carbon">Share trip preview</p>
                <p className="text-xs text-gray-500">Let anyone view the itinerary via link</p>
              </div>
              <button
                onClick={handleToggleSharing}
                disabled={privacyBlocked || sharingLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  shareEnabled ? 'bg-brand-red' : 'bg-gray-300'
                } ${(privacyBlocked || sharingLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                aria-label={shareEnabled ? 'Disable trip sharing' : 'Enable trip sharing'}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  shareEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {privacyBlocked && (
              <p className="text-xs text-gray-500">
                A traveler&apos;s privacy settings prevent sharing this trip.
              </p>
            )}

            {shareEnabled && shareUrl && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 text-xs bg-gray-50 border rounded px-2 py-1.5 text-brand-carbon font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyShareLink}>
                    {shareCopied ? (
                      <>
                        <Check className="h-4 w-4 mr-1 text-green-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShareTrip}
                  className="w-full border-dashed border-brand-blue text-brand-blue hover:bg-brand-blue/5"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share trip preview
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Locked status note */}
      {isLocked && isLeader && (
        <p className="text-xs text-gray-500 text-center">
          Only the destination can be updated after dates are locked.
        </p>
      )}

      {/* Share confirmation dialog */}
      <AlertDialog open={showShareConfirm} onOpenChange={setShowShareConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable trip sharing?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Anyone with the link will be able to see:</p>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>Trip name and destination</li>
                  <li>Trip dates</li>
                  <li>Itinerary</li>
                  <li>Number of travelers</li>
                </ul>
                <p>Hidden from public view:</p>
                <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                  <li>Traveler names and profiles</li>
                  <li>Chat messages</li>
                  <li>Accommodation details</li>
                  <li>Expenses</li>
                  <li>Personal notes</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmEnableSharing}
              className="bg-brand-red hover:bg-brand-red/90"
            >
              Enable sharing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
