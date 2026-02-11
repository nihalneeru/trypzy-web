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
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TripFormFields } from './TripFormFields'

/**
 * Create Trip Dialog Component
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Function} props.onSuccess - Callback when trip is created successfully
 * @param {string} props.circleId - Circle ID for the trip
 * @param {string} props.token - Auth token
 * @param {string} props.currentUserId - Current user's ID (to exclude from invite list)
 */
export function CreateTripDialog({ open, onOpenChange, onSuccess, circleId, token, currentUserId }) {
  const [tripForm, setTripForm] = useState({
    name: '',
    description: '',
    type: 'collaborative',
    startDate: '',
    endDate: '',
    duration: '',
    destinationHint: ''
  })
  const [creating, setCreating] = useState(false)
  const [circleMembers, setCircleMembers] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [selectedInvites, setSelectedInvites] = useState([])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTripForm({
        name: '',
        description: '',
        type: 'collaborative',
        startDate: '',
        endDate: '',
        duration: '',
        destinationHint: ''
      })
      setSelectedInvites([])
    }
  }, [open])

  // Fetch circle members when dialog opens
  useEffect(() => {
    if (open && circleId && token) {
      fetchCircleMembers()
    }
  }, [open, circleId, token])

  const fetchCircleMembers = async () => {
    setLoadingMembers(true)
    try {
      const response = await fetch(`/api/circles/${circleId}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        // Filter out current user from the list
        const otherMembers = (data || []).filter(m => m.userId !== currentUserId)
        setCircleMembers(otherMembers)
      }
    } catch (error) {
      console.error('Failed to fetch circle members:', error)
    } finally {
      setLoadingMembers(false)
    }
  }

  const toggleInvite = (userId) => {
    setSelectedInvites(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const selectAllMembers = () => {
    setSelectedInvites(circleMembers.map(m => m.userId))
  }

  const deselectAllMembers = () => {
    setSelectedInvites([])
  }

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
      // For hosted trips, include invited user IDs
      if (tripForm.type === 'hosted' && selectedInvites.length > 0) {
        payload.invitedUserIds = selectedInvites
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
      toast.error(error.message || 'Could not create trip — please try again')
    } finally {
      setCreating(false)
    }
  }

  if (!circleId) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create a Trip</DialogTitle>
          <DialogDescription>Plan a new adventure with your circle</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          <TripFormFields tripForm={tripForm} onChange={setTripForm} />
          {/* Invite circle members (hosted trips only) */}
          {tripForm.type === 'hosted' && (
            <div className="space-y-2">
              <Label>
                Invite Travelers
                <span className="text-xs font-normal text-gray-500 ml-1">(optional)</span>
              </Label>
              <p className="text-xs text-gray-500">
                Select circle members to invite. They can accept or decline the invitation.
              </p>
              {loadingMembers ? (
                <p className="text-sm text-gray-500">Loading members...</p>
              ) : circleMembers.length === 0 ? (
                <p className="text-sm text-gray-500">No other members in this circle yet.</p>
              ) : (
                <div className="border rounded-md">
                  <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                    <span className="text-xs text-gray-600">
                      {selectedInvites.length} of {circleMembers.length} selected
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={selectAllMembers}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={deselectAllMembers}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[120px]">
                    <div className="p-2 space-y-1">
                      {circleMembers.map((member) => (
                        <label
                          key={member.userId}
                          className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedInvites.includes(member.userId)}
                            onCheckedChange={() => toggleInvite(member.userId)}
                          />
                          <span className="text-sm">{member.userName || member.name || 'Unknown'}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
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
