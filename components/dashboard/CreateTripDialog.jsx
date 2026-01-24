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
    duration: 3
  })
  const [showOptionalDates, setShowOptionalDates] = useState(false)
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
        duration: 3
      })
      setShowOptionalDates(false)
    }
  }, [open])

  const handleCreate = async () => {
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
      const response = await fetch('/api/trips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...tripForm, circleId })
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
