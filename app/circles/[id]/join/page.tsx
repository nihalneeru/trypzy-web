'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Navbar } from '@/components/Navbar'

export default function JoinCirclePage() {
  const router = useRouter()
  const params = useParams()
  const circleId = params.id as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const joinCircle = async () => {
      try {
        const response = await fetch(`/api/circles/${circleId}/join`, {
          method: 'POST',
        })

        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to join circle')
          return
        }

        setSuccess(true)
        setTimeout(() => {
          router.push(`/circles/${circleId}`)
        }, 2000)
      } catch (err) {
        setError('An error occurred. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    joinCircle()
  }, [circleId, router])

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          {loading && <p className="text-gray-600">Joining circle...</p>}
          {error && (
            <div>
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={() => router.push('/circles')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Go to Circles
              </button>
            </div>
          )}
          {success && (
            <div>
              <p className="text-green-600 mb-4">Successfully joined circle!</p>
              <p className="text-gray-600">Redirecting...</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

