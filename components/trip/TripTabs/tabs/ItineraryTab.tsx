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
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

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
  token
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
            
            {/* Ideas List */}
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
                <div className="space-y-3">
                  {ideas.map((idea: any) => (
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
                          {idea.author && (
                            <span>by {idea.author.name}</span>
                          )}
                          {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0)) > 0 && (
                            <span className="text-gray-600">
                              • {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0))} {(idea.likeCount !== undefined ? idea.likeCount : (idea.priority || 0)) === 1 ? 'like' : 'likes'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
              {trip.isCreator && !latestVersion && (
                <div className="flex flex-col gap-2">
                  {/* Leader stats */}
                  <div className="text-xs text-gray-500">
                    {ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'} from {[...new Set(ideas.map((i: any) => i.authorUserId || i.authorId))].filter(Boolean).length} {[...new Set(ideas.map((i: any) => i.authorUserId || i.authorId))].filter(Boolean).length === 1 ? 'traveler' : 'travelers'}
                  </div>
                  <Button 
                    onClick={generateItinerary} 
                    disabled={true} 
                    size="sm"
                    title="Generate itinerary (coming soon)"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Itinerary
                  </Button>
                  <p className="text-xs text-gray-500">Waiting for more ideas from travelers</p>
                </div>
              )}
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
                      <Button onClick={generateItinerary} disabled={true} title="Generate itinerary (coming soon)">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Itinerary
                      </Button>
                      <p className="text-xs text-gray-500">Waiting for more ideas from travelers</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
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
                <Button onClick={reviseItinerary} disabled={revising || feedback.length === 0} size="sm" variant="outline">
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
                
                <div className="space-y-2.5 pt-4 border-t bg-white">
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
                    />
                  </div>
                  <Textarea
                    value={newFeedback.message}
                    onChange={(e) => setNewFeedback({ ...newFeedback, message: e.target.value })}
                    placeholder="Your feedback..."
                    className="text-sm min-h-[70px] resize-none"
                  />
                  <Button onClick={submitFeedback} disabled={submittingFeedback || !newFeedback.message.trim()} className="w-full" size="sm">
                    {submittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
