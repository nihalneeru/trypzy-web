'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Lightbulb, ListTodo, MessageCircle, Vote, MapPin, Calendar as CalendarIcon, Lock, Sparkles, RefreshCw } from 'lucide-react'
import Image from 'next/image'

// BrandedSpinner component (copied from app/page.js for self-contained component)
function BrandedSpinner({ className = '', size = 'default' }: { className?: string; size?: 'sm' | 'default' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }
  
  const dimensions = {
    sm: 16,
    default: 20,
    md: 24,
    lg: 32
  }
  
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <Image
        src="/brand/trypzy-icon.png"
        alt="Loading"
        width={dimensions[size]}
        height={dimensions[size]}
        className={`${sizeClasses[size]} animate-spin`}
        unoptimized
      />
    </div>
  )
}

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
  upvoteIdea
}: any) {
  if (trip.status !== 'locked') {
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
            {/* Add Idea Form */}
            <div className="space-y-2">
              <Input
                value={newIdea.title}
                onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
                placeholder="Activity title"
                className="text-sm"
              />
              <Textarea
                value={newIdea.details}
                onChange={(e) => setNewIdea({ ...newIdea, details: e.target.value })}
                placeholder="Details (optional)"
                className="text-sm min-h-[60px]"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={newIdea.category} onValueChange={(v) => setNewIdea({ ...newIdea, category: v })}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ideaCategories.map((cat: any) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newIdea.location}
                  onChange={(e) => setNewIdea({ ...newIdea, location: e.target.value })}
                  placeholder="Location (optional)"
                  className="text-sm"
                />
              </div>
              <Input
                value={newIdea.constraints}
                onChange={(e) => setNewIdea({ ...newIdea, constraints: e.target.value })}
                placeholder="Constraints (comma separated)"
                className="text-sm"
              />
              <Button onClick={addIdea} disabled={addingIdea || !newIdea.title.trim()} className="w-full" size="sm">
                {addingIdea ? 'Adding...' : 'Add Idea'}
              </Button>
            </div>
            
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
                <div className="space-y-2">
                  {ideas.map((idea: any) => (
                    <div 
                      key={idea.id} 
                      className="flex items-start justify-between p-2 bg-gray-50 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-xs"
                            onClick={() => upvoteIdea(idea.id)}
                          >
                            <Vote className="h-3 w-3" />
                          </Button>
                          <span className="text-xs font-semibold text-[#FA3823]">{idea.priority || 0}</span>
                          <Badge variant="secondary" className="text-xs">
                            {ideaCategories.find((c: any) => c.value === idea.category)?.label || idea.category}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{idea.title}</p>
                        {idea.details && <p className="text-xs text-gray-600 mt-1">{idea.details}</p>}
                        {idea.location && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {idea.location}
                          </p>
                        )}
                        {idea.constraints && idea.constraints.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Constraints: {idea.constraints.join(', ')}
                          </p>
                        )}
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
                <Button onClick={generateItinerary} disabled={generating || ideas.length === 0} size="sm">
                  {generating ? (
                    <>
                      <BrandedSpinner size="sm" className="mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
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
                  {trip.isCreator && ideas.length > 0 && (
                    <Button onClick={generateItinerary} disabled={generating}>
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
                                {new Date(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
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
          <CardContent className="flex flex-col h-full">
            {!latestVersion ? (
              <div className="text-center py-12">
                <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">No itinerary published yet</p>
                <p className="text-gray-400 text-xs mt-2">Feedback will appear here once an itinerary is generated</p>
              </div>
            ) : (
              <>
                <ScrollArea className="flex-1 mb-4">
                  {loadingFeedback ? (
                    <div className="flex justify-center py-8">
                      <BrandedSpinner size="md" />
                    </div>
                  ) : feedback.length === 0 ? (
                    <p className="text-center text-gray-500 py-8 text-sm">
                      No feedback yet. Share your thoughts!
                    </p>
                  ) : (
                    <div className="space-y-3">
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
                
                <div className="space-y-2 pt-4 border-t">
                  <Select value={newFeedback.type} onValueChange={(v) => setNewFeedback({ ...newFeedback, type: v })}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
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
                    placeholder="Target (e.g., day2.block3) - optional"
                    className="text-sm"
                  />
                  <Textarea
                    value={newFeedback.message}
                    onChange={(e) => setNewFeedback({ ...newFeedback, message: e.target.value })}
                    placeholder="Your feedback..."
                    className="text-sm min-h-[80px]"
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
