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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Users, Calendar, Copy, Share2 } from 'lucide-react'
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
    duration: ''
  })
  const [creating, setCreating] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

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
      console.error('Create trip error:', error)
      toast.error(error.message || 'Failed to create trip')
    } finally {
      setCreating(false)
    }
  }

  // Clipboard copy with try/catch fallback
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      // Fallback for browsers without clipboard API
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        return true
      } catch (fallbackErr) {
        console.error('Clipboard fallback failed:', fallbackErr)
        return false
      }
    }
  }

  const handleCopyInviteCode = async () => {
    if (circle.inviteCode) {
      const success = await copyToClipboard(circle.inviteCode)
      if (success) {
        setInviteCopied(true)
        toast.success('Code copied!')
        setTimeout(() => setInviteCopied(false), 2000)
      } else {
        toast.error('Could not copy — please copy manually')
      }
    }
  }

  // Smart share: Web Share API or clipboard fallback
  async function handleShare() {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/join/${circle.inviteCode}`
      : `/join/${circle.inviteCode}`
    const shareText = `Join "${circle.name}" on Trypzy to plan trips together!`

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Trypzy Invite',
          text: shareText,
          url: shareUrl
        })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }

    // Fallback: copy formatted message
    const fullMessage = `${shareText}\n${shareUrl}`
    const success = await copyToClipboard(fullMessage)
    if (success) {
      toast.success('Invite link copied!')
    } else {
      toast.error('Could not copy — please copy manually')
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
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2"
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
              <p className="text-xs text-gray-500 mt-1">
                {tripForm.type === 'collaborative'
                  ? "Your group suggests and votes on dates together. Best for flexible planning."
                  : "You set the dates, others join if they can. Best when dates are already decided."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={tripForm.startDate}
                  onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={tripForm.endDate}
                  onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                  min={tripForm.startDate || new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            {tripForm.type === 'collaborative' && (
              <div className="space-y-2">
                <Label>Trip Duration (days)</Label>
              <Select 
                value={tripForm.duration ? tripForm.duration.toString() : ''}
                onValueChange={(v) => setTripForm({ ...tripForm, duration: v ? parseInt(v) : '' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5, 6, 7].map((d) => (
                    <SelectItem key={d} value={d.toString()}>{d} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

          <div className="space-y-4 py-4">
            {/* Share Link */}
            <div className="space-y-2">
              <Label>Invite Link</Label>
              <div className="p-3 bg-brand-sand border border-brand-carbon/20 rounded-lg">
                <p className="text-sm font-mono text-brand-carbon break-all">
                  {shareUrl}
                </p>
              </div>
            </div>

            {/* Share Button */}
            <Button onClick={handleShare} className="w-full" size="lg">
              <Share2 className="h-4 w-4 mr-2" />
              Share Invite Link
            </Button>

            {/* Invite Code (secondary) */}
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-2">Or share the code directly:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-2 bg-gray-100 border rounded">
                  <p className="text-lg font-mono font-bold text-brand-carbon text-center">
                    {circle.inviteCode || 'N/A'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyInviteCode}
                  className="flex-shrink-0"
                >
                  <Copy className={`h-4 w-4 ${inviteCopied ? 'text-brand-blue' : ''}`} />
                </Button>
              </div>
            </div>
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
