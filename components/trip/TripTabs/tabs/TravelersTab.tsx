'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'

// API Helper
const api = async (endpoint: string, options: any = {}, token: string | null = null) => {
  const headers: any = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  
  return data
}

export function TravelersTab({
  trip,
  token
}: any) {
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadMembers = async () => {
      if (!trip?.circleId || !token) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const circleData = await api(`/circles/${trip.circleId}`, { method: 'GET' }, token)
        setMembers(circleData.members || [])
      } catch (err: any) {
        console.error('Failed to load circle members:', err)
        setError(err.message || 'Failed to load travelers')
      } finally {
        setLoading(false)
      }
    }

    loadMembers()
  }, [trip?.circleId, token])

  if (!trip?.circleId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No circle found for this trip</h3>
          <p className="text-gray-500">This trip is not associated with a circle.</p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
          <p className="text-gray-600 mt-4">Loading travelers...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-red-600">Error loading travelers: {error}</p>
        </CardContent>
      </Card>
    )
  }

  // Get trip leader user ID
  const tripLeaderUserId = trip?.createdBy

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          This trip is shared with the circle. Travelers currently reflect circle members.
        </p>
      </div>

      {/* Members List */}
      <div>
        <h2 className="text-xl font-semibold mb-6">Travelers ({members.length})</h2>
        {members.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No members found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isTripLeader = tripLeaderUserId && member.id === tripLeaderUserId
              const isCircleLeader = member.role === 'owner'
              
              return (
                <Card key={member.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-600 font-medium">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isTripLeader && (
                          <Badge>Trip Leader</Badge>
                        )}
                        {isCircleLeader && (
                          <Badge>Circle Leader</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
