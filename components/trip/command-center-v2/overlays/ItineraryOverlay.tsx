'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Lightbulb,
  ListTodo,
  MessageCircle,
  Vote,
  MapPin,
  Calendar as CalendarIcon,
  Sparkles,
  RefreshCw,
  Edit2,
  Save,
  X,
  ThumbsUp,
  Heart,
  ChevronDown,
  AlertTriangle
} from 'lucide-react'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { toast } from 'sonner'
import { ITINERARY_CONFIG } from '@/lib/itinerary/config'

// ============================================================================
// Types
// ============================================================================

interface ItineraryOverlayProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  onClose: () => void
  setHasUnsavedChanges: (has: boolean) => void
}

interface Idea {
  id: string
  text: string
  authorUserId?: string
  authorId?: string
  userId?: string
  author?: {
    name: string
    id?: string
  }
  likeCount?: number
  userLiked?: boolean
  createdAt?: string
}

interface Feedback {
  id: string
  type: string
  target?: string
  message: string
  author?: {
    name: string
  }
  createdAt: string
}

interface ItineraryVersion {
  id: string
  version: number
  changeLog?: string
  createdAt?: string
  content?: {
    overview?: {
      pace?: string
      budget?: string
      notes?: string
    }
    days?: ItineraryDay[]
  }
  llmMeta?: {
    ideaCount?: number
    feedbackCount?: number
    reactionCount?: number
    chatMessageCount?: number
    chatBriefEnabled?: boolean
    chatBriefSucceeded?: boolean
  }
}

interface ItineraryDay {
  date: string
  title?: string
  blocks?: ItineraryBlock[]
  areaFocus?: string
  groupFit?: string
}

interface ItineraryBlock {
  timeRange: string
  title: string
  description?: string
  location?: string
  estCost?: string
  transitNotes?: string
  tags?: string[]
  reservation?: { needed?: boolean; notes?: string }
}

interface Reaction {
  id: string
  userId: string
  reactionKey: string
  category: string
  user?: {
    id: string
    name: string
  } | null
}

// ============================================================================
// Constants
// ============================================================================

const FEEDBACK_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'add', label: 'Add something' },
  { value: 'remove', label: 'Remove something' },
  { value: 'modify', label: 'Change something' },
  { value: 'timing', label: 'Timing' },
  { value: 'budget', label: 'Budget' }
]

const REACTION_GROUPS = [
  {
    category: 'pace',
    label: 'Pace',
    exclusive: true,
    advanced: false,
    reactions: [
      { id: 'pace:slow', label: 'Slower', emoji: '🐢', advanced: false },
      { id: 'pace:balanced', label: 'Just right', emoji: '⚖️', advanced: false },
      { id: 'pace:fast', label: 'Faster', emoji: '⚡', advanced: false }
    ]
  },
  {
    category: 'focus',
    label: 'What matters most',
    exclusive: false,
    advanced: false,
    reactions: [
      { id: 'focus:culture', label: 'Culture', emoji: '🏛️', advanced: false },
      { id: 'focus:food', label: 'Food', emoji: '🍽️', advanced: false },
      { id: 'focus:nature', label: 'Nature', emoji: '🌲', advanced: false },
      { id: 'focus:local', label: 'Local vibes', emoji: '🗺️', advanced: false },
      { id: 'focus:nightlife', label: 'Nightlife', emoji: '🌃', advanced: true }
    ]
  },
  {
    category: 'budget',
    label: 'Budget',
    exclusive: true,
    advanced: false,
    reactions: [
      { id: 'budget:lower', label: 'Budget-friendly', emoji: '💰', advanced: false },
      { id: 'budget:mid', label: 'Comfortable', emoji: '💵', advanced: false },
      { id: 'budget:high', label: 'Splurge', emoji: '💎', advanced: false }
    ]
  },
  {
    category: 'logistics',
    label: 'Travel style',
    exclusive: false,
    advanced: true,
    reactions: [
      { id: 'logistics:fewer-moves', label: 'Fewer travel days', emoji: '🎒', advanced: true },
      { id: 'logistics:short-days', label: 'Shorter days', emoji: '⏱️', advanced: true },
      { id: 'logistics:central-base', label: 'One home base', emoji: '🏨', advanced: true }
    ]
  }
]

// Use centralized config for easy post-MVP adjustment
const { MAX_IDEAS_PER_USER, MAX_IDEA_LENGTH, MAX_VERSIONS } = ITINERARY_CONFIG

// Cycling progress messages shown during LLM generation
const GENERATION_PROGRESS_MESSAGES = [
  'Gathering ideas...',
  'Building the itinerary...',
  'Organizing days...',
  'Adding local recommendations...',
  'Polishing the plan...',
  'Almost there...'
]

// ============================================================================
// Helpers
// ============================================================================

/**
 * API Helper - makes authenticated requests to the backend
 */
// Custom error class to preserve API error codes
class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

async function api(endpoint: string, options: RequestInit = {}, token: string | null = null): Promise<any> {
  const headers: Record<string, string> = {}

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(data.error || 'Something went wrong', data.code)
  }

  return data
}

/**
 * Format relative date for display
 */
function formatDate(dateStr: string): string {
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

/**
 * Parse YYYY-MM-DD date string as local date to avoid timezone issues
 */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Get author ID from various possible fields
 */
function getAuthorId(idea: Idea): string | null {
  if (!idea) return null
  if (idea.authorUserId) return idea.authorUserId
  if (idea.authorId) return idea.authorId
  if (idea.userId) return idea.userId
  return null
}

// ============================================================================
// Component
// ============================================================================

export function ItineraryOverlay({
  trip,
  token,
  user,
  onRefresh,
  onClose,
  setHasUnsavedChanges
}: ItineraryOverlayProps) {
  // ----------------------------------------------------------------------------
  // Ideas State
  // ----------------------------------------------------------------------------
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [ideasError, setIdeasError] = useState<string | null>(null)
  const [newIdeaText, setNewIdeaText] = useState('')
  const [addingIdea, setAddingIdea] = useState(false)

  // ----------------------------------------------------------------------------
  // Destination Hint State
  // ----------------------------------------------------------------------------
  const [editingDestinationHint, setEditingDestinationHint] = useState(false)
  const [destinationHintValue, setDestinationHintValue] = useState(trip?.destinationHint || '')
  const [savingDestinationHint, setSavingDestinationHint] = useState(false)

  // ----------------------------------------------------------------------------
  // Itinerary State
  // ----------------------------------------------------------------------------
  const [allVersions, setAllVersions] = useState<ItineraryVersion[]>([])
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number>(-1)
  const [latestVersion, setLatestVersion] = useState<ItineraryVersion | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [revising, setRevising] = useState(false)
  // Version limit tracking (server is source of truth via data.canRevise)
  const [versionCount, setVersionCount] = useState(0)
  const [maxVersions, setMaxVersions] = useState(MAX_VERSIONS)
  const [canRevise, setCanRevise] = useState(true)

  // ----------------------------------------------------------------------------
  // Feedback State
  // ----------------------------------------------------------------------------
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [newFeedback, setNewFeedback] = useState({
    type: 'general',
    target: '',
    message: ''
  })
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  // ----------------------------------------------------------------------------
  // Reactions State
  // ----------------------------------------------------------------------------
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [loadingReactions, setLoadingReactions] = useState(false)
  const [reactingChip, setReactingChip] = useState<string | null>(null)
  const [reactingAction, setReactingAction] = useState<'adding' | 'removing' | null>(null)
  const [showAdvancedPreferences, setShowAdvancedPreferences] = useState(false)
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)
  const [generateWarning, setGenerateWarning] = useState({
    needsIdeas: false,
    needsDestinationHint: false
  })
  const [llmDisabledMessage, setLlmDisabledMessage] = useState<string | null>(null)
  const [generatingMsgIndex, setGeneratingMsgIndex] = useState(0)

  // Cycle through progress messages during generation
  useEffect(() => {
    if (!generating && !revising) {
      setGeneratingMsgIndex(0)
      return
    }
    const interval = setInterval(() => {
      setGeneratingMsgIndex(prev =>
        (prev + 1) % GENERATION_PROGRESS_MESSAGES.length
      )
    }, 2500)
    return () => clearInterval(interval)
  }, [generating, revising])

  // ----------------------------------------------------------------------------
  // Derived State
  // ----------------------------------------------------------------------------
  const viewer = trip?.viewer || {}
  const isCancelled = trip?.tripStatus === 'CANCELLED' || trip?.status === 'canceled'
  const viewerIsReadOnly =
    !viewer.isActiveParticipant ||
    viewer.participantStatus === 'left' ||
    isCancelled
  const readOnlyReason =
    isCancelled
      ? 'Trip is canceled'
      : viewer.isRemovedTraveler
        ? "You've left this trip"
        : !viewer.isActiveParticipant
          ? 'You are not a traveler on this trip'
          : null
  const isLeader = trip?.isCreator === true
  const destinationHint = (trip?.destinationHint || '').trim()

  // Track unsaved changes for idea input
  useEffect(() => {
    setHasUnsavedChanges(newIdeaText.trim().length > 0)
  }, [newIdeaText, setHasUnsavedChanges])

  // Update destination hint value when trip changes
  useEffect(() => {
    if (trip?.destinationHint !== undefined) {
      setDestinationHintValue(trip.destinationHint || '')
    }
  }, [trip?.destinationHint])

  // Count user's ideas
  const userIdeaCount = useMemo(() => {
    if (!ideas || !user?.id) return 0
    return ideas.filter((idea) => getAuthorId(idea) === user.id).length
  }, [ideas, user?.id])

  // Selected version for viewing (defaults to latest)
  const selectedVersion = useMemo(() => {
    if (selectedVersionIdx < 0 || selectedVersionIdx >= allVersions.length) return latestVersion
    return allVersions[selectedVersionIdx]
  }, [allVersions, selectedVersionIdx, latestVersion])

  const isViewingLatest = selectedVersion?.version === latestVersion?.version

  const generateNeedsIdeas = ideas.length === 0
  const generateNeedsDestinationHint = destinationHint.length === 0
  const llmDisabled = Boolean(llmDisabledMessage)

  const generateWarningDetails = useMemo(() => {
    const parts = []
    if (generateWarning.needsIdeas) parts.push('no trip ideas yet')
    if (generateWarning.needsDestinationHint) parts.push('no destination hint')
    return parts.join(' and ')
  }, [generateWarning])

  // Group ideas by traveler
  const groupedIdeas = useMemo(() => {
    if (!ideas || ideas.length === 0) return []

    const groups = new Map<
      string,
      { travelerId: string; travelerName: string; ideas: Idea[]; count: number }
    >()

    ideas.forEach((idea) => {
      const travelerId = getAuthorId(idea)
      if (!travelerId) return

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

    const currentUserId = user?.id
    return Array.from(groups.values()).sort((a, b) => {
      if (currentUserId) {
        if (a.travelerId === currentUserId) return -1
        if (b.travelerId === currentUserId) return 1
      }
      const aIncomplete = a.count < MAX_IDEAS_PER_USER
      const bIncomplete = b.count < MAX_IDEAS_PER_USER
      if (aIncomplete && !bIncomplete) return -1
      if (!aIncomplete && bIncomplete) return 1
      return a.travelerName.localeCompare(b.travelerName)
    })
  }, [ideas, user?.id])

  // Calculate new feedback count since current version
  const newFeedbackCount = useMemo(() => {
    if (!latestVersion || !feedback || feedback.length === 0) return 0

    const versionCreatedAt = latestVersion.createdAt
    if (versionCreatedAt) {
      return feedback.filter((fb) => {
        if (fb.createdAt) {
          return new Date(fb.createdAt) > new Date(versionCreatedAt)
        }
        return false
      }).length
    }
    return 0
  }, [latestVersion, feedback])

  // Aggregate reaction counts
  const reactionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    reactions.forEach((r) => {
      counts.set(r.reactionKey, (counts.get(r.reactionKey) || 0) + 1)
    })
    return counts
  }, [reactions])

  // Get current user's reactions
  const userReactions = useMemo(() => {
    if (!user?.id) return []
    return reactions
      .filter((r) => r.userId === user.id)
      .map((r) => {
        for (const group of REACTION_GROUPS) {
          const matching = group.reactions.find((rx) => rx.id === r.reactionKey)
          if (matching) return matching.label
        }
        return null
      })
      .filter(Boolean)
  }, [reactions, user?.id])

  // Check if revise button should be enabled (combines server canRevise with UI conditions)
  const reviseButtonEnabled = useMemo(() => {
    // Server says we've hit version limit
    if (!canRevise) return false
    // Must have a version, be leader, and not currently revising
    if (!latestVersion || !isLeader || revising) return false
    // Enable if there's new feedback OR reactions for the current version
    return newFeedbackCount > 0 || reactions.length > 0
  }, [canRevise, latestVersion, isLeader, newFeedbackCount, reactions.length, revising])

  // ----------------------------------------------------------------------------
  // Data Loading
  // ----------------------------------------------------------------------------

  // Load ideas
  const loadIdeas = useCallback(async () => {
    if (!trip?.id || !token) return
    setLoadingIdeas(true)
    try {
      const data = await api(`/trips/${trip.id}/itinerary/ideas`, { method: 'GET' }, token)
      setIdeas(data.ideas || data || [])
      setIdeasError(null)
    } catch (error: any) {
      console.error('Failed to load ideas:', error)
      setIdeasError(error.message || 'Failed to load ideas')
    } finally {
      setLoadingIdeas(false)
    }
  }, [trip?.id, token])

  // Load itinerary versions
  const loadVersions = useCallback(async () => {
    if (!trip?.id || !token) return
    setLoadingVersions(true)
    try {
      const data = await api(`/trips/${trip.id}/itinerary/versions`, { method: 'GET' }, token)
      const versions = (data.versions || data || [])
        .sort((a: ItineraryVersion, b: ItineraryVersion) => a.version - b.version)

      // Track version metadata from server (source of truth for version limit)
      setVersionCount(data.versionCount ?? versions.length)
      setMaxVersions(data.maxVersions ?? MAX_VERSIONS)
      setCanRevise(data.canRevise ?? versions.length < MAX_VERSIONS)
      setAllVersions(versions)

      if (versions.length > 0) {
        const latest = versions[versions.length - 1]
        setLatestVersion(latest)
        setSelectedVersionIdx(versions.length - 1)
      } else {
        setLatestVersion(null)
        setSelectedVersionIdx(-1)
      }
    } catch (error: any) {
      console.error('Failed to load versions:', error)
    } finally {
      setLoadingVersions(false)
    }
  }, [trip?.id, token])

  // Load feedback for the current version
  const loadFeedback = useCallback(async () => {
    if (!trip?.id || !token || !latestVersion) return
    setLoadingFeedback(true)
    try {
      const data = await api(
        `/trips/${trip.id}/itinerary/feedback?version=${latestVersion.version}`,
        { method: 'GET' },
        token
      )
      setFeedback(data.feedback || data || [])
    } catch (error: any) {
      console.error('Failed to load feedback:', error)
    } finally {
      setLoadingFeedback(false)
    }
  }, [trip?.id, token, latestVersion])

  // Load reactions for current version
  const loadReactions = useCallback(async () => {
    if (!latestVersion || !trip?.id || !token) return
    setLoadingReactions(true)
    try {
      const data = await api(
        `/trips/${trip.id}/itinerary/versions/${latestVersion.id}/reactions`,
        { method: 'GET' },
        token
      )
      setReactions(data || [])
    } catch (error: any) {
      console.error('Failed to load reactions:', error)
      setReactions([])
    } finally {
      setLoadingReactions(false)
    }
  }, [latestVersion, trip?.id, token])

  // Initial data load
  useEffect(() => {
    loadIdeas()
    loadVersions()
  }, [loadIdeas, loadVersions])

  // Load feedback and reactions when version changes
  useEffect(() => {
    if (latestVersion) {
      loadFeedback()
      loadReactions()
    }
  }, [latestVersion, loadFeedback, loadReactions])

  // ----------------------------------------------------------------------------
  // Actions
  // ----------------------------------------------------------------------------

  // Add idea
  const handleAddIdea = async () => {
    if (!newIdeaText.trim() || addingIdea || viewerIsReadOnly) return
    if (userIdeaCount >= MAX_IDEAS_PER_USER) {
      toast.error(`You can only submit ${MAX_IDEAS_PER_USER} ideas`)
      return
    }

    setAddingIdea(true)
    try {
      await api(
        `/trips/${trip.id}/itinerary/ideas`,
        {
          method: 'POST',
          body: JSON.stringify({ text: newIdeaText.trim() })
        },
        token
      )
      setNewIdeaText('')
      setHasUnsavedChanges(false)
      toast.success('Idea added!')
      await loadIdeas()
      onRefresh() // Refresh trip to update ideaSummary for CTA bar
    } catch (error: any) {
      toast.error(error.message || 'Could not add idea — please try again')
    } finally {
      setAddingIdea(false)
    }
  }

  // Like/unlike idea
  const handleLikeIdea = async (ideaId: string) => {
    if (viewerIsReadOnly) return
    try {
      await api(`/trips/${trip.id}/itinerary/ideas/${ideaId}/like`, { method: 'POST' }, token)
      await loadIdeas()
    } catch (error: any) {
      toast.error(error.message || 'Could not like idea — please try again')
    }
  }

  // Save destination hint (leader only)
  const handleSaveDestinationHint = async () => {
    if (!isLeader) return
    setSavingDestinationHint(true)
    try {
      // P0-3: Get updated trip for immediate UI refresh
      const updatedTrip = await api(
        `/trips/${trip.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ destinationHint: destinationHintValue })
        },
        token
      )
      toast.success('Destination hint updated')
      setEditingDestinationHint(false)
      onRefresh(updatedTrip)
    } catch (error: any) {
      toast.error(error.message || 'Couldn\'t update destination — try again')
    } finally {
      setSavingDestinationHint(false)
    }
  }

  // Cancel destination hint editing
  const handleCancelDestinationHint = () => {
    setDestinationHintValue(trip?.destinationHint || '')
    setEditingDestinationHint(false)
  }

  // Generate itinerary (leader only)
  const handleGenerateItinerary = async (forceGenerate = false) => {
    if (!isLeader || generating) return
    setGenerating(true)
    try {
      setLlmDisabledMessage(null)
      const body = forceGenerate ? JSON.stringify({ forceGenerate: true }) : undefined
      const result = await api(
        `/trips/${trip.id}/itinerary/generate`,
        { method: 'POST', body },
        token
      )
      toast.success('Itinerary generated!')
      await loadVersions()
      // Pass updated trip if returned, otherwise trigger refetch
      onRefresh(result?.trip || undefined)
    } catch (error: any) {
      const message = error.message || 'Couldn\'t generate itinerary — try again'
      if (message.includes('AI features are disabled')) {
        setLlmDisabledMessage(message)
      }
      toast.error(message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateClick = () => {
    if (!isLeader || generating || llmDisabled) return
    if (generateNeedsIdeas || generateNeedsDestinationHint) {
      setGenerateWarning({
        needsIdeas: generateNeedsIdeas,
        needsDestinationHint: generateNeedsDestinationHint
      })
      setShowGenerateConfirm(true)
      return
    }
    handleGenerateItinerary(false)
  }

  // Revise itinerary (leader only)
  const handleReviseItinerary = async () => {
    if (!isLeader || revising || !reviseButtonEnabled || llmDisabled) return
    setRevising(true)
    try {
      setLlmDisabledMessage(null)
      // P0-3: Get updated trip for immediate UI refresh
      const result = await api(`/trips/${trip.id}/itinerary/revise`, { method: 'POST' }, token)
      toast.success('Itinerary revised!')
      await loadVersions()
      await loadFeedback()
      // Pass updated trip if returned, otherwise trigger refetch
      onRefresh(result?.trip || undefined)
    } catch (error: any) {
      const message = error.message || 'Couldn\'t revise itinerary — try again'

      // Handle specific error codes
      if (error.code === 'VERSION_LIMIT_REACHED') {
        setCanRevise(false)
        toast.info('This itinerary is now finalized')
      } else if (message.includes('AI features are disabled')) {
        setLlmDisabledMessage(message)
        toast.error(message)
      } else {
        toast.error(message)
      }
    } finally {
      setRevising(false)
    }
  }

  // Submit feedback
  const handleSubmitFeedback = async () => {
    if (!newFeedback.message.trim() || submittingFeedback || viewerIsReadOnly || !latestVersion) return
    setSubmittingFeedback(true)
    try {
      await api(
        `/trips/${trip.id}/itinerary/feedback`,
        {
          method: 'POST',
          body: JSON.stringify({
            itineraryVersion: latestVersion.version,
            type: newFeedback.type,
            target: newFeedback.target || undefined,
            message: newFeedback.message.trim()
          })
        },
        token
      )
      toast.success('Feedback added')
      setNewFeedback({ type: 'general', target: '', message: '' })
      setShowFeedbackForm(false)
      await loadFeedback()
    } catch (error: any) {
      toast.error(error.message || 'Could not submit feedback — please try again')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  // Send a chat message for the reaction
  const sendReactionChatMessage = async (reactionLabel: string, reactionEmoji: string, isAdding: boolean) => {
    try {
      const action = isAdding ? 'prefers' : 'removed preference for'
      const message = `${reactionEmoji} ${user?.name || 'Someone'} ${action} "${reactionLabel}" for the itinerary`
      await api(
        `/trips/${trip.id}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ content: message })
        },
        token
      )
    } catch (error) {
      // Silent fail - chat message is optional enhancement
      console.error('Failed to send reaction chat message:', error)
    }
  }

  // Handle quick reaction click
  const handleQuickReaction = async (reactionId: string, category: string) => {
    if (reactingChip || viewerIsReadOnly || !latestVersion) return

    setReactingChip(reactionId)

    // Find the reaction details for the chat message
    let reactionLabel = ''
    let reactionEmoji = ''
    for (const group of REACTION_GROUPS) {
      const matching = group.reactions.find((rx) => rx.id === reactionId)
      if (matching) {
        reactionLabel = matching.label
        reactionEmoji = matching.emoji
        break
      }
    }

    try {
      const userReactionKeys = reactions.filter((r) => r.userId === user?.id).map((r) => r.reactionKey)
      const hasReaction = userReactionKeys.includes(reactionId)

      if (hasReaction) {
        setReactingAction('removing')
        await api(
          `/trips/${trip.id}/itinerary/versions/${latestVersion.id}/reactions?reactionKey=${encodeURIComponent(reactionId)}`,
          { method: 'DELETE' },
          token
        )
        // Send chat message for removing reaction
        await sendReactionChatMessage(reactionLabel, reactionEmoji, false)
        toast.success('Reaction removed')
      } else {
        setReactingAction('adding')
        await api(
          `/trips/${trip.id}/itinerary/versions/${latestVersion.id}/reactions`,
          {
            method: 'POST',
            body: JSON.stringify({ category, reactionKey: reactionId })
          },
          token
        )
        // Send chat message for adding reaction
        await sendReactionChatMessage(reactionLabel, reactionEmoji, true)
        toast.success('Reaction added')
      }

      await loadReactions()

      setTimeout(() => {
        setReactingChip(null)
        setReactingAction(null)
      }, 800)
    } catch (error: any) {
      setReactingChip(null)
      setReactingAction(null)
      toast.error(error.message || 'Could not save reaction — please try again')
    }
  }

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Section 1: Ideas Submission */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Activity Ideas
          </CardTitle>
          <CardDescription>
            Share up to {MAX_IDEAS_PER_USER} activity ideas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Destination Hint (Leader only) */}
          {(trip?.destinationHint || isLeader) && (
            <div className="pb-3 border-b">
              <p className="text-xs font-medium text-gray-500 mb-1">Destination</p>
              {editingDestinationHint && isLeader ? (
                <div className="space-y-2">
                  <Input
                    value={destinationHintValue}
                    onChange={(e) => setDestinationHintValue(e.target.value)}
                    placeholder="e.g., Kenya (Nairobi + Maasai Mara)"
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
                <div
                  className={`flex items-start justify-between gap-2${isLeader ? ' cursor-pointer hover:bg-gray-50 rounded-md -mx-1 px-1 transition-colors' : ''}`}
                  onClick={isLeader ? () => {
                    setDestinationHintValue(trip?.destinationHint || '')
                    setEditingDestinationHint(true)
                  } : undefined}
                >
                  {trip?.destinationHint ? (
                    <p className="text-sm text-gray-700 flex-1">{trip.destinationHint}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic flex-1">No destination set</p>
                  )}
                  {isLeader && (
                    <Edit2 className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add Idea Form */}
          {userIdeaCount < MAX_IDEAS_PER_USER ? (
            <div className="space-y-2">
              <Textarea
                value={newIdeaText}
                onChange={(e) => setNewIdeaText(e.target.value)}
                placeholder={
                  viewerIsReadOnly
                    ? readOnlyReason || ''
                    : 'e.g., Visit the local market, Try authentic street food...'
                }
                className="text-sm min-h-[80px]"
                maxLength={MAX_IDEA_LENGTH}
                disabled={viewerIsReadOnly}
              />
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{newIdeaText.length}/{MAX_IDEA_LENGTH} characters</span>
                <span>{userIdeaCount}/{MAX_IDEAS_PER_USER} ideas added</span>
              </div>
              <Button
                onClick={handleAddIdea}
                disabled={viewerIsReadOnly || addingIdea || !newIdeaText.trim()}
                className="w-full"
                size="sm"
              >
                {addingIdea ? 'Adding...' : 'Add idea'}
              </Button>
              {viewerIsReadOnly && readOnlyReason && (
                <p className="text-xs text-gray-500 text-center mt-1">{readOnlyReason}</p>
              )}
            </div>
          ) : (
            <div className="text-center py-4 px-2 bg-gray-50 rounded-lg border">
              <p className="text-sm text-gray-600">You've added all {MAX_IDEAS_PER_USER} ideas</p>
            </div>
          )}

          {/* Ideas List - Grouped by Traveler */}
          <div className="pt-2">
            <p className="text-xs font-medium text-gray-500 mb-2">All Ideas</p>
            <ScrollArea className="h-[180px] md:h-[250px]">
              {loadingIdeas ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <BrandedSpinner size="md" className="mb-2" />
                  <p className="text-sm text-gray-500">Loading ideas...</p>
                </div>
              ) : ideasError ? (
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  <AlertTriangle className="h-10 w-10 text-brand-red mb-3" />
                  <p className="text-sm text-gray-600 mb-4">{ideasError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIdeasError(null)
                      loadIdeas()
                    }}
                  >
                    Try again
                  </Button>
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
                    const hasEnoughIdeas = group.count >= MAX_IDEAS_PER_USER

                    return (
                      <AccordionItem key={group.travelerId} value={`traveler-${group.travelerId}`}>
                        <AccordionTrigger className="hover:no-underline py-2">
                          <div className="flex items-center gap-2 flex-1 text-left">
                            <span className="font-medium text-sm">{travelerName}</span>
                            <span className="text-xs text-gray-500">({group.count}/{MAX_IDEAS_PER_USER})</span>
                            {hasEnoughIdeas ? (
                              <span className="text-green-600 text-xs">Complete</span>
                            ) : (
                              <span className="text-yellow-600 text-xs">Pending</span>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-1">
                            {group.ideas.map((idea) => (
                              <div
                                key={idea.id}
                                className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg border"
                              >
                                <Button
                                  size="icon"
                                  variant={idea.userLiked ? 'default' : 'ghost'}
                                  className="h-7 w-7 flex-shrink-0"
                                  onClick={() => handleLikeIdea(idea.id)}
                                  disabled={viewerIsReadOnly}
                                >
                                  <Heart
                                    className={`h-3.5 w-3.5 ${idea.userLiked ? 'text-white fill-white' : ''}`}
                                  />
                                </Button>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900">{idea.text}</p>
                                  {(idea.likeCount || 0) > 0 && (
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {idea.likeCount} {idea.likeCount === 1 ? 'like' : 'likes'}
                                    </p>
                                  )}
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
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Itinerary Viewer */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTodo className="h-5 w-5" />
                Itinerary
              </CardTitle>
              {latestVersion && (
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Version {selectedVersion?.version || latestVersion.version} of {maxVersions}
                    </Badge>
                    {!canRevise && isViewingLatest && (
                      <Badge variant="secondary" className="text-xs bg-brand-sand text-brand-carbon">
                        Final
                      </Badge>
                    )}
                    {!isViewingLatest && (
                      <Badge variant="secondary" className="text-xs">
                        Viewing older version
                      </Badge>
                    )}
                  </div>
                  {/* llmMeta transparency — what inputs were used */}
                  {selectedVersion?.llmMeta && (
                    <p className="text-xs text-gray-500">
                      Based on {selectedVersion.llmMeta.ideaCount || 0} idea{(selectedVersion.llmMeta.ideaCount || 0) !== 1 ? 's' : ''}
                      {(selectedVersion.llmMeta.feedbackCount || 0) > 0 && (
                        <>, {selectedVersion.llmMeta.feedbackCount} feedback</>
                      )}
                      {(selectedVersion.llmMeta.reactionCount || 0) > 0 && (
                        <>, {selectedVersion.llmMeta.reactionCount} reaction{selectedVersion.llmMeta.reactionCount !== 1 ? 's' : ''}</>
                      )}
                      {selectedVersion.llmMeta.chatBriefSucceeded && (
                        <> + chat context</>
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>
            {isLeader && !latestVersion && (
              <Button
                onClick={handleGenerateClick}
                disabled={generating || llmDisabled}
                size="sm"
              >
                {generating ? (
                  <>
                    <BrandedSpinner size="sm" className="mr-2" />
                    {GENERATION_PROGRESS_MESSAGES[generatingMsgIndex]}
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
          {/* Version picker tabs */}
          {allVersions.length > 1 && (
            <div className="flex gap-1 mb-3 pb-3 border-b">
              {allVersions.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    selectedVersionIdx === idx
                      ? 'bg-brand-blue text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  v{v.version}
                  {idx === allVersions.length - 1 && ' (latest)'}
                </button>
              ))}
            </div>
          )}

          <ScrollArea className="h-[250px] md:h-[350px]">
            {loadingVersions ? (
              <div className="flex flex-col items-center justify-center py-8">
                <BrandedSpinner size="md" className="mb-2" />
                <p className="text-sm text-gray-500">Loading itinerary...</p>
              </div>
            ) : !latestVersion ? (
              <div className="py-6">
                {/* "What Tripti will use" panel — pre-generate transparency */}
                {isLeader ? (
                  <div className="space-y-3">
                    <div className="text-center mb-4">
                      <ListTodo className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No itinerary generated yet</p>
                    </div>
                    <div className="rounded-lg border border-brand-sand bg-brand-sand/30 p-3">
                      <p className="text-xs font-semibold text-brand-carbon mb-2">What Tripti will use to generate</p>
                      <div className="space-y-1.5 text-xs text-brand-carbon/80">
                        <div className="flex items-center justify-between">
                          <span>Destination</span>
                          <span className={`font-medium ${destinationHint ? 'text-brand-carbon' : 'text-gray-400 italic'}`}>
                            {destinationHint || 'Not set'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Trip dates</span>
                          <span className="font-medium">
                            {trip?.lockedStartDate && trip?.lockedEndDate
                              ? `${new Date(trip.lockedStartDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.lockedEndDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : 'Not locked'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Ideas</span>
                          <span className={`font-medium ${ideas.length > 0 ? 'text-brand-carbon' : 'text-gray-400 italic'}`}>
                            {ideas.length > 0
                              ? `${ideas.length} from ${groupedIdeas.length} traveler${groupedIdeas.length !== 1 ? 's' : ''}`
                              : 'None yet'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Group size</span>
                          <span className="font-medium">{trip?.activeTravelerCount || trip?.memberCount || '–'} travelers</span>
                        </div>
                      </div>
                    </div>
                    {llmDisabledMessage && (
                      <div className="inline-flex items-center gap-2 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>{llmDisabledMessage}</span>
                      </div>
                    )}
                    {generating && (
                      <p className="text-xs text-gray-500 text-center">{GENERATION_PROGRESS_MESSAGES[generatingMsgIndex]}</p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <ListTodo className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 mb-2 text-sm">No itinerary generated yet</p>
                    <p className="text-xs text-gray-400">
                      The leader will generate an itinerary once ideas are in.
                    </p>
                  </div>
                )}
              </div>
            ) : selectedVersion ? (
              <div className="space-y-4">
                {/* Changelog — prominent banner for v2+ */}
                {selectedVersion.changeLog && selectedVersion.version > 1 && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs font-semibold text-amber-800 mb-1">
                      What changed in v{selectedVersion.version}
                    </p>
                    <p className="text-sm text-amber-900/80">{selectedVersion.changeLog}</p>
                  </div>
                )}

                {/* Overview */}
                {selectedVersion.content?.overview && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs font-medium mb-1">Overview</p>
                    <p className="text-xs text-gray-600">
                      Pace: {selectedVersion.content.overview.pace} | Budget:{' '}
                      {selectedVersion.content.overview.budget}
                    </p>
                    {selectedVersion.content.overview.notes && (
                      <p className="text-xs text-gray-600 mt-1">
                        {selectedVersion.content.overview.notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Days */}
                {selectedVersion.content?.days && (
                  <Accordion type="multiple" className="w-full">
                    {selectedVersion.content.days.map((day, dayIdx) => (
                      <AccordionItem key={dayIdx} value={`day-${dayIdx}`}>
                        <AccordionTrigger className="hover:no-underline py-2">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            <span className="font-medium text-sm">
                              {parseLocalDate(day.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                            {day.title && (
                              <span className="text-xs text-gray-500">- {day.title}</span>
                            )}
                            {day.areaFocus && (
                              <span className="text-xs text-brand-blue ml-1">· {day.areaFocus}</span>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-1">
                            {day.blocks && day.blocks.length > 0 ? (
                              day.blocks.map((block, blockIdx) => (
                                <div
                                  key={blockIdx}
                                  className="border rounded-lg p-2.5 bg-gray-50"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-[#FA3823]">
                                      {block.timeRange}
                                    </span>
                                    {block.tags?.map((tag, tagIdx) => (
                                      <Badge key={tagIdx} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                  </div>
                                  <p className="font-medium text-sm">{block.title}</p>
                                  {block.description && (
                                    <p className="text-xs text-gray-600 mt-0.5">
                                      {block.description}
                                    </p>
                                  )}
                                  {block.location && (
                                    <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {block.location}
                                    </p>
                                  )}
                                  {block.estCost && (
                                    <p className="text-xs text-green-600 mt-0.5">
                                      Est. {block.estCost}
                                    </p>
                                  )}
                                  {block.transitNotes && (
                                    <p className="text-xs text-gray-500 mt-0.5 italic">
                                      Transit: {block.transitNotes}
                                    </p>
                                  )}
                                  {block.reservation?.needed && (
                                    <p className="text-xs text-amber-600 mt-0.5">
                                      Reservation{block.reservation.notes ? `: ${block.reservation.notes}` : ' recommended'}
                                    </p>
                                  )}
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
            ) : null}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Section 3: Feedback & Reactions */}
      {latestVersion && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageCircle className="h-5 w-5" />
                  Feedback
                </CardTitle>
                <CardDescription>
                  React to v{latestVersion.version} or add detailed feedback
                </CardDescription>
              </div>
              {isLeader && (
                <div className="flex flex-col items-end gap-1">
                  {!canRevise ? (
                    <p className="text-xs text-gray-500">
                      Maximum {maxVersions} versions reached
                    </p>
                  ) : newFeedbackCount > 0 || reactions.length > 0 ? (
                    <p className="text-xs text-gray-500">
                      {newFeedbackCount > 0 && `${newFeedbackCount} feedback`}
                      {newFeedbackCount > 0 && reactions.length > 0 && ', '}
                      {reactions.length > 0 && `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}`}
                      {' '}since v{latestVersion.version}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Waiting for feedback or reactions</p>
                  )}
                  {canRevise && versionCount < maxVersions && (
                    <p className="text-xs text-gray-400">
                      {maxVersions - versionCount} revision{maxVersions - versionCount !== 1 ? 's' : ''} remaining
                    </p>
                  )}
                  {llmDisabledMessage && (
                    <p className="text-xs text-amber-700">{llmDisabledMessage}</p>
                  )}
                  <Button
                    onClick={handleReviseItinerary}
                    disabled={!reviseButtonEnabled || llmDisabled}
                    size="sm"
                    variant="outline"
                  >
                    {revising ? (
                      <>
                        <BrandedSpinner size="sm" className="mr-2" />
                        {GENERATION_PROGRESS_MESSAGES[generatingMsgIndex]}
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
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Quick Reactions */}
            <div className="space-y-3">
              {REACTION_GROUPS.filter(
                (group) => !group.advanced || showAdvancedPreferences
              ).map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-medium text-gray-700 mb-2">{group.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.reactions
                      .filter((rx) => !rx.advanced || showAdvancedPreferences)
                      .map((reaction) => {
                        const isReacting = reactingChip === reaction.id
                        const isDisabled = reactingChip !== null || viewerIsReadOnly
                        const reactionCount = reactionCounts.get(reaction.id) || 0
                        const userHasReaction = reactions.some(
                          (r) => r.userId === user?.id && r.reactionKey === reaction.id
                        )
                        // Get names of users who reacted
                        const reactedUsers = reactions
                          .filter((r) => r.reactionKey === reaction.id)
                          .map((r) => r.user?.name || 'Unknown')

                        return (
                          <div key={reaction.id} className="flex flex-col items-start">
                            <Button
                              variant={userHasReaction ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => handleQuickReaction(reaction.id, group.category)}
                              disabled={isDisabled}
                              className="text-xs h-9 md:h-8"
                              title={reactedUsers.length > 0 ? `Voted by: ${reactedUsers.join(', ')}` : undefined}
                            >
                              {isReacting ? (
                                <>
                                  <span className="mr-1">OK</span>
                                  {reactingAction === 'adding' ? 'Added!' : 'Removed!'}
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
                            {/* Show who reacted below the button */}
                            {reactedUsers.length > 0 && (
                              <p className="text-xs text-gray-500 mt-0.5 pl-1">
                                {reactedUsers.length <= 2
                                  ? reactedUsers.join(', ')
                                  : `${reactedUsers.slice(0, 2).join(', ')} +${reactedUsers.length - 2}`}
                              </p>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              ))}

              <button
                onClick={() => setShowAdvancedPreferences(!showAdvancedPreferences)}
                className="text-xs text-gray-600 hover:text-gray-900 underline"
              >
                {showAdvancedPreferences ? 'Fewer preferences' : 'More preferences'}
              </button>

              {userReactions.length > 0 && (
                <p className="text-xs text-gray-500 pt-2 border-t">
                  Your selections: {userReactions.join(', ')}
                </p>
              )}
            </div>

            {/* Feedback List */}
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-gray-500 mb-2">Feedback History</p>
              <ScrollArea className="h-[150px] md:h-[200px]">
                {loadingFeedback ? (
                  <div className="flex flex-col items-center justify-center py-6">
                    <BrandedSpinner size="md" className="mb-2" />
                    <p className="text-sm text-gray-500">Loading feedback...</p>
                  </div>
                ) : feedback.length === 0 ? (
                  <p className="text-center text-gray-500 py-6 text-sm">
                    No feedback yet — be the first!
                  </p>
                ) : (
                  <div className="space-y-2 pr-2">
                    {feedback.map((fb) => (
                      <div key={fb.id} className="p-2.5 bg-gray-50 rounded-lg border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">{fb.author?.name || 'Anonymous'}</span>
                          <Badge variant="secondary" className="text-xs">
                            {FEEDBACK_TYPES.find((t) => t.value === fb.type)?.label || fb.type}
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
            </div>

            {/* Add Feedback Form */}
            <Collapsible open={showFeedbackForm} onOpenChange={setShowFeedbackForm}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  disabled={viewerIsReadOnly}
                >
                  <ChevronDown
                    className={`h-4 w-4 mr-1 transition-transform ${showFeedbackForm ? 'rotate-180' : ''}`}
                  />
                  {showFeedbackForm ? 'Hide form' : 'Add detailed feedback'}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select
                      value={newFeedback.type}
                      onValueChange={(v) => setNewFeedback({ ...newFeedback, type: v })}
                    >
                      <SelectTrigger className="text-sm h-9">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {FEEDBACK_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={newFeedback.target}
                      onChange={(e) => setNewFeedback({ ...newFeedback, target: e.target.value })}
                      placeholder="Which part? e.g. Day 2, hotels (optional)"
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
                    onClick={handleSubmitFeedback}
                    disabled={submittingFeedback || !newFeedback.message.trim() || viewerIsReadOnly}
                    className="w-full"
                    size="sm"
                  >
                    {submittingFeedback ? 'Adding...' : 'Add feedback'}
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
      <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate itinerary anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              {generateWarningDetails
                ? `This trip has ${generateWarningDetails}. The itinerary may be generic. You can add a destination hint or a couple ideas for better results.`
                : 'This itinerary may be generic without more context. Add a destination hint or ideas for better results.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowGenerateConfirm(false)
                handleGenerateItinerary(true)
              }}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ItineraryOverlay
