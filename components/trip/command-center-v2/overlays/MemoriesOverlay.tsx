'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Camera, Trash2, X, Image as ImageIcon, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/app/HomeClient'

interface MemoriesOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

// API Helper
const api = async (endpoint: string, options: any = {}, token: string | null = null) => {
  const headers: any = {}

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

export function MemoriesOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: MemoriesOverlayProps) {
  const [memories, setMemories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Create form state
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [caption, setCaption] = useState('')
  const [discoverable, setDiscoverable] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isReadOnly = !trip?.viewer?.isActiveParticipant || trip?.viewer?.participantStatus === 'left' || trip?.status === 'canceled'

  useEffect(() => {
    if (trip?.id) {
      loadMemories()
    }
  }, [trip?.id])

  const loadMemories = async () => {
    if (!trip?.id) return

    setLoading(true)
    try {
      // Load posts/memories for this trip
      const data = await api(`/trips/${trip.id}/posts`, { method: 'GET' }, token)
      setMemories(data?.posts || data || [])
    } catch (error: any) {
      console.error('Failed to load memories:', error)
      // Don't show error toast if 404 (no posts endpoint)
      if (!error.message?.includes('404')) {
        toast.error(error.message || 'Failed to load memories')
      }
      setMemories([])
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    if (mediaUrls.length + files.length > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }

    setUploading(true)

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })

        const data = await response.json()
        if (!response.ok) throw new Error(data.error)
        return data.url
      })

      const newUrls = await Promise.all(uploadPromises)
      setMediaUrls([...mediaUrls, ...newUrls])
      toast.success(`${newUrls.length} image(s) uploaded`)
      setHasUnsavedChanges(true)
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload images')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (idx: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== idx))
    setHasUnsavedChanges(mediaUrls.length > 1 || caption.length > 0)
  }

  const handleCreate = async () => {
    if (mediaUrls.length === 0) {
      toast.error('Add at least one image')
      return
    }

    setCreating(true)

    try {
      const payload = {
        circleId: trip.circleId,
        tripId: trip.id,
        mediaUrls,
        caption: caption.trim() || undefined,
        discoverable
      }

      await api('/posts', {
        method: 'POST',
        body: JSON.stringify(payload)
      }, token)

      toast.success('Memory created!')
      setShowCreateDialog(false)
      resetForm()
      setHasUnsavedChanges(false)
      await loadMemories()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create memory')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (memoryId: string) => {
    setDeleting(true)
    try {
      await api(`/posts/${memoryId}`, {
        method: 'DELETE'
      }, token)

      toast.success('Memory deleted')
      setDeletingMemoryId(null)
      await loadMemories()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete memory')
    } finally {
      setDeleting(false)
    }
  }

  const resetForm = () => {
    setMediaUrls([])
    setCaption('')
    setDiscoverable(false)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BrandedSpinner size="md" className="mb-4" />
        <p className="text-gray-500">Loading memories...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {memories.length} memor{memories.length !== 1 ? 'ies' : 'y'}
        </p>
        {!isReadOnly && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Memory
          </Button>
        )}
      </div>

      {memories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Camera className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Memories Yet</h3>
          <p className="text-gray-500 mb-4">Capture and share your travel moments</p>
          {!isReadOnly && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Share First Memory
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {memories.map((memory) => (
            <Card key={memory.id} className="overflow-hidden group relative">
              {/* Image */}
              {memory.mediaUrls && memory.mediaUrls.length > 0 ? (
                <div className="aspect-square relative">
                  <img
                    src={memory.mediaUrls[0]}
                    alt={memory.caption || 'Trip memory'}
                    className="w-full h-full object-cover"
                  />
                  {memory.mediaUrls.length > 1 && (
                    <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                      +{memory.mediaUrls.length - 1}
                    </div>
                  )}
                  {/* Delete button on hover */}
                  {!isReadOnly && memory.createdBy === user?.id && (
                    <button
                      onClick={() => setDeletingMemoryId(memory.id)}
                      className="absolute top-2 left-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-gray-400" />
                </div>
              )}

              {/* Caption and metadata */}
              <CardContent className="p-3">
                {memory.caption && (
                  <p className="text-sm text-gray-700 line-clamp-2 mb-1">
                    {memory.caption}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {formatDate(memory.createdAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Memory Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open && (mediaUrls.length > 0 || caption.length > 0)) {
          // Has unsaved changes - could add confirmation
        }
        setShowCreateDialog(open)
        if (!open) {
          resetForm()
          setHasUnsavedChanges(false)
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Share a Memory</DialogTitle>
            <DialogDescription>
              Add photos from your trip to share with fellow travelers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Image upload area */}
            <div>
              <Label>Photos *</Label>
              <div className="mt-2">
                {mediaUrls.length === 0 ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
                  >
                    {uploading ? (
                      <BrandedSpinner size="sm" className="mx-auto mb-2" />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">
                      {uploading ? 'Uploading...' : 'Click to upload photos'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Max 5 images</p>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {mediaUrls.map((url, idx) => (
                        <div key={idx} className="relative aspect-square">
                          <img
                            src={url}
                            alt={`Upload ${idx + 1}`}
                            className="w-full h-full object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {mediaUrls.length < 5 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="aspect-square border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-gray-400 transition-colors"
                        >
                          {uploading ? (
                            <BrandedSpinner size="sm" />
                          ) : (
                            <Plus className="h-6 w-6 text-gray-400" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Caption */}
            <div>
              <Label htmlFor="caption">Caption</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => {
                  setCaption(e.target.value)
                  setHasUnsavedChanges(true)
                }}
                placeholder="Share your experience..."
                rows={3}
              />
            </div>

            {/* Discoverable toggle */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="discoverable"
                checked={discoverable}
                onCheckedChange={(checked) => setDiscoverable(!!checked)}
              />
              <div>
                <Label htmlFor="discoverable" className="cursor-pointer text-sm">
                  Make discoverable
                </Label>
                <p className="text-xs text-gray-500">
                  Allow others outside your circle to see this memory
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false)
                resetForm()
                setHasUnsavedChanges(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || mediaUrls.length === 0}
            >
              {creating ? 'Creating...' : 'Share Memory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingMemoryId} onOpenChange={(open) => {
        if (!open) setDeletingMemoryId(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The memory will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingMemoryId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMemoryId && handleDelete(deletingMemoryId)}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
