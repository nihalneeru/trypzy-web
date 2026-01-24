'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Create Trip Dialog Component
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Function} props.onSuccess - Callback when trip is created successfully
 * @param {string} props.circleId - Circle ID for the trip
 * @param {string} props.token - Auth token
 */
export function CreateTripDialog({ open, onOpenChange, onSuccess, circleId, token }) {
  const [tripForm, setTripForm] = useState({
    name: '',
    description: '',
    type: 'collaborative',
    startDate: '',
    endDate: '',
    duration: ''
  })
  const [creating, setCreating] = useState(false)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTripForm({
        name: '',
        description: '',
        type: 'collaborative',
        startDate: '',
        endDate: '',
        duration: ''
      })
    }
  }, [open])

  const handleCreate = async () => {
    // Validate: name is always required
    if (!tripForm.name) {
      toast.error('Please enter a trip name')
      return
    }

    // Hosted trips require dates; collaborative trips dates are optional
    if (tripForm.type === 'hosted' && (!tripForm.startDate || !tripForm.endDate)) {
      toast.error('Hosted trips require start and end dates')
      return
    }

    setCreating(true)

    try {
      // For collaborative trips, only include dates if both are provided
      const payload = { ...tripForm, circleId }
      if (tripForm.type === 'collaborative' && (!tripForm.startDate || !tripForm.endDate)) {
        delete payload.startDate
        delete payload.endDate
      }
      if (!tripForm.duration) {
        delete payload.duration
      }

      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create trip')
      }
      
      toast.success('Trip created!')
      onOpenChange(false)
      if (onSuccess) {
        onSuccess(data)
      }
    } catch (error) {
      console.error('Create trip error:', error)
      toast.error(error.message || 'Failed to create trip')
    } finally {
      setCreating(false)
    }
  }

  if (!circleId) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          {tripForm.type === 'collaborative' && (
            <div className="space-y-2">
              <Label>
                Roughly how long are you imagining this trip?
                <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
              </Label>
              <p className="text-xs text-gray-500">
                Just a starting point—your group can adjust this later.
              </p>
              <Select
                value={tripForm.duration ? tripForm.duration.toString() : ''}
                onValueChange={(v) => setTripForm({ ...tripForm, duration: v ? parseInt(v) : '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No preference</SelectItem>
                  {[2, 3, 4, 5, 6, 7].map((d) => (
                    <SelectItem key={d} value={d.toString()}>{d} days</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>
              {tripForm.type === 'hosted' ? 'Trip Dates' : 'Planning Window'}
              {tripForm.type === 'collaborative' && (
                <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
              )}
            </Label>
            <p className="text-xs text-gray-500">
              {tripForm.type === 'hosted'
                ? 'Set the fixed dates for your trip. Participants join if they can make it.'
                : 'Optionally set a date range. Your group can suggest windows and finalize dates later.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tripForm.type === 'hosted' ? 'Start date' : 'Earliest possible date'}</Label>
                <Input
                  type="date"
                  value={tripForm.startDate}
                  onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                  required={tripForm.type === 'hosted'}
                />
              </div>
              <div className="space-y-2">
                <Label>{tripForm.type === 'hosted' ? 'End date' : 'Latest possible date'}</Label>
                <Input
                  type="date"
                  value={tripForm.endDate}
                  onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                  required={tripForm.type === 'hosted'}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating...' : 'Create Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
