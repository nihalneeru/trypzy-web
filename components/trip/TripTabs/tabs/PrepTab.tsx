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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Luggage, Plane, Train, Car, Bus, Lock, Sparkles, Check } from 'lucide-react'
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

export function PrepTab({
  trip,
  token,
  user,
  onRefresh
}: any) {
  const [prepData, setPrepData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showTransportDialog, setShowTransportDialog] = useState(false)
  const [showPackingDialog, setShowPackingDialog] = useState(false)
  const [adding, setAdding] = useState(false)
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  
  const [newTransport, setNewTransport] = useState({
    mode: 'other',
    fromLocation: '',
    toLocation: '',
    departAt: '',
    arriveAt: '',
    bookingRef: '',
    provider: '',
    link: '',
    notes: ''
  })
  
  const [newPackingItem, setNewPackingItem] = useState({
    title: '',
    quantity: '',
    notes: ''
  })

  useEffect(() => {
    if (trip?.id && trip.status === 'locked') {
      loadPrepData()
    }
  }, [trip?.id, trip?.status])

  const loadPrepData = async () => {
    if (!trip?.id) return
    
    setLoading(true)
    try {
      const data = await api(`/trips/${trip.id}/prep`, { method: 'GET' }, token)
      setPrepData(data)
    } catch (error) {
      console.error('Failed to load prep data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddTransport = async () => {
    if (!newTransport.fromLocation.trim() || !newTransport.toLocation.trim()) return
    
    setAdding(true)
    try {
      await api(`/trips/${trip.id}/prep/transport`, {
        method: 'POST',
        body: JSON.stringify({
          ...newTransport,
          departAt: newTransport.departAt || null,
          arriveAt: newTransport.arriveAt || null
        })
      }, token)
      
      setShowTransportDialog(false)
      setNewTransport({
        mode: 'other',
        fromLocation: '',
        toLocation: '',
        departAt: '',
        arriveAt: '',
        bookingRef: '',
        provider: '',
        link: '',
        notes: ''
      })
      loadPrepData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to add transport:', error)
      alert(error.message || 'Failed to add transport')
    } finally {
      setAdding(false)
    }
  }

  const handleAddPackingItem = async () => {
    if (!newPackingItem.title.trim()) return
    
    setAdding(true)
    try {
      await api(`/trips/${trip.id}/prep/checklist`, {
        method: 'POST',
        body: JSON.stringify({
          category: 'packing',
          title: newPackingItem.title.trim(),
          quantity: newPackingItem.quantity ? parseInt(newPackingItem.quantity) : null,
          notes: newPackingItem.notes.trim() || null
        })
      }, token)
      
      setShowPackingDialog(false)
      setNewPackingItem({
        title: '',
        quantity: '',
        notes: ''
      })
      loadPrepData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to add packing item:', error)
      alert(error.message || 'Failed to add packing item')
    } finally {
      setAdding(false)
    }
  }

  const handleTogglePackingItem = async (itemId, currentStatus) => {
    try {
      await api(`/trips/${trip.id}/prep/checklist/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: currentStatus === 'done' ? 'todo' : 'done'
        })
      }, token)
      
      loadPrepData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to update packing item:', error)
    }
  }

  const handleGenerateSuggestions = async () => {
    setGeneratingSuggestions(true)
    try {
      await api(`/trips/${trip.id}/prep/suggestions`, {
        method: 'POST'
      }, token)
      
      loadPrepData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to generate suggestions:', error)
      alert(error.message || 'Failed to generate suggestions')
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  const handleMarkComplete = async () => {
    try {
      await api(`/trips/${trip.id}/prep/markComplete`, {
        method: 'POST'
      }, token)
      
      loadPrepData()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to mark prep complete:', error)
      alert(error.message || 'Failed to mark prep complete')
    }
  }

  const getTransportIcon = (mode) => {
    switch (mode) {
      case 'flight': return <Plane className="h-4 w-4" />
      case 'train': return <Train className="h-4 w-4" />
      case 'car': return <Car className="h-4 w-4" />
      case 'bus': return <Bus className="h-4 w-4" />
      default: return <Luggage className="h-4 w-4" />
    }
  }

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return 'TBD'
    try {
      const dt = new Date(dateTimeStr)
      return dt.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    } catch {
      return dateTimeStr
    }
  }

  const isTripLeader = trip?.createdBy === user?.id

  if (trip.status !== 'locked') {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Trip preparation is only available after dates are locked</p>
        </CardContent>
      </Card>
    )
  }

  if (loading || !prepData) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <BrandedSpinner size="md" className="mx-auto mb-4" />
          <p className="text-gray-500">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  const transportItems = prepData.transportItems || []
  const packingItems = prepData.packingItems || []
  const documentItems = prepData.documentItems || []
  const prepStatus = prepData.prepStatus || 'not_started'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Trip Preparation</h2>
          <p className="text-gray-600">Book transport, pack your bags, and get ready</p>
        </div>
        {isTripLeader && prepStatus !== 'complete' && (
          <Button
            variant="outline"
            onClick={handleMarkComplete}
          >
            <Check className="h-4 w-4 mr-2" />
            Mark Prep Complete
          </Button>
        )}
      </div>

      {/* Transport Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transport</CardTitle>
              <CardDescription>Flights, trains, buses, and other transportation</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSuggestions}
                disabled={generatingSuggestions}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {generatingSuggestions ? 'Generating...' : 'Generate Suggestions'}
              </Button>
              <Dialog open={showTransportDialog} onOpenChange={setShowTransportDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Transport
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add Transport</DialogTitle>
                    <DialogDescription>
                      Add a flight, train, bus, or other transportation leg
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select
                        value={newTransport.mode}
                        onValueChange={(value) => setNewTransport({ ...newTransport, mode: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flight">Flight</SelectItem>
                          <SelectItem value="train">Train</SelectItem>
                          <SelectItem value="bus">Bus</SelectItem>
                          <SelectItem value="car">Car Rental</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>From <span className="text-red-500">*</span></Label>
                        <Input
                          value={newTransport.fromLocation}
                          onChange={(e) => setNewTransport({ ...newTransport, fromLocation: e.target.value })}
                          placeholder="City or location"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>To <span className="text-red-500">*</span></Label>
                        <Input
                          value={newTransport.toLocation}
                          onChange={(e) => setNewTransport({ ...newTransport, toLocation: e.target.value })}
                          placeholder="City or location"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Departure (optional)</Label>
                        <Input
                          type="datetime-local"
                          value={newTransport.departAt}
                          onChange={(e) => setNewTransport({ ...newTransport, departAt: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Arrival (optional)</Label>
                        <Input
                          type="datetime-local"
                          value={newTransport.arriveAt}
                          onChange={(e) => setNewTransport({ ...newTransport, arriveAt: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Provider/Carrier (optional)</Label>
                      <Input
                        value={newTransport.provider}
                        onChange={(e) => setNewTransport({ ...newTransport, provider: e.target.value })}
                        placeholder="e.g., United Airlines, Amtrak"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Booking Reference (optional)</Label>
                      <Input
                        value={newTransport.bookingRef}
                        onChange={(e) => setNewTransport({ ...newTransport, bookingRef: e.target.value })}
                        placeholder="Confirmation code"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Link (optional)</Label>
                      <Input
                        value={newTransport.link}
                        onChange={(e) => setNewTransport({ ...newTransport, link: e.target.value })}
                        placeholder="https://..."
                        type="url"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes (optional)</Label>
                      <Textarea
                        value={newTransport.notes}
                        onChange={(e) => setNewTransport({ ...newTransport, notes: e.target.value })}
                        placeholder="Additional details..."
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowTransportDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddTransport}
                      disabled={adding || !newTransport.fromLocation.trim() || !newTransport.toLocation.trim()}
                    >
                      {adding ? 'Adding...' : 'Add Transport'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transportItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No transport items yet</p>
              <p className="text-sm mt-2">Add transport or generate suggestions from your itinerary</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transportItems.map((item) => (
                <Card key={item.id} className={item.status === 'booked' ? 'border-green-500 bg-green-50' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getTransportIcon(item.mode)}
                          <h4 className="font-medium">{item.fromLocation} → {item.toLocation}</h4>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.mode}
                          </Badge>
                          {item.status === 'booked' && (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Booked
                            </Badge>
                          )}
                          {item.status === 'done' && (
                            <Badge variant="default" className="text-xs">
                              Done
                            </Badge>
                          )}
                        </div>
                        {item.departAt && (
                          <p className="text-sm text-gray-600 mb-1">
                            Depart: {formatDateTime(item.departAt)}
                          </p>
                        )}
                        {item.arriveAt && (
                          <p className="text-sm text-gray-600 mb-1">
                            Arrive: {formatDateTime(item.arriveAt)}
                          </p>
                        )}
                        {item.provider && (
                          <p className="text-sm text-gray-600 mb-1">
                            Provider: {item.provider}
                          </p>
                        )}
                        {item.bookingRef && (
                          <p className="text-sm text-gray-600 mb-1">
                            Booking: {item.bookingRef}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-sm text-gray-600 mb-2">{item.notes}</p>
                        )}
                        {item.link && (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            View booking →
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Packing List Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Packing List</CardTitle>
              <CardDescription>Items to pack for your trip</CardDescription>
            </div>
            <Dialog open={showPackingDialog} onOpenChange={setShowPackingDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Add Packing Item</DialogTitle>
                  <DialogDescription>
                    Add an item to your packing list
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Item Name <span className="text-red-500">*</span></Label>
                    <Input
                      value={newPackingItem.title}
                      onChange={(e) => setNewPackingItem({ ...newPackingItem, title: e.target.value })}
                      placeholder="e.g., Passport, Charger, Sunscreen"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity (optional)</Label>
                    <Input
                      type="number"
                      value={newPackingItem.quantity}
                      onChange={(e) => setNewPackingItem({ ...newPackingItem, quantity: e.target.value })}
                      placeholder="Number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      value={newPackingItem.notes}
                      onChange={(e) => setNewPackingItem({ ...newPackingItem, notes: e.target.value })}
                      placeholder="Additional details..."
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowPackingDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddPackingItem}
                    disabled={adding || !newPackingItem.title.trim()}
                  >
                    {adding ? 'Adding...' : 'Add Item'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {packingItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No packing items yet</p>
              <p className="text-sm mt-2">Add items to your packing list</p>
            </div>
          ) : (
            <div className="space-y-2">
              {packingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50"
                >
                  <Checkbox
                    checked={item.status === 'done'}
                    onCheckedChange={() => handleTogglePackingItem(item.id, item.status)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${item.status === 'done' ? 'line-through text-gray-500' : 'font-medium'}`}>
                        {item.title}
                      </span>
                      {item.quantity && (
                        <Badge variant="outline" className="text-xs">
                          Qty: {item.quantity}
                        </Badge>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents Section (Optional) */}
      {documentItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Passport, visa, insurance, and other documents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50"
                >
                  <Checkbox
                    checked={item.status === 'done'}
                    onCheckedChange={() => handleTogglePackingItem(item.id, item.status)}
                  />
                  <div className="flex-1">
                    <span className={`text-sm ${item.status === 'done' ? 'line-through text-gray-500' : 'font-medium'}`}>
                      {item.title}
                    </span>
                    {item.notes && (
                      <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
