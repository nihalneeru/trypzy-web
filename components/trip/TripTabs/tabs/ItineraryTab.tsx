'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Lightbulb, ListTodo, MessageCircle, Vote, MapPin, Calendar as CalendarIcon, Lock, Sparkles, RefreshCw, Edit2, Save, X } from 'lucide-react'
import { BrandedSpinner } from '@/app/HomeClient'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// formatDate helper (copied from app/page.js)
function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// Parse YYYY-MM-DD date string as local date to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function ItineraryTab({
  trip,
  ideas,
  newIdea,
  setNewIdea,
  addingIdea,
  addIdea,
  loadingIdeas,
  latestVersion,
  loadingVersions,
  generating,
  generateItinerary,
  revising,
  reviseItinerary,
  feedback,
  loadingFeedback,
  newFeedback,
  setNewFeedback,
  submittingFeedback,
  submitFeedback,
  ideaCategories,
  feedbackTypes,
  upvoteIdea,
  likeIdea,
  userIdeaCount,
  onRefresh,
  api,
  token,
  user,
  setActiveTab
}: any) {
  // Destination hint editing state - hooks must be called unconditionally
  const [editingDestinationHint, setEditingDestinationHint] = useState(false)
  const [destinationHintValue, setDestinationHintValue] = useState(trip?.destinationHint || '')
  const [savingDestinationHint, setSavingDestinationHint] = useState(false)
  
  // Update destinationHintValue when trip.destinationHint changes
  useEffect(() => {
    if (trip?.destinationHint !== undefined) {
      setDestinationHintValue(trip.destinationHint || '')
    }
  }, [trip?.destinationHint])
  
  const handleSaveDestinationHint = async () => {
    if (!api || !token || !trip) {
      toast.error('Unable to save: API not available')
      return
    }
    
    setSavingDestinationHint(true)
    try {
      await api(`/trips/${trip.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ destinationHint: destinationHintValue })
      }, token)
      toast.success('Destination hint updated')
      setEditingDestinationHint(false)
      if (onRefresh) {
        onRefresh()
      }
    } catch (error) {
      const errorMessage = error?.message || 'Failed to update destination hint'
      toast.error(errorMessage)
    } finally {
      setSavingDestinationHint(false)
    }
  }
  
  const handleCancelDestinationHint = () => {
    setDestinationHintValue(trip?.destinationHint || '')
    setEditingDestinationHint(false)
  }
  
  // Check if viewer is read-only (left trip or trip is canceled)
  const viewer = trip?.viewer || {}
  const viewerIsReadOnly = !viewer.isActiveParticipant || viewer.participantStatus === 'left' || trip?.status === 'canceled'
  const readOnlyReason = trip?.status === 'canceled' 
    ? 'Trip is canceled'
    : !viewer.isActiveParticipant || viewer.participantStatus === 'left'
    ? "You've left this trip"
    : null

  // Quick reactions state
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [reactingChip, setReactingChip] = useState<string | null>(null)

  // Quick reactions configuration
  const quickReactions = [
    { id: 'love', emoji: '👍', label: 'Love it', message: 'Love it' },
    { id: 'packed', emoji: '🔁', label: 'Too packed', message: 'Too packed' },
    { id: 'chill', emoji: '🧘', label: 'More chill', message: 'More chill' },
    { id: 'cheaper', emoji: '💸', label: 'Cheaper', message: 'Cheaper' },
    { id: 'food', emoji: '🍽️', label: 'More food', message: 'More food' },
    { id: 'freetime', emoji: '🕒', label: 'More free time', message: 'More free time' }
  ]

  // Handle quick reaction click
  const handleQuickReaction = async (reaction: typeof quickReactions[0]) => {
    if (reactingChip || submittingFeedback || viewerIsReadOnly) return
    
    setReactingChip(reaction.id)
    
    try {
      // Find "preference" type or use first available type as fallback
      const preferenceType = feedbackTypes.find((t: any) => t.value === 'preference') || feedbackTypes[0]
      
      // Set feedback state and submit
      const originalFeedback = { ...newFeedback }
      setNewFeedback({
        type: preferenceType.value,
        target: '',
        message: `Reaction: ${reaction.message}`
      })
      
      // Wait a tick for state to update, then submit
      await new Promise(resolve => setTimeout(resolve, 0))
      
      // Submit feedback (submitFeedback uses newFeedback state)
      submitFeedback()
      
      // Show "Sent ✅" state briefly (1.5 seconds), then reset
      setTimeout(() => {
        setReactingChip(null)
        // Reset feedback state back to original
        setNewFeedback(originalFeedback)
      }, 1500)
    } catch (error) {
      setReactingChip(null)
      toast.error('Failed to submit reaction')
    }
  }

  // Calculate new feedback count since current version
  const newFeedbackCount = useMemo(() => {
    if (!latestVersion || !feedback || feedback.length === 0) return 0
    
    // Use createdAt timestamp if available
    const versionCreatedAt = latestVersion.createdAt || latestVersion.created_at || latestVersion.timestamp
    
    // Only count feedback if we can compare timestamps
    if (versionCreatedAt) {
      return feedback.filter((fb: any) => {
        if (fb.createdAt) {
          return new Date(fb.createdAt) > new Date(versionCreatedAt)
        }
        return false
      }).length
    }
    
    // If no timestamp available, can't determine what's new - return 0
    return 0
  }, [latestVersion, feedback])

  // Extract reaction message from feedback item (format: "Reaction: {message}")
  const getReactionFromMessage = (message: string): string | null => {
    if (!message || !message.startsWith('Reaction: ')) return null
    return message.replace('Reaction: ', '').trim()
  }

  // Aggregate reaction counts from all feedback
  const reactionCounts = useMemo(() => {
    if (!feedback || feedback.length === 0) return new Map<string, number>()
    
    const counts = new Map<string, number>()
    
    feedback.forEach((fb: any) => {
      const reactionMessage = getReactionFromMessage(fb.message)
      if (reactionMessage) {
        // Find matching reaction by message
        const matchingReaction = quickReactions.find(r => r.message === reactionMessage)
        if (matchingReaction) {
          counts.set(matchingReaction.id, (counts.get(matchingReaction.id) || 0) + 1)
        }
      }
    })
    
    return counts
  }, [feedback])

  // Get current user's reactions
  const userReactions = useMemo(() => {
    if (!feedback || !user?.id || feedback.length === 0) return []
    
    return feedback
      .filter((fb: any) => {
        const reactionMessage = getReactionFromMessage(fb.message)
        // Check multiple possible author ID fields
        const authorId = fb.author?.id || fb.authorId || fb.userId
        return reactionMessage && authorId === user.id
      })
      .map((fb: any) => {
        const reactionMessage = getReactionFromMessage(fb.message)
        const matchingReaction = quickReactions.find(r => r.message === reactionMessage)
        return matchingReaction ? matchingReaction.label : null
      })
      .filter(Boolean)
  }, [feedback, user?.id])

  // Check if revise should be enabled
  const canRevise = useMemo(() => {
    if (!latestVersion || !trip.isCreator) return false
    return newFeedbackCount > 0 && !revising
  }, [latestVersion, trip.isCreator, newFeedbackCount, revising])

  // Track if revision just completed to show next step guidance
  const [revisionJustCompleted, setRevisionJustCompleted] = useState(false)
  const prevRevisingRef = useRef(revising)
  
  // Watch for revision completion (only when transitioning from true to false)
  useEffect(() => {
    const wasRevising = prevRevisingRef.current
    prevRevisingRef.current = revising
    
    if (wasRevising && !revising && revisionJustCompleted) {
      // Revision just completed, show next step guidance
      const timer = setTimeout(() => {
        setRevisionJustCompleted(false)
      }, 10000) // Show for 10 seconds
      return () => clearTimeout(timer)
    }
  }, [revising, revisionJustCompleted])

  // Handle revise with completion tracking
  const handleRevise = async () => {
    if (revising) return // Prevent double-submit
    setRevisionJustCompleted(true)
    try {
      await reviseItinerary()
    } catch (error: any) {
      setRevisionJustCompleted(false)
      toast.error(error.message || 'Failed to revise itinerary')
    }
  }

  // Helper: Normalize author ID from various fields
  const getAuthorId = (idea: any): string | null => {
    if (!idea) return null
    // Try various fields in order of preference
    if (idea.authorUserId) return idea.authorUserId
    if (idea.authorId) return idea.authorId
    if (idea.userId) return idea.userId
    if (idea.createdBy) {
      // Handle both string and object with _id
      if (typeof idea.createdBy === 'string') return idea.createdBy
      if (idea.createdBy && typeof idea.createdBy === 'object' && idea.createdBy._id) return idea.createdBy._id
    }
    return null
  }

  // Group ideas by traveler
  const groupedIdeas = useMemo(() => {
    if (!ideas || ideas.length === 0) return []
    
    const groups = new Map<string, { travelerId: string, travelerName: string, ideas: any[], count: number }>()
    
    ideas.forEach((idea: any) => {
      const travelerId = getAuthorId(idea)
      if (!travelerId) return // Skip ideas without author
      
      const travelerName = idea.author?.name || 'Unknown Traveler'
      
      if (!groups.has(travelerId)) {
        groups.set(travelerId, {
          travelerId,
          travelerName,
          ideas: [],
          count: 0
        })
      }
      
      const group = groups.get(travelerId)!
      group.ideas.push(idea)
      group.count = group.ideas.length
    })
    
    // Convert to array and sort: current user first, then incomplete travelers, then others alphabetically
    const currentUserId = user?.id
    return Array.from(groups.values()).sort((a, b) => {
      // Current user first
      if (currentUserId) {
        if (a.travelerId === currentUserId) return -1
        if (b.travelerId === currentUserId) return 1
      }
      
      // Incomplete travelers (< 3 ideas) before complete travelers
      const aIncomplete = a.count < 3
      const bIncomplete = b.count < 3
      if (aIncomplete && !bIncomplete) return -1
      if (!aIncomplete && bIncomplete) return 1
      
      // Then alphabetically by name
      return a.travelerName.localeCompare(b.travelerName)
    })
  }, [ideas, user?.id])

  // Compute idea participation progress (soft indicator, not a gate)
  const ideaProgress = useMemo(() => {
    if (!trip || !ideas) return { travelerCount: 0, ideaCount: 0, travelersWithIdeas: 0 }
    
    // Build set of active traveler IDs
    const activeTravelerIds = new Set<string>()
    
    // Always include the trip creator (leader) as a traveler
    if (trip.createdBy) {
      activeTravelerIds.add(trip.createdBy)
    }
    
    // Include active travelers from trip participants
    if (trip.participants && Array.isArray(trip.participants)) {
      trip.participants.forEach((p: any) => {
        const status = p.status || 'active'
        if (status === 'active' && p.userId) {
          activeTravelerIds.add(p.userId)
        }
      })
    }
    
    // Fallback to activeTravelerCount if no participants list
    const totalTravelers = activeTravelerIds.size > 0 ? activeTravelerIds.size : (trip.activeTravelerCount || 1)
    
    // Count travelers who have submitted at least one idea
    const travelersWithIdeas = new Set(
      ideas
        .map((idea: any) => idea.authorUserId || idea.authorId)
        .filter(Boolean)
    ).size
    
    return {
      travelerCount: totalTravelers,
      ideaCount: ideas.length,
      travelersWithIdeas
    }
  }, [trip, ideas])

  // Early return check AFTER hooks (hooks must run unconditionally)
  if (!trip || trip.status !== 'locked') {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Lock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Itinerary planning is only available after dates are locked</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Panel 1: Ideas */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Ideas
            </CardTitle>
            <CardDescription>
              Suggest activities for the trip
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Destination Hint - Display/Edit */}
            {trip.destinationHint || trip.isCreator ? (
              <div className="pb-3 border-b">
                {editingDestinationHint && trip.isCreator ? (
                  <div className="space-y-2">
                    <Input
                      value={destinationHintValue}
                      onChange={(e) => setDestinationHintValue(e.target.value)}
                      placeholder="Kenya (Nairobi + Maasai Mara)"
                      className="text-sm"
                      disabled={savingDestinationHint}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSaveDestinationHint}
                        disabled={savingDestinationHint}
                        className="h-7"
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCancelDestinationHint}
                        disabled={savingDestinationHint}
                        className="h-7"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    {trip.destinationHint ? (
                      <p className="text-sm text-gray-700 flex-1">{trip.destinationHint}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic flex-1">No destination hint set</p>
                    )}
                    {trip.isCreator && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDestinationHintValue(trip.destinationHint || '')
                          setEditingDestinationHint(true)
                        }}
                        className="h-7"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
            
            {/* Add Idea Form */}
            {userIdeaCount === undefined || userIdeaCount < 3 ? (
              <div className="space-y-2">
                <Textarea
                  value={newIdea.text || ''}
                  onChange={(e) => setNewIdea({ text: e.target.value })}
                  placeholder={viewerIsReadOnly ? readOnlyReason : "E.g., Visit the local market, Try authentic street food, Go hiking in the mountains..."}
                  className="text-sm min-h-[80px]"
                  maxLength={120}
                  disabled={viewerIsReadOnly}
                />
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{(newIdea.text || '').length}/120 characters</span>
                  {userIdeaCount !== undefined && userIdeaCount < 3 && (
                    <span>{userIdeaCount}/3 ideas submitted</span>
                  )}
                </div>
                <Button 
                  onClick={viewerIsReadOnly ? undefined : addIdea} 
                  disabled={viewerIsReadOnly || addingIdea || !newIdea.text?.trim()} 
                  className="w-full" 
                  size="sm"
                  title={viewerIsReadOnly ? readOnlyReason : undefined}
                >
                  {addingIdea ? 'Adding...' : 'Submit Idea'}
                </Button>
                {viewerIsReadOnly && readOnlyReason && (
                  <p className="text-xs text-gray-500 text-center mt-1">{readOnlyReason}</p>
                )}
              </div>
            ) : (
              <div className="text-center py-4 px-2 bg-gray-50 rounded-lg border">
                <p className="text-sm text-gray-600 mb-2">You've submitted 3 ideas</p>
                <Button onClick={() => {/* Scroll to ideas list */}} variant="outline" size="sm">
                  View Ideas
                </Button>
              </div>
            )}
            
            {/* Ideas List - Grouped by Traveler */}
            <ScrollArea className="h-[400px]">
              {loadingIdeas ? (
                <div className="flex justify-center py-8">
                  <BrandedSpinner size="md" />
                </div>
              ) : ideas.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No ideas yet. Add some activities!
                </p>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {groupedIdeas.map((group) => {
                    const isCurrentUser = group.travelerId === user?.id
                    const travelerName = isCurrentUser ? 'You' : group.travelerName
                    const ideaCount = group.count
                    const hasEnoughIdeas = ideaCount >= 3
                    const accordionValue = `traveler-${group.travelerId}`
                    
                    return (
                      <AccordionItem key={group.travelerId} value={accordionValue}>
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-2 flex-1 text-left">
                            <span className="font-medium text-sm">{travelerName}</span>
                            <span className="text-xs text-gray-500">({ideaCount}/3)</span>
                            {hasEnoughIdeas ? (
                              <span className="text-green-600">✅</span>
                            ) : (
                              <span className="text-yellow-600">⏳</span>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {group.ideas.map((idea: any) => (
                              <div 
                                key={idea.id} 
                                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border"
                              >
                                <Button
                                  size="icon"
                                  variant={idea.userLiked ? "default" : "ghost"}
                                  className="h-8 w-8 flex-shrink-0"
                                  onClick={() => (likeIdea || upvoteIdea)(idea.id)}
                                >
                                  <Vote className={`h-4 w-4 ${idea.userLiked ? 'text-white' : ''}`} />
                                </Button>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 mb-1">{idea.text || idea.title}</p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0)) > 0 && (
                                      <span className="text-gray-600">
                                        {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0))} {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0)) === 1 ? 'like' : 'likes'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Panel 2: Itinerary Viewer */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  Itinerary
                </CardTitle>
                {latestVersion && (
                  <Badge variant="outline" className="mt-2">
                    Version {latestVersion.version}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {loadingVersions ? (
                <div className="flex justify-center py-8">
                  <BrandedSpinner size="md" />
                </div>
              ) : !latestVersion ? (
                <div className="text-center py-12">
                  <ListTodo className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No itinerary generated yet</p>
                  {trip.isCreator && (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 mb-2">
                        {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'} from {[...new Set(ideas.map((i: any) => i.authorUserId || i.authorId))].filter(Boolean).length} {[...new Set(ideas.map((i: any) => i.authorUserId || i.authorId))].filter(Boolean).length === 1 ? 'traveler' : 'travelers'}
                      </div>
                      <Button 
                        onClick={async () => {
                          try {
                            await generateItinerary()
                          } catch (error: any) {
                            toast.error(error.message || 'Failed to generate itinerary. Please try again.')
                          }
                        }}
                        disabled={generating} 
                        title="Generate itinerary from ideas"
                      >
                        {generating ? (
                          <>
                            <BrandedSpinner size="sm" className="mr-2" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Generate Itinerary
                          </>
                        )}
                      </Button>
                      {generating && (
                        <p className="text-xs text-gray-500">Building a day-by-day plan...</p>
                      )}
                      {!generating && ideas.length > 0 && (
                        <p className="text-xs text-gray-500">
                          Ideas added: {[...new Set(ideas.map((i: any) => i.authorUserId || i.authorId))].filter(Boolean).length} of {trip.activeTravelerCount || trip.totalMembers || 1} travelers
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Next step guidance after revision */}
                  {revisionJustCompleted && !revising && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 mb-2">Next step: Choose where to stay</p>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (setActiveTab) {
                            setActiveTab('accommodation')
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Continue to Accommodation
                      </Button>
                    </div>
                  )}
                  
                  {latestVersion.changeLog && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="changelog">
                        <AccordionTrigger className="text-sm">What changed in v{latestVersion.version}?</AccordionTrigger>
                        <AccordionContent className="text-sm text-gray-600">
                          {latestVersion.changeLog}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                  
                  {latestVersion.content?.overview && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs font-medium mb-1">Overview</p>
                      <p className="text-xs text-gray-600">Pace: {latestVersion.content.overview.pace} • Budget: {latestVersion.content.overview.budget}</p>
                      {latestVersion.content.overview.notes && (
                        <p className="text-xs text-gray-600 mt-1">{latestVersion.content.overview.notes}</p>
                      )}
                    </div>
                  )}
                  
                  {latestVersion.content?.days && (
                    <Accordion type="multiple" className="w-full">
                      {latestVersion.content.days.map((day: any, dayIdx: number) => (
                        <AccordionItem key={dayIdx} value={`day-${dayIdx}`}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4" />
                              <span className="font-medium text-sm">
                                {parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                              </span>
                              {day.title && <span className="text-xs text-gray-500">• {day.title}</span>}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="space-y-3 pt-2">
                              {day.blocks && day.blocks.length > 0 ? (
                                day.blocks.map((block: any, blockIdx: number) => (
                                  <div key={blockIdx} className="border rounded-lg p-3 bg-gray-50">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium text-[#FA3823]">{block.timeRange}</span>
                                          {block.tags && block.tags.length > 0 && (
                                            <div className="flex gap-1">
                                              {block.tags.map((tag: string, tagIdx: number) => (
                                                <Badge key={tagIdx} variant="secondary" className="text-xs">
                                                  {tag}
                                                </Badge>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <p className="font-medium text-sm">{block.title}</p>
                                        {block.description && (
                                          <p className="text-xs text-gray-600 mt-1">{block.description}</p>
                                        )}
                                        {block.location && (
                                          <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                                            <MapPin className="h-3 w-3" />
                                            {block.location}
                                          </p>
                                        )}
                                        {block.estCost && (
                                          <p className="text-xs text-green-600 mt-1">Est. {block.estCost}</p>
                                        )}
                                        {block.transitNotes && (
                                          <p className="text-xs text-gray-500 mt-1 italic">Transit: {block.transitNotes}</p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-gray-400 italic">No activities planned</p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Panel 3: Discussion */}
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                Feedback
              </CardTitle>
              {trip.isCreator && latestVersion && (
                <div className="flex flex-col items-end gap-1">
                  {canRevise ? (
                    <p className="text-xs text-gray-500">
                      {newFeedbackCount} {newFeedbackCount === 1 ? 'new item' : 'new items'} since v{latestVersion.version}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Waiting for feedback</p>
                  )}
                  <Button onClick={handleRevise} disabled={!canRevise} size="sm" variant="outline">
                    {revising ? (
                      <>
                        <BrandedSpinner size="sm" className="mr-2" />
                        Revising...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Revise
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
            {latestVersion && (
              <CardDescription>
                Feedback for v{latestVersion.version}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col" style={{ maxHeight: '600px' }}>
            {!latestVersion ? (
              <div className="text-center py-12">
                <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">No itinerary published yet</p>
                <p className="text-gray-400 text-xs mt-2">Feedback will appear here once an itinerary is generated</p>
              </div>
            ) : (
              <>
                {/* Quick Reactions */}
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {quickReactions.map((reaction) => {
                      const isReacting = reactingChip === reaction.id
                      const isDisabled = reactingChip !== null || submittingFeedback || viewerIsReadOnly
                      const reactionCount = reactionCounts.get(reaction.id) || 0
                      
                      return (
                        <Button
                          key={reaction.id}
                          variant={isReacting ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleQuickReaction(reaction)}
                          disabled={isDisabled}
                          className="text-xs h-8"
                        >
                          {isReacting ? (
                            <>
                              <span className="mr-1">✅</span>
                              Sent
                            </>
                          ) : (
                            <>
                              <span className="mr-1">{reaction.emoji}</span>
                              {reaction.label}
                              {reactionCount > 0 && (
                                <span className="ml-1 text-gray-500">({reactionCount})</span>
                              )}
                            </>
                          )}
                        </Button>
                      )
                    })}
                  </div>
                  
                  {/* Personal reactions summary */}
                  {userReactions.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Your reactions: {userReactions.join(', ')}
                    </p>
                  )}
                </div>

                {/* Reactions Summary */}
                {reactionCounts.size > 0 && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                    <p className="text-xs font-medium text-gray-700 mb-2">Reactions</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {quickReactions
                        .filter(reaction => reactionCounts.has(reaction.id))
                        .map((reaction) => {
                          const count = reactionCounts.get(reaction.id) || 0
                          return (
                            <div key={reaction.id} className="text-xs text-gray-600">
                              <span className="mr-1">{reaction.emoji}</span>
                              {reaction.label} — {count}
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}

                <ScrollArea className="flex-1 mb-4 pr-4" style={{ maxHeight: '300px' }}>
                  {loadingFeedback ? (
                    <div className="flex justify-center py-8">
                      <BrandedSpinner size="md" />
                    </div>
                  ) : feedback.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 text-sm">
                      No feedback yet. Share your thoughts!
                    </p>
                  ) : (
                    <div className="space-y-3 pr-2">
                      {feedback.map((fb: any) => (
                        <div key={fb.id} className="p-3 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{fb.author?.name || 'Anonymous'}</span>
                            <Badge variant="secondary" className="text-xs">
                              {feedbackTypes.find((t: any) => t.value === fb.type)?.label || fb.type}
                            </Badge>
                          </div>
                          {fb.target && (
                            <p className="text-xs text-gray-500 mb-1">Target: {fb.target}</p>
                          )}
                          <p className="text-sm text-gray-700">{fb.message}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatDate(fb.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                
                {/* Progressive Disclosure: Add a note */}
                <div className="pt-4 border-t bg-white">
                  <Collapsible open={showFeedbackForm} onOpenChange={setShowFeedbackForm}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full mb-2 text-xs" disabled={viewerIsReadOnly}>
                        {showFeedbackForm ? 'Hide form' : 'Add a note'}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={newFeedback.type} onValueChange={(v) => setNewFeedback({ ...newFeedback, type: v })}>
                            <SelectTrigger className="text-sm h-9">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              {feedbackTypes.map((type: any) => (
                                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={newFeedback.target}
                            onChange={(e) => setNewFeedback({ ...newFeedback, target: e.target.value })}
                            placeholder="Target (optional)"
                            className="text-sm h-9"
                            disabled={viewerIsReadOnly}
                          />
                        </div>
                        <Textarea
                          value={newFeedback.message}
                          onChange={(e) => setNewFeedback({ ...newFeedback, message: e.target.value })}
                          placeholder="Your feedback..."
                          className="text-sm min-h-[70px] resize-none"
                          disabled={viewerIsReadOnly}
                        />
                        <Button 
                          onClick={() => {
                            submitFeedback()
                            // Collapse form after submission starts
                            // The form will stay collapsed after successful submit
                            setTimeout(() => {
                              setShowFeedbackForm(false)
                              // Reset form
                              setNewFeedback({ type: feedbackTypes[0]?.value || '', target: '', message: '' })
                            }, 500)
                          }} 
                          disabled={submittingFeedback || !newFeedback.message.trim() || viewerIsReadOnly} 
                          className="w-full" 
                          size="sm"
                        >
                          {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
