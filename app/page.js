'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { 
  Users, Plus, LogOut, MapPin, Calendar as CalendarIcon, 
  MessageCircle, Check, X, HelpCircle, Vote, Lock, UserPlus,
  ChevronLeft, Send, Compass, ArrowRight, Image as ImageIcon,
  Camera, Globe, Eye, EyeOff, Trash2, Edit, Search, Flag, Sparkles,
  ListTodo, Lightbulb, RefreshCw, ChevronUp, ChevronDown, Clock, Sun, Moon, Sunset
} from 'lucide-react'

// Auth Context
const useAuth = () => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('trypzy_token')
    const storedUser = localStorage.getItem('trypzy_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const login = (userData, authToken) => {
    localStorage.setItem('trypzy_token', authToken)
    localStorage.setItem('trypzy_user', JSON.stringify(userData))
    setToken(authToken)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    setToken(null)
    setUser(null)
  }

  return { user, token, loading, login, logout }
}

// API Helper
const api = async (endpoint, options = {}, token = null) => {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token && { Authorization: `Bearer ${token}` })
  }
  
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  
  return data
}

// Format date for display
const formatDate = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours === 0) {
      const mins = Math.floor(diff / (1000 * 60))
      return mins <= 1 ? 'Just now' : `${mins} min ago`
    }
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Auth Page Component
function AuthPage({ onLogin }) {
  const [isSignup, setIsSignup] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const endpoint = isSignup ? '/auth/signup' : '/auth/signin'
      const body = isSignup ? { email, password, name } : { email, password }
      
      const data = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
      })
      
      onLogin(data.user, data.token)
      toast.success(isSignup ? 'Account created!' : 'Welcome back!')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Compass className="h-10 w-10 text-indigo-600" />
            <h1 className="text-4xl font-bold text-gray-900">Trypzy</h1>
          </div>
          <p className="text-gray-600">Plan trips together with your circles</p>
        </div>
        
        <Card className="shadow-xl border-0">
          <CardHeader>
            <CardTitle>{isSignup ? 'Create Account' : 'Welcome Back'}</CardTitle>
            <CardDescription>
              {isSignup ? 'Start planning trips with friends' : 'Sign in to continue planning'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required={isSignup}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Loading...' : (isSignup ? 'Create Account' : 'Sign In')}
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setIsSignup(!isSignup)}
            >
              {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

// Post Card Component
function PostCard({ post, onDelete, onEdit, showCircle = false, isDiscoverView = false, onViewItinerary, onProposeTrip }) {
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [itineraryExpanded, setItineraryExpanded] = useState(false)
  
  const handleReport = async () => {
    if (!reportReason.trim()) return
    setReporting(true)
    try {
      await api('/reports', {
        method: 'POST',
        body: JSON.stringify({ postId: post.id, reason: reportReason })
      })
      toast.success('Report submitted. Thank you.')
      setShowReportDialog(false)
      setReportReason('')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setReporting(false)
    }
  }

  const getTimeBlockIcon = (timeBlock) => {
    switch (timeBlock) {
      case 'morning': return <Sun className="h-3 w-3 text-yellow-500" />
      case 'afternoon': return <Sunset className="h-3 w-3 text-orange-500" />
      case 'evening': return <Moon className="h-3 w-3 text-indigo-500" />
      default: return <Clock className="h-3 w-3 text-gray-400" />
    }
  }

  return (
    <Card className="overflow-hidden">
      {/* Image Grid */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className={`grid gap-1 ${
          post.mediaUrls.length === 1 ? 'grid-cols-1' :
          post.mediaUrls.length === 2 ? 'grid-cols-2' :
          post.mediaUrls.length === 3 ? 'grid-cols-3' :
          post.mediaUrls.length === 4 ? 'grid-cols-2' :
          'grid-cols-3'
        }`}>
          {post.mediaUrls.slice(0, 5).map((url, idx) => (
            <div 
              key={idx} 
              className={`aspect-square bg-gray-100 overflow-hidden ${
                post.mediaUrls.length === 3 && idx === 0 ? 'col-span-2 row-span-2' : ''
              }`}
            >
              <img 
                src={url} 
                alt={`Memory ${idx + 1}`}
                className="w-full h-full object-cover hover:scale-105 transition-transform"
              />
            </div>
          ))}
        </div>
      )}
      
      <CardContent className="p-4">
        {/* Author & Date */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 text-sm font-medium">
                {(post.author?.name || post.authorName || 'A').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-sm">{post.author?.name || post.authorName || 'Anonymous'}</p>
              <p className="text-xs text-gray-500">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {post.discoverable && !isDiscoverView && (
              <Badge variant="secondary" className="text-xs">
                <Globe className="h-3 w-3 mr-1" />
                Discoverable
              </Badge>
            )}
            {post.trip && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {post.trip.name || post.tripName}
              </Badge>
            )}
            {post.tripName && !post.trip && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                {post.tripName}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Destination */}
        {post.destinationText && (
          <p className="text-sm text-indigo-600 mb-2 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {post.destinationText}
          </p>
        )}
        
        {/* Caption */}
        {post.caption && (
          <p className="text-gray-700 text-sm">{post.caption}</p>
        )}
        
        {/* Itinerary Snapshot - Only show if post has attached itinerary */}
        {post.itinerarySnapshot && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={() => setItineraryExpanded(!itineraryExpanded)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-indigo-600" />
                <span className="font-medium text-sm text-gray-900">Itinerary Snapshot</span>
                <Badge variant="secondary" className="text-xs">
                  {post.itinerarySnapshot.tripLength} days • {post.itinerarySnapshot.style}
                </Badge>
              </div>
              {itineraryExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            
            {itineraryExpanded && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-500 italic">
                  This itinerary worked for them. Your group can change it.
                </p>
                
                {/* Day-by-day summary */}
                <div className="space-y-2">
                  {post.itinerarySnapshot.days?.map((day) => (
                    <div key={day.dayNumber} className="bg-gray-50 rounded-lg p-3">
                      <p className="font-medium text-xs text-gray-700 mb-2">Day {day.dayNumber}</p>
                      <div className="space-y-1">
                        {day.items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                            {getTimeBlockIcon(item.timeBlock)}
                            <span className="truncate">{item.title}</span>
                          </div>
                        ))}
                        {day.hasMore && (
                          <p className="text-xs text-gray-400 pl-5">
                            +{day.totalItems - day.items.length} more activities
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Itinerary Actions - Only in discover view */}
                {isDiscoverView && (
                  <div className="flex gap-2 pt-2">
                    {onViewItinerary && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => onViewItinerary(post)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View full itinerary
                      </Button>
                    )}
                    {onProposeTrip && (
                      <Button 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => onProposeTrip(post)}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Propose to circle
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          {isDiscoverView ? (
            <>
              {post.isAuthor ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onEdit?.(post)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete?.(post.id)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setShowReportDialog(true)}>
                  <Flag className="h-4 w-4 mr-1" />
                  Report
                </Button>
              )}
              {/* CTA for discover - will be handled by parent */}
            </>
          ) : post.isAuthor ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(post)}>
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete?.(post.id)}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </div>
          ) : (
            <div />
          )}
        </div>
      </CardContent>
      
      {/* Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Post</DialogTitle>
            <DialogDescription>Let us know why you're reporting this post</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancel</Button>
            <Button onClick={handleReport} disabled={reporting || !reportReason.trim()}>
              {reporting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// Create Post Dialog Component
function CreatePostDialog({ open, onOpenChange, circleId, trips, token, onCreated }) {
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
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  {uploading ? (
                    <div className="animate-spin h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full" />
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
            <div className="space-y-3 p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="font-medium text-sm">Attach itinerary to this memory?</p>
                    <p className="text-xs text-gray-500">Share your trip plan to inspire others</p>
                  </div>
                </div>
                {loadingItinerary ? (
                  <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
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
                <div className="space-y-3 pt-2 border-t border-indigo-100">
                  <div className="flex items-center gap-2 text-sm text-indigo-700">
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
                <Globe className="h-5 w-5 text-indigo-600" />
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

// Memories View Component
function MemoriesView({ posts, loading, onCreatePost, onDeletePost, onEditPost, emptyMessage = "No memories yet" }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{emptyMessage}</h3>
          <p className="text-gray-500 mb-4">Capture and share your travel moments</p>
          {onCreatePost && (
            <Button onClick={onCreatePost}>
              <Plus className="h-4 w-4 mr-2" />
              Share your first memory
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {posts.map((post) => (
        <PostCard 
          key={post.id} 
          post={post}
          onDelete={onDeletePost}
          onEdit={onEditPost}
        />
      ))}
    </div>
  )
}

// Discover Page Component - Story-First (Memories Only, No Separate Itinerary Feed)
function DiscoverPage({ token, circles, onCreateTrip, onNavigateToTrip }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState('global') // 'global' or 'circle'
  const [viewCircleId, setViewCircleId] = useState('') // Circle ID for viewing circle feed
  
  // View/Propose state
  const [selectedPost, setSelectedPost] = useState(null)
  const [showProposeModal, setShowProposeModal] = useState(false)
  const [proposingPost, setProposingPost] = useState(null)
  const [selectedCircleId, setSelectedCircleId] = useState('')
  const [proposing, setProposing] = useState(false)

  const loadPosts = async (pageNum = 1, searchQuery = search, currentScope = scope, circleId = viewCircleId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ 
        page: pageNum.toString(),
        scope: currentScope
      })
      if (searchQuery) params.append('search', searchQuery)
      if (currentScope === 'circle' && circleId) {
        params.append('circleId', circleId)
      }
      
      const data = await api(`/discover/posts?${params}`, {}, token)
      
      if (pageNum === 1) {
        setPosts(data.posts)
      } else {
        setPosts([...posts, ...data.posts])
      }
      setHasMore(data.pagination.hasMore)
      setTotal(data.pagination.total)
      setPage(pageNum)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    // Don't load if circle scope is selected but no circle is chosen
    if (scope === 'circle' && !viewCircleId) {
      setPosts([])
      setTotal(0)
      setHasMore(false)
      return
    }
    loadPosts(1, search, scope, viewCircleId)
  }, [scope, viewCircleId, search])

  // Initial load - only if not circle scope or circle is selected
  useEffect(() => {
    if (scope !== 'circle' || viewCircleId) {
      loadPosts(1)
    }
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearch(searchInput)
    loadPosts(1, searchInput)
  }

  const loadMore = () => {
    loadPosts(page + 1, search)
  }

  const handleViewItinerary = (post) => {
    setSelectedPost(post)
  }

  const handleDeletePost = async (postId) => {
    if (!confirm('Are you sure you want to delete this post?')) return
    
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' }, token)
      toast.success('Post deleted')
      loadPosts(1, search, scope, viewCircleId) // Refresh posts
    } catch (error) {
      toast.error(error.message)
    }
  }

  const handleEditPost = (post) => {
    // Set post to edit and open edit modal
    setSelectedPost(post)
    setShowEditModal(true)
  }

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPost, setEditingPost] = useState(null)

  const handleProposeTrip = (post) => {
    if (!token) {
      toast.error('Please sign in to propose a trip')
      return
    }
    setProposingPost(post)
    setSelectedCircleId('')
    setShowProposeModal(true)
  }

  const proposeTrip = async () => {
    if (!selectedCircleId) {
      toast.error('Please select a circle')
      return
    }
    setProposing(true)
    try {
      const result = await api(`/discover/posts/${proposingPost.id}/propose`, {
        method: 'POST',
        body: JSON.stringify({ circleId: selectedCircleId })
      }, token)
      
      toast.success('Trip proposed! Your group can now schedule dates and customize the itinerary.')
      setShowProposeModal(false)
      setProposingPost(null)
      
      // Optionally navigate to the new trip
      if (onNavigateToTrip && result.trip) {
        onNavigateToTrip(result.trip.circleId, result.trip.id)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setProposing(false)
    }
  }

  const getTimeBlockIcon = (timeBlock) => {
    switch (timeBlock) {
      case 'morning': return <Sun className="h-4 w-4 text-yellow-500" />
      case 'afternoon': return <Sunset className="h-4 w-4 text-orange-500" />
      case 'evening': return <Moon className="h-4 w-4 text-indigo-500" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const [showShareModal, setShowShareModal] = useState(false)
  const [shareScope, setShareScope] = useState('global') // 'global' or 'circle'
  const [selectedCircle, setSelectedCircle] = useState('')
  const [selectedTrip, setSelectedTrip] = useState('')
  const [shareFiles, setShareFiles] = useState([]) // Store File objects instead of URLs
  const [sharePreviewUrls, setSharePreviewUrls] = useState([]) // For preview
  const [shareCaption, setShareCaption] = useState('')
  const [shareUploading, setShareUploading] = useState(false)
  const [shareCreating, setShareCreating] = useState(false)
  const [tripsForCircle, setTripsForCircle] = useState([])
  const shareFileInputRef = useRef(null)

  // Load trips when circle is selected
  useEffect(() => {
    if (selectedCircle && selectedCircle !== '' && token) {
      loadTripsForCircle(selectedCircle)
    } else {
      setTripsForCircle([])
      setSelectedTrip('')
    }
  }, [selectedCircle, token])

  const loadTripsForCircle = async (circleId) => {
    try {
      const circle = await api(`/circles/${circleId}`, {}, token)
      setTripsForCircle(circle.trips || [])
    } catch (error) {
      console.error('Failed to load trips:', error)
      setTripsForCircle([])
    }
  }

  const handleShareFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    
    if (shareFiles.length + files.length > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }
    
    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
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
    
    const newFiles = [...shareFiles, ...files]
    setShareFiles(newFiles)
    
    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file))
    setSharePreviewUrls([...sharePreviewUrls, ...newPreviews])
  }

  const removeShareImage = (idx) => {
    // Revoke preview URL
    URL.revokeObjectURL(sharePreviewUrls[idx])
    
    setShareFiles(shareFiles.filter((_, i) => i !== idx))
    setSharePreviewUrls(sharePreviewUrls.filter((_, i) => i !== idx))
  }

  const handleShareSubmit = async () => {
    if (shareFiles.length === 0) {
      toast.error('Please add at least one image')
      return
    }
    
    // Validate scope rules
    if (shareScope === 'circle' && !selectedCircle) {
      toast.error('Please select a circle for circle-scoped posts')
      return
    }
    
    setShareCreating(true)
    
    try {
      // Create FormData
      const formData = new FormData()
      formData.append('scope', shareScope)
      if (shareScope === 'circle') {
        formData.append('circleId', selectedCircle)
        if (selectedTrip && selectedTrip !== '' && selectedTrip !== 'none') {
          formData.append('tripId', selectedTrip)
        }
      }
      if (shareCaption.trim()) {
        formData.append('caption', shareCaption.trim())
      }
      
      // Add all files with name "images"
      shareFiles.forEach(file => {
        formData.append('images', file)
      })
      
      // Send multipart/form-data
      const response = await fetch('/api/discover/posts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      })
      
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create post')
      }
      
      toast.success('Shared to Discover!')
      setShowShareModal(false)
      setShareScope('global')
      setSelectedCircle('')
      setSelectedTrip('')
      setTripsForCircle([])
      setShareFiles([])
      // Clean up preview URLs
      sharePreviewUrls.forEach(url => URL.revokeObjectURL(url))
      setSharePreviewUrls([])
      setShareCaption('')
      loadPosts(1, search, scope, viewCircleId) // Refresh posts
    } catch (error) {
      toast.error(error.message)
    } finally {
      setShareCreating(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-indigo-600" />
            Discover
          </h1>
          <p className="text-gray-600 mt-1">Travel stories and inspiration from fellow explorers</p>
        </div>
        {token && (
          <Button onClick={() => setShowShareModal(true)} className="flex-shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Share to Discover
          </Button>
        )}
      </div>

      {/* Scope Toggle */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setScope('global')
              setViewCircleId('')
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              scope === 'global'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Global
          </button>
          {token && (
            <button
              onClick={() => setScope('circle')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                scope === 'circle'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              My Circles
            </button>
          )}
        </div>
        
        {/* Circle selector for circle scope */}
        {scope === 'circle' && token && (
          <>
            {circles && circles.length > 0 ? (
              <Select value={viewCircleId || undefined} onValueChange={(value) => setViewCircleId(value || '')}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select a circle..." />
                </SelectTrigger>
                <SelectContent>
                  {circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>
                      {circle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-gray-500">No circles available. Join a circle to see circle-scoped posts.</p>
            )}
          </>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <form onSubmit={handleSearch}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search destinations, stories..."
                className="pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
          </div>
        </form>
      </div>

      {/* Results count */}
      {search && (
        <p className="text-sm text-gray-500 mb-4">
          Found {total} {total === 1 ? 'story' : 'stories'} for "{search}"
        </p>
      )}

      {/* Memories Feed */}
      {loading && posts.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : scope === 'circle' && !viewCircleId && circles && circles.length > 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Select a Circle
            </h3>
            <p className="text-gray-500 mb-4">
              Choose a circle from the dropdown above to see posts from that circle.
            </p>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {search ? 'No stories found' : 'No stories yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {search ? 'Try a different search term' : 'Be the first to share your travel story!'}
            </p>
            {token && !search && (
              <Button onClick={() => setShowShareModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Share Your Story
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            {posts.map((post) => (
              <div key={post.id}>
                <PostCard 
                  post={post} 
                  isDiscoverView 
                  onViewItinerary={post.hasItinerary ? handleViewItinerary : undefined}
                  onProposeTrip={post.hasItinerary ? handleProposeTrip : undefined}
                  onDelete={post.isAuthor ? handleDeletePost : undefined}
                  onEdit={post.isAuthor ? handleEditPost : undefined}
                />
                {/* CTA for posts without itinerary */}
                {!post.hasItinerary && (
                  <Button 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => onCreateTrip?.(post.destinationText)}
                  >
                    <Compass className="h-4 w-4 mr-2" />
                    Create a similar trip
                  </Button>
                )}
                {/* CTA for posts with itinerary - secondary button at card level */}
                {post.hasItinerary && (
                  <Button 
                    className="w-full mt-2"
                    onClick={() => handleProposeTrip(post)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Propose this trip to a circle
                  </Button>
                )}
              </div>
            ))}
          </div>
          
          {hasMore && (
            <div className="text-center mt-8">
              <Button variant="outline" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading...' : 'Load More Stories'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* View Itinerary Dialog */}
      <Dialog open={!!selectedPost} onOpenChange={(open) => !open && setSelectedPost(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedPost?.itinerarySnapshot && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5 text-indigo-600" />
                  Full Itinerary
                </DialogTitle>
                <DialogDescription>
                  {selectedPost.itinerarySnapshot.tripLength}-day {selectedPost.itinerarySnapshot.style} itinerary • {selectedPost.itinerarySnapshot.totalActivities} activities
                </DialogDescription>
              </DialogHeader>
              
              {/* Inspiration Notice */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                <p className="font-medium">This itinerary worked for them</p>
                <p className="text-indigo-600">Your group can change it to fit your preferences.</p>
              </div>
              
              {/* Day by Day Itinerary */}
              <div className="space-y-4 mt-4">
                {selectedPost.itinerarySnapshot.days?.map((day) => (
                  <div key={day.dayNumber} className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-gray-500" />
                      Day {day.dayNumber}
                    </h4>
                    <div className="space-y-2">
                      {day.items.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 pl-2">
                          {getTimeBlockIcon(item.timeBlock)}
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.title}</p>
                            {item.notes && (
                              <p className="text-xs text-gray-500">{item.notes}</p>
                            )}
                            {item.locationText && (
                              <p className="text-xs text-indigo-600 flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />
                                {item.locationText}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.timeBlock}
                          </Badge>
                        </div>
                      ))}
                      {day.hasMore && (
                        <p className="text-xs text-gray-400 pl-7">
                          +{day.totalItems - day.items.length} more activities
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSelectedPost(null)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setSelectedPost(null)
                  handleProposeTrip(selectedPost)
                }}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Propose to Circle
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Propose to Circle Modal */}
      <Dialog open={showProposeModal} onOpenChange={setShowProposeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Propose Trip to Your Circle
            </DialogTitle>
            <DialogDescription>
              Start planning a trip inspired by this memory
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {/* Circle Selection */}
            <div className="space-y-2">
              <Label>Select a Circle</Label>
              {circles && circles.length > 0 ? (
                <Select value={selectedCircleId} onValueChange={setSelectedCircleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a circle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {circles.map(circle => (
                      <SelectItem key={circle.id} value={circle.id}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          {circle.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-gray-500">
                  You need to create or join a circle first to propose trips.
                </p>
              )}
            </div>
            
            {/* Info Box */}
            <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-gray-700">What happens next:</p>
              <ul className="space-y-1 text-gray-600">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>A new trip will be created in your circle</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>The itinerary will be copied as an editable template</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Your circle decides the actual dates</span>
                </li>
              </ul>
              <p className="text-xs text-gray-500 italic mt-2">
                This itinerary worked for them. Your group can change it.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProposeModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={proposeTrip} 
              disabled={proposing || !selectedCircleId}
            >
              {proposing ? 'Proposing...' : 'Propose Trip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share to Discover Dialog */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Share to Discover
            </DialogTitle>
            <DialogDescription>
              Share your travel memories publicly. Select a circle for context (circle name won't be shown publicly).
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
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
              <p className="text-xs text-gray-500">
                {shareScope === 'global' 
                  ? "Visible to everyone on Discover" 
                  : "Visible only to members of the selected circle"}
              </p>
            </div>
            
            {/* Circle Selector (Required if scope=circle) */}
            {shareScope === 'circle' && (
              <div className="space-y-2">
                <Label>Circle <span className="text-red-500">*</span></Label>
                <Select 
                  value={selectedCircle || undefined} 
                  onValueChange={(value) => setSelectedCircle(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a circle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {circles && circles.length > 0 ? circles.map((circle) => (
                      <SelectItem key={circle.id} value={circle.id}>
                        {circle.name}
                      </SelectItem>
                    )) : (
                      <SelectItem value="" disabled>No circles available</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">Circle name won't be visible publicly</p>
              </div>
            )}

            {/* Trip Selector (optional) */}
            {selectedCircle && selectedCircle !== '' && tripsForCircle.length > 0 && (
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
              <Label>Photos (1-5 images) <span className="text-red-500">*</span></Label>
              <div className="grid grid-cols-5 gap-2">
                {sharePreviewUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeShareImage(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {shareFiles.length < 5 && (
                  <button
                    onClick={() => shareFileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-500 flex items-center justify-center text-gray-400 hover:text-indigo-500"
                  >
                    {shareUploading ? (
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    ) : (
                      <ImageIcon className="h-6 w-6" />
                    )}
                  </button>
                )}
              </div>
              <input
                ref={shareFileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                onChange={handleShareFileSelect}
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

            {/* Discoverable Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p className="font-medium">This will be shared publicly</p>
              <p className="text-blue-600">Anyone can see this in Discover. Your circle name stays private.</p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleShareSubmit} 
              disabled={shareCreating || shareFiles.length === 0 || (shareScope === 'circle' && !selectedCircle)}
            >
              {shareCreating ? 'Sharing...' : 'Share to Discover'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Post Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Post
            </DialogTitle>
            <DialogDescription>
              Update your post caption and destination
            </DialogDescription>
          </DialogHeader>
          
          {selectedPost && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Caption</Label>
                <Textarea
                  value={editingPost?.caption !== undefined ? editingPost.caption : (selectedPost.caption || '')}
                  onChange={(e) => setEditingPost({ ...(editingPost || {}), caption: e.target.value })}
                  placeholder="Share your story..."
                  rows={3}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Destination</Label>
                <Input
                  value={editingPost?.destinationText !== undefined ? editingPost.destinationText : (selectedPost.destinationText || '')}
                  onChange={(e) => setEditingPost({ ...(editingPost || {}), destinationText: e.target.value })}
                  placeholder="Destination name..."
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditModal(false)
              setEditingPost(null)
              setSelectedPost(null)
            }}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!selectedPost) return
                const postToSave = editingPost || { caption: selectedPost.caption, destinationText: selectedPost.destinationText }
                try {
                  await api(`/posts/${selectedPost.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      caption: postToSave.caption?.trim() || null,
                      destinationText: postToSave.destinationText?.trim() || null
                    })
                  }, token)
                  toast.success('Post updated')
                  setShowEditModal(false)
                  setEditingPost(null)
                  setSelectedPost(null)
                  loadPosts(1, search, scope, viewCircleId)
                } catch (error) {
                  toast.error(error.message)
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main Dashboard Component
function Dashboard({ user, token, onLogout }) {
  const [circles, setCircles] = useState([])
  const [selectedCircle, setSelectedCircle] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('circles') // circles, circle, trip, discover

  // Load circles
  const loadCircles = async () => {
    try {
      const data = await api('/circles', { method: 'GET' }, token)
      setCircles(data)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCircles()
  }, [])

  // Navigation handlers
  const openCircle = async (circleId) => {
    try {
      const data = await api(`/circles/${circleId}`, { method: 'GET' }, token)
      setSelectedCircle(data)
      setView('circle')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const openTrip = async (tripId) => {
    try {
      const data = await api(`/trips/${tripId}`, { method: 'GET' }, token)
      setSelectedTrip(data)
      setView('trip')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const goBack = () => {
    if (view === 'trip') {
      setSelectedTrip(null)
      setView('circle')
    } else if (view === 'circle') {
      setSelectedCircle(null)
      setView('circles')
      loadCircles()
    } else if (view === 'discover') {
      setView('circles')
    }
  }

  const handleCreateTripFromDiscover = (destination) => {
    // Navigate to circles to create a trip
    if (circles.length > 0) {
      toast.info(`Select a circle to create a trip${destination ? ` to ${destination}` : ''}`)
      setView('circles')
    } else {
      toast.info('Create a circle first to plan trips')
      setView('circles')
    }
  }

  const handleNavigateToTrip = async (circleId, tripId) => {
    // Navigate to the newly proposed trip
    try {
      const circleData = await api(`/circles/${circleId}`, { method: 'GET' }, token)
      setSelectedCircle(circleData)
      const tripData = await api(`/trips/${tripId}`, { method: 'GET' }, token)
      setSelectedTrip(tripData)
      setView('trip')
    } catch (error) {
      toast.error(error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Compass className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              {view !== 'circles' && view !== 'discover' && (
                <Button variant="ghost" size="icon" onClick={goBack}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('circles')}>
                <Compass className="h-6 w-6 text-indigo-600" />
                <span className="font-semibold text-xl">Trypzy</span>
              </div>
              
              {/* Nav Links */}
              <div className="hidden md:flex items-center gap-1 ml-8">
                <Button 
                  variant={view === 'circles' || view === 'circle' || view === 'trip' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setView('circles')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Circles
                </Button>
                <Button 
                  variant={view === 'discover' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setView('discover')}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Discover
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">Hi, {user.name}</span>
              <Button variant="ghost" size="icon" onClick={onLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile Nav */}
        <div className="md:hidden border-t px-4 py-2 flex gap-2">
          <Button 
            variant={view === 'circles' || view === 'circle' || view === 'trip' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setView('circles')}
          >
            <Users className="h-4 w-4 mr-2" />
            Circles
          </Button>
          <Button 
            variant={view === 'discover' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setView('discover')}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Discover
          </Button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'circles' && (
          <CirclesView 
            circles={circles} 
            token={token} 
            onOpenCircle={openCircle}
            onRefresh={loadCircles}
          />
        )}
        {view === 'circle' && selectedCircle && (
          <CircleDetailView
            circle={selectedCircle}
            token={token}
            user={user}
            onOpenTrip={openTrip}
            onRefresh={() => openCircle(selectedCircle.id)}
          />
        )}
        {view === 'trip' && selectedTrip && (
          <TripDetailView
            trip={selectedTrip}
            token={token}
            user={user}
            onRefresh={() => openTrip(selectedTrip.id)}
          />
        )}
        {view === 'discover' && (
          <DiscoverPage 
            token={token}
            circles={circles}
            onCreateTrip={handleCreateTripFromDiscover}
            onNavigateToTrip={handleNavigateToTrip}
          />
        )}
      </main>
    </div>
  )
}

// Circles View
function CirclesView({ circles, token, onOpenCircle, onRefresh }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [newCircleName, setNewCircleName] = useState('')
  const [newCircleDescription, setNewCircleDescription] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [creating, setCreating] = useState(false)

  const createCircle = async () => {
    if (!newCircleName.trim()) return
    setCreating(true)
    
    try {
      await api('/circles', {
        method: 'POST',
        body: JSON.stringify({ name: newCircleName, description: newCircleDescription })
      }, token)
      
      toast.success('Circle created!')
      setShowCreate(false)
      setNewCircleName('')
      setNewCircleDescription('')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  const joinCircle = async () => {
    if (!inviteCode.trim()) return
    setCreating(true)
    
    try {
      await api('/circles/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode })
      }, token)
      
      toast.success('Joined circle!')
      setShowJoin(false)
      setInviteCode('')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Circles</h1>
          <p className="text-gray-600 mt-1">Private groups for trip planning</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showJoin} onOpenChange={setShowJoin}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <UserPlus className="h-4 w-4 mr-2" />
                Join Circle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a Circle</DialogTitle>
                <DialogDescription>Enter the invite code to join a circle</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Invite Code</Label>
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="ABCD12"
                    className="uppercase"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={joinCircle} disabled={creating || !inviteCode.trim()}>
                  {creating ? 'Joining...' : 'Join Circle'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Circle
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a Circle</DialogTitle>
                <DialogDescription>Start a new group for trip planning</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Circle Name</Label>
                  <Input
                    value={newCircleName}
                    onChange={(e) => setNewCircleName(e.target.value)}
                    placeholder="College Friends"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={newCircleDescription}
                    onChange={(e) => setNewCircleDescription(e.target.value)}
                    placeholder="Our adventure crew"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createCircle} disabled={creating || !newCircleName.trim()}>
                  {creating ? 'Creating...' : 'Create Circle'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {circles.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No circles yet</h3>
            <p className="text-gray-500 mb-4">Create a circle to start planning trips with friends</p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first circle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {circles.map((circle) => (
            <Card 
              key={circle.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => onOpenCircle(circle.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Users className="h-6 w-6 text-indigo-600" />
                  </div>
                  {circle.isOwner && (
                    <Badge variant="secondary">Owner</Badge>
                  )}
                </div>
                <CardTitle className="mt-4">{circle.name}</CardTitle>
                {circle.description && (
                  <CardDescription>{circle.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {circle.memberCount} members
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {circle.tripCount} trips
                  </span>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" className="w-full">
                  View Circle <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// Circle Detail View
function CircleDetailView({ circle, token, user, onOpenTrip, onRefresh }) {
  const [activeTab, setActiveTab] = useState('trips')
  const [showCreateTrip, setShowCreateTrip] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [tripForm, setTripForm] = useState({
    name: '',
    description: '',
    type: 'collaborative',
    startDate: '',
    endDate: '',
    duration: 3
  })
  const [creating, setCreating] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Load messages
  const loadMessages = async () => {
    try {
      const data = await api(`/circles/${circle.id}/messages`, { method: 'GET' }, token)
      setMessages(data)
    } catch (error) {
      console.error(error)
    }
  }

  // Load posts
  const loadPosts = async () => {
    setLoadingPosts(true)
    try {
      const data = await api(`/circles/${circle.id}/posts`, { method: 'GET' }, token)
      setPosts(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingPosts(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'chat') {
      loadMessages()
      const interval = setInterval(loadMessages, 5000)
      return () => clearInterval(interval)
    }
    if (activeTab === 'memories') {
      loadPosts()
    }
  }, [activeTab])

  const createTrip = async () => {
    if (!tripForm.name || !tripForm.startDate || !tripForm.endDate) {
      toast.error('Please fill in all required fields')
      return
    }
    setCreating(true)
    
    try {
      await api('/trips', {
        method: 'POST',
        body: JSON.stringify({ ...tripForm, circleId: circle.id })
      }, token)
      
      toast.success('Trip created!')
      setShowCreateTrip(false)
      setTripForm({ name: '', description: '', type: 'collaborative', startDate: '', endDate: '', duration: 3 })
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return
    setSendingMessage(true)
    
    try {
      const msg = await api(`/circles/${circle.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage })
      }, token)
      
      setMessages([...messages, msg])
      setNewMessage('')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSendingMessage(false)
    }
  }

  const deletePost = async (postId) => {
    if (!confirm('Delete this memory?')) return
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' }, token)
      toast.success('Memory deleted')
      loadPosts()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const [showEditTripModal, setShowEditTripModal] = useState(false)
  const [editingTrip, setEditingTrip] = useState(null)

  const handleEditTrip = (trip) => {
    setEditingTrip({
      id: trip.id,
      name: trip.name,
      description: trip.description || '',
      startDate: trip.startDate,
      endDate: trip.endDate,
      duration: trip.duration
    })
    setShowEditTripModal(true)
  }

  const handleSaveTrip = async () => {
    if (!editingTrip || !editingTrip.name || !editingTrip.startDate || !editingTrip.endDate) {
      toast.error('Please fill in all required fields')
      return
    }
    
    try {
      await api(`/trips/${editingTrip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingTrip.name,
          description: editingTrip.description,
          startDate: editingTrip.startDate,
          endDate: editingTrip.endDate,
          duration: editingTrip.duration
        })
      }, token)
      toast.success('Trip updated')
      setShowEditTripModal(false)
      setEditingTrip(null)
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'scheduling':
        return <Badge className="bg-yellow-100 text-yellow-800">Scheduling</Badge>
      case 'voting':
        return <Badge className="bg-blue-100 text-blue-800">Voting</Badge>
      case 'locked':
        return <Badge className="bg-green-100 text-green-800">Locked</Badge>
      default:
        return null
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center">
            <Users className="h-8 w-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{circle.name}</h1>
            {circle.description && (
              <p className="text-gray-600">{circle.description}</p>
            )}
          </div>
        </div>
        
        {/* Invite Code */}
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-indigo-600 font-medium">Invite Code</p>
                <p className="text-2xl font-mono font-bold text-indigo-800">{circle.inviteCode}</p>
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  navigator.clipboard.writeText(circle.inviteCode)
                  toast.success('Invite code copied!')
                }}
              >
                Copy Code
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="trips">
            <MapPin className="h-4 w-4 mr-2" />
            Trips
          </TabsTrigger>
          <TabsTrigger value="memories">
            <Camera className="h-4 w-4 mr-2" />
            Memories
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat
          </TabsTrigger>
        </TabsList>

        {/* Trips Tab */}
        <TabsContent value="trips">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Circle Trips</h2>
            <Dialog open={showCreateTrip} onOpenChange={setShowCreateTrip}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Trip
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create a Trip</DialogTitle>
                  <DialogDescription>Plan a new adventure with your circle</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Trip Name</Label>
                    <Input
                      value={tripForm.name}
                      onChange={(e) => setTripForm({ ...tripForm, name: e.target.value })}
                      placeholder="Summer Beach Trip"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Textarea
                      value={tripForm.description}
                      onChange={(e) => setTripForm({ ...tripForm, description: e.target.value })}
                      placeholder="A relaxing weekend getaway..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Trip Type</Label>
                    <Select 
                      value={tripForm.type} 
                      onValueChange={(v) => setTripForm({ ...tripForm, type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="collaborative">Collaborative (everyone votes on dates)</SelectItem>
                        <SelectItem value="hosted">Hosted (fixed dates, join if available)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={tripForm.startDate}
                        onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={tripForm.endDate}
                        onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                      />
                    </div>
                  </div>
                  {tripForm.type === 'collaborative' && (
                    <div className="space-y-2">
                      <Label>Trip Duration (days)</Label>
                      <Select 
                        value={tripForm.duration.toString()} 
                        onValueChange={(v) => setTripForm({ ...tripForm, duration: parseInt(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5, 6, 7].map((d) => (
                            <SelectItem key={d} value={d.toString()}>{d} days</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button onClick={createTrip} disabled={creating}>
                    {creating ? 'Creating...' : 'Create Trip'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {circle.trips.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No trips yet</h3>
                <p className="text-gray-500 mb-4">Create a trip to start planning with your circle</p>
                <Button onClick={() => setShowCreateTrip(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create first trip
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {circle.trips.map((trip) => (
                <Card 
                  key={trip.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onOpenTrip(trip.id)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{trip.name}</h3>
                          {getStatusBadge(trip.status)}
                          <Badge variant="outline">
                            {trip.type === 'collaborative' ? 'Collaborative' : 'Hosted'}
                          </Badge>
                        </div>
                        {trip.description && (
                          <p className="text-gray-600 text-sm mb-2">{trip.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <CalendarIcon className="h-4 w-4" />
                          {trip.status === 'locked' ? (
                            <span>{trip.lockedStartDate} to {trip.lockedEndDate}</span>
                          ) : (
                            <span>Range: {trip.startDate} to {trip.endDate}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {trip.isCreator && trip.status !== 'locked' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditTrip?.(trip)
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
                                  try {
                                    await api(`/trips/${trip.id}`, { method: 'DELETE' }, token)
                                    toast.success('Trip deleted')
                                    onRefresh?.()
                                  } catch (error) {
                                    toast.error(error.message)
                                  }
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost">
                          <ArrowRight className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Memories Tab */}
        <TabsContent value="memories">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Circle Memories</h2>
            <Button onClick={() => setShowCreatePost(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Memory
            </Button>
          </div>
          
          <MemoriesView 
            posts={posts}
            loading={loadingPosts}
            onCreatePost={() => setShowCreatePost(true)}
            onDeletePost={deletePost}
          />
          
          <CreatePostDialog
            open={showCreatePost}
            onOpenChange={setShowCreatePost}
            circleId={circle.id}
            trips={circle.trips}
            token={token}
            onCreated={loadPosts}
          />
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <h2 className="text-xl font-semibold mb-6">Circle Members ({circle.members.length})</h2>
          <div className="space-y-2">
            {circle.members.map((member) => (
              <Card key={member.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-600 font-medium">
                          {member.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    {member.role === 'owner' && (
                      <Badge>Owner</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat">
          <Card className="h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Circle Chat</CardTitle>
              <CardDescription>Coordinate with your circle members</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.isSystem ? 'justify-center' : msg.user?.id === user.id ? 'justify-end' : 'justify-start'}`}>
                        {msg.isSystem ? (
                          <div className="bg-gray-100 rounded-full px-4 py-1 text-sm text-gray-600">
                            {msg.content}
                          </div>
                        ) : (
                          <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.user?.id === user.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                            {msg.user?.id !== user.id && (
                              <p className="text-xs font-medium mb-1 opacity-70">{msg.user?.name}</p>
                            )}
                            <p>{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Trip Modal */}
      <Dialog open={showEditTripModal} onOpenChange={setShowEditTripModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Trip</DialogTitle>
            <DialogDescription>Update trip details</DialogDescription>
          </DialogHeader>
          
          {editingTrip && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Trip Name</Label>
                <Input
                  value={editingTrip.name}
                  onChange={(e) => setEditingTrip({ ...editingTrip, name: e.target.value })}
                  placeholder="Summer Beach Trip"
                />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={editingTrip.description}
                  onChange={(e) => setEditingTrip({ ...editingTrip, description: e.target.value })}
                  placeholder="A relaxing weekend getaway..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={editingTrip.startDate}
                    onChange={(e) => setEditingTrip({ ...editingTrip, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={editingTrip.endDate}
                    onChange={(e) => setEditingTrip({ ...editingTrip, endDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duration (days)</Label>
                <Input
                  type="number"
                  min="1"
                  value={editingTrip.duration}
                  onChange={(e) => setEditingTrip({ ...editingTrip, duration: parseInt(e.target.value) || 3 })}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditTripModal(false)
              setEditingTrip(null)
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveTrip}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Trip Detail View
function TripDetailView({ trip, token, user, onRefresh }) {
  const [activeTab, setActiveTab] = useState('planning')
  const [availability, setAvailability] = useState({})
  const [activityIdeas, setActivityIdeas] = useState(['', '', '']) // Idea jar for availability submission
  const [saving, setSaving] = useState(false)
  const [selectedVote, setSelectedVote] = useState(trip.userVote?.optionKey || '')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  
  // Itinerary state
  const [ideas, setIdeas] = useState([])
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [newIdea, setNewIdea] = useState({ title: '', category: '', notes: '' })
  const [addingIdea, setAddingIdea] = useState(false)
  const [itineraries, setItineraries] = useState([])
  const [loadingItineraries, setLoadingItineraries] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedItinerary, setSelectedItinerary] = useState(null)
  const [editingItems, setEditingItems] = useState([])
  const [savingItems, setSavingItems] = useState(false)

  // Initialize availability from existing data
  useEffect(() => {
    const existingAvail = {}
    trip.userAvailability?.forEach((a) => {
      existingAvail[a.day] = a.status
    })
    setAvailability(existingAvail)
  }, [trip.userAvailability])

  // Load messages
  const loadMessages = async () => {
    try {
      const data = await api(`/trips/${trip.id}/messages`, { method: 'GET' }, token)
      setMessages(data)
    } catch (error) {
      console.error(error)
    }
  }

  // Load posts
  const loadPosts = async () => {
    setLoadingPosts(true)
    try {
      const data = await api(`/trips/${trip.id}/posts`, { method: 'GET' }, token)
      setPosts(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingPosts(false)
    }
  }

  // Load ideas
  const loadIdeas = async () => {
    setLoadingIdeas(true)
    try {
      const data = await api(`/trips/${trip.id}/ideas`, { method: 'GET' }, token)
      setIdeas(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingIdeas(false)
    }
  }

  // Load itineraries
  const loadItineraries = async () => {
    setLoadingItineraries(true)
    try {
      const data = await api(`/trips/${trip.id}/itineraries`, { method: 'GET' }, token)
      setItineraries(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingItineraries(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'chat') {
      loadMessages()
      const interval = setInterval(loadMessages, 5000)
      return () => clearInterval(interval)
    }
    if (activeTab === 'memories') {
      loadPosts()
    }
    if (activeTab === 'itinerary') {
      loadIdeas()
      loadItineraries()
    }
  }, [activeTab])

  // Generate date range
  const getDatesInRange = () => {
    const dates = []
    const start = new Date(trip.startDate)
    const end = new Date(trip.endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d).toISOString().split('T')[0])
    }
    return dates
  }

  const dates = getDatesInRange()

  const setDayAvailability = (day, status) => {
    setAvailability({ ...availability, [day]: status })
  }

  const hasAnyAvailability = () => {
    return Object.values(availability).some(status => status !== undefined && status !== null)
  }

  const saveAvailability = async () => {
    if (!hasAnyAvailability()) {
      toast.error('Please mark at least one day as available, maybe, or unavailable')
      return
    }
    setSaving(true)
    try {
      const availabilities = Object.entries(availability).map(([day, status]) => ({ day, status }))
      await api(`/trips/${trip.id}/availability`, {
        method: 'POST',
        body: JSON.stringify({ availabilities })
      }, token)
      
      // Also submit activity ideas if any
      const validIdeas = activityIdeas.filter(idea => idea.trim())
      for (const ideaTitle of validIdeas) {
        try {
          await api(`/trips/${trip.id}/ideas`, {
            method: 'POST',
            body: JSON.stringify({ title: ideaTitle })
          }, token)
        } catch (e) {
          // Ignore duplicate errors
        }
      }
      
      toast.success('Availability saved!')
      setActivityIdeas(['', '', ''])
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const openVoting = async () => {
    try {
      await api(`/trips/${trip.id}/open-voting`, { method: 'POST' }, token)
      toast.success('Voting opened!')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const submitVote = async () => {
    if (!selectedVote) return
    try {
      await api(`/trips/${trip.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionKey: selectedVote })
      }, token)
      
      toast.success('Vote recorded!')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const [showLockConfirm, setShowLockConfirm] = useState(false)
  const [pendingLockOption, setPendingLockOption] = useState(null)

  const lockTrip = async (optionKey) => {
    setPendingLockOption(optionKey)
    setShowLockConfirm(true)
  }

  const confirmLockTrip = async () => {
    if (!pendingLockOption) return
    try {
      await api(`/trips/${trip.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ optionKey: pendingLockOption })
      }, token)
      
      toast.success('Trip dates locked! 🎉 Planning can now begin.')
      setShowLockConfirm(false)
      setPendingLockOption(null)
      onRefresh()
    } catch (error) {
      toast.error(error.message)
      setShowLockConfirm(false)
      setPendingLockOption(null)
    }
  }

  const joinTrip = async () => {
    try {
      await api(`/trips/${trip.id}/join`, { method: 'POST' }, token)
      toast.success('Joined trip!')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const leaveTrip = async () => {
    try {
      await api(`/trips/${trip.id}/leave`, { method: 'POST' }, token)
      toast.success('Left trip')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) return
    setSendingMessage(true)
    
    try {
      const msg = await api(`/trips/${trip.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage })
      }, token)
      
      setMessages([...messages, msg])
      setNewMessage('')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSendingMessage(false)
    }
  }

  const deletePost = async (postId) => {
    if (!confirm('Delete this memory?')) return
    try {
      await api(`/posts/${postId}`, { method: 'DELETE' }, token)
      toast.success('Memory deleted')
      loadPosts()
    } catch (error) {
      toast.error(error.message)
    }
  }

  // Itinerary functions
  const addIdea = async () => {
    if (!newIdea.title.trim()) return
    setAddingIdea(true)
    try {
      await api(`/trips/${trip.id}/ideas`, {
        method: 'POST',
        body: JSON.stringify(newIdea)
      }, token)
      toast.success('Idea added!')
      setNewIdea({ title: '', category: '', notes: '' })
      loadIdeas()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAddingIdea(false)
    }
  }

  const deleteIdea = async (ideaId) => {
    try {
      await api(`/trips/${trip.id}/ideas/${ideaId}`, { method: 'DELETE' }, token)
      toast.success('Idea removed')
      loadIdeas()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const generateItineraries = async () => {
    setGenerating(true)
    try {
      await api(`/trips/${trip.id}/itineraries/generate`, { method: 'POST' }, token)
      toast.success('Itineraries generated!')
      loadItineraries()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setGenerating(false)
    }
  }

  const selectItinerary = async (itineraryId) => {
    try {
      await api(`/trips/${trip.id}/itineraries/${itineraryId}/select`, { method: 'PATCH' }, token)
      toast.success('Itinerary selected as final!')
      loadItineraries()
      setSelectedItinerary(null)
    } catch (error) {
      toast.error(error.message)
    }
  }

  const openItineraryEditor = (itinerary) => {
    setSelectedItinerary(itinerary)
    setEditingItems([...itinerary.items])
  }

  const updateItem = (itemId, field, value) => {
    setEditingItems(editingItems.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ))
  }

  const addItem = (day, timeBlock) => {
    const maxOrder = Math.max(0, ...editingItems.filter(i => i.day === day).map(i => i.order))
    setEditingItems([...editingItems, {
      id: `new-${Date.now()}`,
      day,
      timeBlock,
      title: '',
      notes: '',
      locationText: '',
      order: maxOrder + 1
    }])
  }

  const removeItem = (itemId) => {
    setEditingItems(editingItems.filter(item => item.id !== itemId))
  }

  const moveItem = (itemId, direction) => {
    const item = editingItems.find(i => i.id === itemId)
    if (!item) return
    
    const dayItems = editingItems.filter(i => i.day === item.day).sort((a, b) => a.order - b.order)
    const idx = dayItems.findIndex(i => i.id === itemId)
    
    if (direction === 'up' && idx > 0) {
      const prevItem = dayItems[idx - 1]
      setEditingItems(editingItems.map(i => {
        if (i.id === itemId) return { ...i, order: prevItem.order }
        if (i.id === prevItem.id) return { ...i, order: item.order }
        return i
      }))
    } else if (direction === 'down' && idx < dayItems.length - 1) {
      const nextItem = dayItems[idx + 1]
      setEditingItems(editingItems.map(i => {
        if (i.id === itemId) return { ...i, order: nextItem.order }
        if (i.id === nextItem.id) return { ...i, order: item.order }
        return i
      }))
    }
  }

  const saveItineraryItems = async () => {
    if (!selectedItinerary) return
    setSavingItems(true)
    try {
      await api(`/trips/${trip.id}/itineraries/${selectedItinerary.id}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ items: editingItems })
      }, token)
      toast.success('Itinerary saved!')
      loadItineraries()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSavingItems(false)
    }
  }

  const toggleItineraryDiscoverable = async (itineraryId, discoverable) => {
    try {
      await api(`/trips/${trip.id}/itineraries/${itineraryId}/discoverable`, {
        method: 'PATCH',
        body: JSON.stringify({ discoverable })
      }, token)
      toast.success(discoverable ? 'Itinerary is now discoverable!' : 'Itinerary is now private')
      loadItineraries()
    } catch (error) {
      toast.error(error.message)
    }
  }

  const getStatusBadge = () => {
    switch (trip.status) {
      case 'proposed':
        return <Badge className="bg-gray-100 text-gray-800">Proposed</Badge>
      case 'scheduling':
        return <Badge className="bg-yellow-100 text-yellow-800">Scheduling</Badge>
      case 'voting':
        return <Badge className="bg-blue-100 text-blue-800">Voting</Badge>
      case 'locked':
        return <Badge className="bg-green-100 text-green-800">Locked</Badge>
      default:
        // Backward compatibility: treat missing status as scheduling for collaborative trips
        return trip.type === 'collaborative' 
          ? <Badge className="bg-yellow-100 text-yellow-800">Scheduling</Badge>
          : null
    }
  }

  // Calculate vote counts
  const getVoteCounts = () => {
    const counts = {}
    trip.votes?.forEach((v) => {
      counts[v.optionKey] = (counts[v.optionKey] || 0) + 1
    })
    return counts
  }

  const voteCounts = getVoteCounts()

  // Get unique ideas with counts
  const getUniqueIdeas = () => {
    const ideaMap = new Map()
    ideas.forEach(idea => {
      const key = idea.title.toLowerCase()
      if (!ideaMap.has(key)) {
        ideaMap.set(key, { ...idea, count: 1 })
      } else {
        ideaMap.get(key).count++
      }
    })
    return Array.from(ideaMap.values()).sort((a, b) => b.count - a.count)
  }

  const uniqueIdeas = getUniqueIdeas()

  // Get time block icon
  const getTimeBlockIcon = (timeBlock) => {
    switch (timeBlock) {
      case 'morning': return <Sun className="h-4 w-4 text-yellow-500" />
      case 'afternoon': return <Sunset className="h-4 w-4 text-orange-500" />
      case 'evening': return <Moon className="h-4 w-4 text-indigo-500" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  // Get days for locked trip
  const getLockedDays = () => {
    if (!trip.lockedStartDate || !trip.lockedEndDate) return []
    const days = []
    const start = new Date(trip.lockedStartDate)
    const end = new Date(trip.lockedEndDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d).toISOString().split('T')[0])
    }
    return days
  }

  const lockedDays = getLockedDays()

  // Category options
  const categories = [
    { value: 'food', label: 'Food & Dining' },
    { value: 'outdoors', label: 'Outdoors & Nature' },
    { value: 'culture', label: 'Culture & Sightseeing' },
    { value: 'nightlife', label: 'Nightlife & Entertainment' },
    { value: 'relax', label: 'Relaxation' },
    { value: 'shopping', label: 'Shopping' },
    { value: 'adventure', label: 'Adventure' }
  ]

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <span>{trip.circle?.name}</span>
        </div>
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <h1 className="text-3xl font-bold text-gray-900">{trip.name}</h1>
          {getStatusBadge()}
          <Badge variant="outline">
            {trip.type === 'collaborative' ? 'Collaborative' : 'Hosted'}
          </Badge>
        </div>
        {trip.description && (
          <p className="text-gray-600 mb-4">{trip.description}</p>
        )}
        
        {/* Trip Info Card */}
        <Card className={trip.status === 'locked' ? 'bg-green-50 border-green-200' : ''}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <CalendarIcon className="h-5 w-5 text-gray-500" />
              {trip.status === 'locked' ? (
                <span className="font-medium text-green-800">
                  Locked: {trip.lockedStartDate} to {trip.lockedEndDate}
                </span>
              ) : (
                <span>Date Range: {trip.startDate} to {trip.endDate}</span>
              )}
              {trip.type === 'collaborative' && trip.status !== 'locked' && (
                <span className="text-gray-500">• {trip.duration} day trip</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scheduling Progress Panel - Collaborative Trips Only */}
      {trip.type === 'collaborative' && trip.status !== 'locked' && (
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardContent className="py-4">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-gray-900">Scheduling Progress</h3>
                  {getStatusBadge()}
                </div>
                <div className="space-y-2 text-sm">
                  {trip.status === 'proposed' && (
                    <p className="text-gray-600">
                      This trip is proposed. Start by marking your availability to help the group find the best dates.
                    </p>
                  )}
                  {trip.status === 'scheduling' && (
                    <>
                      <p className="text-gray-700 font-medium">
                        {trip.respondedCount || 0} of {trip.totalMembers || 0} members responded
                      </p>
                      <p className="text-gray-600">
                        {trip.totalMembers - (trip.respondedCount || 0) > 0 
                          ? `${trip.totalMembers - (trip.respondedCount || 0)} haven't responded yet. We'll proceed with those who did.`
                          : 'Everyone has responded! Ready to move to voting.'}
                      </p>
                    </>
                  )}
                  {trip.status === 'voting' && (
                    <>
                      <p className="text-gray-700 font-medium">
                        {trip.votedCount || 0} of {trip.totalMembers || 0} members voted
                      </p>
                      <p className="text-gray-600">
                        Vote for your preferred dates. The trip creator will lock dates based on preferences.
                      </p>
                    </>
                  )}
                </div>
              </div>
              {trip.status === 'scheduling' && trip.isCreator && (
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-2">
                    Ready to move forward?
                  </p>
                  <Button variant="outline" size="sm" onClick={openVoting}>
                    <Vote className="h-4 w-4 mr-2" />
                    Open Voting
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hosted Trip Actions */}
      {trip.type === 'hosted' && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-semibold">Participants ({trip.participants?.length || 0})</h3>
                <p className="text-sm text-gray-500">
                  {trip.participants?.map((p) => p.name).join(', ') || 'No participants yet'}
                </p>
              </div>
              {trip.isParticipant ? (
                <Button variant="outline" onClick={leaveTrip}>
                  Leave Trip
                </Button>
              ) : (
                <Button onClick={joinTrip}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join Trip
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="planning">
            <CalendarIcon className="h-4 w-4 mr-2" />
            Planning
          </TabsTrigger>
          <TabsTrigger value="itinerary" disabled={trip.status !== 'locked'}>
            <ListTodo className="h-4 w-4 mr-2" />
            Itinerary
            {trip.status !== 'locked' && (
              <Lock className="h-3 w-3 ml-1 text-gray-400" />
            )}
          </TabsTrigger>
          <TabsTrigger value="memories">
            <Camera className="h-4 w-4 mr-2" />
            Memories
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planning">
          {/* Collaborative Trip Planning */}
          {trip.type === 'collaborative' && (
            <>
              {/* Proposed Phase */}
              {trip.status === 'proposed' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Mark Your Availability
                      </CardTitle>
                      <CardDescription>
                        Help the group find the best dates. Approximate availability is okay — locking is the only commitment.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Note:</strong> Mark days you're genuinely open. If you don't respond, we'll assume you're unavailable.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {dates.map((date) => (
                          <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0 flex-wrap">
                            <span className="w-32 font-medium text-gray-900">
                              {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant={availability[date] === 'available' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'available')}
                                className={availability[date] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Available
                              </Button>
                              <Button
                                size="sm"
                                variant={availability[date] === 'maybe' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'maybe')}
                                className={availability[date] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                              >
                                <HelpCircle className="h-4 w-4 mr-1" />
                                Maybe
                              </Button>
                              <Button
                                size="sm"
                                variant={availability[date] === 'unavailable' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'unavailable')}
                                className={availability[date] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Unavailable
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-6 flex gap-4 flex-wrap">
                        <Button onClick={saveAvailability} disabled={saving || !hasAnyAvailability()}>
                          {saving ? 'Saving...' : 'Save Availability'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Scheduling Phase */}
              {trip.status === 'scheduling' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5" />
                        Submit Your Availability
                      </CardTitle>
                      <CardDescription>
                        Mark days you're genuinely open. If you don't respond, we'll assume you're unavailable.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-800">
                          <strong>Remember:</strong> Approximate availability is okay now — locking dates is the only commitment moment.
                        </p>
                      </div>
                      <div className="space-y-2">
                        {dates.map((date) => (
                          <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0 flex-wrap">
                            <span className="w-32 font-medium text-gray-900">
                              {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant={availability[date] === 'available' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'available')}
                                className={availability[date] === 'available' ? 'bg-green-600 hover:bg-green-700' : ''}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Available
                              </Button>
                              <Button
                                size="sm"
                                variant={availability[date] === 'maybe' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'maybe')}
                                className={availability[date] === 'maybe' ? 'bg-yellow-500 hover:bg-yellow-600' : ''}
                              >
                                <HelpCircle className="h-4 w-4 mr-1" />
                                Maybe
                              </Button>
                              <Button
                                size="sm"
                                variant={availability[date] === 'unavailable' ? 'default' : 'outline'}
                                onClick={() => setDayAvailability(date, 'unavailable')}
                                className={availability[date] === 'unavailable' ? 'bg-red-600 hover:bg-red-700' : ''}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Unavailable
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Optional Activity Ideas (Idea Jar) */}
                      <div className="mt-6 pt-6 border-t">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="h-5 w-5 text-yellow-500" />
                          <span className="font-medium text-sm">Any activity ideas? (optional)</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">Suggest up to 3 activities you'd like to do on this trip</p>
                        <div className="grid gap-2">
                          {activityIdeas.map((idea, idx) => (
                            <Input
                              key={idx}
                              value={idea}
                              onChange={(e) => {
                                const newIdeas = [...activityIdeas]
                                newIdeas[idx] = e.target.value
                                setActivityIdeas(newIdeas)
                              }}
                              placeholder={`Activity idea ${idx + 1}...`}
                              className="text-sm"
                            />
                          ))}
                        </div>
                      </div>
                      
                      <div className="mt-6 flex gap-4 flex-wrap">
                        <Button onClick={saveAvailability} disabled={saving || trip.status === 'voting' || trip.status === 'locked'}>
                          {trip.status === 'voting' || trip.status === 'locked' 
                            ? 'Availability Frozen' 
                            : saving ? 'Saving...' : 'Save Availability'}
                        </Button>
                        {trip.isCreator && trip.status === 'scheduling' && (
                          <Button variant="outline" onClick={openVoting}>
                            <Vote className="h-4 w-4 mr-2" />
                            Open Voting
                          </Button>
                        )}
                      </div>
                      {(trip.status === 'voting' || trip.status === 'locked') && (
                        <p className="text-xs text-gray-500 mt-2">
                          Availability cannot be changed after voting has started.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Consensus Preview */}
                  {trip.consensusOptions?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Top Date Options (Preview)</CardTitle>
                        <CardDescription>
                          Based on {trip.availabilities?.length || 0} availability submissions
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {trip.consensusOptions.map((option, idx) => (
                            <div key={option.optionKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                                <div>
                                  <p className="font-medium">{option.startDate} to {option.endDate}</p>
                                  <p className="text-sm text-gray-500">Score: {(option.score * 100).toFixed(0)}%</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Voting Phase */}
              {trip.status === 'voting' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Vote className="h-5 w-5" />
                        Vote for Your Preferred Dates
                      </CardTitle>
                      <CardDescription>
                        Voting is preference — we'll move forward even if everyone doesn't vote.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RadioGroup value={selectedVote} onValueChange={setSelectedVote}>
                        <div className="space-y-3">
                          {trip.consensusOptions?.map((option, idx) => (
                            <div key={option.optionKey} className="flex items-center space-x-3">
                              <RadioGroupItem value={option.optionKey} id={option.optionKey} />
                              <Label htmlFor={option.optionKey} className="flex-1 cursor-pointer">
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                                    <div>
                                      <p className="font-medium">{option.startDate} to {option.endDate}</p>
                                      <p className="text-sm text-gray-500">Compatibility: {(option.score * 100).toFixed(0)}%</p>
                                    </div>
                                  </div>
                                  <Badge variant="secondary">
                                    {voteCounts[option.optionKey] || 0} votes
                                  </Badge>
                                </div>
                              </Label>
                            </div>
                          ))}
                        </div>
                      </RadioGroup>
                      <div className="mt-6 flex gap-4 flex-wrap">
                        <Button onClick={submitVote} disabled={!selectedVote}>
                          {trip.userVote ? 'Update Vote' : 'Submit Vote'}
                        </Button>
                        {trip.canLock && selectedVote && (
                          <Button variant="default" onClick={() => lockTrip(selectedVote)}>
                            <Lock className="h-4 w-4 mr-2" />
                            Lock Dates
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Locked Phase */}
              {trip.status === 'locked' && (
                <Card className="bg-green-50 border-green-200">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-800">
                      <Lock className="h-5 w-5" />
                      Trip Dates Locked!
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <div className="text-4xl font-bold text-green-800 mb-4">
                        {trip.lockedStartDate} to {trip.lockedEndDate}
                      </div>
                      <p className="text-green-700">
                        Your trip dates are confirmed. Time to start planning the details!
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Hosted Trip - Just show locked dates */}
          {trip.type === 'hosted' && (
            <Card className="bg-green-50 border-green-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-800">
                  <Lock className="h-5 w-5" />
                  Fixed Trip Dates
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <div className="text-4xl font-bold text-green-800 mb-4">
                    {trip.lockedStartDate} to {trip.lockedEndDate}
                  </div>
                  <p className="text-green-700">
                    This is a hosted trip with fixed dates. Join if you're available!
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Memories Tab */}
        <TabsContent value="memories">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Trip Memories</h2>
            <Button onClick={() => setShowCreatePost(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Memory
            </Button>
          </div>
          
          <MemoriesView 
            posts={posts}
            loading={loadingPosts}
            onCreatePost={() => setShowCreatePost(true)}
            onDeletePost={deletePost}
            emptyMessage="No memories from this trip yet"
          />
          
          <CreatePostDialog
            open={showCreatePost}
            onOpenChange={setShowCreatePost}
            circleId={trip.circleId}
            trips={[trip]}
            token={token}
            onCreated={loadPosts}
          />
        </TabsContent>

        {/* Itinerary Tab */}
        <TabsContent value="itinerary">
          {selectedItinerary ? (
            // Itinerary Editor View
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={() => setSelectedItinerary(null)}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <div>
                    <h2 className="text-xl font-semibold">{selectedItinerary.title} Itinerary</h2>
                    <p className="text-sm text-gray-500">
                      {selectedItinerary.status === 'selected' ? 'Final itinerary (read-only)' : 'Edit activities for each day'}
                    </p>
                  </div>
                </div>
                {selectedItinerary.status !== 'selected' && (
                  <div className="flex gap-2">
                    <Button onClick={saveItineraryItems} disabled={savingItems}>
                      {savingItems ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>

              <Accordion type="multiple" defaultValue={lockedDays} className="w-full">
                {lockedDays.map((day) => {
                  const dayItems = editingItems
                    .filter(item => item.day === day)
                    .sort((a, b) => a.order - b.order)
                  
                  return (
                    <AccordionItem key={day} value={day}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          <span className="font-medium">
                            {new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                          </span>
                          <Badge variant="secondary" className="ml-2">
                            {dayItems.length} {dayItems.length === 1 ? 'activity' : 'activities'}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {['morning', 'afternoon', 'evening'].map((timeBlock) => {
                            const blockItems = dayItems.filter(i => i.timeBlock === timeBlock)
                            return (
                              <div key={timeBlock} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    {getTimeBlockIcon(timeBlock)}
                                    <span className="font-medium capitalize">{timeBlock}</span>
                                  </div>
                                  {selectedItinerary.status !== 'selected' && (
                                    <Button size="sm" variant="outline" onClick={() => addItem(day, timeBlock)}>
                                      <Plus className="h-3 w-3 mr-1" />
                                      Add
                                    </Button>
                                  )}
                                </div>
                                
                                {blockItems.length === 0 ? (
                                  <p className="text-sm text-gray-400 italic">No activities planned</p>
                                ) : (
                                  <div className="space-y-3">
                                    {blockItems.map((item, idx) => (
                                      <div key={item.id} className="bg-gray-50 rounded-lg p-3">
                                        {selectedItinerary.status === 'selected' ? (
                                          // Read-only view
                                          <div>
                                            <p className="font-medium">{item.title}</p>
                                            {item.notes && <p className="text-sm text-gray-600 mt-1">{item.notes}</p>}
                                            {item.locationText && (
                                              <p className="text-sm text-indigo-600 mt-1 flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {item.locationText}
                                              </p>
                                            )}
                                          </div>
                                        ) : (
                                          // Editable view
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                              <Input
                                                value={item.title}
                                                onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                                                placeholder="Activity name"
                                                className="flex-1"
                                              />
                                              <div className="flex gap-1">
                                                <Button 
                                                  size="icon" 
                                                  variant="ghost" 
                                                  className="h-8 w-8"
                                                  onClick={() => moveItem(item.id, 'up')}
                                                  disabled={idx === 0}
                                                >
                                                  <ChevronUp className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                  size="icon" 
                                                  variant="ghost"
                                                  className="h-8 w-8"
                                                  onClick={() => moveItem(item.id, 'down')}
                                                  disabled={idx === blockItems.length - 1}
                                                >
                                                  <ChevronDown className="h-4 w-4" />
                                                </Button>
                                                <Button 
                                                  size="icon" 
                                                  variant="ghost"
                                                  className="h-8 w-8 text-red-500 hover:text-red-600"
                                                  onClick={() => removeItem(item.id)}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              <Input
                                                value={item.notes || ''}
                                                onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                                                placeholder="Notes (optional)"
                                                className="text-sm"
                                              />
                                              <Input
                                                value={item.locationText || ''}
                                                onChange={(e) => updateItem(item.id, 'locationText', e.target.value)}
                                                placeholder="Location (optional)"
                                                className="text-sm"
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            </div>
          ) : (
            // Itinerary List View
            <div className="space-y-6">
              {/* Activity Ideas Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    Activity Ideas
                  </CardTitle>
                  <CardDescription>
                    Suggest activities for the trip. Popular ideas will be included in generated itineraries.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Add Idea Form */}
                  <div className="flex gap-2 mb-4">
                    <Input
                      value={newIdea.title}
                      onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                      placeholder="e.g. Visit the local market, Go snorkeling..."
                      className="flex-1"
                    />
                    <Select value={newIdea.category} onValueChange={(v) => setNewIdea({ ...newIdea, category: v })}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(cat => (
                          <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={addIdea} disabled={addingIdea || !newIdea.title.trim()}>
                      {addingIdea ? 'Adding...' : 'Add Idea'}
                    </Button>
                  </div>
                  
                  {/* Ideas List */}
                  {loadingIdeas ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
                    </div>
                  ) : uniqueIdeas.length === 0 ? (
                    <p className="text-center text-gray-500 py-6">
                      No ideas yet. Add some activities you'd like to do!
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {uniqueIdeas.map((idea) => (
                        <div 
                          key={idea.id} 
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <span className="text-lg font-semibold text-indigo-600">{idea.count}</span>
                              <span className="text-xs text-gray-500">vote{idea.count !== 1 ? 's' : ''}</span>
                            </div>
                            <div>
                              <p className="font-medium">{idea.title}</p>
                              {idea.category && (
                                <Badge variant="secondary" className="text-xs mt-1">
                                  {categories.find(c => c.value === idea.category)?.label || idea.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {idea.isAuthor && (
                            <Button 
                              size="icon" 
                              variant="ghost"
                              className="h-8 w-8 text-gray-400 hover:text-red-500"
                              onClick={() => deleteIdea(idea.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Generate Itineraries Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    Itinerary Drafts
                  </CardTitle>
                  <CardDescription>
                    Generate 3 itinerary styles based on group activity ideas
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={generateItineraries} 
                    disabled={generating}
                    className="mb-6"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : itineraries.length > 0 ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Regenerate Itineraries
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Itineraries
                      </>
                    )}
                  </Button>
                  
                  {loadingItineraries ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full" />
                    </div>
                  ) : itineraries.length === 0 ? (
                    <p className="text-center text-gray-500 py-6">
                      No itineraries generated yet. Click the button above to create drafts.
                    </p>
                  ) : (
                    <div className="grid md:grid-cols-3 gap-4">
                      {itineraries.map((itin) => {
                        const isSelected = itin.status === 'selected'
                        const itemsPerDay = lockedDays.length > 0 
                          ? Math.round(itin.items.length / lockedDays.length)
                          : 0
                        
                        return (
                          <Card 
                            key={itin.id} 
                            className={`cursor-pointer hover:shadow-md transition-shadow ${
                              isSelected ? 'ring-2 ring-green-500 bg-green-50' : ''
                            }`}
                          >
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">{itin.title}</CardTitle>
                                <div className="flex items-center gap-2">
                                  {itin.discoverable && (
                                    <Badge variant="outline" className="text-xs">
                                      <Globe className="h-3 w-3 mr-1" />
                                      Discoverable
                                    </Badge>
                                  )}
                                  {isSelected && (
                                    <Badge className="bg-green-100 text-green-800">
                                      <Check className="h-3 w-3 mr-1" />
                                      Selected
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <CardDescription>
                                ~{itemsPerDay} activities per day
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                              <div className="text-sm text-gray-600 mb-4">
                                <p>{itin.items.length} total activities</p>
                                <p className="text-xs text-gray-400">
                                  {itin.startDay} → {itin.endDay}
                                </p>
                              </div>
                              
                              {/* Discoverable toggle for selected itinerary */}
                              {isSelected && (trip.isCreator || trip.circle?.ownerId === user.id) && (
                                <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg mb-3">
                                  <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-gray-500" />
                                    <span className="text-sm">Share in Discover</span>
                                  </div>
                                  <Switch
                                    checked={itin.discoverable || false}
                                    onCheckedChange={(checked) => toggleItineraryDiscoverable(itin.id, checked)}
                                  />
                                </div>
                              )}
                              
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => openItineraryEditor(itin)}
                                >
                                  {isSelected ? 'View' : 'View & Edit'}
                                </Button>
                                {!isSelected && (trip.isCreator || trip.circle?.ownerId === user.id) && (
                                  <Button 
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => selectItinerary(itin.id)}
                                  >
                                    Select as Final
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat">
          <Card className="h-[500px] flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg">Trip Chat</CardTitle>
              <CardDescription>Discuss trip details with your group</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-4">
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.isSystem ? 'justify-center' : msg.user?.id === user.id ? 'justify-end' : 'justify-start'}`}>
                        {msg.isSystem ? (
                          <div className="bg-gray-100 rounded-full px-4 py-1 text-sm text-gray-600">
                            {msg.content}
                          </div>
                        ) : (
                          <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.user?.id === user.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                            {msg.user?.id !== user.id && (
                              <p className="text-xs font-medium mb-1 opacity-70">{msg.user?.name}</p>
                            )}
                            <p>{msg.content}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lock Confirmation Dialog */}
      <Dialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock Trip Dates?</DialogTitle>
            <DialogDescription>
              Locking finalizes dates so planning can begin 🎉 Once locked, the trip dates cannot be changed.
            </DialogDescription>
          </DialogHeader>
          {pendingLockOption && (
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-2">Selected dates:</p>
              <p className="font-medium text-lg">
                {pendingLockOption.split('_')[0]} to {pendingLockOption.split('_')[1]}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowLockConfirm(false)
              setPendingLockOption(null)
            }}>
              Cancel
            </Button>
            <Button onClick={confirmLockTrip} className="bg-green-600 hover:bg-green-700">
              <Lock className="h-4 w-4 mr-2" />
              Lock Dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main App
export default function App() {
  const { user, token, loading, login, logout } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Compass className="h-12 w-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading Trypzy...</p>
        </div>
      </div>
    )
  }

  if (!user || !token) {
    return <AuthPage onLogin={login} />
  }

  return <Dashboard user={user} token={token} onLogout={logout} />
}
