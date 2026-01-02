'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'

export default function NewTripPage() {
  const router = useRouter()
  const params = useParams()
  const circleId = params.id as string

  const [destination, setDestination] = useState('')
  const [tripType, setTripType] = useState<'collaborative' | 'hosted'>('collaborative')
  const [earliestStart, setEarliestStart] = useState('')
  const [latestEnd, setLatestEnd] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const body: any = {
        destination,
        tripType,
        notes: notes || undefined,
      }

      if (tripType === 'collaborative') {
        body.earliestStart = new Date(earliestStart).toISOString()
        body.latestEnd = new Date(latestEnd).toISOString()
      } else {
        body.startDate = new Date(startDate).toISOString()
        body.endDate = new Date(endDate).toISOString()
      }

      const response = await fetch(`/api/circles/${circleId}/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to create trip')
        return
      }

      router.push(`/circles/${circleId}/trips/${data.trip.id}`)
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Trip</h1>

        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-2">
              Destination *
            </label>
            <input
              id="destination"
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., Paris, France"
            />
          </div>

          <div>
            <label htmlFor="tripType" className="block text-sm font-medium text-gray-700 mb-2">
              Trip Type *
            </label>
            <select
              id="tripType"
              value={tripType}
              onChange={(e) => setTripType(e.target.value as 'collaborative' | 'hosted')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="collaborative">Collaborative (group decides dates)</option>
              <option value="hosted">Hosted (fixed dates, others join)</option>
            </select>
          </div>

          {tripType === 'collaborative' ? (
            <>
              <div>
                <label htmlFor="earliestStart" className="block text-sm font-medium text-gray-700 mb-2">
                  Earliest Start Date *
                </label>
                <input
                  id="earliestStart"
                  type="date"
                  required
                  value={earliestStart}
                  onChange={(e) => setEarliestStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="latestEnd" className="block text-sm font-medium text-gray-700 mb-2">
                  Latest End Date *
                </label>
                <input
                  id="latestEnd"
                  type="date"
                  required
                  value={latestEnd}
                  onChange={(e) => setLatestEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date *
                </label>
                <input
                  id="startDate"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                  End Date *
                </label>
                <input
                  id="endDate"
                  type="date"
                  required
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Any additional details about the trip..."
            />
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

