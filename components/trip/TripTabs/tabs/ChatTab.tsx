'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { MessageCircle, Send, X, Lock } from 'lucide-react'
import { getNextAction } from '@/lib/trips/nextAction'
import { ActionCard } from '@/components/trip/chat/ActionCard'
import { toast } from 'sonner'

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

  // Handle lock dates confirmation
  const handleLockDates = async () => {
    if (!selectedLockWindow || !trip) return
    
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
      
      await api(`/trips/${trip.id}/lock`, {
        method: 'POST',
        body: JSON.stringify(body)
      }, token)
      
      toast.success('Trip dates locked! 🎉 Planning can now begin.')
      setShowLockModal(false)
      setSelectedLockWindow(null)
      
      // Refresh trip data to update UI
      if (onRefresh) {
        onRefresh()
      }
      
      logAnalytics('action_completed', nextAction?.id || 'lock-dates')
    } catch (error: any) {
      toast.error(error.message || 'Failed to lock dates')
    } finally {
      setLocking(false)
    }
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
                    onClick={handleLockDates} 
                    disabled={!selectedLockWindow || locking}
                    className="bg-green-600 hover:bg-green-700"
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
            
            {/* ActionCard - sticky above composer */}
            <div className="mb-4">
              <ActionCard
                action={nextAction}
                onDismiss={handleDismiss}
                onAction={handleAction}
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
