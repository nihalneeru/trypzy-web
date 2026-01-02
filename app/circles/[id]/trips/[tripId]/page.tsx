'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Navbar } from '@/components/Navbar'
import Link from 'next/link'
import { DateOption } from '@/types'
import { dateToDayString, getAllDaysBetween, dayStringToDate } from '@/lib/trip-consensus'
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
                return (
                  <div
                    key={option.optionKey}
                    className={`border rounded-lg p-4 ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">
                          {new Date(option.startDate).toLocaleDateString()} -{' '}
                          {new Date(option.endDate).toLocaleDateString()}
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

  const dayArray = Object.keys(days).sort()

  return (
    <form onSubmit={handleSubmit} className="mt-4">
      <div className="mb-4 max-h-64 overflow-y-auto">
        <div className="space-y-2">
          {dayArray.map((day) => {
            const date = dayStringToDate(day)
            return (
              <div key={day} className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">
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
                      className={`px-3 py-1 text-xs rounded ${
                        days[day] === status
                          ? status === 'available'
                            ? 'bg-green-600 text-white'
                            : status === 'maybe'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </form>
  )
}

