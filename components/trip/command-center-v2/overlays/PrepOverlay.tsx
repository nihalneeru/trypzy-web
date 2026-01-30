'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Plus,
  Luggage,
  Plane,
  Train,
  Car,
  Bus,
  Lock,
  Sparkles,
  Check,
  Package,
  ExternalLink,
  Trash2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { toast } from 'sonner'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'

interface PrepOverlayProps {
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

export function PrepOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: PrepOverlayProps) {
  const [prepData, setPrepData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTransportForm, setShowTransportForm] = useState(false)
  const [showPackingForm, setShowPackingForm] = useState(false)
  const [showAdvancedTransport, setShowAdvancedTransport] = useState(false)
  const [adding, setAdding] = useState(false)
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false)
  const [markingComplete, setMarkingComplete] = useState(false)
  const [deletingTransport, setDeletingTransport] = useState<string | null>(null)
  const [deletingChecklist, setDeletingChecklist] = useState<string | null>(null)

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

  const isTripLeader = trip?.createdBy === user?.id
  const isReadOnly = !trip?.viewer?.isActiveParticipant || trip?.viewer?.participantStatus === 'left' || trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'

  useEffect(() => {
    if (trip?.id && trip.status === 'locked') {
      loadPrepData()
    } else {
      setLoading(false)
    }
  }, [trip?.id, trip?.status])

  const loadPrepData = async () => {
    if (!trip?.id) return

    setLoading(true)
    try {
      const data = await api(`/trips/${trip.id}/prep`, { method: 'GET' }, token)
      setPrepData(data)
      setError(null)
    } catch (err: any) {
      console.error('Failed to load prep data:', err)
      setError(err.message || 'Failed to load prep data')
    } finally {
      setLoading(false)
    }
  }

  const resetTransportForm = () => {
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
    setShowAdvancedTransport(false)
  }

  const handleAddTransport = async () => {
    if (isReadOnly) return
    if (!newTransport.fromLocation.trim() || !newTransport.toLocation.trim()) {
      toast.error('Please fill in from and to locations')
      return
    }

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

      toast.success('Transport added')
      setShowTransportForm(false)
      resetTransportForm()
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not add transport — please try again')
    } finally {
      setAdding(false)
    }
  }

  const handleAddPackingItem = async () => {
    if (!newPackingItem.title.trim()) {
      toast.error('Please enter an item name')
      return
    }

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

      toast.success('Item added to packing list')
      setShowPackingForm(false)
      setNewPackingItem({
        title: '',
        quantity: '',
        notes: ''
      })
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not add item — please try again')
    } finally {
      setAdding(false)
    }
  }

  const handleTogglePackingItem = async (itemId: string, currentStatus: string) => {
    if (isReadOnly) return

    try {
      await api(`/trips/${trip.id}/prep/checklist/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: currentStatus === 'done' ? 'todo' : 'done'
        })
      }, token)

      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not update item — please try again')
    }
  }

  const handleGenerateSuggestions = async () => {
    if (isReadOnly) return

    setGeneratingSuggestions(true)
    try {
      await api(`/trips/${trip.id}/prep/suggestions`, {
        method: 'POST'
      }, token)

      toast.success('Suggestions generated')
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate suggestions')
    } finally {
      setGeneratingSuggestions(false)
    }
  }

  const handleMarkComplete = async () => {
    if (!isTripLeader) return

    setMarkingComplete(true)
    try {
      await api(`/trips/${trip.id}/prep/markComplete`, {
        method: 'POST'
      }, token)

      toast.success('Prep marked as complete')
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark prep complete')
    } finally {
      setMarkingComplete(false)
    }
  }

  const handleDeleteTransport = async (transportId: string) => {
    if (isReadOnly) return

    setDeletingTransport(transportId)
    try {
      await api(`/trips/${trip.id}/prep/transport/${transportId}`, {
        method: 'DELETE'
      }, token)

      toast.success('Transport deleted')
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not delete transport — please try again')
    } finally {
      setDeletingTransport(null)
    }
  }

  const handleDeleteChecklist = async (itemId: string) => {
    if (isReadOnly) return

    setDeletingChecklist(itemId)
    try {
      await api(`/trips/${trip.id}/prep/checklist/${itemId}`, {
        method: 'DELETE'
      }, token)

      toast.success('Item deleted')
      loadPrepData()
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not delete item — please try again')
    } finally {
      setDeletingChecklist(null)
    }
  }

  // Check if user can delete an item (owner or leader)
  const canDeleteItem = (ownerUserId: string) => {
    return !isReadOnly && (ownerUserId === user?.id || isTripLeader)
  }

  const getTransportIcon = (mode: string) => {
    switch (mode) {
      case 'flight': return <Plane className="h-4 w-4" />
      case 'train': return <Train className="h-4 w-4" />
      case 'car': return <Car className="h-4 w-4" />
      case 'bus': return <Bus className="h-4 w-4" />
      default: return <Luggage className="h-4 w-4" />
    }
  }

  const formatDateTime = (dateTimeStr: string) => {
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

  // Show locked state for trips that haven't locked dates
  if (trip.status !== 'locked') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Prep Not Available</h3>
        <p className="text-gray-500">Trip preparation is only available after dates are locked.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BrandedSpinner size="md" className="mb-4" />
        <p className="text-gray-500">Loading prep data...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null)
            loadPrepData()
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  const transportItems = prepData?.transportItems || []
  const packingItems = prepData?.packingItems || []
  const prepStatus = prepData?.prepStatus || 'not_started'

  return (
    <div className="space-y-6 p-4">
      {/* Header with Mark Complete */}
      {isTripLeader && prepStatus !== 'complete' && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkComplete}
            disabled={markingComplete}
          >
            <Check className="h-4 w-4 mr-2" />
            {markingComplete ? 'Marking...' : 'Mark Prep Complete'}
          </Button>
        </div>
      )}

      {prepStatus === 'complete' && (
        <div className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg">
          <Check className="h-5 w-5" />
          <span className="font-medium">Prep completed</span>
        </div>
      )}

      {/* Transport Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Transport
          </h3>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGenerateSuggestions}
              disabled={generatingSuggestions || isReadOnly}
              className="h-8 text-xs"
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {generatingSuggestions ? 'Generating...' : 'AI Suggest'}
            </Button>
            {!showTransportForm && (
              <Button
                size="sm"
                onClick={() => setShowTransportForm(true)}
                disabled={isReadOnly}
                className="h-8"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </div>
        </div>

        {/* Inline Transport Form */}
        {showTransportForm && (
          <Card className="mb-4 border-brand-blue">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-brand-carbon">Add Transport</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowTransportForm(false)
                    resetTransportForm()
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={newTransport.mode}
                  onValueChange={(value) => setNewTransport({ ...newTransport, mode: value })}
                >
                  <SelectTrigger className="h-9">
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From *</Label>
                  <Input
                    value={newTransport.fromLocation}
                    onChange={(e) => setNewTransport({ ...newTransport, fromLocation: e.target.value })}
                    placeholder="e.g., NYC"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To *</Label>
                  <Input
                    value={newTransport.toLocation}
                    onChange={(e) => setNewTransport({ ...newTransport, toLocation: e.target.value })}
                    placeholder="e.g., Paris"
                    className="h-9"
                  />
                </div>
              </div>

              {/* Advanced fields toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedTransport(!showAdvancedTransport)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                {showAdvancedTransport ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showAdvancedTransport ? 'Less details' : 'More details (optional)'}
              </button>

              {showAdvancedTransport && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Departure</Label>
                      <Input
                        type="datetime-local"
                        value={newTransport.departAt}
                        onChange={(e) => setNewTransport({ ...newTransport, departAt: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Arrival</Label>
                      <Input
                        type="datetime-local"
                        value={newTransport.arriveAt}
                        onChange={(e) => setNewTransport({ ...newTransport, arriveAt: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Provider/Carrier</Label>
                    <Input
                      value={newTransport.provider}
                      onChange={(e) => setNewTransport({ ...newTransport, provider: e.target.value })}
                      placeholder="e.g., United Airlines"
                      className="h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Booking Reference</Label>
                      <Input
                        value={newTransport.bookingRef}
                        onChange={(e) => setNewTransport({ ...newTransport, bookingRef: e.target.value })}
                        placeholder="Confirmation code"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Booking Link</Label>
                      <Input
                        value={newTransport.link}
                        onChange={(e) => setNewTransport({ ...newTransport, link: e.target.value })}
                        placeholder="https://..."
                        type="url"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      value={newTransport.notes}
                      onChange={(e) => setNewTransport({ ...newTransport, notes: e.target.value })}
                      placeholder="Additional details..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowTransportForm(false)
                    resetTransportForm()
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddTransport}
                  disabled={adding || !newTransport.fromLocation.trim() || !newTransport.toLocation.trim()}
                  className="flex-1"
                >
                  {adding ? 'Adding...' : 'Add Transport'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {transportItems.length === 0 && !showTransportForm ? (
          <Card>
            <CardContent className="py-6 text-center">
              <Plane className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No transport items yet</p>
              <p className="text-xs text-gray-500 mt-1">Add transport or generate suggestions</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {transportItems.map((item: any) => (
              <Card key={item.id} className={item.status === 'booked' ? 'border-green-300 bg-green-50' : ''}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getTransportIcon(item.mode)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {item.fromLocation} → {item.toLocation}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {item.mode}
                        </Badge>
                        {item.status === 'booked' && (
                          <Badge className="bg-green-600 text-xs text-white">
                            <Check className="h-3 w-3 mr-1" />
                            Booked
                          </Badge>
                        )}
                      </div>
                      {item.departAt && (
                        <p className="text-xs text-gray-600 mt-1">
                          Depart: {formatDateTime(item.departAt)}
                        </p>
                      )}
                      {item.provider && (
                        <p className="text-xs text-gray-600">
                          {item.provider}
                        </p>
                      )}
                      {item.bookingRef && (
                        <p className="text-xs text-gray-500">
                          Ref: {item.bookingRef}
                        </p>
                      )}
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-blue hover:underline flex items-center gap-1 mt-1"
                        >
                          View booking
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {canDeleteItem(item.ownerUserId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => handleDeleteTransport(item.id)}
                        disabled={deletingTransport === item.id}
                        aria-label="Delete transport"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Packing List Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Packing List
          </h3>
          {!showPackingForm && (
            <Button
              size="sm"
              onClick={() => setShowPackingForm(true)}
              disabled={isReadOnly}
              className="h-8"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Item
            </Button>
          )}
        </div>

        {/* Inline Packing Form */}
        {showPackingForm && (
          <Card className="mb-4 border-brand-blue">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-brand-carbon">Add Packing Item</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPackingForm(false)
                    setNewPackingItem({ title: '', quantity: '', notes: '' })
                  }}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Item Name *</Label>
                <Input
                  value={newPackingItem.title}
                  onChange={(e) => setNewPackingItem({ ...newPackingItem, title: e.target.value })}
                  placeholder="e.g., Passport, Charger, Sunscreen"
                  className="h-9"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newPackingItem.title.trim() && !adding) {
                      handleAddPackingItem()
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newPackingItem.quantity}
                    onChange={(e) => setNewPackingItem({ ...newPackingItem, quantity: e.target.value })}
                    placeholder="Number"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={newPackingItem.notes}
                    onChange={(e) => setNewPackingItem({ ...newPackingItem, notes: e.target.value })}
                    placeholder="Optional"
                    className="h-9"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowPackingForm(false)
                    setNewPackingItem({ title: '', quantity: '', notes: '' })
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleAddPackingItem}
                  disabled={adding || !newPackingItem.title.trim()}
                  className="flex-1"
                >
                  {adding ? 'Adding...' : 'Add Item'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {packingItems.length === 0 && !showPackingForm ? (
          <Card>
            <CardContent className="py-6 text-center">
              <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No packing items yet</p>
              <p className="text-xs text-gray-500 mt-1">Add items to your packing list</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1">
            {packingItems.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50"
              >
                <Checkbox
                  checked={item.status === 'done'}
                  onCheckedChange={() => handleTogglePackingItem(item.id, item.status)}
                  disabled={isReadOnly}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${item.status === 'done' ? 'line-through text-gray-500' : 'font-medium'}`}>
                      {item.title}
                    </span>
                    {item.quantity && (
                      <Badge variant="outline" className="text-xs">
                        x{item.quantity}
                      </Badge>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>
                  )}
                </div>
                {canDeleteItem(item.ownerUserId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => handleDeleteChecklist(item.id)}
                    disabled={deletingChecklist === item.id}
                    aria-label="Delete checklist item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
