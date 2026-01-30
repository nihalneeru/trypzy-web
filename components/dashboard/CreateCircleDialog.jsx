'use client'

import { useState } from 'react'
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

/**
 * Create Circle Dialog Component
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Function} props.onSuccess - Callback when circle is created successfully (receives circle data)
 * @param {string} props.token - Auth token
 */
export function CreateCircleDialog({ open, onOpenChange, onSuccess, token }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    
    try {
      const response = await fetch('/api/circles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create circle')
      }
      
      toast.success('Circle created!')
      setName('')
      setDescription('')
      onOpenChange(false)
      // Pass circle data to onSuccess callback (for onboarding interstitial)
      if (onSuccess) {
        onSuccess(data)
      }
    } catch (error) {
      console.error('Create circle error:', error)
      toast.error(error.message || 'Could not create circle — please try again')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Circle</DialogTitle>
          <DialogDescription>Start a new group for trip planning</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Circle Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="College Friends"
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Our adventure crew"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Creating...' : 'Create Circle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
