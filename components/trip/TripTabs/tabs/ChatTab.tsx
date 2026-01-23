'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { MessageCircle, Send, X, Lock } from 'lucide-react'
import { ActionCard } from '@/components/trip/chat/ActionCard'
import { toast } from 'sonner'
import { getTripCountdownLabel } from '@/lib/trips/getTripCountdownLabel'
import { getBlockingUsers } from '@/lib/trips/getBlockingUsers'
import { formatLeadingOption } from '@/lib/trips/getVotingStatus'
import { computeTripProgressSnapshot } from '@/lib/trips/progressSnapshot'

// API helper (local to this component)
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

export function ChatTab({
  trip,
  token,
  user,
  onRefresh,
  messages,
  newMessage,
  setNewMessage,
  sendingMessage,
  sendMessage,
  showTripChatHint,
  dismissTripChatHint,
  stage,
  setActiveTab,
  isReadOnly = false,
  mode = 'legacy' as 'legacy' | 'command-center'
}: any) {
  // In command-center mode, chat is the primary surface (no card wrapper, no header)
  const isCommandCenter = mode === 'command-center'
  // Check if user is trip leader
  const isTripLeader = trip?.viewer?.isTripLeader || trip?.createdBy === user?.id
  
  // Get trip status with backward compatibility
  const tripStatus = trip?.status || (trip?.type === 'hosted' ? 'locked' : 'scheduling')

  // Check if viewer is read-only (left trip or trip is canceled)
  // Use prop if provided, otherwise compute from trip data
  const viewer = trip?.viewer || {}
  const viewerIsReadOnly = isReadOnly !== undefined ? isReadOnly : (!viewer.isActiveParticipant || viewer.participantStatus === 'left' || trip?.status === 'canceled')
  const readOnlyPlaceholder = trip?.status === 'canceled' 
    ? 'Trip is canceled'
    : !viewer.isActiveParticipant || viewer.participantStatus === 'left'
    ? "You've left this trip"
    : 'Type a message...'
  
  // Get user's completion state
  const userDatePicks = trip?.userDatePicks || []
  const userVote = trip?.userVote || null
  const userHasPicked = userDatePicks && userDatePicks.length > 0
  const userHasVoted = !!userVote
  
  // Get actionRequired flag (computed server-side via getUserActionRequired)
  const actionRequired = trip?.actionRequired === true
  
  // Compute progress snapshot as single source of truth for CTA decisions (P0-4)
  const progressSnapshot = useMemo(() => {
    return computeTripProgressSnapshot(trip, user, {
      pickProgress: trip?.pickProgress
    })
  }, [trip, user])

  // Auto-scroll refs and state
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevMessageCountRef = useRef(messages?.length || 0)
  const SCROLL_THRESHOLD = 100 // pixels from bottom to consider "near bottom"

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior })
    }
  }, [])

  // Track scroll position to determine if user is near bottom
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!viewport) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      isNearBottomRef.current = distanceFromBottom < SCROLL_THRESHOLD
    }

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll when new messages arrive (only if near bottom)
  useEffect(() => {
    const currentCount = messages?.length || 0
    const prevCount = prevMessageCountRef.current

    if (currentCount > prevCount && isNearBottomRef.current) {
      // Small delay to ensure DOM has updated
      requestAnimationFrame(() => scrollToBottom('smooth'))
    }

    prevMessageCountRef.current = currentCount
  }, [messages, scrollToBottom])

  // Wrap sendMessage to always scroll to bottom after sending
  const handleSendMessage = useCallback(() => {
    if (sendMessage) {
      sendMessage()
      // Scroll to bottom immediately when user sends a message
      requestAnimationFrame(() => {
        isNearBottomRef.current = true
        scrollToBottom('instant')
      })
    }
  }, [sendMessage, scrollToBottom])

  // Stage-aware, role-aware CTA computation using progress snapshot (P0-4)
  const chatCTA = useMemo(() => {
    if (!trip || !user || !trip.type) return null

    // Only show CTAs for collaborative trips in active stages
    if (trip.type !== 'collaborative') return null

    // Use progress snapshot for core state decisions (P0-4)
    const { datesLocked, everyoneResponded, leaderNeedsToLock, itineraryFinalized, accommodationChosen, prepStarted } = progressSnapshot

    // Scheduling stage: show "Pick your dates" only if user hasn't picked
    if (tripStatus === 'proposed' || tripStatus === 'scheduling') {
      if (!userHasPicked) {
        return {
          id: 'pick-dates',
          title: 'Pick your dates',
          description: 'Share your date preferences to help coordinate the trip',
          ctaLabel: 'Pick your dates',
          kind: 'deeplink',
          deeplinkTab: 'planning',
          actionRequired
        }
      }
      // User has picked, but check if leader needs to lock (from snapshot)
      if (leaderNeedsToLock) {
        return {
          id: 'lock-dates',
          title: 'Lock dates',
          description: 'Everyone has responded. Lock the trip dates.',
          ctaLabel: 'Lock Dates',
          kind: 'inline',
          actionRequired: false // Leader actions are not "action required" for red styling
        }
      }
      // Non-leader waiting for lock (everyone responded from snapshot)
      if (!isTripLeader && everyoneResponded) {
        return null // No CTA, show read-only status (handled by description in messages)
      }
      // Still waiting for responses
      return null
    }

    // Voting stage: show "Vote on dates" only if user hasn't voted
    if (tripStatus === 'voting') {
      if (!userHasVoted) {
        return {
          id: 'vote-dates',
          title: 'Vote on dates',
          description: 'Choose your preferred date window',
          ctaLabel: 'Vote on dates',
          kind: 'deeplink',
          deeplinkTab: 'planning',
          actionRequired
        }
      }
      // User has voted - leader can lock, non-leaders see read-only status
      if (isTripLeader) {
        return {
          id: 'lock-dates-voting',
          title: 'Lock dates',
          description: 'Lock the trip dates after voting.',
          ctaLabel: 'Lock Dates',
          kind: 'inline',
          actionRequired: false
        }
      }
      return null
    }

    // Post-lock stages: show CTAs for itinerary, accommodation, prep, and view itinerary
    if (tripStatus === 'locked' || tripStatus === 'completed') {
      const itineraryStatus = trip.itineraryStatus

      // Check accommodation options availability (not in snapshot, UI-specific)
      const hasAccommodationOptions = trip.accommodationOptions?.length > 0 ||
        trip.accommodations?.length > 0 ||
        trip.stayRequirements?.some((req: any) => req.options?.length > 0)
      const userHasVotedOnAccommodation = trip.accommodationUserVoted ||
        trip.accommodations?.some((a: any) => a.userVoted)

      // Get user's ideas count (not in snapshot, user-specific)
      const userIdeasCount = trip.ideas?.filter(
        (i: any) => i.userId === user.id || i.createdBy === user.id
      )?.length || 0

      // 1. "Add your ideas" - when collecting ideas and user has fewer than 3 ideas
      if (datesLocked && itineraryStatus === 'collecting_ideas' && userIdeasCount < 3) {
        return {
          id: 'add-ideas',
          title: 'Add your ideas',
          description: 'Share what you would love to do on this trip',
          ctaLabel: 'Add your ideas',
          kind: 'deeplink',
          deeplinkTab: 'itinerary',
          actionRequired: userIdeasCount === 0
        }
      }

      // 2. "Vote on stays" - when accommodation options exist but not selected (use snapshot)
      if (itineraryFinalized && !accommodationChosen && hasAccommodationOptions && !userHasVotedOnAccommodation) {
        return {
          id: 'vote-stays',
          title: 'Vote on stays',
          description: 'Help pick where the group will stay',
          ctaLabel: 'Vote on stays',
          kind: 'deeplink',
          deeplinkTab: 'accommodation',
          actionRequired: true
        }
      }

      // 3. "Add transport & packing" - when prep phase is active (use snapshot)
      if (accommodationChosen && !prepStarted) {
        return {
          id: 'add-prep',
          title: 'Add transport & packing',
          description: 'Coordinate travel plans and packing lists',
          ctaLabel: 'Start prep',
          kind: 'deeplink',
          deeplinkTab: 'prep',
          actionRequired: false
        }
      }

      // 4. "View itinerary" - when itinerary is published
      if (itineraryStatus === 'published') {
        return {
          id: 'view-itinerary',
          title: 'View itinerary',
          description: 'Check out the finalized trip plan',
          ctaLabel: 'View itinerary',
          kind: 'deeplink',
          deeplinkTab: 'itinerary',
          actionRequired: false
        }
      }

      return null
    }

    return null
  }, [trip, user, tripStatus, isTripLeader, userHasPicked, userHasVoted, actionRequired, progressSnapshot])
  
  // Use chatCTA directly - we now handle all stages including post-lock
  const nextAction = useMemo(() => {
    return chatCTA
  }, [chatCTA])

  // Generate dismiss key for localStorage
  const dismissKey = useMemo(() => {
    if (!nextAction || !trip) return null
    const userId = user?.id || ''
    // Key format: tripId + actionId + userId (or tripId + actionId if no userId)
    return userId 
      ? `action_dismissed_${trip.id}_${nextAction.id}_${userId}`
      : `action_dismissed_${trip.id}_${nextAction.id}`
  }, [nextAction, trip, user])

  // Check if action is dismissed
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!dismissKey) return false
    if (typeof window === 'undefined') return false
    return localStorage.getItem(dismissKey) === 'true'
  })

  // Update dismissed state when dismissKey changes
  useEffect(() => {
    if (!dismissKey) {
      setIsDismissed(false)
      return
    }
    if (typeof window === 'undefined') return
    setIsDismissed(localStorage.getItem(dismissKey) === 'true')
  }, [dismissKey])

  // Analytics helper
  const logAnalytics = (event: string, actionId: string) => {
    if (typeof window === 'undefined' || !trip) return
    console.log(JSON.stringify({
      event,
      tripId: trip.id,
      actionId,
      timestamp: new Date().toISOString()
    }))
  }

  // Handle dismiss action
  const handleDismiss = () => {
    if (!dismissKey || !nextAction) return
    if (typeof window === 'undefined') return
    localStorage.setItem(dismissKey, 'true')
    setIsDismissed(true)
    logAnalytics('action_dismissed', nextAction.id)
  }

  // Handle primary action click
  const handleAction = () => {
    if (!nextAction) return
    
    logAnalytics('action_clicked', nextAction.id)
    
    if (nextAction.kind === 'deeplink') {
      // Deeplink: switch to the specified tab (URL is preserved by setActiveTab)
      if (nextAction.deeplinkTab && setActiveTab) {
        setActiveTab(nextAction.deeplinkTab)
      }
    } else if (nextAction.kind === 'inline') {
      // Inline: check if it's lock dates action
      if (nextAction.id === 'lock-dates') {
        // Always show modal - it will handle the empty case gracefully
        setShowLockModal(true)
      } else {
        // Other inline actions (e.g., quick note)
        setIsInlinePanelOpen(true)
      }
    }
  }

  // Handle lock dates confirmation (from modal)
  const handleLockDates = async () => {
    if (!selectedLockWindow || !trip) return
    
    // Check if user is leader
    if (!isTripLeader) {
      toast.error('Only the trip organizer can lock dates.')
      return
    }
    
    setLocking(true)
    try {
      // Determine the format based on trip scheduling mode
      let body: any
      if (trip.schedulingMode === 'top3_heatmap') {
        // For top3_heatmap, use startDateISO format
        // selectedLockWindow is the startDateISO (YYYY-MM-DD)
        body = { startDateISO: selectedLockWindow }
      } else {
        // For legacy voting, use optionKey format (YYYY-MM-DD_YYYY-MM-DD)
        body = { optionKey: selectedLockWindow }
      }
      
      // Lock endpoint now returns updated trip object for immediate UI update
      const updatedTrip = await api(`/trips/${trip.id}/lock`, {
        method: 'POST',
        body: JSON.stringify(body)
      }, token)
      
      toast.success('Trip dates locked! 🎉 Planning can now begin.')
      setShowLockModal(false)
      setSelectedLockWindow(null)
      setShowLockConfirmation(false)
      
      // Merge updated trip into state immediately (no refetch needed)
      if (onRefresh) {
        onRefresh(updatedTrip)
      }
      
      logAnalytics('action_completed', nextAction?.id || 'lock-dates')
    } catch (error: any) {
      if (error.message?.includes('403') || error.message?.includes('Only')) {
        toast.error('Only the trip organizer can lock dates.')
      } else {
        toast.error(error.message || 'Failed to lock dates')
      }
    } finally {
      setLocking(false)
    }
  }

  // Handle direct lock (from "Ready to lock" button)
  const handleLockDatesDirect = async (optionKey: string) => {
    if (!trip || !optionKey) return
    
    // Check if user is leader
    if (!isTripLeader) {
      toast.error('Only the trip organizer can lock dates.')
      return
    }
    
    // Show confirmation dialog
    setPendingLockAction(() => async () => {
      setLocking(true)
      try {
        // Lock endpoint now returns updated trip object for immediate UI update
        const updatedTrip = await api(`/trips/${trip.id}/lock`, {
          method: 'POST',
          body: JSON.stringify({ optionKey })
        }, token)
        
        toast.success('Trip dates locked! 🎉 Planning can now begin.')
        
        // Merge updated trip into state immediately (no refetch needed)
        if (onRefresh) {
          onRefresh(updatedTrip)
        }
        
        logAnalytics('action_completed', 'lock-dates-direct')
      } catch (error: any) {
        if (error.message?.includes('403') || error.message?.includes('Only')) {
          toast.error('Only the trip organizer can lock dates.')
        } else {
          toast.error(error.message || 'Failed to lock dates')
        }
      } finally {
        setLocking(false)
        setShowLockConfirmation(false)
        setPendingLockAction(null)
      }
    })
    setShowLockConfirmation(true)
  }


  // Inline panel state
  const [isInlinePanelOpen, setIsInlinePanelOpen] = useState(false)
  
  // Quick note state (example inline action)
  const [quickNote, setQuickNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Lock dates modal state
  const [showLockModal, setShowLockModal] = useState(false)
  const [selectedLockWindow, setSelectedLockWindow] = useState<string | null>(null)
  const [locking, setLocking] = useState(false)
  const [showLockConfirmation, setShowLockConfirmation] = useState(false)
  const [pendingLockAction, setPendingLockAction] = useState<(() => void) | null>(null)

  // Join requests state
  const [joinRequests, setJoinRequests] = useState<any[]>([])
  const [loadingJoinRequests, setLoadingJoinRequests] = useState(false)
  const [processingRequest, setProcessingRequest] = useState<string | null>(null)

  // Fetch join requests for trip leader
  const fetchJoinRequests = useCallback(async () => {
    if (!trip?.id || !isTripLeader || !token) {
      setJoinRequests([])
      return
    }
    
    setLoadingJoinRequests(true)
    try {
      const data = await api(`/trips/${trip.id}/join-requests`, { method: 'GET' }, token)
      setJoinRequests(data || [])
    } catch (error: any) {
      // Silently fail if not authorized or no requests
      if (error.message?.includes('403') || error.message?.includes('404')) {
        setJoinRequests([])
      } else {
        console.error('Failed to fetch join requests:', error)
      }
    } finally {
      setLoadingJoinRequests(false)
    }
  }, [trip?.id, isTripLeader, token])

  useEffect(() => {
    fetchJoinRequests()
  }, [fetchJoinRequests])

  // Handle approve join request
  const handleApproveRequest = async (requestId: string) => {
    if (!requestId || !trip?.id) return
    
    setProcessingRequest(requestId)
    try {
      await api(`/trips/${trip.id}/join-requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' })
      }, token)
      
      // Refresh join requests list (removes processed request, shows any new ones)
      await fetchJoinRequests()
      
      // Refresh trip data to update progress pane
      if (onRefresh) {
        onRefresh()
      }
      
      toast.success('Join request approved')
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve request')
    } finally {
      setProcessingRequest(null)
    }
  }

  // Handle deny join request
  const handleDenyRequest = async (requestId: string) => {
    if (!requestId || !trip?.id) return
    
    setProcessingRequest(requestId)
    try {
      await api(`/trips/${trip.id}/join-requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject' })
      }, token)
      
      // Refresh join requests list (removes processed request, shows any new ones)
      await fetchJoinRequests()
      
      // Refresh trip data to update progress pane
      if (onRefresh) {
        onRefresh()
      }
      
      toast.success('Join request declined')
    } catch (error: any) {
      toast.error(error.message || 'Failed to decline request')
    } finally {
      setProcessingRequest(null)
    }
  }

  // Get candidate windows for locking
  // For top3_heatmap: use topCandidates
  // For legacy: use promisingWindows or consensusOptions
  const candidateWindows = useMemo(() => {
    if (!trip) return []
    
    if (trip.schedulingMode === 'top3_heatmap') {
      // For top3_heatmap, use topCandidates (top 5, but we'll show top 3)
      return (trip.topCandidates || []).slice(0, 3)
    } else {
      // For legacy mode, use promisingWindows or consensusOptions
      return trip.promisingWindows || trip.consensusOptions || []
    }
  }, [trip?.topCandidates, trip?.promisingWindows, trip?.consensusOptions, trip?.schedulingMode])

  // Handle quick note submission (example inline action)
  const handleSaveQuickNote = async () => {
    if (!quickNote.trim() || !nextAction) return
    
    setSavingNote(true)
    
    // In a real implementation, this would save to the backend
    // For MVP, we'll send it as a chat message
    try {
      // Send as a chat message (MVP approach)
      if (sendMessage && setNewMessage) {
        const noteMessage = `📝 Quick note: ${quickNote}`
        setNewMessage(noteMessage)
        // Use a small delay to ensure state is updated before sending
        setTimeout(async () => {
          if (sendMessage) {
            await sendMessage()
            setQuickNote('')
            setIsInlinePanelOpen(false)
            if (nextAction) {
              logAnalytics('action_completed', nextAction.id)
            }
          }
        }, 50)
      } else {
        // Fallback: just close the panel
        setQuickNote('')
        setIsInlinePanelOpen(false)
        if (nextAction) {
          logAnalytics('action_completed', nextAction.id)
        }
      }
    } catch (error) {
      console.error('Failed to save note:', error)
    } finally {
      setSavingNote(false)
    }
  }

  // Show action card if there's a next action and it's not dismissed
  // In command-center mode, hide ActionCard since V2 has its own CTA bar
  const showActionCard = nextAction && !isDismissed && !isCommandCenter

  // Log when action is shown
  useEffect(() => {
    if (nextAction && !isDismissed && trip) {
      logAnalytics('action_shown', nextAction.id)
    }
  }, [nextAction?.id, isDismissed, trip?.id])
  
  // Get countdown label if dates are locked
  const countdownLabel = trip ? getTripCountdownLabel(trip, trip.name) : null
  
  // Get blocking users for "waiting on..." clarity message
  const blockingInfo = useMemo(() => {
    if (!trip || !user) return null
    return getBlockingUsers(trip, user)
  }, [trip, user])
  
  // Chat content (shared between legacy and command-center modes)
  const chatContent = (
    <>
      <ScrollArea ref={scrollAreaRef} className={`flex-1 pr-4 ${isCommandCenter ? 'h-[400px]' : ''}`}>
          <div className="space-y-4">
            {/* Waiting on... clarity message (system style, at top) */}
            {blockingInfo && (
              <div className="flex justify-center">
                <div className="bg-blue-50 border border-blue-200 rounded-full px-4 py-2 text-sm text-blue-700">
                  ⏳ {blockingInfo.message}
                </div>
              </div>
            )}
            
            {/* Voting status - only during voting stage */}
            {trip?.votingStatus?.isVotingStage && trip.votingStatus.leadingOption && (
              <div className="flex justify-center">
                <div className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-sm text-gray-700 flex items-center gap-3">
                  <span>{formatLeadingOption(trip.votingStatus)}</span>
                  <span className="text-xs text-gray-500">
                    {trip.votingStatus.votedCount}/{trip.votingStatus.totalTravelers} voted
                  </span>
                </div>
              </div>
            )}
            
            {/* Ready to lock message - leaders only */}
            {trip?.votingStatus?.readyToLock && tripStatus === 'voting' && (
              <div className="flex justify-center">
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-800 flex items-center gap-3">
                  <span>
                    Ready to lock — {trip.votingStatus.isTie ? 'tie (you decide)' : `${trip.votingStatus.leadingOption?.name || 'winner'} is leading`}
                  </span>
                  {isTripLeader ? (
                    <Button 
                      size="sm" 
                      onClick={() => {
                        // If voting mode, use leading option's optionKey; otherwise show modal
                        if (trip.votingStatus.leadingOption?.optionKey) {
                          handleLockDatesDirect(trip.votingStatus.leadingOption.optionKey)
                        } else {
                          setShowLockModal(true)
                        }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                    >
                      Lock dates
                    </Button>
                  ) : (
                    <Button 
                      size="sm" 
                      disabled
                      className="bg-gray-300 text-gray-500 h-7 text-xs cursor-not-allowed"
                      title="Only the trip organizer can lock dates."
                    >
                      Lock dates
                    </Button>
                  )}
                </div>
              </div>
            )}
            
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</p>
            ) : (
              messages.map((msg: any) => {
                return (
                  <div key={msg.id} className={`flex flex-col ${msg.isSystem ? 'items-center' : msg.user?.id === user.id ? 'items-end' : 'items-start'}`}>
                    <div className={`flex ${msg.isSystem ? 'justify-center' : msg.user?.id === user.id ? 'justify-end' : 'justify-start'}`}>
                      {msg.isSystem ? (
                        <div 
                          className={`bg-gray-100 rounded-full px-4 py-1 text-sm text-gray-600 ${msg.metadata?.href ? 'cursor-pointer hover:bg-gray-200 transition-colors' : ''}`}
                          onClick={msg.metadata?.href ? () => {
                            // Navigate to the href if it's a relative path
                            if (msg.metadata.href.startsWith('/')) {
                              window.location.href = msg.metadata.href
                            } else {
                              window.open(msg.metadata.href, '_blank')
                            }
                          } : undefined}
                        >
                          {msg.content}
                        </div>
                      ) : (
                        (() => {
                          // Check if message is from current user (handle various ID formats)
                          const isOwnMessage = msg.user?.id === user?.id || msg.userId === user?.id
                          return (
                            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${isOwnMessage ? 'bg-indigo-600' : 'bg-gray-100'}`}>
                              {!isOwnMessage && (
                                <p className="text-xs font-medium mb-1 text-gray-600">{msg.user?.name}</p>
                              )}
                              <p className={isOwnMessage ? 'text-white' : 'text-gray-900'}>{msg.content}</p>
                            </div>
                          )
                        })()
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
        
        {/* Sticky section: Join Requests + ActionCard above message composer */}
        {(isTripLeader && joinRequests.length > 0) || showActionCard ? (
          <div className="sticky bottom-0 bg-white pt-4 border-t z-10">
            {/* Join Request Cards (Trip Leader only) */}
            {isTripLeader && joinRequests.length > 0 && (
              <div className="mb-4 space-y-3">
                {joinRequests.map((request: any) => (
                  <div
                    key={request.id}
                    className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">
                          {request.requesterName} requested to join this trip
                        </h3>
                        {request.message && (
                          <p className="text-sm text-gray-700 mt-1">{request.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApproveRequest(request.id)}
                        disabled={processingRequest === request.id}
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {processingRequest === request.id ? 'Processing...' : 'Approve'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDenyRequest(request.id)}
                        disabled={processingRequest === request.id}
                        size="sm"
                        className="flex-1"
                      >
                        {processingRequest === request.id ? 'Processing...' : 'Deny'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* ActionCard */}
            {showActionCard && !viewerIsReadOnly && (
              <>
                {/* Inline action panel */}
                {nextAction.kind === 'inline' && (
              <Collapsible open={isInlinePanelOpen} onOpenChange={setIsInlinePanelOpen}>
                <CollapsibleContent className="mb-4">
                  <div className="p-4 bg-white border border-gray-200 rounded-lg">
                    {nextAction.id === 'quick-note' && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Add a quick note
                        </h4>
                        <Textarea
                          value={quickNote}
                          onChange={(e) => setQuickNote(e.target.value)}
                          placeholder="Add a note about this trip..."
                          className="min-h-[80px]"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsInlinePanelOpen(false)
                              setQuickNote('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveQuickNote}
                            disabled={savingNote || !quickNote.trim()}
                          >
                            {savingNote ? 'Saving...' : 'Save Note'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {nextAction.id !== 'quick-note' && nextAction.id !== 'lock-dates' && (
                      <div className="text-sm text-gray-600">
                        Inline action: {nextAction.title}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Lock Dates Modal */}
            <Dialog 
              open={showLockModal} 
              onOpenChange={(open) => {
                setShowLockModal(open)
                if (!open) {
                  // Reset selection when modal closes
                  setSelectedLockWindow(null)
                }
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Lock Trip Dates</DialogTitle>
                  <DialogDescription>
                    Everyone has responded. Select a date window to finalize the trip dates. Once locked, dates cannot be changed.
                  </DialogDescription>
                </DialogHeader>
                
                {candidateWindows.length > 0 ? (
                  <div className="py-4">
                    <RadioGroup value={selectedLockWindow || ''} onValueChange={setSelectedLockWindow}>
                      <div className="space-y-3">
                        {candidateWindows.map((window: any, idx: number) => {
                          // Determine the value based on scheduling mode
                          // For top3_heatmap: use startDateISO (YYYY-MM-DD)
                          // For legacy: use optionKey (YYYY-MM-DD_YYYY-MM-DD)
                          const windowValue = trip.schedulingMode === 'top3_heatmap' 
                            ? (window.startDateISO || window.startDate)
                            : (window.optionKey || `${window.startDate}_${window.endDate}`)
                          
                          // Display dates (support both formats)
                          const windowStartDate = window.startDateISO || window.startDate
                          const windowEndDate = window.endDateISO || window.endDate
                          const windowScore = window.score ? (window.score * 100).toFixed(0) : null
                          
                          return (
                            <div key={windowValue} className="flex items-start space-x-3">
                              <RadioGroupItem value={windowValue} id={windowValue} className="mt-1" />
                              <Label htmlFor={windowValue} className="flex-1 cursor-pointer">
                                <div className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                      <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                                      <div>
                                        <p className="font-medium">{windowStartDate} to {windowEndDate}</p>
                                        {windowScore && (
                                          <p className="text-sm text-gray-500">Compatibility: {windowScore}%</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                    </RadioGroup>
                  </div>
                ) : (
                  <div className="py-4">
                    <div className="text-center text-gray-600 mb-4">
                      <p className="mb-2">We couldn't compute date options right now.</p>
                      <p className="text-sm text-gray-500">This may happen if no one has submitted availability yet.</p>
                    </div>
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowLockModal(false)
                          if (setActiveTab) {
                            setActiveTab('planning')
                          }
                        }}
                      >
                        Open Planning
                      </Button>
                    </div>
                  </div>
                )}
                
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowLockModal(false)
                      setSelectedLockWindow(null)
                    }}
                    disabled={locking}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      if (!isTripLeader) {
                        toast.error('Only the trip organizer can lock dates.')
                        return
                      }
                      if (!selectedLockWindow) return
                      setPendingLockAction(() => async () => {
                        await handleLockDates()
                      })
                      setShowLockConfirmation(true)
                    }}
                    disabled={!selectedLockWindow || locking || !isTripLeader}
                    className="bg-green-600 hover:bg-green-700"
                    title={!isTripLeader ? "Only the trip organizer can lock dates." : undefined}
                  >
                    {locking ? (
                      'Locking...'
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Lock Dates
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Lock Dates Confirmation Dialog */}
            <AlertDialog open={showLockConfirmation} onOpenChange={setShowLockConfirmation}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Lock dates for everyone?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This finalizes the trip dates. Once locked, dates cannot be changed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => {
                    setShowLockConfirmation(false)
                    setPendingLockAction(null)
                  }}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      if (pendingLockAction) {
                        await pendingLockAction()
                      }
                    }}
                    disabled={locking}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {locking ? 'Locking...' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
                {/* ActionCard - Single CTA area */}
                {!viewerIsReadOnly && (
                  <div className="mb-4">
                    <ActionCard
                      action={nextAction}
                      onDismiss={handleDismiss}
                      onAction={handleAction}
                      actionRequired={nextAction?.actionRequired || actionRequired}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}
        
        <div className={`flex gap-2 ${showActionCard ? 'pt-0' : 'mt-4 pt-4'} border-t`}>
          <Input
            value={newMessage}
            onChange={(e) => {
              if (!viewerIsReadOnly) {
                setNewMessage(e.target.value)
              }
            }}
            placeholder={readOnlyPlaceholder}
            onKeyDown={(e) => {
              if (!viewerIsReadOnly && e.key === 'Enter' && sendMessage) {
                handleSendMessage()
              }
            }}
            disabled={viewerIsReadOnly}
            className="text-brand-carbon bg-white"
          />
          <Button
            onClick={viewerIsReadOnly ? undefined : handleSendMessage}
            disabled={viewerIsReadOnly || sendingMessage || !newMessage.trim()}
            title={viewerIsReadOnly ? readOnlyPlaceholder : undefined}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
    </>
  )

  // Command Center mode: no card wrapper, just the content
  if (isCommandCenter) {
    return (
      <div className="flex flex-col h-full">
        {chatContent}
      </div>
    )
  }

  // Legacy mode: full card wrapper with header
  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">Trip Chat</CardTitle>
        <CardDescription>
          Decisions and updates for this trip. System updates appear here.
          {countdownLabel && (
            <span className="ml-2 text-gray-500">• {countdownLabel}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {chatContent}
      </CardContent>
    </Card>
  )
}
