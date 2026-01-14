'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Plus, Home, ExternalLink, Check, Lock } from 'lucide-react'
import { buildAirbnbSearchUrl } from '@/lib/accommodations/buildAirbnbSearchUrl'
import { BrandedSpinner } from '@/app/HomeClient'

// API Helper (local to this component)
const api = async (endpoint, options = {}, token = null) => {
  const headers = {}
  
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

export function AccommodationTab({
  trip,
  token,
  user,
  onRefresh
}: any) {
  const [stays, setStays] = useState([])
  const [accommodations, setAccommodations] = useState([])
  const [selectedStayId, setSelectedStayId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [adding, setAdding] = useState(false)
  
  const [newAccommodation, setNewAccommodation] = useState({
    stayRequirementId: null,
    source: 'AIRBNB',
    title: '',
    url: '',
    priceRange: '',
    sleepCapacity: '',
    notes: ''
  })

  // Load stays and accommodations
  useEffect(() => {
    if (trip?.id && trip.status === 'locked') {
      loadData()
    }
  }, [trip?.id, trip?.status])

  const loadData = async () => {
    if (!trip?.id) return
    
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
    } finally {
      setLoading(false)
    }
  }

  const handleAddAccommodation = async () => {
    if (!newAccommodation.title.trim()) return
    
    setAdding(true)
    try {
      await api(`/trips/${trip.id}/accommodations`, {
        method: 'POST',
        body: JSON.stringify({
          ...newAccommodation,
          stayRequirementId: selectedStayId || newAccommodation.stayRequirementId || null,
          sleepCapacity: newAccommodation.sleepCapacity ? parseInt(newAccommodation.sleepCapacity) : null
        })
      }, token)
      
      setShowAddDialog(false)
      setNewAccommodation({
        stayRequirementId: null,
        source: 'AIRBNB',
        title: '',
        url: '',
        priceRange: '',
        sleepCapacity: '',
        notes: ''
      })
      loadData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to add accommodation:', error)
      alert(error.message || 'Failed to add accommodation')
    } finally {
      setAdding(false)
    }
  }

  const handleSelectAccommodation = async (optionId) => {
    try {
      await api(`/trips/${trip.id}/accommodations/${optionId}/select`, {
        method: 'POST'
      }, token)
      
      loadData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to select accommodation:', error)
      alert(error.message || 'Failed to select accommodation')
    }
  }

  const formatDateRange = (startDate, endDate) => {
    if (!startDate) return 'Dates TBD'
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : null
    
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (!end) return startStr
    
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${startStr} - ${endStr}`
  }

  const isTripLeader = trip?.createdBy === user?.id

  if (trip.status !== 'locked') {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Accommodation planning is only available after dates are locked</p>
        </CardContent>
      </Card>
    )
  }

  const selectedStay = stays.find(s => s.id === selectedStayId)
  const stayAccommodations = selectedStayId
    ? accommodations.filter(a => a.stayRequirementId === selectedStayId)
    : accommodations.filter(a => !a.stayRequirementId)

  const selectedAccommodation = stayAccommodations.find(a => a.status === 'selected')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Accommodation</h2>
        <p className="text-gray-600">Find and choose where to stay for your trip</p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="text-center py-12">
            <BrandedSpinner size="md" className="mx-auto mb-4" />
            <p className="text-gray-500">Loading...</p>
          </CardContent>
        </Card>
      ) : stays.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Home className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 mb-2">No stay segments yet</p>
            <p className="text-sm text-gray-400">
              Generate an itinerary to automatically create accommodation needs
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Stay Segments */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Stay Segments</CardTitle>
                <CardDescription>Accommodation needed by location</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {stays.map((stay) => {
                    const isSelected = stay.id === selectedStayId
                    const stayOptions = accommodations.filter(a => a.stayRequirementId === stay.id)
                    const hasSelected = stayOptions.some(a => a.status === 'selected')
                    const isOutdated = stay.status === 'outdated'
                    
                    return (
                      <div
                        key={stay.id}
                        onClick={() => setSelectedStayId(stay.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-sm">{stay.locationName}</h4>
                              {isOutdated && (
                                <Badge variant="outline" className="text-xs">Outdated</Badge>
                              )}
                              {hasSelected && (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  <Check className="h-3 w-3 mr-1" />
                                  Covered
                                </Badge>
                              )}
                              {!hasSelected && stay.status === 'pending' && (
                                <Badge variant="secondary" className="text-xs">Pending</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-600">
                              {formatDateRange(stay.startDate, stay.endDate)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {stay.nights} night{stay.nights !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Options for Selected Stay */}
          <div className="lg:col-span-2 space-y-6">
            {selectedStay ? (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Options for {selectedStay.locationName}</CardTitle>
                        <CardDescription>
                          {formatDateRange(selectedStay.startDate, selectedStay.endDate)} • {selectedStay.nights} night{selectedStay.nights !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {selectedStay.startDate && selectedStay.endDate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const url = buildAirbnbSearchUrl({
                                locationName: selectedStay.locationName,
                                startDate: selectedStay.startDate,
                                endDate: selectedStay.endDate
                              })
                              window.open(url, '_blank')
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Search on Airbnb
                          </Button>
                        )}
                        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm">
                              <Plus className="h-4 w-4 mr-2" />
                              Add Option
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Add Accommodation Option</DialogTitle>
                              <DialogDescription>
                                Share an accommodation option for this stay segment
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Source</Label>
                                <Select
                                  value={newAccommodation.source}
                                  onValueChange={(value) => setNewAccommodation({ ...newAccommodation, source: value })}
                                >
                                  <SelectTrigger>
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
                              <div className="space-y-2">
                                <Label>Title <span className="text-red-500">*</span></Label>
                                <Input
                                  value={newAccommodation.title}
                                  onChange={(e) => setNewAccommodation({ ...newAccommodation, title: e.target.value })}
                                  placeholder="e.g., Cozy apartment in city center"
                                />
                              </div>
                              {newAccommodation.source !== 'MANUAL' && (
                                <div className="space-y-2">
                                  <Label>URL <span className="text-red-500">*</span></Label>
                                  <Input
                                    value={newAccommodation.url}
                                    onChange={(e) => setNewAccommodation({ ...newAccommodation, url: e.target.value })}
                                    placeholder="https://..."
                                    type="url"
                                  />
                                </div>
                              )}
                              <div className="space-y-2">
                                <Label>Price Range (optional)</Label>
                                <Input
                                  value={newAccommodation.priceRange}
                                  onChange={(e) => setNewAccommodation({ ...newAccommodation, priceRange: e.target.value })}
                                  placeholder="e.g., $100-150/night"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Sleep Capacity (optional)</Label>
                                <Input
                                  value={newAccommodation.sleepCapacity}
                                  onChange={(e) => setNewAccommodation({ ...newAccommodation, sleepCapacity: e.target.value })}
                                  placeholder="Number of guests"
                                  type="number"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Notes (optional)</Label>
                                <Textarea
                                  value={newAccommodation.notes}
                                  onChange={(e) => setNewAccommodation({ ...newAccommodation, notes: e.target.value })}
                                  placeholder="Additional details..."
                                  rows={3}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleAddAccommodation}
                                disabled={adding || !newAccommodation.title.trim() || (newAccommodation.source !== 'MANUAL' && !newAccommodation.url.trim())}
                              >
                                {adding ? 'Adding...' : 'Add Option'}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stayAccommodations.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <p>No accommodation options yet</p>
                        <p className="text-sm mt-2">Add an option to get started</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {stayAccommodations.map((option) => (
                          <Card
                            key={option.id}
                            className={option.status === 'selected' ? 'border-green-500 bg-green-50' : ''}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-medium">{option.title}</h4>
                                    {option.status === 'selected' && (
                                      <Badge variant="default" className="bg-green-600">
                                        <Check className="h-3 w-3 mr-1" />
                                        Selected
                                      </Badge>
                                    )}
                                    <Badge variant="outline" className="text-xs">
                                      {option.source}
                                    </Badge>
                                  </div>
                                  {option.addedBy && (
                                    <p className="text-xs text-gray-500 mb-2">
                                      Added by {option.addedBy.name}
                                    </p>
                                  )}
                                  {option.priceRange && (
                                    <p className="text-sm text-gray-600 mb-1">
                                      💰 {option.priceRange}
                                    </p>
                                  )}
                                  {option.sleepCapacity && (
                                    <p className="text-sm text-gray-600 mb-1">
                                      👥 Sleeps {option.sleepCapacity}
                                    </p>
                                  )}
                                  {option.notes && (
                                    <p className="text-sm text-gray-600 mb-2">{option.notes}</p>
                                  )}
                                  {option.url && (
                                    <a
                                      href={option.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      View listing
                                    </a>
                                  )}
                                </div>
                                {isTripLeader && option.status !== 'selected' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSelectAccommodation(option.id)}
                                  >
                                    Select
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Selected Accommodation Summary */}
                {selectedAccommodation && (
                  <Card className="border-green-500">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Check className="h-5 w-5 text-green-600" />
                        Chosen Accommodation
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div>
                        <h4 className="font-medium mb-2">{selectedAccommodation.title}</h4>
                        {selectedAccommodation.addedBy && (
                          <p className="text-sm text-gray-600 mb-2">
                            Added by {selectedAccommodation.addedBy.name}
                          </p>
                        )}
                        {selectedAccommodation.url && (
                          <a
                            href={selectedAccommodation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View listing
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="text-center py-12 text-gray-500">
                  <p>Select a stay segment to view options</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
