'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { MessageCircle, Send, X, ChevronDown, ChevronUp } from 'lucide-react'
import { TripPrimaryStage } from '@/lib/trips/stage'
import { getNextAction } from '@/lib/trips/nextAction'
import { ActionCard } from '@/components/trip/chat/ActionCard'

export function ChatTab({
  trip,
  user,
  messages,
  newMessage,
  setNewMessage,
  sendingMessage,
  sendMessage,
  showTripChatHint,
  dismissTripChatHint,
  stage,
  setActiveTab
}: any) {
  // Get next action for this trip
  const nextAction = useMemo(() => {
    if (!trip || !user) return null
    return getNextAction({ trip, user })
  }, [trip, user])

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
      // Inline: open the expandable panel
      setIsInlinePanelOpen(true)
    }
  }

  // Handle "See details" click (navigate to the tab)
  const handleSeeDetails = () => {
    if (!nextAction || !setActiveTab) return
    if (nextAction.deeplinkTab) {
      logAnalytics('action_clicked', nextAction.id)
      setActiveTab(nextAction.deeplinkTab)
    }
  }

  // Inline panel state
  const [isInlinePanelOpen, setIsInlinePanelOpen] = useState(false)
  
  // Quick note state (example inline action)
  const [quickNote, setQuickNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

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

  // Check if scheduling progress banner should be shown
  const showSchedulingBanner = trip.pickProgress && 
    trip.pickProgress.respondedCount < trip.pickProgress.totalCount &&
    trip.status !== 'locked'
  
  const waitingCount = trip.pickProgress 
    ? trip.pickProgress.totalCount - trip.pickProgress.respondedCount 
    : 0

  // Show action card if there's a next action and it's not dismissed
  const showActionCard = nextAction && !isDismissed

  // Log when action is shown
  useEffect(() => {
    if (nextAction && !isDismissed && trip) {
      logAnalytics('action_shown', nextAction.id)
    }
  }, [nextAction?.id, isDismissed, trip?.id])
  
  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">Trip Chat</CardTitle>
        <CardDescription>Decisions and updates for this trip. System updates appear here.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">

        {showTripChatHint && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-3">
            <p className="text-sm text-blue-800 flex-1">
              {stage === TripPrimaryStage.PROPOSED && 'Discuss dates and availability'}
              {stage === TripPrimaryStage.DATES_LOCKED && 'Discuss itinerary ideas'}
              {stage === TripPrimaryStage.ITINERARY && 'Discuss itinerary details'}
              {(stage === TripPrimaryStage.STAY || stage === TripPrimaryStage.PREP) && 'Coordinate trip preparation'}
              {stage === TripPrimaryStage.ONGOING && 'Coordinate live plans'}
              {stage === TripPrimaryStage.COMPLETED && 'Share trip memories'}
              {!stage && 'Trip Chat is for decisions and updates. For general discussion, use Circle Lounge.'}
            </p>
            <button
              onClick={dismissTripChatHint}
              className="flex-shrink-0 text-blue-600 hover:text-blue-800"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        {showSchedulingBanner && (
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between gap-3">
            <p className="text-sm text-gray-700 flex-1">
              Dates: {trip.pickProgress.respondedCount}/{trip.pickProgress.totalCount} have saved picks. Waiting on {waitingCount} {waitingCount === 1 ? 'person' : 'people'}.
            </p>
            {setActiveTab && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('planning')}
                className="flex-shrink-0"
              >
                Go to Dates
              </Button>
            )}
          </div>
        )}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</p>
            ) : (
              messages.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.isSystem ? 'justify-center' : msg.user?.id === user.id ? 'justify-end' : 'justify-start'}`}>
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
                    <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.user?.id === user.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                      {msg.user?.id !== user.id && (
                        <p className="text-xs font-medium mb-1 opacity-70">{msg.user?.name}</p>
                      )}
                      <p>{msg.content}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        {/* Sticky CTA section above message composer */}
        {showActionCard && (
          <div className="sticky bottom-0 bg-white pt-4 border-t z-10">
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
                    {nextAction.id !== 'quick-note' && (
                      <div className="text-sm text-gray-600">
                        Inline action: {nextAction.title}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            
            {/* ActionCard - sticky above composer */}
            <div className="mb-4">
              <ActionCard
                action={nextAction}
                onDismiss={handleDismiss}
                onAction={handleAction}
                onSeeDetails={nextAction.kind === 'inline' ? handleSeeDetails : undefined}
              />
            </div>
          </div>
        )}
        
        <div className={`flex gap-2 ${showActionCard ? 'pt-0' : 'mt-4 pt-4'} border-t`}>
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
