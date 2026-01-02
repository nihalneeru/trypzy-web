'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/layout/Navbar'
import Link from 'next/link'
import { DateOption } from '@/types/trips'
import { dateToDayString, getAllDaysBetween, dayStringToDate } from '@/lib/trips/trip-consensus'
import { AvailabilityStatus } from '@/types/enums'

interface Trip {
  id: string
  destination: string
  tripType: string
  status: string
  startDate: string | null
  endDate: string | null
  earliestStart: string | null
  latestEnd: string | null
  notes: string | null
  creator: {
    id: string
    name: string
  }
  availabilities: Array<{
    id: string
    day: string
    status: AvailabilityStatus
    userId: string
    user: {
      id: string
      name: string
    }
  }>
  votes: Array<{
    id: string
    optionKey: string
    userId: string
    user: {
      id: string
      name: string
    }
  }>
  participants?: Array<{
    userId: string
    joinedAt: string
    user: {
      id: string
      name: string
      email: string
    }
  }>
}

export default function TripDetailPage() {
  const router = useRouter()
  const params = useParams()
  const circleId = params.id as string
  const tripId = params.tripId as string
  const { data: session } = useSession()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [options, setOptions] = useState<DateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false)
  const [isParticipant, setIsParticipant] = useState(false)

  useEffect(() => {
    fetchTrip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  useEffect(() => {
    if (trip?.tripType === 'collaborative' && trip.status === 'scheduling') {
      fetchOptions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip])

  const fetchTrip = async () => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}`)
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to fetch trip')
        return
      }
      setTrip(data.trip)
    } catch (err) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchOptions = async () => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}/options`)
      const data = await response.json()
      if (response.ok) {
        setOptions(data.options || [])
      }
    } catch (err) {
      console.error('Error fetching options:', err)
    }
  }

  const handleVote = async (optionKey: string) => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionKey }),
      })

      if (response.ok) {
        fetchTrip()
        fetchOptions()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to vote')
      }
    } catch (err) {
      console.error('Error voting:', err)
      alert('An error occurred while voting')
    }
  }

  const handleJoinTrip = async () => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}/participants`, {
        method: 'POST',
      })

      if (response.ok) {
        fetchTrip()
      }
    } catch (err) {
      console.error('Error joining trip:', err)
    }
  }

  const handleLeaveTrip = async () => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}/participants`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchTrip()
      }
    } catch (err) {
      console.error('Error leaving trip:', err)
    }
  }

  const handleLock = async (startDate: string, endDate: string) => {
    try {
      const response = await fetch(`/api/circles/${circleId}/trips/${tripId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })

      if (response.ok) {
        fetchTrip()
        fetchOptions() // Refresh to hide voting UI
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to lock trip dates')
      }
    } catch (err) {
      console.error('Error locking trip:', err)
      alert('An error occurred while locking trip dates')
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p>Loading...</p>
        </div>
      </>
    )
  }

  if (error || !trip) {
    return (
      <>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-red-600">{error || 'Trip not found'}</p>
        </div>
      </>
    )
  }

  const userAvailability = trip.availabilities.filter(
    a => a.userId === session?.user?.id
  )
  const userVote = trip.votes.find(v => v.userId === session?.user?.id)
  const isOwnerOrCreator = trip.creator.id === session?.user?.id
  const isParticipantOfHostedTrip = trip.participants?.some(p => p.userId === session?.user?.id) || false

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={`/circles/${circleId}`}
            className="text-indigo-600 hover:text-indigo-800 mb-2 inline-block"
          >
            ← Back to Circle
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{trip.destination}</h1>
          <p className="text-gray-600 mt-1">
            Created by {trip.creator.name} • {trip.tripType} • {trip.status}
          </p>
        </div>

        {trip.status === 'locked' && trip.startDate && trip.endDate && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800 font-semibold">
              Trip dates locked: {new Date(trip.startDate).toLocaleDateString()} -{' '}
              {new Date(trip.endDate).toLocaleDateString()}
            </p>
          </div>
        )}

        {trip.tripType === 'collaborative' && trip.status === 'scheduling' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Submit Your Availability
            </h2>
            {userAvailability.length === 0 ? (
              <div>
                <p className="text-gray-600 mb-4">
                  Select your availability for dates between{' '}
                  {trip.earliestStart && new Date(trip.earliestStart).toLocaleDateString()} and{' '}
                  {trip.latestEnd && new Date(trip.latestEnd).toLocaleDateString()}
                </p>
                <button
                  onClick={() => setShowAvailabilityForm(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Submit Availability
                </button>
              </div>
            ) : (
              <div>
                <p className="text-green-600 mb-2">You've submitted your availability</p>
                <button
                  onClick={() => setShowAvailabilityForm(true)}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Update Availability
                </button>
              </div>
            )}

            {showAvailabilityForm && (
              <AvailabilityForm
                tripId={tripId}
                circleId={circleId}
                earliestStart={trip.earliestStart!}
                latestEnd={trip.latestEnd!}
                onSuccess={() => {
                  setShowAvailabilityForm(false)
                  fetchTrip()
                  fetchOptions()
                }}
                onCancel={() => setShowAvailabilityForm(false)}
              />
            )}
          </div>
        )}

        {trip.tripType === 'collaborative' && trip.status === 'scheduling' && options.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Date Options</h2>
            <div className="space-y-4">
              {options.map((option, index) => {
                const isSelected = userVote?.optionKey === option.optionKey
                const startDate = new Date(option.startDate)
                const endDate = new Date(option.endDate)
                // Format dates with consistent options
                const startDateStr = startDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                const endDateStr = endDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
                // For single-day trips, show just one date; otherwise show range
                const dateDisplay = startDateStr === endDateStr 
                  ? startDateStr 
                  : `${startDateStr} - ${endDateStr}`
                return (
                  <div
                    key={option.optionKey}
                    className={`border rounded-lg p-4 ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {dateDisplay}
                        </p>
                        <p className="text-sm text-gray-600">
                          {option.attendeeCount} attendees • Score: {option.score.toFixed(2)}
                        </p>
                      </div>
                      <div className="space-x-2">
                        <button
                          onClick={() => handleVote(option.optionKey)}
                          className={`px-4 py-2 rounded-lg ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {isSelected ? 'Voted' : 'Vote'}
                        </button>
                        {isOwnerOrCreator && (
                          <button
                            onClick={() => handleLock(option.startDate, option.endDate)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                          >
                            Lock Dates
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {trip.tripType === 'hosted' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Participants</h2>
              {!isParticipantOfHostedTrip && trip.creator.id !== session?.user?.id && (
                <button
                  onClick={handleJoinTrip}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Join Trip
                </button>
              )}
              {isParticipantOfHostedTrip && trip.creator.id !== session?.user?.id && (
                <button
                  onClick={handleLeaveTrip}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Leave Trip
                </button>
              )}
            </div>
            <ul className="space-y-2">
              <li className="flex items-center justify-between py-2 border-b">
                <span className="font-medium">{trip.creator.name}</span>
                <span className="text-sm text-gray-500">Creator</span>
              </li>
              {trip.participants?.map((participant) => (
                <li key={participant.userId} className="flex items-center justify-between py-2 border-b">
                  <span>{participant.user.name}</span>
                  <span className="text-sm text-gray-500">
                    Joined {new Date(participant.joinedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {trip.notes && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Notes</h2>
            <p className="text-gray-700">{trip.notes}</p>
          </div>
        )}
      </div>
    </>
  )
}

function AvailabilityForm({
  tripId,
  circleId,
  earliestStart,
  latestEnd,
  onSuccess,
  onCancel,
}: {
  tripId: string
  circleId: string
  earliestStart: string
  latestEnd: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [days, setDays] = useState<Record<string, AvailabilityStatus>>({})
  const [loading, setLoading] = useState(false)
  const [dragStart, setDragStart] = useState<string | null>(null)
  const [dragStatus, setDragStatus] = useState<AvailabilityStatus | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Generate day range (YYYY-MM-DD format)
  useEffect(() => {
    const start = new Date(earliestStart)
    const end = new Date(latestEnd)
    const dayMap: Record<string, AvailabilityStatus> = {}

    const allDays = getAllDaysBetween(start, end)
    allDays.forEach(day => {
      dayMap[day] = AvailabilityStatus.available
    })

    setDays(dayMap)
  }, [earliestStart, latestEnd])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const availabilities = Object.entries(days).map(([day, status]) => ({
        day,
        status: status as string,
      }))

      const response = await fetch(
        `/api/circles/${circleId}/trips/${tripId}/availability`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ availabilities }),
        }
      )

      if (response.ok) {
        onSuccess()
      }
    } catch (err) {
      console.error('Error submitting availability:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateDayStatus = (day: string, status: AvailabilityStatus) => {
    setDays(prev => ({ ...prev, [day]: status }))
  }

  const updateDaysInRange = (startDay: string, endDay: string, status: AvailabilityStatus) => {
    const dayArray = Object.keys(days).sort()
    const startIdx = dayArray.indexOf(startDay)
    const endIdx = dayArray.indexOf(endDay)
    
    if (startIdx === -1 || endIdx === -1) return
    
    const minIdx = Math.min(startIdx, endIdx)
    const maxIdx = Math.max(startIdx, endIdx)
    
    setDays(prev => {
      const updated = { ...prev }
      for (let i = minIdx; i <= maxIdx; i++) {
        updated[dayArray[i]] = status
      }
      return updated
    })
  }

  const handleDayMouseDown = (day: string, status: AvailabilityStatus) => {
    setDragStart(day)
    setDragStatus(status)
    setIsDragging(true)
    updateDayStatus(day, status)
  }

  const handleDayMouseEnter = (day: string) => {
    if (isDragging && dragStart && dragStatus !== null) {
      updateDaysInRange(dragStart, day, dragStatus)
    }
  }

  const handleDayMouseUp = () => {
    setIsDragging(false)
    setDragStart(null)
    setDragStatus(null)
  }

  // Quick actions
  const setAllDays = (status: AvailabilityStatus) => {
    const dayArray = Object.keys(days).sort()
    const updated: Record<string, AvailabilityStatus> = {}
    dayArray.forEach(day => {
      updated[day] = status
    })
    setDays(updated)
  }

  const setWeekendsOnly = () => {
    const dayArray = Object.keys(days).sort()
    const updated: Record<string, AvailabilityStatus> = { ...days }
    dayArray.forEach(day => {
      const date = dayStringToDate(day)
      const dayOfWeek = date.getUTCDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      updated[day] = isWeekend ? AvailabilityStatus.available : AvailabilityStatus.unavailable
    })
    setDays(updated)
  }

  const dayArray = Object.keys(days).sort()
  const hasAtLeastOneDay = dayArray.length > 0

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      {/* Visual Legend */}
      <div className="mb-4 flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-green-600 flex items-center justify-center text-white text-xs">✓</div>
          <span className="text-gray-700">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-yellow-500 flex items-center justify-center text-white text-xs">?</div>
          <span className="text-gray-700">Maybe</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-red-600 flex items-center justify-center text-white text-xs">✗</div>
          <span className="text-gray-700">Unavailable</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAllDays(AvailabilityStatus.available)}
          className="px-3 py-1.5 text-sm bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100"
        >
          Set All Available
        </button>
        <button
          type="button"
          onClick={() => setAllDays(AvailabilityStatus.unavailable)}
          className="px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100"
        >
          Set All Unavailable
        </button>
        <button
          type="button"
          onClick={setWeekendsOnly}
          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100"
        >
          Weekends Only
        </button>
      </div>

      {/* Days Grid */}
      <div 
        className="mb-4 max-h-64 overflow-y-auto"
        onMouseUp={handleDayMouseUp}
        onMouseLeave={handleDayMouseUp}
      >
        <div className="space-y-2">
          {dayArray.map((day) => {
            const date = dayStringToDate(day)
            const currentStatus = days[day]
            return (
              <div 
                key={day} 
                className="flex items-center justify-between border-b pb-2"
                onMouseEnter={() => handleDayMouseEnter(day)}
              >
                <span className="text-sm font-medium text-gray-900 min-w-[120px]">
                  {date.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <div className="flex space-x-2">
                  {([AvailabilityStatus.available, AvailabilityStatus.maybe, AvailabilityStatus.unavailable] as AvailabilityStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => updateDayStatus(day, status)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleDayMouseDown(day, status)
                      }}
                      className={`h-8 w-8 rounded text-xs font-semibold transition-all ${
                        currentStatus === status
                          ? status === AvailabilityStatus.available
                            ? 'bg-green-600 text-white shadow-md scale-110'
                            : status === AvailabilityStatus.maybe
                            ? 'bg-yellow-500 text-white shadow-md scale-110'
                            : 'bg-red-600 text-white shadow-md scale-110'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {status === AvailabilityStatus.available ? '✓' : status === AvailabilityStatus.maybe ? '?' : '✗'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !hasAtLeastOneDay}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  )
}

