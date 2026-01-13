'use client'

import { useState, useEffect } from 'react'

// Auth Context
export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('trypzy_token')
    const storedUser = localStorage.getItem('trypzy_user')
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const login = (userData, authToken) => {
    localStorage.setItem('trypzy_token', authToken)
    localStorage.setItem('trypzy_user', JSON.stringify(userData))
    setToken(authToken)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    setToken(null)
    setUser(null)
  }

  return { user, token, loading, login, logout }
}
