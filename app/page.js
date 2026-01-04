'use client'

import { useState, useEffect } from 'react'
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
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import { 
  Users, Plus, LogOut, MapPin, Calendar as CalendarIcon, 
  MessageCircle, Check, X, HelpCircle, Vote, Lock, UserPlus,
  ChevronLeft, Send, Compass, ArrowRight
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
    'Content-Type': 'application/json',
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

// Main Dashboard Component
function Dashboard({ user, token, onLogout }) {
  const [circles, setCircles] = useState([])
  const [selectedCircle, setSelectedCircle] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('circles') // circles, circle, trip

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
              {view !== 'circles' && (
                <Button variant="ghost" size="icon" onClick={goBack}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Compass className="h-6 w-6 text-indigo-600" />
                <span className="font-semibold text-xl">Trypzy</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Hi, {user.name}</span>
              <Button variant="ghost" size="icon" onClick={onLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
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

  // Load messages
  const loadMessages = async () => {
    try {
      const data = await api(`/circles/${circle.id}/messages`, { method: 'GET' }, token)
      setMessages(data)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    if (activeTab === 'chat') {
      loadMessages()
      const interval = setInterval(loadMessages, 5000)
      return () => clearInterval(interval)
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
                      <Button variant="ghost">
                        <ArrowRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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
    </div>
  )
}

// Trip Detail View
function TripDetailView({ trip, token, user, onRefresh }) {
  const [activeTab, setActiveTab] = useState('planning')
  const [availability, setAvailability] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedVote, setSelectedVote] = useState(trip.userVote?.optionKey || '')
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

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

  useEffect(() => {
    if (activeTab === 'chat') {
      loadMessages()
      const interval = setInterval(loadMessages, 5000)
      return () => clearInterval(interval)
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

  const saveAvailability = async () => {
    setSaving(true)
    try {
      const availabilities = Object.entries(availability).map(([day, status]) => ({ day, status }))
      await api(`/trips/${trip.id}/availability`, {
        method: 'POST',
        body: JSON.stringify({ availabilities })
      }, token)
      
      toast.success('Availability saved!')
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

  const lockTrip = async (optionKey) => {
    try {
      await api(`/trips/${trip.id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ optionKey })
      }, token)
      
      toast.success('Trip dates locked!')
      onRefresh()
    } catch (error) {
      toast.error(error.message)
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

  const getStatusBadge = () => {
    switch (trip.status) {
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

  // Calculate vote counts
  const getVoteCounts = () => {
    const counts = {}
    trip.votes?.forEach((v) => {
      counts[v.optionKey] = (counts[v.optionKey] || 0) + 1
    })
    return counts
  }

  const voteCounts = getVoteCounts()

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
          <span>{trip.circle?.name}</span>
        </div>
        <div className="flex items-center gap-4 mb-4">
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
            <div className="flex items-center gap-2">
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

      {/* Hosted Trip Actions */}
      {trip.type === 'hosted' && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
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

      {/* Tabs for Collaborative Trips */}
      {trip.type === 'collaborative' && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="planning">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Planning
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessageCircle className="h-4 w-4 mr-2" />
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="planning">
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
                      Mark your availability for each day in the trip range
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dates.map((date) => (
                        <div key={date} className="flex items-center gap-4 py-2 border-b last:border-0">
                          <span className="w-32 font-medium">
                            {new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                          <div className="flex gap-2">
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
                    <div className="mt-6 flex gap-4">
                      <Button onClick={saveAvailability} disabled={saving}>
                        {saving ? 'Saving...' : 'Save Availability'}
                      </Button>
                      {trip.isCreator && (
                        <Button variant="outline" onClick={openVoting}>
                          <Vote className="h-4 w-4 mr-2" />
                          Open Voting
                        </Button>
                      )}
                    </div>
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
                      Choose one of the top options based on group availability
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
                    <div className="mt-6 flex gap-4">
                      <Button onClick={submitVote} disabled={!selectedVote}>
                        {trip.userVote ? 'Update Vote' : 'Submit Vote'}
                      </Button>
                      {trip.canLock && selectedVote && (
                        <Button variant="outline" onClick={() => lockTrip(selectedVote)}>
                          <Lock className="h-4 w-4 mr-2" />
                          Lock Selected Dates
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
          </TabsContent>

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
      )}

      {/* Chat for Hosted Trips */}
      {trip.type === 'hosted' && (
        <Card className="h-[500px] flex flex-col mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Trip Chat</CardTitle>
            <CardDescription>Discuss trip details with participants</CardDescription>
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
      )}
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
