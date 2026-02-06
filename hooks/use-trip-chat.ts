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

// Backoff constants
const BASE_INTERVAL = 5000    // 5s
const MAX_INTERVAL = 20000    // 20s
const BACKOFF_MULTIPLIER = 1.5

/**
 * Hook for managing trip chat messages
 * Handles loading, polling (with exponential backoff), and sending messages
 */
export function useTripChat({
  tripId,
  token,
  enabled = true,
  pollInterval = BASE_INTERVAL
}: UseTripChatOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failureCount, setFailureCount] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentIntervalRef = useRef(pollInterval)
  const prevMessageCountRef = useRef(0)
  const stoppedRef = useRef(false)

  // Clear error helper
  const clearError = useCallback(() => setError(null), [])

  // Reset polling interval to base
  const resetInterval = useCallback(() => {
    currentIntervalRef.current = pollInterval
  }, [pollInterval])

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!tripId || !token) return

    try {
      const data = await api(`/trips/${tripId}/messages`, { method: 'GET' }, token)
      const msgList: Message[] = data || []
      const prevCount = prevMessageCountRef.current
      prevMessageCountRef.current = msgList.length

      // If new messages arrived, reset backoff to base interval
      if (msgList.length > prevCount && prevCount > 0) {
        currentIntervalRef.current = pollInterval
      } else if (prevCount > 0) {
        // No new messages — increase interval with backoff
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * BACKOFF_MULTIPLIER,
          MAX_INTERVAL
        )
      }

      setMessages(msgList)
      setError(null) // Clear error on success
      setFailureCount(0) // Reset failure count on success
    } catch (err: any) {
      console.error('Failed to load messages:', err)
      setError(err.message || 'Failed to load messages')
      setFailureCount(prev => {
        const newCount = prev + 1
        // Stop polling after 3 consecutive failures
        if (newCount >= 3) {
          stoppedRef.current = true
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
        }
        return newCount
      })
    }
  }, [tripId, token, pollInterval])

  // Initial load
  useEffect(() => {
    if (enabled && tripId && token) {
      setLoading(true)
      prevMessageCountRef.current = 0
      loadMessages().finally(() => setLoading(false))
    }
  }, [enabled, tripId, token, loadMessages])

  // Polling with setTimeout chain (supports backoff)
  useEffect(() => {
    if (!enabled || !tripId || !token) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    stoppedRef.current = false

    const scheduleNext = () => {
      if (stoppedRef.current) return
      timeoutRef.current = setTimeout(async () => {
        await loadMessages()
        scheduleNext()
      }, currentIntervalRef.current)
    }

    scheduleNext()

    return () => {
      stoppedRef.current = true
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [enabled, tripId, token, loadMessages])

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
      prevMessageCountRef.current += 1

      // Reset backoff on user activity
      currentIntervalRef.current = pollInterval
    } catch (error: any) {
      toast.error(error.message || 'Failed to send message')
    } finally {
      setSendingMessage(false)
    }
  }, [newMessage, tripId, token, pollInterval])

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
