'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Users, Calendar } from 'lucide-react'
import { TripFormFields } from './TripFormFields'
import { InviteShareBlock } from './InviteShareBlock'
import { tripHref, circlePageHref } from '@/lib/navigation/routes'

/**
 * Circle Onboarding Interstitial
 * Shows after circle creation to guide user to next steps
 * 
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onOpenChange
 * @param {Object} props.circle - Created circle object
 * @param {string} props.token - Auth token
 * @param {Function} props.onSkip - Callback when user skips
 */
export function CircleOnboardingInterstitial({ 
  open, 
  onOpenChange, 
  circle, 
  token,
  onSkip 
}) {
  const router = useRouter()
  const [mode, setMode] = useState('interstitial')
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
  if (!circle) return null

  const handleCreateTrip = async () => {
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
      const payload = { ...tripForm, circleId: circle.id }
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
      
      // Navigate to trip detail with chat tab (chat-first)
      const tripUrl = tripHref(data.id)
      router.push(tripUrl)
    } catch (error) {
      toast.error(error.message || "Couldn't create trip — please try again")
    } finally {
      setCreating(false)
    }
  }

  const handleSkip = () => {
    onOpenChange(false)
    // Navigate to circle page (or dashboard if no circle page route)
    if (circle?.id) {
      router.push(circlePageHref(circle.id))
    }
    if (onSkip) {
      onSkip()
    }
  }

  // Interstitial view
  if (mode === 'interstitial') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-brand-blue/10 p-3">
                <CheckCircle2 className="h-8 w-8 text-brand-blue" />
              </div>
            </div>
            <DialogTitle className="text-center">Circle Created!</DialogTitle>
            <DialogDescription className="text-center">
              <span className="font-semibold">{circle.name}</span> is ready. What would you like to do next?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => setMode('create-trip')}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Create first trip
            </Button>
            
            <Button 
              variant="outline" 
              className="w-full" 
              size="lg"
              onClick={() => setMode('invite')}
            >
              <Users className="h-4 w-4 mr-2" />
              Invite members
            </Button>
            
            <button
              onClick={handleSkip}
              className="w-full text-sm text-brand-carbon/60 hover:text-brand-carbon/80 py-2"
            >
              Skip for now
            </button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Create trip view
  if (mode === 'create-trip') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Your First Trip</DialogTitle>
            <DialogDescription>Plan an adventure with {circle.name}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <TripFormFields tripForm={tripForm} onChange={setTripForm} />
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setMode('interstitial')}
              className="flex-1"
            >
              Back
            </Button>
            <Button 
              onClick={handleCreateTrip} 
              disabled={creating || !tripForm.name || (tripForm.type === 'hosted' && (!tripForm.startDate || !tripForm.endDate))}
              className="flex-1"
            >
              {creating ? 'Creating...' : 'Create Trip'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Invite members view
  if (mode === 'invite') {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/join/${circle.inviteCode}`
      : `/join/${circle.inviteCode}`

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Members</DialogTitle>
            <DialogDescription>
              Share this link with friends to join <span className="font-semibold">{circle.name}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <InviteShareBlock
              inviteCode={circle.inviteCode}
              shareText={`Join "${circle.name}" on Tripti.ai to plan trips together!`}
              shareUrl={shareUrl}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setMode('interstitial')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSkip}
              className="flex-1"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return null
}
