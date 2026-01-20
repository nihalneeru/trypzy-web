'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/marketing/WelcomePage'

export default function WelcomePageWrapper() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('trypzy_token')
    
    if (token) {
      // Authenticated: redirect to dashboard
      router.replace('/dashboard')
    } else {
      // Not authenticated: show welcome page
      setLoading(false)
    }
  }, [router])

  // Show nothing while checking auth (prevents flash of welcome page for authenticated users)
  if (loading) {
    return null
  }

  return <WelcomePage />
}
