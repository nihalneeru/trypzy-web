'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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
import { toast } from 'sonner'
import { itineraryGenerated } from '@/lib/analytics/track'
import { ITINERARY_CONFIG } from '@/lib/itinerary/config'
import { isTripCompleted } from '@/lib/trips/isTripCompleted'

import { ItineraryIdeasSection } from './ItineraryIdeasSection'
import { ItineraryEditorPanel } from './ItineraryEditorPanel'
import { ItineraryFeedbackSection } from './ItineraryFeedbackSection'

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
  onQuoteToChat?: (quote: string) => void
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
    days?: {
      date: string
      title?: string
      blocks?: any[]
      areaFocus?: string
      groupFit?: string
    }[]
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

const { MAX_IDEAS_PER_USER, MAX_IDEA_LENGTH, MAX_VERSIONS } = ITINERARY_CONFIG

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
  setHasUnsavedChanges,
  onQuoteToChat
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
    isCancelled ||
    isTripCompleted(trip)
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

  // Check if revise button should be enabled
  const reviseButtonEnabled = useMemo(() => {
    if (!canRevise) return false
    if (!latestVersion || !isLeader || revising) return false
    return newFeedbackCount > 0 || reactions.length > 0
  }, [canRevise, latestVersion, isLeader, newFeedbackCount, reactions.length, revising])

  // ----------------------------------------------------------------------------
  // Data Loading
  // ----------------------------------------------------------------------------

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
  }, [trip?.id, trip?.status, token])

  const loadVersions = useCallback(async () => {
    if (!trip?.id || !token) return
    setLoadingVersions(true)
    try {
      const data = await api(`/trips/${trip.id}/itinerary/versions`, { method: 'GET' }, token)
      const versions = (data.versions || data || [])
        .sort((a: ItineraryVersion, b: ItineraryVersion) => a.version - b.version)

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
  }, [trip?.id, trip?.status, token])

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
      onRefresh()
    } catch (error: any) {
      toast.error(error.message || 'Could not add idea — please try again')
    } finally {
      setAddingIdea(false)
    }
  }

  const handleLikeIdea = async (ideaId: string) => {
    if (viewerIsReadOnly) return
    try {
      await api(`/trips/${trip.id}/itinerary/ideas/${ideaId}/like`, { method: 'POST' }, token)
      await loadIdeas()
    } catch (error: any) {
      toast.error(error.message || 'Could not like idea — please try again')
    }
  }

  const handleSaveDestinationHint = async () => {
    if (!isLeader) return
    setSavingDestinationHint(true)
    try {
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

  const handleCancelDestinationHint = () => {
    setDestinationHintValue(trip?.destinationHint || '')
    setEditingDestinationHint(false)
  }

  const handleGenerateItinerary = async (forceGenerate = false) => {
    if (!isLeader || generating || viewerIsReadOnly) return
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
      itineraryGenerated(trip.id)
      await loadVersions()
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

  const handleExportICS = async () => {
    try {
      const res = await fetch(`/api/trips/${trip.id}/export/ics`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename = `${(trip.name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.ics`

      if (navigator.share) {
        const file = new File([blob], filename, { type: 'text/calendar' })
        await navigator.share({ files: [file] }).catch(() => {
          downloadFile(url, filename)
        })
      } else {
        downloadFile(url, filename)
      }
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export calendar')
    }
  }

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
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

  const handleReviseItinerary = async () => {
    if (!isLeader || revising || !reviseButtonEnabled || llmDisabled) return
    setRevising(true)
    try {
      setLlmDisabledMessage(null)
      const result = await api(`/trips/${trip.id}/itinerary/revise`, { method: 'POST' }, token)
      toast.success('Itinerary revised!')
      await loadVersions()
      await loadFeedback()
      onRefresh(result?.trip || undefined)
    } catch (error: any) {
      const message = error.message || 'Couldn\'t revise itinerary — try again'

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
      console.error('Failed to send reaction chat message:', error)
    }
  }

  const handleQuickReaction = async (reactionId: string, category: string) => {
    if (reactingChip || viewerIsReadOnly || !latestVersion) return

    setReactingChip(reactionId)

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

  const handleRetryLoadIdeas = useCallback(() => {
    setIdeasError(null)
    loadIdeas()
  }, [loadIdeas])

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Section 1: Ideas Submission */}
      <ItineraryIdeasSection
        trip={trip}
        user={user}
        isLeader={isLeader}
        viewerIsReadOnly={viewerIsReadOnly}
        readOnlyReason={readOnlyReason}
        maxIdeasPerUser={MAX_IDEAS_PER_USER}
        maxIdeaLength={MAX_IDEA_LENGTH}
        ideas={ideas}
        loadingIdeas={loadingIdeas}
        ideasError={ideasError}
        newIdeaText={newIdeaText}
        setNewIdeaText={setNewIdeaText}
        addingIdea={addingIdea}
        userIdeaCount={userIdeaCount}
        groupedIdeas={groupedIdeas}
        editingDestinationHint={editingDestinationHint}
        setEditingDestinationHint={setEditingDestinationHint}
        destinationHintValue={destinationHintValue}
        setDestinationHintValue={setDestinationHintValue}
        savingDestinationHint={savingDestinationHint}
        onAddIdea={handleAddIdea}
        onLikeIdea={handleLikeIdea}
        onSaveDestinationHint={handleSaveDestinationHint}
        onCancelDestinationHint={handleCancelDestinationHint}
        onRetryLoadIdeas={handleRetryLoadIdeas}
        onQuoteToChat={onQuoteToChat}
      />

      {/* Section 2: Itinerary Viewer */}
      <ItineraryEditorPanel
        trip={trip}
        isLeader={isLeader}
        destinationHint={destinationHint}
        ideas={ideas}
        groupedIdeas={groupedIdeas}
        allVersions={allVersions}
        selectedVersionIdx={selectedVersionIdx}
        setSelectedVersionIdx={setSelectedVersionIdx}
        latestVersion={latestVersion}
        selectedVersion={selectedVersion}
        isViewingLatest={isViewingLatest}
        loadingVersions={loadingVersions}
        maxVersions={maxVersions}
        canRevise={canRevise}
        generating={generating}
        llmDisabled={llmDisabled}
        llmDisabledMessage={llmDisabledMessage}
        generatingMsgIndex={generatingMsgIndex}
        progressMessages={GENERATION_PROGRESS_MESSAGES}
        viewerIsReadOnly={viewerIsReadOnly}
        onGenerateClick={handleGenerateClick}
        onExportICS={handleExportICS}
      />

      {/* Section 3: Feedback & Reactions */}
      {latestVersion && (
        <ItineraryFeedbackSection
          user={user}
          isLeader={isLeader}
          viewerIsReadOnly={viewerIsReadOnly}
          latestVersion={latestVersion}
          feedback={feedback}
          loadingFeedback={loadingFeedback}
          showFeedbackForm={showFeedbackForm}
          setShowFeedbackForm={setShowFeedbackForm}
          newFeedback={newFeedback}
          setNewFeedback={setNewFeedback}
          submittingFeedback={submittingFeedback}
          newFeedbackCount={newFeedbackCount}
          feedbackTypes={FEEDBACK_TYPES}
          reactions={reactions}
          reactionGroups={REACTION_GROUPS}
          reactionCounts={reactionCounts}
          userReactions={userReactions}
          reactingChip={reactingChip}
          reactingAction={reactingAction}
          showAdvancedPreferences={showAdvancedPreferences}
          setShowAdvancedPreferences={setShowAdvancedPreferences}
          canRevise={canRevise}
          versionCount={versionCount}
          maxVersions={maxVersions}
          revising={revising}
          reviseButtonEnabled={reviseButtonEnabled}
          llmDisabled={llmDisabled}
          llmDisabledMessage={llmDisabledMessage}
          generatingMsgIndex={generatingMsgIndex}
          progressMessages={GENERATION_PROGRESS_MESSAGES}
          onSubmitFeedback={handleSubmitFeedback}
          onQuickReaction={handleQuickReaction}
          onReviseItinerary={handleReviseItinerary}
        />
      )}

      {/* Generate Confirmation Dialog */}
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
