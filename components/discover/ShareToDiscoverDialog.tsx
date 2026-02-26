'use client'

import { useState, useEffect, useRef } from 'react'
import { Globe, Plus, X, Image as ImageIcon } from 'lucide-react'
import { useBlobUpload } from '@/hooks/use-blob-upload'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { toast } from 'sonner'

interface Circle {
  id: string
  name: string
}

interface Trip {
  id: string
  name: string
}

interface ShareToDiscoverDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  circles: Circle[]
  token: string
  onCreated?: () => void
}

export function ShareToDiscoverDialog({ open, onOpenChange, circles, token, onCreated }: ShareToDiscoverDialogProps) {
  const [shareScope, setShareScope] = useState('global')
  const [selectedCircle, setSelectedCircle] = useState('')
  const [selectedTrip, setSelectedTrip] = useState('')
  const [tripsForCircle, setTripsForCircle] = useState<Trip[]>([])
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [shareCaption, setShareCaption] = useState('')
  const [shareCreating, setShareCreating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Use blob upload hook for client-direct uploads
  const { uploadFiles, uploading } = useBlobUpload()

  // Load trips when a specific circle is selected
  useEffect(() => {
    if (selectedCircle && selectedCircle !== 'all' && token) {
      loadTripsForCircle(selectedCircle)
    } else {
      setTripsForCircle([])
      setSelectedTrip('')
    }
  }, [selectedCircle, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadTripsForCircle = async (circleId: string) => {
    try {
      const res = await fetch(`/api/circles/${circleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const circle = await res.json()
        setTripsForCircle(circle.trips || [])
      }
    } catch {
      setTripsForCircle([])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    if (mediaUrls.length + files.length > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        toast.error(`Invalid file type: ${file.name}. Allowed: JPEG, PNG, WebP`)
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`File ${file.name} is too large. Maximum 5MB`)
        return
      }
    }

    const newUrls = await uploadFiles(files)
    if (newUrls.length > 0) {
      setMediaUrls([...mediaUrls, ...newUrls])
      toast.success(`${newUrls.length} image(s) uploaded`)
    } else {
      toast.error('Could not upload images — please try again')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (idx: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== idx))
  }

  const resetForm = () => {
    setShareScope('global')
    setSelectedCircle('')
    setSelectedTrip('')
    setTripsForCircle([])
    setMediaUrls([])
    setShareCaption('')
  }

  const handleSubmit = async () => {
    if (mediaUrls.length === 0) {
      toast.error('Please add at least one image')
      return
    }

    if (shareScope === 'circle' && selectedCircle !== 'all' && !selectedCircle) {
      toast.error('Please select a circle for circle-scoped posts')
      return
    }

    setShareCreating(true)

    try {
      if (shareScope === 'circle' && selectedCircle === 'all') {
        // Create a post for each circle
        const results = await Promise.all(
          circles.map(async (circle) => {
            const response = await fetch('/api/discover/posts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                scope: 'circle',
                circleId: circle.id,
                tripId: null,
                caption: shareCaption.trim() || null,
                mediaUrls,
              }),
            })
            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error(data.error || `Failed to share to ${circle.name}`)
            }
            return response.json()
          })
        )

        toast.success(`Shared to ${results.length} circle${results.length > 1 ? 's' : ''}!`)
      } else {
        const response = await fetch('/api/discover/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            scope: shareScope,
            circleId: shareScope === 'circle' ? selectedCircle : null,
            tripId: shareScope === 'circle' && selectedTrip && selectedTrip !== 'none' ? selectedTrip : null,
            caption: shareCaption.trim() || null,
            mediaUrls,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create post')
        }

        toast.success('Shared to Discover!')
      }

      onOpenChange(false)
      resetForm()
      onCreated?.()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setShareCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Share to Discover
          </DialogTitle>
          <DialogDescription>
            Share your travel memories publicly. Select a circle for context (circle name won&apos;t be shown publicly).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto min-h-0">
          {/* Scope Selector */}
          <div className="space-y-2">
            <Label>Visibility Scope</Label>
            <Select value={shareScope} onValueChange={(value) => {
              setShareScope(value)
              if (value === 'global') {
                setSelectedCircle('')
                setSelectedTrip('')
                setTripsForCircle([])
              }
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global (Everyone)</SelectItem>
                <SelectItem value="circle">Circle-only Discover (Members of selected circle)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-brand-carbon/60">
              {shareScope === 'global'
                ? 'Visible to everyone on Discover'
                : 'Visible only to members of the selected circle'}
            </p>
          </div>

          {/* Circle Selector */}
          {shareScope === 'circle' && (
            <div className="space-y-2">
              <Label>Circle <span className="text-brand-red">*</span></Label>
              <Select
                value={selectedCircle || undefined}
                onValueChange={(value) => {
                  setSelectedCircle(value)
                  if (value === 'all') {
                    setSelectedTrip('')
                    setTripsForCircle([])
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a circle..." />
                </SelectTrigger>
                <SelectContent>
                  {circles && circles.length > 1 && (
                    <SelectItem value="all">All my circles</SelectItem>
                  )}
                  {circles && circles.length > 0 ? circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>
                      {circle.name}
                    </SelectItem>
                  )) : (
                    <SelectItem value="" disabled>No circles available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-brand-carbon/60">
                {selectedCircle === 'all'
                  ? 'Will be shared to all your circles'
                  : 'Circle name won\'t be visible publicly'}
              </p>
            </div>
          )}

          {/* Trip Selector — hidden when "All circles" selected */}
          {selectedCircle && selectedCircle !== 'all' && tripsForCircle.length > 0 && (
            <div className="space-y-2">
              <Label>Trip (optional)</Label>
              <Select
                value={selectedTrip === '' ? undefined : (selectedTrip || undefined)}
                onValueChange={(value) => setSelectedTrip(value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tripsForCircle.map((trip) => (
                    <SelectItem key={trip.id} value={trip.id}>
                      {trip.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Image Upload */}
          <div className="space-y-2">
            <Label>Photos (1-5 images) <span className="text-brand-red">*</span></Label>
            <div className="grid grid-cols-5 gap-2">
              {mediaUrls.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-brand-sand/50">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-brand-red text-white rounded-full p-1 hover:bg-brand-red/90"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {mediaUrls.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-brand-carbon/20 hover:border-brand-blue flex items-center justify-center text-brand-carbon/40 hover:text-brand-blue transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <div className="animate-spin h-5 w-5 border-2 border-brand-carbon/30 border-t-transparent rounded-full" />
                  ) : (
                    <ImageIcon className="h-6 w-6" />
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Caption */}
          <div className="space-y-2">
            <Label>Caption (optional)</Label>
            <Textarea
              value={shareCaption}
              onChange={(e) => setShareCaption(e.target.value)}
              placeholder="Share your story..."
              rows={3}
            />
          </div>

          {/* Notice — contextual based on scope */}
          <div className="bg-brand-sand border border-brand-carbon/10 rounded-lg p-3 text-sm text-brand-carbon">
            {shareScope === 'global' ? (
              <>
                <p className="font-medium">This will be shared publicly</p>
                <p className="text-brand-carbon/70">Anyone on Tripti can see this in Explore.</p>
              </>
            ) : selectedCircle === 'all' ? (
              <>
                <p className="font-medium">Shared with all your circles</p>
                <p className="text-brand-carbon/70">Only members of your circles will see this story.</p>
              </>
            ) : selectedCircle ? (
              <>
                <p className="font-medium">Shared with your circle</p>
                <p className="text-brand-carbon/70">Only members of the selected circle will see this story.</p>
              </>
            ) : (
              <>
                <p className="font-medium">Choose who sees this</p>
                <p className="text-brand-carbon/70">Select a circle above to share with your friends.</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={shareCreating || uploading || mediaUrls.length === 0 || (shareScope === 'circle' && !selectedCircle) || (shareScope === 'circle' && selectedCircle === 'all' && circles.length === 0)}
          >
            {shareCreating ? 'Sharing...' : 'Share to Discover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
