'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import { 
  Users, Plus, LogOut, MapPin, Calendar as CalendarIcon, 
  MessageCircle, Check, X, HelpCircle, Vote, Lock, UserPlus, Trash2, AlertTriangle,
  ChevronLeft, Send, Compass, ArrowRight, Image as ImageIcon,
  Camera, Globe, Eye, EyeOff, Edit, Search, Flag, Sparkles,
  ListTodo, Lightbulb, RefreshCw, ChevronUp, ChevronDown, Clock, Sun, Moon, Sunset, Info,
  Circle, CheckCircle2, Home, Luggage, DollarSign, ChevronRight
} from 'lucide-react'
import { TRIP_PROGRESS_STEPS } from '@/lib/trips/progress'
import { TripCard } from '@/components/dashboard/TripCard'
import { sortTrips } from '@/lib/dashboard/sortTrips'
import { deriveTripPrimaryStage, getPrimaryTabForStage, computeProgressFlags, TripPrimaryStage, TripTabKey } from '@/lib/trips/stage'
import { getUserActionRequired } from '@/lib/trips/getUserActionRequired.js'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { dashboardCircleHref, circlePageHref, tripHref } from '@/lib/navigation/routes'
import { formatTripDateRange } from '@/lib/utils'
import { getTripDisplayDates } from '@/lib/trips/dateState.js'
import { CommandCenterV2 } from '@/components/trip/command-center-v2'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

// Branded Spinner Component
export function BrandedSpinner({ className = '', size = 'default' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }
  
  const dimensions = {
    sm: 16,
    default: 20,
    md: 24,
    lg: 32
  }
  
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <Image
        src="/brand/trypzy-icon.png"
        alt="Loading"
        width={dimensions[size]}
        height={dimensions[size]}
        className={`${sizeClasses[size]} animate-spin`}
        unoptimized
      />
    </div>
  )
}

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
    // MVP policy: login always redirects to /dashboard (do not restore previous deep link)
    // Navigation will be handled by App component's useEffect
  }

  const logout = (router = null) => {
    // Clear auth state
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    setToken(null)
    setUser(null)
    
    // MVP POLICY: Logout ALWAYS returns to clean "/" (no query params, no deep URL preservation)
    // Immediately navigate to login if router is provided
    // This ensures instant navigation without waiting for useEffect
    if (router && typeof window !== 'undefined') {
      // Use replace to ensure clean URL with no query params
      router.replace('/')
    }
  }

  return { user, token, loading, login, logout }
}

// API Helper
const api = async (endpoint, options = {}, token = null) => {
  const headers = {}
  
  // Set Content-Type if body exists and is not FormData
  if (options.body) {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    // For POST/PUT/PATCH without body, still set Content-Type
    headers['Content-Type'] = 'application/json'
  }
  
  // Always set Authorization if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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
  const router = useRouter()
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

      // MVP policy: login ALWAYS redirects to /dashboard (clean URL, no deep link restore)
      // This overrides any deep URL that might exist (e.g., ?tripId=...) for internal testing consistency
      // Use replace to avoid adding login page to history
      router.replace('/dashboard')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <TrypzyLogo variant="full" className="h-10 w-auto" />
          </div>
          <p className="text-[#6B7280]">Trips made easy</p>
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
                  data-testid="login-email"
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
                  data-testid="login-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 shrink-0 animate-spin">
                      <Image
                        src="/brand/trypzy-icon.png"
                        alt="Loading"
                        width={20}
                        height={20}
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <span>Loading...</span>
                  </div>
                ) : (
                  isSignup ? 'Create Account' : 'Sign In'
                )}
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
      case 'evening': return <Moon className="h-3 w-3 text-[#6B7280]" />
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
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <span className="text-[#111111] text-sm font-medium">
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
          <p className="text-sm text-[#6B7280] mb-2 flex items-center gap-1">
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
                <ListTodo className="h-4 w-4 text-[#6B7280]" />
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

// Memories View Component
export function MemoriesView({ posts, loading, onCreatePost, onDeletePost, onEditPost, emptyMessage = "No memories yet" }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <BrandedSpinner size="lg" />
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
          <h1 className="text-3xl font-bold text-[#111111] flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-[#FA3823]" />
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
                ? 'bg-[#FA3823] text-white'
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
                  ? 'bg-[#FA3823] text-white'
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
          <BrandedSpinner size="lg" />
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
                      <BrandedSpinner size="md" />
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
function Dashboard({ user, token, onLogout, initialTripId, initialCircleId, returnTo, initialView }) {
  const router = useRouter()
  const pathname = usePathname()
  const [circles, setCircles] = useState([])
  const [selectedCircle, setSelectedCircle] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(initialView || 'circles') // circles, circle, trip, discover
  
  // Hydration guards: prevent duplicate loading of trip/circle from query params
  // These refs ensure we only hydrate once from URL params, preventing race conditions
  const tripHydratedRef = useRef(false)
  const circleHydratedRef = useRef(false)
  
  // Browser back/forward navigation: track last handled URL to prevent loops
  const lastHandledUrlRef = useRef(null)
  const isHandlingPopRef = useRef(false)
  
  // Wrap onLogout to pass router for immediate navigation
  const handleLogout = () => {
    // Clear selection state to prevent any stale navigation
    setSelectedCircle(null)
    setSelectedTrip(null)
    // Call logout with router for immediate navigation
    onLogout(router)
  }
  
  // Dev-only navigation tracing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] Dashboard component', { 
        pathname, 
        initialTripId, 
        initialCircleId, 
        returnTo, 
        view, 
        selectedTripId: selectedTrip?.id,
        selectedCircleId: selectedCircle?.id
      })
    }
  }, [pathname, initialTripId, initialCircleId, returnTo, view, selectedTrip?.id, selectedCircle?.id])
  
  // Dev-only guardrail: warn if invalid view is set
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const validViews = ['circles', 'circle', 'trip', 'discover']
      if (view && !validViews.includes(view)) {
        console.warn(`[Navigation Guardrail] Invalid view value: "${view}". Valid views are:`, validViews)
      }
    }
  }, [view])

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
  
  // Initialize lastHandledUrlRef with current URL on mount to prevent initial popstate conflicts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname
      const currentSearch = window.location.search || ''
      lastHandledUrlRef.current = currentPath + currentSearch
    }
  }, [])
  
  // Browser back/forward button handler: sync UI state with URL changes
  // This ensures when user clicks browser back/forward, the Dashboard view updates accordingly
  useEffect(() => {
    const handlePopState = () => {
      // Prevent infinite loops: don't handle if we're already handling or if this is from our own navigation
      if (isHandlingPopRef.current || typeof window === 'undefined') {
        return
      }
      
      isHandlingPopRef.current = true
      
      try {
        const currentUrl = new URL(window.location.href)
        const currentPath = currentUrl.pathname
        const currentSearch = currentUrl.search
        const tripIdParam = currentUrl.searchParams.get('tripId')
        const circleIdParam = currentUrl.searchParams.get('circleId')
        const viewParam = currentUrl.searchParams.get('view')
        const returnToParam = currentUrl.searchParams.get('returnTo')
        
        // Build a normalized URL string for comparison (pathname + search)
        const normalizedUrl = currentPath + currentSearch
        
        // Skip if this is the same URL we just handled (prevents duplicate processing)
        if (lastHandledUrlRef.current === normalizedUrl) {
          isHandlingPopRef.current = false
          return
        }
        
        lastHandledUrlRef.current = normalizedUrl
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[NAV] Dashboard: popstate handler', { 
            pathname: currentPath,
            tripId: tripIdParam, 
            circleId: circleIdParam, 
            view: viewParam,
            currentSearch,
            normalizedUrl
          })
        }
        
        // If we navigated to a route-based page (/dashboard, /circles/[id]), 
        // the App component will handle the redirect, so just clear state
        if (currentPath === '/dashboard' || currentPath.startsWith('/circles/')) {
          // We're on a route-based page - clear legacy dashboard state
          setView('circles')
          setSelectedTrip(null)
          setSelectedCircle(null)
          isHandlingPopRef.current = false
          return
        }
        
        // Handle legacy query-param routes (only when on root path)
        if (currentPath === '/') {
          // Handle trip view
          if (tripIdParam) {
            // Trip ID exists in URL - ensure trip is loaded and view is set
            if (!selectedTrip || selectedTrip.id !== tripIdParam) {
              // Trip changed or not loaded - load it (skip URL update since URL already matches)
              openTrip(tripIdParam, true) // skipUrlUpdate=true prevents redundant URL navigation
            } else {
              // Trip already loaded, just ensure view is correct
              setView('trip')
            }
          } else if (circleIdParam) {
            // No trip, but circle exists - show circle view
            if (!selectedCircle || selectedCircle.id !== circleIdParam) {
              // Circle changed or not loaded - need to load it
              // Note: openCircle will update URL if needed, but since URL already has circleId,
              // the URL check in openCircle should prevent redundant navigation
              openCircle(circleIdParam)
            } else {
              // Circle already loaded, just ensure view is correct
              setView('circle')
            }
          } else if (viewParam === 'discover') {
            // Discover view
            setView('discover')
            setSelectedTrip(null)
            setSelectedCircle(null)
          } else {
            // Default to circles view
            setView('circles')
            setSelectedTrip(null)
            setSelectedCircle(null)
          }
        }
      } catch (error) {
        console.error('[NAV] Dashboard: popstate handler error', error)
      } finally {
        // Reset handling flag after a short delay to allow state updates to complete
        setTimeout(() => {
          isHandlingPopRef.current = false
        }, 100)
      }
    }
    
    // Add popstate listener for browser back/forward buttons
    window.addEventListener('popstate', handlePopState)
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrip, selectedCircle]) // Dependencies: selectedTrip and selectedCircle to check if they match URL

  // Sync view state with URL params reactively
  useEffect(() => {
    if (initialTripId) {
      setView('trip')
    } else if (initialCircleId) {
      setView('circle')
    } else if (initialView) {
      // Respect the view from URL query params
      setView(initialView)
    } else {
      // Default to circles if no specific view is set
      setView('circles')
    }
  }, [initialTripId, initialCircleId, initialView])

  // Reactively sync selectedCircle with URL params
  // STRICT GUARD: Do NOT sync circle if we're on a trip view (prevents bounce)
  // Multiple guard conditions ensure circle sync never interferes with trip loading
  useEffect(() => {
    // Dev-only tracing
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] Dashboard effect: sync selectedCircle', { 
        initialCircleId, 
        initialTripId, 
        selectedCircleId: selectedCircle?.id,
        view,
        shouldSkip: !!initialTripId || view === 'trip' || !!selectedTrip 
      })
    }
    
    // GUARD 1: Trip takes absolute precedence - if tripId exists, NEVER sync circle
    // This prevents the bounce where circle sync fires after trip loads and overrides the trip view
    if (initialTripId) {
      return
    }
    
    // GUARD 2: If view is already 'trip', don't sync circle (defensive check)
    if (view === 'trip') {
      return
    }
    
    // GUARD 3: If selectedTrip exists, don't sync circle (trip is active)
    // This defensive check ensures we never load circle state when trip is already loaded
    if (selectedTrip) {
      return
    }
    
    // Only sync circle if all guards pass (we're NOT in a trip context)
    if (initialCircleId) {
      // Only load if we haven't hydrated this circle yet, or if it changed
      if (!circleHydratedRef.current || !selectedCircle || selectedCircle.id !== initialCircleId) {
        circleHydratedRef.current = true
        openCircle(initialCircleId)
      }
    } else {
      // Clear circle if circleId is removed from URL (only if not in trip context)
      if (selectedCircle && view !== 'trip' && !selectedTrip) {
        setSelectedCircle(null)
        circleHydratedRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCircleId, initialTripId, view, selectedTrip])

  // Reactively sync selectedTrip with URL params
  // Hydration guard prevents duplicate loading when query param changes
  useEffect(() => {
    // Dev-only tracing
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] Dashboard effect: sync selectedTrip', { 
        initialTripId, 
        selectedTripId: selectedTrip?.id,
        tripHydrated: tripHydratedRef.current,
        shouldLoad: initialTripId && (!tripHydratedRef.current || !selectedTrip || selectedTrip.id !== initialTripId)
      })
    }
    
    if (initialTripId) {
      // Only load if we haven't hydrated this trip yet, or if tripId changed
      // tripHydratedRef ensures we only call openTrip once per tripId
      if (!tripHydratedRef.current || !selectedTrip || selectedTrip.id !== initialTripId) {
        tripHydratedRef.current = true
        openTrip(initialTripId)
      }
    } else {
      // Clear trip if tripId is removed from URL
      if (selectedTrip) {
        setSelectedTrip(null)
        tripHydratedRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTripId])

  // Navigation handlers
  const openCircle = async (circleId) => {
    try {
      // Dev-only tracing
      if (process.env.NODE_ENV === 'development') {
        console.log('[NAV] Dashboard: openCircle called', { circleId, pathname, view, hasSelectedTrip: !!selectedTrip })
      }
      
      // Additional guard: don't open circle if we're currently in trip view
      // This prevents circle from being loaded when trip takes precedence
      if (view === 'trip' || selectedTrip) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[NAV] Dashboard: openCircle blocked (in trip view)')
        }
        return
      }
      
      const data = await api(`/circles/${circleId}`, { method: 'GET' }, token)
      setSelectedCircle(data)
      // Update URL to reflect circle view (remove tripId if present)
      // Guard: Only update URL if we're NOT currently on a trip route
      // This prevents openCircle from overriding trip view when called from trip sync
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href)
        const currentPath = currentUrl.pathname
        const hasTripId = currentUrl.searchParams.get('tripId')
        
        // Don't navigate away from trip view
        if (currentPath.startsWith('/trips/') || hasTripId) {
          // We're on a trip - don't override with circle view
          // Just set the state, don't navigate
          if (process.env.NODE_ENV === 'development') {
            console.log('[NAV] Dashboard: openCircle skipped navigation (on trip view)')
          }
          return
        }
        
        // Only update URL if it's different to avoid redundant updates
        // Use replace to avoid history churn (don't add entry to browser history)
        const newCircleUrl = `/?circleId=${circleId}`
        const currentSearch = currentUrl.search || ''
        const expectedSearch = newCircleUrl.replace('/?', '?')
        if (currentSearch !== expectedSearch) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[NAV] Dashboard: openCircle navigating', { to: newCircleUrl })
          }
          // Update lastHandledUrlRef to prevent popstate handler from re-processing this URL
          // Use normalized format (pathname + search) for consistency
          lastHandledUrlRef.current = currentPath + expectedSearch
          router.replace(newCircleUrl)
        } else {
          // URL already matches - update lastHandledUrlRef to prevent popstate conflicts
          lastHandledUrlRef.current = currentPath + (currentSearch || '')
        }
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  const openTrip = async (tripId, skipUrlUpdate = false) => {
    try {
      // Dev-only tracing
      if (process.env.NODE_ENV === 'development') {
        console.log('[NAV] Dashboard: openTrip called', { tripId, pathname, skipUrlUpdate })
      }
      
      const data = await api(`/trips/${tripId}`, { method: 'GET' }, token)
      
      // Compute stage and set initial tab based on stage
      const stage = deriveTripPrimaryStage(data)
      const primaryTab = getPrimaryTabForStage(stage)
      const progressFlags = computeProgressFlags(data)
      
      // Store stage and primary tab in trip data for TripDetailView to use
      data._computedStage = stage
      data._primaryTab = primaryTab
      data._progressFlags = progressFlags
      
      setSelectedTrip(data)
      
      // Skip URL update if flag is set (used by popstate handler to avoid redundant navigation)
      if (skipUrlUpdate) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[NAV] Dashboard: openTrip skipping URL update (skipUrlUpdate=true)')
        }
        return
      }
      
      // Update URL to reflect trip view (include circleId if available)
      // Guard: Only update URL if we're on root path with query params (legacy route)
      // If we're on /trips/[tripId], the route page handles navigation
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href)
        const currentPath = currentUrl.pathname
        
        // If we're already on /trips/[tripId], don't update URL (route page handles it)
        if (currentPath.startsWith('/trips/')) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[NAV] Dashboard: openTrip skipped navigation (already on /trips route)')
          }
          return
        }
        
        // Only update URL if it's different to avoid redundant updates
        // Use replace for URL normalization (not user-initiated navigation) to avoid history churn
        // This prevents back button from navigating through intermediate redirect states
        // Preserve returnTo and ui params if they exist in current URL
        const currentReturnTo = currentUrl.searchParams.get('returnTo')
        const currentUiMode = currentUrl.searchParams.get('ui')
        const circleIdParam = data.circleId ? `&circleId=${data.circleId}` : ''
        const returnToParam = currentReturnTo ? `&returnTo=${encodeURIComponent(currentReturnTo)}` : ''
        const uiParam = currentUiMode ? `&ui=${currentUiMode}` : ''
        const newUrl = `/?tripId=${tripId}${circleIdParam}${returnToParam}${uiParam}`
        const currentSearch = currentUrl.search || ''
        const expectedSearch = newUrl.replace('/?', '?')
        
        // Only replace if URL actually differs (prevents unnecessary navigation)
        if (currentSearch !== expectedSearch) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[NAV] Dashboard: openTrip normalizing URL', { to: newUrl, currentSearch, expectedSearch })
          }
          // Update lastHandledUrlRef to prevent popstate handler from re-processing this URL
          // Use normalized format (pathname + search) for consistency
          lastHandledUrlRef.current = currentPath + expectedSearch
          router.replace(newUrl)
        } else {
          // URL already matches - update lastHandledUrlRef to prevent popstate conflicts
          lastHandledUrlRef.current = currentPath + (currentSearch || '')
        }
      }
    } catch (error) {
      toast.error(error.message)
    }
  }

  const goBack = () => {
    if (view === 'trip') {
      // Use returnTo if provided, otherwise check initialCircleId
      if (returnTo) {
        // returnTo should already be in the correct format (/circles/[id] or /dashboard)
        // Update lastHandledUrlRef to prevent popstate conflicts (will be set when navigation completes)
        lastHandledUrlRef.current = null // Reset to allow popstate handler to process new URL
        router.push(returnTo)
      } else if (initialCircleId) {
        // If we came from a circle page (initialCircleId exists), go back to that circle
        // Use /circles/[circleId] format for proper routing
        lastHandledUrlRef.current = null // Reset to allow popstate handler to process new URL
        router.push(`/circles/${initialCircleId}`)
      } else {
        // If no initialCircleId, we came from dashboard, so go back to dashboard
        lastHandledUrlRef.current = null // Reset to allow popstate handler to process new URL
        router.push('/dashboard')
      }
    } else if (view === 'circle') {
      // Navigate back to dashboard when on circle view
      lastHandledUrlRef.current = null // Reset to allow popstate handler to process new URL
      router.push('/dashboard')
    } else if (view === 'discover') {
      // Navigate back to dashboard when on discover view
      lastHandledUrlRef.current = null // Reset to allow popstate handler to process new URL
      router.push('/dashboard')
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
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
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
              <div className="flex items-center cursor-pointer" onClick={() => router.push('/dashboard')} data-testid="logo-home">
                <TrypzyLogo variant="full" className="h-8 w-auto" />
              </div>
              
              {/* Nav Links */}
              <div className="hidden md:flex items-center gap-1 ml-8">
                <Button 
                  variant={view === 'circles' || view === 'circle' || view === 'trip' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => router.push('/dashboard')}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Circles
                </Button>
                <Button 
                  variant={view === 'discover' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => router.push('/?view=discover')}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Discover
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">Hi, {user.name}</span>
              <Link 
                href="/settings/privacy"
                className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
              >
                Privacy
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="logout">
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
            onClick={() => router.push('/dashboard')}
          >
            <Users className="h-4 w-4 mr-2" />
            Circles
          </Button>
          <Button 
            variant={view === 'discover' ? 'secondary' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => router.push('/?view=discover')}
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
          <div data-testid="trip-page">
            <ErrorBoundary>
              <TripDetailView
                trip={selectedTrip}
                token={token}
                user={user}
                onRefresh={(updatedTrip) => {
                  // If updated trip provided, merge it into existing trip state (avoids refetch for immediate UI update)
                  if (updatedTrip) {
                    // Merge updated fields into existing trip to preserve enriched fields (circle, participantsWithStatus, etc.)
                    const mergedTrip = {
                      ...selectedTrip,
                      ...updatedTrip,
                      // Preserve computed fields that might not be in raw trip document
                      circle: selectedTrip.circle || updatedTrip.circle,
                      participantsWithStatus: selectedTrip.participantsWithStatus || updatedTrip.participantsWithStatus,
                      viewer: selectedTrip.viewer || updatedTrip.viewer
                    }

                    // Compute stage and progress flags for merged trip
                    const stage = deriveTripPrimaryStage(mergedTrip)
                    const primaryTab = getPrimaryTabForStage(stage)
                    const progressFlags = computeProgressFlags(mergedTrip)
                    mergedTrip._computedStage = stage
                    mergedTrip._primaryTab = primaryTab
                    mergedTrip._progressFlags = progressFlags

                    setSelectedTrip(mergedTrip)
                  } else {
                    // Otherwise refetch (backward compatibility)
                    openTrip(selectedTrip.id)
                  }
                }}
              />
            </ErrorBoundary>
          </div>
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
                    <Badge variant="secondary">Circle Leader</Badge>
                  )}
                </div>
                <CardTitle className="mt-4">
                  <Link href={`/dashboard#circle-${circle.id}`} className="hover:underline">
                    {circle.name}
                  </Link>
                </CardTitle>
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
  const router = useRouter()
  
  // Default landing tab: Circle Updates (aligns with Trip Chat default behavior)
  // Helper to get initial tab (returns "chat" which displays as "Circle Updates")
  const getInitialCircleTab = () => 'chat'
  
  const [activeTab, setActiveTab] = useState(getInitialCircleTab())
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
  const [showOptionalDates, setShowOptionalDates] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updates, setUpdates] = useState([])
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [posts, setPosts] = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  // Load circle updates (read-only digest from trip activity)
  const loadUpdates = async () => {
    setLoadingUpdates(true)
    try {
      const data = await api(`/circles/${circle.id}/updates`, { method: 'GET' }, token)
      setUpdates(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingUpdates(false)
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

  // Reset to Circle Updates tab whenever circle changes (default landing behavior)
  useEffect(() => {
    setActiveTab(getInitialCircleTab())
  }, [circle.id])

  useEffect(() => {
    if (activeTab === 'chat') { // 'chat' is the tab value, but UI shows "Circle Updates"
      loadUpdates()
      const interval = setInterval(loadUpdates, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
    if (activeTab === 'memories') {
      loadPosts()
    }
  }, [activeTab])

  const createTrip = async () => {
    const hasDates = Boolean(tripForm.startDate && tripForm.endDate)
    const hasPartialDates = Boolean(tripForm.startDate || tripForm.endDate)
    const isHosted = tripForm.type === 'hosted'

    if (!tripForm.name) {
      toast.error('Please fill in all required fields')
      return
    }
    if (isHosted && !hasDates) {
      toast.error('Hosted trips require start and end dates')
      return
    }
    if (!isHosted && hasPartialDates && !hasDates) {
      toast.error('Please provide both a start and end date')
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
      setShowOptionalDates(false)
      onRefresh()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setCreating(false)
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
          <TabsTrigger value="members">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="trips">
            <MapPin className="h-4 w-4 mr-2" />
            Trips
          </TabsTrigger>
          <TabsTrigger value="memories">
            <Camera className="h-4 w-4 mr-2" />
            Memories
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageCircle className="h-4 w-4 mr-2" />
            Circle Updates
          </TabsTrigger>
        </TabsList>

        {/* Members Tab */}
        <TabsContent value="members">
          <h2 className="text-xl font-semibold mb-6">Circle Members ({circle.members.length})</h2>
          <div className="space-y-2">
            {circle.members.map((member) => {
              // Build returnTo URL from current location
              const currentUrl = typeof window !== 'undefined' 
                ? window.location.pathname + window.location.search
                : '/dashboard'
              const returnTo = encodeURIComponent(currentUrl)
              const profileUrl = `/members/${member.id}?returnTo=${returnTo}`
              
              return (
                <Link key={member.id} href={profileUrl}>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">View profile</span>
                          {member.role === 'owner' && (
                            <Badge>Circle Leader</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </TabsContent>

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
                      onValueChange={(v) => {
                        setTripForm({ ...tripForm, type: v })
                        const hasDates = Boolean(tripForm.startDate || tripForm.endDate)
                        setShowOptionalDates(v === 'hosted' ? true : hasDates)
                      }}
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
                  {tripForm.type === 'collaborative' ? (
                    <div className="space-y-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="px-0 text-sm"
                        onClick={() => setShowOptionalDates(!showOptionalDates)}
                      >
                        {showOptionalDates ? 'Hide dates' : 'Add dates (optional)'}
                      </Button>
                      {showOptionalDates && (
                        <>
                          <p className="text-xs text-gray-500">If you already have a proposal, add it here.</p>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Proposed start</Label>
                              <Input
                                type="date"
                                value={tripForm.startDate}
                                onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Proposed end</Label>
                              <Input
                                type="date"
                                value={tripForm.endDate}
                                onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Trip Dates</Label>
                      <p className="text-xs text-gray-500">Hosted trips have fixed dates.</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Start date</Label>
                          <Input
                            type="date"
                            value={tripForm.startDate}
                            onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End date</Label>
                          <Input
                            type="date"
                            value={tripForm.endDate}
                            onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                          />
                        </div>
                      </div>
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

          {/* Uses shared TripCard to keep dashboard + circle detail consistent */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortTrips(circle.trips || []).map((trip) => (
                <TripCard key={trip.id} trip={trip} circleId={circle.id} />
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


        {/* Circle Updates Tab (Read-only digest from trip activity) */}
        <TabsContent value="chat">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Circle Updates</CardTitle>
              <CardDescription className="text-xs">Recent activity across trips in this circle.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col px-4 pb-4">
              <div className="max-h-[60vh] md:max-h-[450px] overflow-y-auto pr-2">
                {loadingUpdates ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-sm text-gray-500">Loading updates...</div>
                  </div>
                ) : updates.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm text-gray-500">No updates yet. Activity will appear here as the circle grows.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      // Helper: Render a single update item
                      const renderUpdateItem = (update) => {
                        // Get icon and color based on update type
                        const getUpdateIcon = (type) => {
                          switch (type) {
                            case 'trip_created':
                              return <Plus className="h-3.5 w-3.5" />
                            case 'circle_created':
                              return <Plus className="h-3.5 w-3.5" />
                            case 'circle_member_joined':
                              return <UserPlus className="h-3.5 w-3.5" />
                            case 'user_joined':
                              return <UserPlus className="h-3.5 w-3.5" />
                            case 'user_voted':
                              return <Vote className="h-3.5 w-3.5" />
                            case 'dates_locked':
                              return <Lock className="h-3.5 w-3.5" />
                            case 'itinerary_finalized':
                              return <CheckCircle2 className="h-3.5 w-3.5" />
                            default:
                              return <Circle className="h-3.5 w-3.5" />
                          }
                        }
                        
                        const isStageTransition = update.type === 'dates_locked' || update.type === 'itinerary_finalized'
                        const iconColor = isStageTransition ? 'text-indigo-600' : 'text-gray-400'
                        
                        // Format timestamp to human-readable format
                        const formatTimestamp = (timestamp) => {
                          if (!timestamp) return ''
                          const date = new Date(timestamp)
                          const now = new Date()
                          const diffMs = now - date
                          const diffMins = Math.floor(diffMs / 60000)
                          const diffHours = Math.floor(diffMs / 3600000)
                          const diffDays = Math.floor(diffMs / 86400000)
                          
                          if (diffMins < 1) return 'Just now'
                          if (diffMins < 60) return `${diffMins}m ago`
                          if (diffHours < 24) return `${diffHours}h ago`
                          if (diffDays === 1) return 'Yesterday'
                          if (diffDays < 7) return `${diffDays}d ago`
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }
                        
                        // Format action text from update data
                        const getActionText = () => {
                          if (update.actorName) {
                            switch (update.type) {
                              case 'trip_created':
                                return `${update.actorName} created`
                              case 'circle_created':
                                return `${update.actorName} created`
                              case 'circle_member_joined':
                                return `${update.actorName} joined`
                              case 'user_joined':
                                return `${update.actorName} joined`
                              case 'user_voted':
                                return `${update.actorName} voted on dates`
                              default:
                                return update.message
                            }
                          } else {
                            switch (update.type) {
                              case 'dates_locked':
                                return 'Dates locked'
                              case 'itinerary_finalized':
                                return 'Itinerary finalized'
                              default:
                                return update.message
                            }
                          }
                        }

                        const contextLabel = update.tripName || update.circleName || ''
                        const hasTripTarget = Boolean(update.tripId)
                        const hasMemberTarget =
                          (update.type === 'circle_member_joined' || update.type === 'circle_created') &&
                          update.actorId
                        const isClickable = hasTripTarget || hasMemberTarget
                        
                        return (
                          <div
                            key={update.id}
                            onClick={() => {
                              if (!isClickable) return
                              const currentUrl = typeof window !== 'undefined' 
                                ? window.location.pathname + window.location.search
                                : '/dashboard'
                              const returnTo = encodeURIComponent(currentUrl)
                              if (hasMemberTarget) {
                                router.push(`/members/${update.actorId}?returnTo=${returnTo}`)
                                return
                              }
                              if (hasTripTarget) {
                                router.push(`${tripHref(update.tripId)}?tab=chat`)
                              }
                            }}
                            className={`p-3 rounded-md border border-gray-200 transition-all ${
                              isClickable ? 'hover:bg-gray-50 hover:border-gray-300 cursor-pointer' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                                {getUpdateIcon(update.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isStageTransition ? 'text-indigo-900' : 'text-gray-900'}`}>
                                  {getActionText()}
                                </p>
                                {contextLabel ? (
                                  <p className="text-xs text-gray-600 mt-0.5">
                                    {contextLabel}
                                  </p>
                                ) : null}
                                <p className="text-xs text-gray-400 mt-1">
                                  {formatTimestamp(update.timestamp)}
                                </p>
                              </div>
                              {isClickable ? (
                                <ChevronRight className="h-4 w-4 text-gray-300 ml-2 flex-shrink-0 mt-0.5" />
                              ) : null}
                            </div>
                          </div>
                        )
                      }
                      
                      // Group updates by day (lightweight implementation)
                      const groupUpdatesByDay = (updates) => {
                        const now = new Date()
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                        const yesterday = new Date(today)
                        yesterday.setDate(yesterday.getDate() - 1)
                        
                        const groups = {
                          today: [],
                          yesterday: [],
                          earlier: []
                        }
                        
                        updates.forEach(update => {
                          if (!update.timestamp) {
                            groups.earlier.push(update)
                            return
                          }
                          
                          const updateDate = new Date(update.timestamp)
                          const updateDay = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate())
                          
                          if (updateDay.getTime() === today.getTime()) {
                            groups.today.push(update)
                          } else if (updateDay.getTime() === yesterday.getTime()) {
                            groups.yesterday.push(update)
                          } else {
                            groups.earlier.push(update)
                          }
                        })
                        
                        return groups
                      }
                      
                      const grouped = groupUpdatesByDay(updates)
                      
                      return (
                        <>
                          {grouped.today.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 px-1">Today</p>
                              <div className="space-y-2">
                                {grouped.today.map((update) => renderUpdateItem(update))}
                              </div>
                            </div>
                          )}
                          {grouped.yesterday.length > 0 && (
                            <div className={grouped.today.length > 0 ? 'mt-4' : ''}>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 px-1">Yesterday</p>
                              <div className="space-y-2">
                                {grouped.yesterday.map((update) => renderUpdateItem(update))}
                              </div>
                            </div>
                          )}
                          {grouped.earlier.length > 0 && (
                            <div className={(grouped.today.length > 0 || grouped.yesterday.length > 0) ? 'mt-4' : ''}>
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 px-1">Earlier</p>
                              <div className="space-y-2">
                                {grouped.earlier.map((update) => renderUpdateItem(update))}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
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
              <div className="space-y-2">
                <Label>Planning Window</Label>
                <p className="text-xs text-gray-500">These are the possible dates your group can choose from. Final dates are locked later.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Earliest possible date</Label>
                    <Input
                      type="date"
                      value={editingTrip.startDate}
                      onChange={(e) => setEditingTrip({ ...editingTrip, startDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Latest possible date</Label>
                    <Input
                      type="date"
                      value={editingTrip.endDate}
                      onChange={(e) => setEditingTrip({ ...editingTrip, endDate: e.target.value })}
                    />
                  </div>
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

// Trip Progress Component
function TripProgress({ trip, token, user, onRefresh, onSwitchTab }) {
  const isMobile = useIsMobile()
  const [progress, setProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [isOpen, setIsOpen] = useState(!isMobile) // Open on desktop, closed on mobile by default
  
  useEffect(() => {
    loadProgress()
  }, [trip.id, trip.status, trip.lockedStartDate])
  
  const loadProgress = async () => {
    try {
      const data = await api(`/trips/${trip.id}/progress`, { method: 'GET' }, token)
      setProgress(data)
      // Update trip with progress data for stage computation
      trip.progress = data
    } catch (error) {
      console.error('Failed to load progress:', error)
      toast.error('Failed to load trip progress')
    } finally {
      setLoading(false)
    }
  }
  
  const toggleStep = async (step) => {
    if (!progress?.canEdit) return
    if (updating) return
    
    const currentValue = progress.steps[step]
    setUpdating(true)
    
    try {
      const data = await api(`/trips/${trip.id}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ step, completed: !currentValue })
      }, token)
      setProgress(data)
      onRefresh() // Refresh trip data to update chat messages
    } catch (error) {
      toast.error(error.message || 'Failed to update progress')
    } finally {
      setUpdating(false)
    }
  }
  
  if (loading || !progress) {
    return null
  }
  
  // Use shared milestone definitions
  const stepConfigs = TRIP_PROGRESS_STEPS
  
  // Find first incomplete step
  const firstIncompleteStep = stepConfigs.find(step => !progress.steps[step.key])
  const firstIncompleteKey = firstIncompleteStep?.key
  
  // Compute action required for current user
  const userDatePicks = trip.userDatePicks || null
  const userVote = trip.userVote || null
  const availabilities = trip.availabilities || []
  const actionRequired = getUserActionRequired(trip, user.id, userDatePicks, userVote, availabilities)
  
  const ProgressContent = () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Trip Progress</CardTitle>
            <CardDescription>Track your trip planning milestones</CardDescription>
          </div>
          {actionRequired && (
            <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-indigo-600 border border-indigo-100">
              Waiting on you
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stepConfigs.map((stepConfig, index) => {
          const isComplete = progress.steps[stepConfig.key]
          const isFirstIncomplete = stepConfig.key === firstIncompleteKey
          const canToggle = stepConfig.manual && progress.canEdit && (stepConfig.key !== 'itineraryFinalized' || !progress.steps.itineraryFinalized)
          const StepIcon = stepConfig.icon
          
          return (
            <div
              key={stepConfig.key}
              className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                isFirstIncomplete ? 'bg-blue-50 border border-blue-200' : ''
              } ${stepConfig.key === 'expensesSettled' && onSwitchTab ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={stepConfig.key === 'expensesSettled' && onSwitchTab ? () => onSwitchTab('expenses') : undefined}
            >
              <div className="flex-shrink-0 mt-0.5">
                {isComplete ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <StepIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className={`text-sm font-medium ${isFirstIncomplete ? 'text-blue-900' : 'text-gray-900'}`}>
                    {stepConfig.shortLabel}
                  </span>
                  {isFirstIncomplete && (
                    <Badge variant="secondary" className="text-xs">Next</Badge>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">{stepConfig.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {stepConfig.manual && progress.canEdit && (
                  <Switch
                    checked={isComplete}
                    onCheckedChange={() => toggleStep(stepConfig.key)}
                    disabled={updating}
                    className="mt-1"
                  />
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
  
  if (isMobile) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-6">
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="font-medium">Trip Progress</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          <ProgressContent />
        </CollapsibleContent>
      </Collapsible>
    )
  }
  
  return (
    <div className="sticky top-4 self-start">
      <ProgressContent />
    </div>
  )
}

// Top 3 Heatmap Scheduling Component (new MVP)
export function Top3HeatmapScheduling({ trip, token, user, onRefresh, datePicks, setDatePicks, savingPicks, setSavingPicks, canParticipate = true }) {
  const startBound = trip.startBound || trip.startDate
  const endBound = trip.endBound || trip.endDate
  const tripLengthDays = trip.tripLengthDays || trip.duration || 3
  const isLocked = trip.status === 'locked'
  
  // Rank selection state
  const [activeRank, setActiveRank] = useState(null) // 1, 2, 3, or null
  const [hoveredStartDate, setHoveredStartDate] = useState(null) // ISO string or null
  
  // Initialize picks from trip data
  useEffect(() => {
    if (trip.userDatePicks) {
      setDatePicks(trip.userDatePicks)
    }
  }, [trip.userDatePicks])
  
  // Compute activeRank based on current picks
  useEffect(() => {
    if (isLocked) {
      setActiveRank(null)
      return
    }
    
    if (datePicks.length === 0) {
      setActiveRank(1)
    } else if (datePicks.length === 1) {
      setActiveRank(datePicks[0].rank === 1 ? 2 : 1)
    } else if (datePicks.length === 2) {
      const ranks = datePicks.map(p => p.rank).sort()
      if (ranks[0] === 1 && ranks[1] === 2) {
        setActiveRank(3)
      } else if (ranks[0] === 1) {
        setActiveRank(2)
      } else {
        setActiveRank(1)
      }
    } else {
      // All 3 picks set, activeRank stays as set (or null)
      // Will be set when user clicks a chip to edit
    }
  }, [datePicks, isLocked])
  
  // Compute preview window dates for hovered start date
  const getPreviewWindowDates = useMemo(() => {
    if (!hoveredStartDate) return new Set()
    
    const startDateObj = new Date(hoveredStartDate + 'T12:00:00')
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
    const endDateISO = endDateObj.toISOString().split('T')[0]
    
    // Check if window is valid
    if (hoveredStartDate < startBound || hoveredStartDate > endBound || endDateISO > endBound) {
      return new Set()
    }
    
    // Generate all dates in the window
    const windowDates = new Set()
    for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
      windowDates.add(d.toISOString().split('T')[0])
    }
    return windowDates
  }, [hoveredStartDate, tripLengthDays, startBound, endBound])
  
  // Compute selected window dates (for persistent highlight)
  const getSelectedWindowDates = useMemo(() => {
    const selectedWindows = new Map() // startDateISO -> Set of dates in window
    datePicks.forEach(pick => {
      const startDateObj = new Date(pick.startDateISO + 'T12:00:00')
      const endDateObj = new Date(startDateObj)
      endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
      const dates = new Set()
      for (let d = new Date(startDateObj); d <= endDateObj; d.setDate(d.getDate() + 1)) {
        dates.add(d.toISOString().split('T')[0])
      }
      selectedWindows.set(pick.startDateISO, dates)
    })
    return selectedWindows
  }, [datePicks, tripLengthDays])
  
  // Save picks to backend
  const savePicks = async () => {
    setSavingPicks(true)
    try {
      await api(`/trips/${trip.id}/date-picks`, {
        method: 'POST',
        body: JSON.stringify({ picks: datePicks })
      }, token)
      toast.success('Date picks saved!')
      onRefresh()
    } catch (error) {
      toast.error(error.message || 'Failed to save picks')
    } finally {
      setSavingPicks(false)
    }
  }
  
  // Lock a window (owner only)
  const [showLockConfirmation, setShowLockConfirmation] = useState(false)
  const [pendingLockDate, setPendingLockDate] = useState(null)
  
  const lockWindow = async (startDateISO) => {
    // Check if user is leader
    if (!trip.isCreator && trip.createdBy !== user?.id) {
      toast.error('Only the trip organizer can lock dates.')
      return
    }
    
    // Show confirmation
    setPendingLockDate(startDateISO)
    setShowLockConfirmation(true)
  }
  
  const confirmLockWindow = async () => {
    if (!pendingLockDate) return
    
    try {
      await api(`/trips/${trip.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ startDateISO: pendingLockDate })
      }, token)
      toast.success('Trip dates locked!')
      setShowLockConfirmation(false)
      setPendingLockDate(null)
      onRefresh()
    } catch (error) {
      if (error.message?.includes('403') || error.message?.includes('Only')) {
        toast.error('Only the trip organizer can lock dates.')
      } else {
        toast.error(error.message || 'Failed to lock dates')
      }
      setShowLockConfirmation(false)
      setPendingLockDate(null)
    }
  }
  
  // Handle date selection from calendar
  const handleDateSelect = (dateISO) => {
    if (isLocked || !activeRank || !canParticipate) return
    
    // Check if window is valid
    const startDateObj = new Date(dateISO + 'T12:00:00')
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
    const endDateISO = endDateObj.toISOString().split('T')[0]
    
    if (dateISO < startBound || dateISO > endBound || endDateISO > endBound) {
      return // Invalid window
    }
    
    // Remove existing pick for this rank if any
    const otherPicks = datePicks.filter(p => p.rank !== activeRank)
    
    // Add new pick for activeRank
    setDatePicks([...otherPicks, { rank: activeRank, startDateISO: dateISO }])
    
    // Advance activeRank to next missing rank
    if (activeRank === 1) {
      setActiveRank(2)
    } else if (activeRank === 2) {
      setActiveRank(3)
    } else {
      setActiveRank(null) // All 3 set
    }
  }
  
  const removePick = (startDateISO) => {
    if (isLocked) return
    setDatePicks(datePicks.filter(p => p.startDateISO !== startDateISO))
    // activeRank will be updated by useEffect
  }
  
  // Handle clicking a pick chip to edit that rank
  const editPick = (rank) => {
    if (isLocked) return
    setActiveRank(rank)
  }
  
  // Generate all months covered by bounds (memoized)
  const calendarMonths = useMemo(() => {
    const months = []
    const startDate = new Date(startBound + 'T12:00:00')
    const endDate = new Date(endBound + 'T12:00:00')
    
    // Iterate through all months in the range
    let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)
    
    while (currentMonth <= endMonth) {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth()
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const startDayOfWeek = firstDay.getDay()
      
      const days = []
      
      // Add padding for days before month start
      for (let i = 0; i < startDayOfWeek; i++) {
        days.push(null)
      }
      
      // Add all days in the month
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const date = new Date(dateISO + 'T12:00:00')
        
        // Check if date is within bounds
        const isInBounds = dateISO >= startBound && dateISO <= endBound
        
        // Check if this date is a valid start date
        let isValidStart = false
        if (isInBounds) {
          const endDateObj = new Date(date)
          endDateObj.setDate(endDateObj.getDate() + tripLengthDays - 1)
          const endDateISO = endDateObj.toISOString().split('T')[0]
          isValidStart = endDateISO <= endBound
        }
        
        days.push({
          date,
          dateISO,
          isInBounds,
          isValidStart,
          score: trip.heatmapScores?.[dateISO] || 0
        })
      }
      
      months.push({
        year,
        month,
        monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        days
      })
      
      // Move to next month
      currentMonth = new Date(year, month + 1, 1)
    }
    
    return months
  }, [startBound, endBound, tripLengthDays, trip.heatmapScores])
  
  // Stabilize heat intensity scaling using expected max score
  const activeVoterCount = trip.effectiveActiveVoterCount ?? 1
  const expectedMaxScore = Math.max(3 * activeVoterCount, 1)
  
  // Compute last valid start date (memoized)
  const lastValidStartISO = useMemo(() => {
    const endBoundObj = new Date(endBound + 'T12:00:00')
    const lastValidStartObj = new Date(endBoundObj)
    lastValidStartObj.setDate(lastValidStartObj.getDate() - (tripLengthDays - 1))
    return lastValidStartObj.toISOString().split('T')[0]
  }, [endBound, tripLengthDays])
  
  // Format date for display (D MMM YYYY)
  const formatDisplayDate = (dateISO) => {
    const date = new Date(dateISO + 'T12:00:00')
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  
  const getRankLabel = (rank) => {
    if (rank === 1) return 'Love to go'
    if (rank === 2) return 'Can go'
    if (rank === 3) return 'Might be able'
    return ''
  }
  
  const formatDateRange = (startDateISO) => {
    const start = new Date(startDateISO + 'T12:00:00')
    const end = new Date(start)
    end.setDate(end.getDate() + tripLengthDays - 1)
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Pick Your Top 3 Date Windows
          </CardTitle>
          <CardDescription>
            Pick your top 3 date options. Hover to preview, then click to select.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLocked ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                {(() => {
                  const { startDate, endDate, label } = getTripDisplayDates(trip)
                  return startDate && endDate
                    ? `Dates ${label === 'proposed' ? 'proposed' : 'locked'}: ${formatTripDateRange(startDate, endDate)}`
                    : 'Dates TBD'
                })()}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 space-y-2">
                {datePicks.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Hover over dates to preview, then click to select your first pick.
                  </p>
                ) : (
                  datePicks
                    .sort((a, b) => a.rank - b.rank)
                    .map((pick) => (
                      <div 
                        key={pick.startDateISO} 
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          activeRank === pick.rank 
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' 
                            : 'bg-gray-50 border-gray-200'
                        } ${!isLocked && canParticipate ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                        onClick={() => !isLocked && canParticipate && editPick(pick.rank)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={pick.rank === 1 ? 'default' : pick.rank === 2 ? 'secondary' : 'outline'}>
                              {pick.rank === 1 ? '❤️' : pick.rank === 2 ? '✓' : '~'} {getRankLabel(pick.rank)}
                            </Badge>
                            <span className="font-medium">{formatDateRange(pick.startDateISO)}</span>
                            {activeRank === pick.rank && (
                              <span className="text-xs text-blue-600">(editing)</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            removePick(pick.startDateISO)
                          }}
                          disabled={isLocked || !canParticipate}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                )}
              </div>
              
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-medium">Availability Overview</h3>
                    {trip.pickProgress && (
                      <Badge variant="secondary" className="text-xs">
                        Picks saved: {trip.pickProgress.respondedCount}/{trip.pickProgress.totalCount}
                      </Badge>
                    )}
                  </div>
                  {activeRank && !isLocked && canParticipate && (
                    <Badge variant="outline" className="text-xs">
                      Selecting: {getRankLabel(activeRank)}
                    </Badge>
                  )}
                </div>
                
                {/* Date range info */}
                <div className="mb-3 text-xs text-gray-600 space-y-1">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span>
                      <strong>Date range:</strong> {formatDisplayDate(startBound)} – {formatDisplayDate(endBound)}
                    </span>
                    <span>
                      <strong>Trip length:</strong> {tripLengthDays} day{tripLengthDays !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {trip.pickProgress && trip.pickProgress.respondedCount > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500">Saved by:</span>
                      {(() => {
                        // Map respondedUserIds to names using trip.participants
                        const participantMap = new Map()
                        if (trip.participants) {
                          trip.participants.forEach(p => {
                            participantMap.set(p.id, p.name)
                          })
                        }
                        
                        const displayNames = trip.pickProgress.respondedUserIds
                          .slice(0, 3)
                          .map(userId => participantMap.get(userId) || userId)
                        const remainingCount = trip.pickProgress.respondedUserIds.length - 3
                        
                        return (
                          <>
                            {displayNames.map((name, idx) => (
                              <span key={idx} className="text-gray-700 font-medium">{name}</span>
                            ))}
                            {remainingCount > 0 && (
                              <span className="text-gray-500">+{remainingCount} more</span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                  {trip.pickProgress && trip.pickProgress.respondedCount < trip.pickProgress.totalCount && (
                    <div className="text-xs text-gray-500 italic">
                      Waiting on {trip.pickProgress.totalCount - trip.pickProgress.respondedCount} {trip.pickProgress.totalCount - trip.pickProgress.respondedCount === 1 ? 'person' : 'people'}.
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {calendarMonths.map((monthData) => (
                    <div key={`${monthData.year}-${monthData.month}`} className="space-y-1">
                      <h4 className="text-xs font-semibold text-gray-700 px-1">
                        {monthData.monthName}
                      </h4>
                      <div className="grid grid-cols-7 gap-0.5">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="text-center text-[10px] font-medium text-gray-500 py-0.5">
                            {day.slice(0, 1)}
                          </div>
                        ))}
                        {monthData.days.map((day, idx) => {
                          if (!day) {
                            return <div key={`empty-${idx}`} className="h-9" />
                          }
                          
                          // Determine background color based on bounds and validity
                          let bgColor
                          if (!day.isInBounds) {
                            bgColor = 'bg-transparent'
                          } else if (!day.isValidStart) {
                            bgColor = 'bg-gray-50'
                          } else {
                            // Valid start date - compute heat intensity
                            const intensity = day.score > 0 ? Math.min(day.score / expectedMaxScore, 1) : 0
                            bgColor = intensity > 0.7 ? 'bg-green-600' : intensity > 0.4 ? 'bg-green-400' : intensity > 0 ? 'bg-green-200' : 'bg-gray-100'
                          }
                          const isSelected = datePicks.some(p => p.startDateISO === day.dateISO)
                          const userPick = datePicks.find(p => p.startDateISO === day.dateISO)
                          
                          // Optimize tooltip: compute topCandidate once per cell
                          const topCandidate = trip.topCandidates?.find(c => c.startDateISO === day.dateISO)
                          
                          // Check if this day is in preview window
                          const isInPreviewWindow = getPreviewWindowDates.has(day.dateISO)
                          // Check if this day is in any selected window
                          let isInSelectedWindow = false
                          let selectedWindowRank = null
                          for (const [startDateISO, windowDates] of getSelectedWindowDates.entries()) {
                            if (windowDates.has(day.dateISO)) {
                              isInSelectedWindow = true
                              const pick = datePicks.find(p => p.startDateISO === startDateISO)
                              selectedWindowRank = pick?.rank || null
                              break
                            }
                          }
                          
                          // Determine if this is a valid start date for preview
                          const isValidForPreview = day.isValidStart && activeRank && !isLocked && canParticipate
                          
                          // Days outside bounds should be disabled
                          const isDisabled = !day.isInBounds || !day.isValidStart || isLocked || !canParticipate
                          
                          // Build tooltip string
                          let tooltipText = ''
                          if (day.isValidStart && day.isInBounds) {
                            if (topCandidate) {
                              tooltipText = `${topCandidate.loveCount} love, ${topCandidate.canCount} can, ${topCandidate.mightCount} might`
                            } else if (day.score > 0) {
                              tooltipText = 'Preferred by group'
                            }
                          } else if (!day.isInBounds) {
                            tooltipText = 'Outside date range'
                          } else {
                            tooltipText = 'Invalid start date'
                          }
                          
                          return (
                            <button
                              key={day.dateISO}
                              onClick={() => isValidForPreview && handleDateSelect(day.dateISO)}
                              onMouseEnter={() => isValidForPreview && setHoveredStartDate(day.dateISO)}
                              onMouseLeave={() => setHoveredStartDate(null)}
                              disabled={isDisabled}
                              className={`h-9 w-full rounded text-[11px] font-medium border transition-all relative flex items-center justify-center ${
                                day.isValidStart && day.isInBounds
                                  ? isLocked 
                                    ? 'cursor-not-allowed opacity-50' 
                                    : 'cursor-pointer'
                                  : 'cursor-not-allowed opacity-20'
                              } ${
                                isInPreviewWindow
                                  ? 'ring-2 ring-yellow-400 ring-offset-0 shadow-md z-10'
                                  : isInSelectedWindow
                                  ? 'ring-2 ring-blue-300 ring-offset-0'
                                  : isSelected
                                  ? 'ring-2 ring-blue-500 ring-offset-0'
                                  : ''
                              } ${bgColor} ${bgColor.startsWith('bg-green') ? 'text-white' : 'text-gray-600'}`}
                              title={tooltipText}
                            >
                              {day.date.getDate()}
                              {userPick && (
                                <div className="absolute top-0.5 text-[8px]">
                                  {userPick.rank === 1 ? '❤️' : userPick.rank === 2 ? '✓' : '~'}
                                </div>
                              )}
                              {isInPreviewWindow && (
                                <div className="absolute inset-0 bg-yellow-200 bg-opacity-30 rounded pointer-events-none" />
                              )}
                              {isInSelectedWindow && !isInPreviewWindow && (
                                <div className="absolute inset-0 bg-blue-200 bg-opacity-20 rounded pointer-events-none" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-100 border rounded" />
                    <span>No preference</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-200 rounded" />
                    <span>Low</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-400 rounded" />
                    <span>Medium</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-600 rounded" />
                    <span>High</span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={savePicks}
                  disabled={!canParticipate || savingPicks || datePicks.length === 0}
                  className="flex-1"
                >
                  {!canParticipate ? 'You have left this trip' : savingPicks ? 'Saving...' : 'Save Picks'}
                </Button>
                {datePicks.length > 0 && !isLocked && canParticipate && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDatePicks([])
                      setActiveRank(1)
                    }}
                    disabled={savingPicks}
                    title="Clear all picks and start over"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      
      {trip.topCandidates && trip.topCandidates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Best Date Options</CardTitle>
            <CardDescription>
              Most preferred dates based on everyone's picks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {trip.topCandidates.slice(0, 3).map((candidate, idx) => (
                <div key={candidate.startDateISO} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary">#{idx + 1}</Badge>
                      <span className="font-medium">
                        {formatDateRange(candidate.startDateISO)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {candidate.loveCount} love • {candidate.canCount} can • {candidate.mightCount} might
                    </div>
                  </div>
                  {trip.isCreator && !isLocked && (
                    <Button
                      size="sm"
                      onClick={() => lockWindow(candidate.startDateISO)}
                      disabled={!canParticipate || (trip.isCreator !== true && trip.createdBy !== user?.id)}
                      className="bg-green-600 hover:bg-green-700"
                      title={!trip.isCreator && trip.createdBy !== user?.id ? "Only the trip organizer can lock dates." : undefined}
                    >
                      <Lock className="h-4 w-4 mr-1" />
                      Lock
                    </Button>
                  )}
                  {!trip.isCreator && trip.createdBy !== user?.id && !isLocked && (
                    <Button
                      size="sm"
                      disabled
                      className="bg-gray-300 text-gray-500 cursor-not-allowed"
                      title="Only the trip organizer can lock dates."
                    >
                      <Lock className="h-4 w-4 mr-1" />
                      Lock
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Lock Confirmation Dialog */}
      <AlertDialog open={showLockConfirmation} onOpenChange={setShowLockConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lock dates for everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              This finalizes the trip dates. Once locked, dates cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowLockConfirmation(false)
              setPendingLockDate(null)
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmLockWindow}
              className="bg-green-600 hover:bg-green-700"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Trip Detail View - Command Center V2
function TripDetailView({ trip, token, user, onRefresh }) {
  return (
    <CommandCenterV2
      trip={trip}
      token={token}
      user={user}
      onRefresh={onRefresh}
    />
  )
}

// Main App
// NOTE: /dashboard is the canonical post-login landing page.
// Authenticated users are redirected to /dashboard instead of showing the old Dashboard component.
// EXCEPTION: If a tripId or circleId query param is present, show the old Dashboard to access TripDetailView or CircleDetailView.
export default function App() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, token, loading, login, logout } = useAuth()
  
  // Derive tripId, circleId, returnTo, and view from URL query params reactively
  const tripId = searchParams.get('tripId')
  const circleId = searchParams.get('circleId')
  const returnTo = searchParams.get('returnTo')
  const view = searchParams.get('view')

  // Dev-only navigation tracing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NAV] App component', { 
        pathname, 
        tripId, 
        circleId, 
        returnTo, 
        view, 
        hasUser: !!user, 
        hasToken: !!token,
        loading 
      })
    }
  }, [pathname, tripId, circleId, returnTo, view, user, token, loading])

  // Auth gate: redirect unauthenticated users to login
  // This prevents unauthenticated access to protected routes and ensures logout always lands on login
  useEffect(() => {
    if (!loading && !user && !token) {
      // Only redirect if we're not already on login page (prevent loops)
      const currentPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')
      if (currentPath !== '/' && !currentPath.startsWith('/login')) {
        // User is not authenticated and not on login page - redirect to login with clean URL
        router.replace('/')
      }
    }
  }, [loading, user, token, pathname, router])

  // Redirect authenticated users to /dashboard UNLESS tripId, circleId, or view=discover is present
  // Only redirect if we're on root path with no query params (not already on a protected route)
  useEffect(() => {
    if (!loading && user && token) {
      const currentPath = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')
      // Only redirect to dashboard if we're on root path with no trip/circle/view params
      if (currentPath === '/' && !tripId && !circleId && view !== 'discover') {
        // Clear any stale query params before redirecting to dashboard
        router.replace('/dashboard')
      }
    }
  }, [loading, user, token, router, tripId, circleId, view, pathname])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BrandedSpinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading Trypzy...</p>
        </div>
      </div>
    )
  }

  if (!user || !token) {
    return <AuthPage onLogin={login} />
  }

  // If tripId or circleId is present, show the old Dashboard so users can access TripDetailView or CircleDetailView
  // Also show Dashboard if view=discover is present
  if (tripId || circleId || view === 'discover') {
    return <LegacyDashboard user={user} token={token} tripId={tripId} circleId={circleId} returnTo={returnTo} initialView={view} onLogout={logout} />
  }

  // Show loading state while redirecting (should be brief)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <BrandedSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600">Redirecting to dashboard...</p>
      </div>
    </div>
  )
}
// Legacy Dashboard wrapper that loads a trip or circle when tripId or circleId is provided
// Also handles view=discover query parameter
function LegacyDashboard({ user, token, tripId, circleId, returnTo, initialView, onLogout }) {
  const [initialized, setInitialized] = useState(false)
  
  useEffect(() => {
    if ((tripId || circleId || initialView === 'discover') && !initialized) {
      // The Dashboard component will handle loading the trip or circle or showing discover view
      setInitialized(true)
    }
  }, [tripId, circleId, initialView, initialized])

  return <Dashboard user={user} token={token} onLogout={onLogout} initialTripId={tripId} initialCircleId={circleId} returnTo={returnTo || null} initialView={initialView} />
}
