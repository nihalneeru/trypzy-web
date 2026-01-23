'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

// API helper (shared pattern)
const api = async (endpoint: string, options: RequestInit = {}, token: string | null = null) => {
  const headers: Record<string, string> = {}

  if (options.body) {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    headers['Content-Type'] = 'application/json'
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

interface UseTripChatOptions {
  tripId: string
  token: string
  enabled?: boolean
  pollInterval?: number
}

interface Message {
  id: string
  tripId: string
  userId: string
  user?: { id: string; name: string }
  content: string
  createdAt: string
  isSystem?: boolean
  metadata?: Record<string, any>
}

/**
 * Hook for managing trip chat messages
 * Handles loading, polling, and sending messages
 */
export function useTripChat({
  tripId,
  token,
  enabled = true,
  pollInterval = 5000
}: UseTripChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failureCount, setFailureCount] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Clear error helper
  const clearError = useCallback(() => setError(null), [])

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!tripId || !token) return

    try {
      const data = await api(`/trips/${tripId}/messages`, { method: 'GET' }, token)
      setMessages(data || [])
      setError(null) // Clear error on success
      setFailureCount(0) // Reset failure count on success
    } catch (err: any) {
      console.error('Failed to load messages:', err)
      setError(err.message || 'Failed to load messages')
      setFailureCount(prev => {
        const newCount = prev + 1
        // Stop polling after 3 consecutive failures
        if (newCount >= 3 && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return newCount
      })
    }
  }, [tripId, token])

  // Initial load
  useEffect(() => {
    if (enabled && tripId && token) {
      setLoading(true)
      loadMessages().finally(() => setLoading(false))
    }
  }, [enabled, tripId, token, loadMessages])

  // Polling
  useEffect(() => {
    if (!enabled || !tripId || !token) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    // Start polling
    intervalRef.current = setInterval(loadMessages, pollInterval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, tripId, token, pollInterval, loadMessages])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !tripId || !token) return

    setSendingMessage(true)

    try {
      const msg = await api(`/trips/${tripId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage })
      }, token)

      setMessages(prev => [...prev, msg])
      setNewMessage('')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message')
    } finally {
      setSendingMessage(false)
    }
  }, [newMessage, tripId, token])

  return {
    messages,
    setMessages,
    newMessage,
    setNewMessage,
    sendingMessage,
    sendMessage,
    loading,
    error,
    clearError,
    refresh: loadMessages
  }
}
