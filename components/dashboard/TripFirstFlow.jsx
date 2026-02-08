'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { TripFormFields } from './TripFormFields'
import { InviteShareBlock } from './InviteShareBlock'
import { tripHref } from '@/lib/navigation/routes'

/**
 * Trip-First Onboarding Flow
 *
 * Two-step dialog: setup (create trip, auto-create circle) → invite travelers.
 * Gated by NEXT_PUBLIC_TRIP_FIRST_ONBOARDING=true.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {string} props.token - Auth token
 * @param {() => void} props.onSuccess - Called after flow completes
 */
export function TripFirstFlow({ open, onOpenChange, token, onSuccess }) {
  const router = useRouter()
  const [step, setStep] = useState('setup')
  const [tripForm, setTripForm] = useState({
    name: '',
    description: '',
    type: 'collaborative',
    startDate: '',
    endDate: '',
    duration: ''
  })
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState(null) // { trip, circle }

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep('setup')
      setTripForm({
        name: '',
        description: '',
        type: 'collaborative',
        startDate: '',
        endDate: '',
        duration: ''
      })
      setCreating(false)
      setResult(null)
    }
  }, [open])

  const handleCreate = async () => {
    if (!tripForm.name) {
      toast.error('Please enter a trip name')
      return
    }
    if (tripForm.type === 'hosted' && (!tripForm.startDate || !tripForm.endDate)) {
      toast.error('Hosted trips require start and end dates')
      return
    }

    setCreating(true)

    try {
      // POST without circleId — backend auto-creates circle
      const payload = { ...tripForm }
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
      setResult({ trip: data, circle: data.circle })
      setStep('invite')
    } catch (error) {
      console.error('Create trip error:', error)
      toast.error(error.message || 'Could not create trip — please try again')
    } finally {
      setCreating(false)
    }
  }

  const handleFinish = () => {
    onOpenChange(false)
    if (result?.trip?.id) {
      router.push(tripHref(result.trip.id))
    }
    if (onSuccess) {
      onSuccess()
    }
  }

  const shareUrl = typeof window !== 'undefined' && result?.circle?.inviteCode
    ? `${window.location.origin}/join/${result.circle.inviteCode}`
    : ''

  if (step === 'invite' && result) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite your travelers</DialogTitle>
            <DialogDescription>
              Share this link — they'll land right in the trip.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <InviteShareBlock
              inviteCode={result.circle.inviteCode}
              shareText={`Join "${result.trip.name}" on Trypzy!`}
              shareUrl={shareUrl}
            />
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleFinish}>
              I'll do this later
            </Button>
            <Button onClick={handleFinish}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Plan your trip</DialogTitle>
          <DialogDescription>
            We'll set up your group automatically — one less thing to think about.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          <TripFormFields tripForm={tripForm} onChange={setTripForm} />
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
