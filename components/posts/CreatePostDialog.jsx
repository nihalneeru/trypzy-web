'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Camera, Plus, X, ListTodo, Check, Globe, EyeOff } from 'lucide-react'
import { BrandedSpinner } from '@/components/brand/BrandedSpinner'
import { api } from '@/lib/client/api'

export function CreatePostDialog({ open, onOpenChange, circleId, trips, token, onCreated }) {
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [mediaUrls, setMediaUrls] = useState([])
  const [caption, setCaption] = useState('')
  const [tripId, setTripId] = useState('')
  const [discoverable, setDiscoverable] = useState(false)
  const [destinationText, setDestinationText] = useState('')
  const [attachItinerary, setAttachItinerary] = useState(false)
  const [selectedItinerary, setSelectedItinerary] = useState(null)
  const [itineraryMode, setItineraryMode] = useState('highlights')
  const [loadingItinerary, setLoadingItinerary] = useState(false)
  const fileInputRef = useRef(null)

  // Fetch selected itinerary when trip changes
  useEffect(() => {
    if (tripId && tripId !== 'none') {
      fetchSelectedItinerary(tripId)
    } else {
      setSelectedItinerary(null)
      setAttachItinerary(false)
    }
  }, [tripId])

  const fetchSelectedItinerary = async (tid) => {
    setLoadingItinerary(true)
    try {
      const data = await api(`/trips/${tid}/itineraries/selected`, {}, token)
      setSelectedItinerary(data.itinerary)
    } catch (error) {
      console.error('Failed to fetch itinerary:', error)
      setSelectedItinerary(null)
    } finally {
      setLoadingItinerary(false)
    }
  }

  const handleFileSelect = async (e) => {
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
    } catch (error) {
      toast.error(error.message)
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (idx) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== idx))
  }

  const handleCreate = async () => {
    if (mediaUrls.length === 0) {
      toast.error('Add at least one image')
      return
    }
    
    setCreating(true)
    
    try {
      await api(`/circles/${circleId}/posts`, {
        method: 'POST',
        body: JSON.stringify({
          mediaUrls,
          caption,
          tripId: tripId && tripId !== 'none' ? tripId : null,
          discoverable,
          destinationText,
          itineraryId: attachItinerary && selectedItinerary ? selectedItinerary.id : null,
          itineraryMode: attachItinerary && selectedItinerary ? itineraryMode : null
        })
      }, token)
      
      toast.success('Memory shared!')
      onOpenChange(false)
      onCreated?.()
      
      // Reset form
      setMediaUrls([])
      setCaption('')
      setTripId('')
      setDiscoverable(false)
      setDestinationText('')
      setAttachItinerary(false)
      setSelectedItinerary(null)
      setItineraryMode('highlights')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Share a Memory
          </DialogTitle>
          <DialogDescription>
            Add photos and share moments with your circle
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Image Upload */}
          <div className="space-y-2">
            <Label>Photos (1-5 images)</Label>
            <div className="grid grid-cols-5 gap-2">
              {mediaUrls.map((url, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {mediaUrls.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-gray-400 hover:bg-gray-50 transition-colors"
                >
                  {uploading ? (
                    <BrandedSpinner size="default" />
                  ) : (
                    <Plus className="h-6 w-6 text-gray-400" />
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
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Share your thoughts..."
              rows={2}
            />
          </div>
          
          {/* Destination */}
          <div className="space-y-2">
            <Label>Destination (optional)</Label>
            <Input
              value={destinationText}
              onChange={(e) => setDestinationText(e.target.value)}
              placeholder="e.g. Bali, Indonesia"
            />
          </div>
          
          {/* Attach to Trip */}
          {trips && trips.length > 0 && (
            <div className="space-y-2">
              <Label>Attach to Trip (optional)</Label>
              <Select value={tripId} onValueChange={setTripId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a trip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trip</SelectItem>
                  {trips.map((trip) => (
                    <SelectItem key={trip.id} value={trip.id}>{trip.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Attach Itinerary Section - Only show if trip is selected and has final itinerary */}
          {tripId && tripId !== 'none' && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-[#6B7280]" />
                  <div>
                    <p className="font-medium text-sm">Attach itinerary to this memory?</p>
                    <p className="text-xs text-gray-500">Share your trip plan to inspire others</p>
                  </div>
                </div>
                {loadingItinerary ? (
                  <BrandedSpinner size="sm" />
                ) : selectedItinerary ? (
                  <Switch
                    checked={attachItinerary}
                    onCheckedChange={setAttachItinerary}
                  />
                ) : (
                  <Badge variant="secondary" className="text-xs">No final itinerary</Badge>
                )}
              </div>
              
              {attachItinerary && selectedItinerary && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                    <Check className="h-4 w-4" />
                    <span>{selectedItinerary.title} ({selectedItinerary.itemCount} activities)</span>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">How much to share:</Label>
                    <RadioGroup value={itineraryMode} onValueChange={setItineraryMode} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="highlights" id="highlights" />
                        <Label htmlFor="highlights" className="text-sm font-normal cursor-pointer">
                          Highlights (top 3 per day)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="full" id="full" />
                        <Label htmlFor="full" className="text-sm font-normal cursor-pointer">
                          Full itinerary
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  
                  <p className="text-xs text-gray-500 bg-white rounded p-2">
                    This itinerary worked for your group. Others can use it as a starting point and customize it for their own trip.
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Visibility */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              {discoverable ? (
                <Globe className="h-5 w-5 text-[#6B7280]" />
              ) : (
                <EyeOff className="h-5 w-5 text-gray-500" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {discoverable ? 'Discoverable' : 'Circle-only'}
                </p>
                <p className="text-xs text-gray-500">
                  {discoverable 
                    ? 'Anyone can see this in Discover feed'
                    : 'Only circle members can see this'}
                </p>
              </div>
            </div>
            <Switch
              checked={discoverable}
              onCheckedChange={setDiscoverable}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={creating || mediaUrls.length === 0}>
            {creating ? 'Sharing...' : 'Share Memory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
