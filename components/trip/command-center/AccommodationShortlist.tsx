'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Home, Check, ThumbsUp, Users, DollarSign, MapPin, Sparkles } from 'lucide-react'

/**
 * AccommodationShortlist - Phase 7 Constrained Accommodation MVP
 *
 * Design principles:
 * - Max 3 options (curated shortlist)
 * - Each option shows: rationale, price/person, trade-off
 * - Single CTA flow: Vote → Confirm → Lock
 * - No browsing - just decision-focused
 */

interface AccommodationOption {
  id: string
  title: string
  source: string
  priceRange?: string
  pricePerPerson?: string
  sleepCapacity?: number
  notes?: string
  url?: string
  status: 'proposed' | 'voted' | 'selected'
  rationale?: string
  tradeOff?: string
  votes?: number
  addedBy?: { id: string; name: string }
}

interface AccommodationShortlistProps {
  trip: any
  token: string
  user: any
  onRefresh: (updatedTrip?: any) => void
  /** Extracted preferences from chat (Phase 6 LLM #4) */
  preferences?: {
    budgetRange?: string
    locationPreference?: string
    stayArrangement?: string
  } | null
}

export function AccommodationShortlist({
  trip,
  token,
  user,
  onRefresh,
  preferences
}: AccommodationShortlistProps) {
  const [options, setOptions] = useState<AccommodationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [userVote, setUserVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const isTripLeader = trip?.createdBy === user?.id

  // Load accommodation options
  const loadOptions = useCallback(async () => {
    if (!trip?.id || trip.status !== 'locked') return

    setLoading(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/accommodations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (response.ok) {
        const data = await response.json()
        // Limit to max 3 options (Phase 7 constraint)
        const shortlist = (data || []).slice(0, 3)
        setOptions(shortlist)

        // Check if user has voted
        const voted = shortlist.find((o: any) =>
          o.votes?.includes?.(user?.id) || o.userVoted
        )
        if (voted) {
          setUserVote(voted.id)
        }
      }
    } catch (error) {
      console.error('Failed to load accommodation options:', error)
    } finally {
      setLoading(false)
    }
  }, [trip?.id, trip?.status, token, user?.id])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  // Handle voting for an option
  const handleVote = async (optionId: string) => {
    if (voting || userVote) return

    setVoting(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/accommodations/${optionId}/vote`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setUserVote(optionId)
        loadOptions()
        onRefresh?.()
      }
    } catch (error) {
      console.error('Failed to vote:', error)
    } finally {
      setVoting(false)
    }
  }

  // Handle confirming/selecting an option (trip leader only)
  const handleConfirm = async (optionId: string) => {
    if (confirming || !isTripLeader) return

    setConfirming(true)
    try {
      const response = await fetch(`/api/trips/${trip.id}/accommodations/${optionId}/select`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        loadOptions()
        onRefresh?.()
      }
    } catch (error) {
      console.error('Failed to confirm:', error)
    } finally {
      setConfirming(false)
    }
  }

  // Determine current phase
  const selectedOption = options.find(o => o.status === 'selected')
  const hasVotes = options.some(o => (o.votes || 0) > 0)
  const allVoted = options.length > 0 && userVote !== null

  // Calculate price per person if not provided
  const getPricePerPerson = (option: AccommodationOption) => {
    if (option.pricePerPerson) return option.pricePerPerson
    if (option.priceRange && trip?.activeTravelerCount) {
      // Try to extract a number and divide
      const match = option.priceRange.match(/\$?(\d+)/)
      if (match) {
        const total = parseInt(match[1])
        const perPerson = Math.round(total / trip.activeTravelerCount)
        return `~$${perPerson}/person`
      }
    }
    return null
  }

  // Generate rationale if not provided (based on option data)
  const getRationale = (option: AccommodationOption) => {
    if (option.rationale) return option.rationale
    const parts = []
    if (option.sleepCapacity && option.sleepCapacity >= (trip?.activeTravelerCount || 1)) {
      parts.push('Fits everyone')
    }
    if (option.source === 'AIRBNB') {
      parts.push('Private space')
    }
    if (option.notes) {
      parts.push(option.notes.substring(0, 50))
    }
    return parts.length > 0 ? parts.join(' • ') : 'Added by group member'
  }

  // Generate trade-off if not provided
  const getTradeOff = (option: AccommodationOption, index: number) => {
    if (option.tradeOff) return option.tradeOff
    // Simple heuristics for trade-offs
    if (index === 0) return 'Most popular choice'
    if (option.priceRange?.toLowerCase().includes('budget') || option.priceRange?.includes('$') && parseInt(option.priceRange.replace(/\D/g, '')) < 100) {
      return 'Budget-friendly, may have fewer amenities'
    }
    return 'Alternative option'
  }

  if (trip?.status !== 'locked') {
    return null
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="animate-pulse">Loading options...</div>
      </div>
    )
  }

  // No options yet - show preferences summary if available
  if (options.length === 0) {
    return (
      <div className="space-y-4">
        {preferences && (
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-800 mb-2">
              <Sparkles className="h-4 w-4" />
              <span className="font-medium text-sm">Group Preferences (from chat)</span>
            </div>
            <div className="text-sm text-blue-700 space-y-1">
              {preferences.budgetRange && (
                <p><DollarSign className="h-3 w-3 inline mr-1" />Budget: {preferences.budgetRange}</p>
              )}
              {preferences.locationPreference && (
                <p><MapPin className="h-3 w-3 inline mr-1" />Location: {preferences.locationPreference}</p>
              )}
              {preferences.stayArrangement && (
                <p><Users className="h-3 w-3 inline mr-1" />Arrangement: {preferences.stayArrangement}</p>
              )}
            </div>
          </div>
        )}
        <div className="text-center py-6 text-gray-500">
          <Home className="h-8 w-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm">No accommodation options yet</p>
          <p className="text-xs text-gray-400 mt-1">Add up to 3 options for the group to choose from</p>
        </div>
      </div>
    )
  }

  // Selected state - show confirmation
  if (selectedOption) {
    return (
      <div className="space-y-3">
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center gap-2 text-green-800 mb-2">
            <Check className="h-5 w-5" />
            <span className="font-medium">Accommodation Confirmed</span>
          </div>
          <h4 className="font-medium text-gray-900">{selectedOption.title}</h4>
          {selectedOption.priceRange && (
            <p className="text-sm text-gray-600 mt-1">{selectedOption.priceRange}</p>
          )}
          {selectedOption.url && (
            <a
              href={selectedOption.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline mt-2 inline-block"
            >
              View listing
            </a>
          )}
        </div>
      </div>
    )
  }

  // Voting/Selection phase - show shortlist
  return (
    <div className="space-y-3">
      {/* Preferences hint */}
      {preferences && !hasVotes && (
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
          <span className="font-medium">Group preferences:</span>{' '}
          {[
            preferences.budgetRange && `${preferences.budgetRange} budget`,
            preferences.locationPreference,
            preferences.stayArrangement && `stay ${preferences.stayArrangement}`
          ].filter(Boolean).join(' • ') || 'No specific preferences'}
        </div>
      )}

      {/* Options list - max 3 */}
      <div className="space-y-2">
        {options.map((option, index) => {
          const isVoted = userVote === option.id
          const pricePerPerson = getPricePerPerson(option)
          const rationale = getRationale(option)
          const tradeOff = getTradeOff(option, index)
          const voteCount = option.votes || 0

          return (
            <Card
              key={option.id}
              className={`transition-all ${isVoted ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Title + Badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-medium text-gray-900">{option.title}</h4>
                      {isVoted && (
                        <Badge className="bg-blue-100 text-blue-800 text-xs">
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Your vote
                        </Badge>
                      )}
                      {voteCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {voteCount} vote{voteCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {/* Price per person */}
                    {pricePerPerson && (
                      <p className="text-sm font-medium text-green-700 mb-1">
                        {pricePerPerson}
                      </p>
                    )}

                    {/* Rationale */}
                    <p className="text-sm text-gray-600 mb-1">
                      {rationale}
                    </p>

                    {/* Trade-off */}
                    <p className="text-xs text-gray-400 italic">
                      {tradeOff}
                    </p>
                  </div>

                  {/* Action button */}
                  <div className="flex flex-col gap-2">
                    {!userVote && (
                      <Button
                        size="sm"
                        variant={isVoted ? "default" : "outline"}
                        onClick={() => handleVote(option.id)}
                        disabled={voting}
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        Vote
                      </Button>
                    )}
                    {isTripLeader && hasVotes && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleConfirm(option.id)}
                        disabled={confirming}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Confirm
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Status message */}
      <div className="text-center text-xs text-gray-500 pt-2">
        {!userVote && 'Vote for your preferred option'}
        {userVote && !isTripLeader && 'Waiting for trip leader to confirm'}
        {userVote && isTripLeader && 'You can confirm an option above'}
      </div>
    </div>
  )
}
