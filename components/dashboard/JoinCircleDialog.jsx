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

/**
 * Join Circle Dialog Component
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Function} props.onSuccess - Callback when circle is joined successfully
 * @param {string} props.token - Auth token
 */
export function JoinCircleDialog({ open, onOpenChange, onSuccess, token }) {
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)

  const handleJoin = async () => {
    if (!inviteCode.trim()) return
    setJoining(true)
    
    try {
      const response = await fetch('/api/circles/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to join circle')
      }
      
      toast.success('Joined circle!')
      setInviteCode('')
      onOpenChange(false)
      if (onSuccess) {
        onSuccess(data)
      }
    } catch (error) {
      toast.error(error.message || "Couldn't join circle — please try again")
    } finally {
      setJoining(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <p className="text-xs text-brand-carbon/60">
              Ask the person who invited you for their circle's invite code or link.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleJoin} disabled={joining || !inviteCode.trim()}>
            {joining ? 'Joining...' : 'Join Circle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
