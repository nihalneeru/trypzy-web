'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import { BrandedSpinner } from '@/components/common/BrandedSpinner'
import { Users, Sparkles, ChevronDown, Settings, FileText, LogOut, Bell, HelpCircle } from 'lucide-react'

interface Notification {
  id: string
  title: string
  context: string
  ctaLabel: string
  href: string
  priority: number
  timestamp: string
}

interface AppHeaderProps {
  userName?: string | null
  activePage?: 'circles' | 'discover'
  notifications?: Notification[]
}

export function AppHeader({ userName, activePage, notifications: externalNotifications }: AppHeaderProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [selfNotifications, setSelfNotifications] = useState<Notification[]>([])
  const fetchedRef = useRef(false)

  // Self-fetch notifications if not provided via prop
  useEffect(() => {
    if (externalNotifications && externalNotifications.length > 0) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    const token = typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null
    if (!token) return

    fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.notifications) setSelfNotifications(data.notifications)
      })
      .catch(() => {}) // silent — bell just won't show
  }, [externalNotifications])

  const notifications = (externalNotifications && externalNotifications.length > 0)
    ? externalNotifications
    : selfNotifications

  const handleLogout = async () => {
    setLoggingOut(true)

    // Unregister push token before clearing auth (best-effort)
    try {
      const pushToken = localStorage.getItem('tripti_push_token')
      const authToken = localStorage.getItem('tripti_token')
      if (pushToken && authToken) {
        fetch('/api/push/register', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ token: pushToken })
        }).catch(() => {})
      }
      localStorage.removeItem('tripti_push_token')
    } catch {}

    localStorage.removeItem('tripti_token')
    localStorage.removeItem('tripti_user')
    document.cookie = 'tripti_auth_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'

    if (window.Capacitor?.isNativePlatform?.()) {
      try {
        const Prefs = window.Capacitor.Plugins?.Preferences
        if (Prefs) {
          await Prefs.remove({ key: 'tripti_token' })
          await Prefs.remove({ key: 'tripti_user' })
          await Prefs.remove({ key: 'pending_url' })
        }
        const GoogleAuth = window.Capacitor.Plugins?.GoogleAuth
        if (GoogleAuth) {
          await GoogleAuth.signOut().catch(() => {})
        }
      } catch {}
    }

    await signOut({ redirect: false })
    router.replace('/')
  }

  return (
    <header className="bg-white border-b border-brand-carbon/10 sticky top-0 z-50 safe-top">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center shrink-0">
              <Link href="/dashboard" className="flex items-center shrink-0" data-testid="logo-home">
                <TriptiLogo variant="full" className="h-6 sm:h-8 w-auto" />
                <span className="sr-only">Tripti.ai</span>
              </Link>
              <nav aria-label="Main navigation" className="flex items-center ml-2 sm:ml-4">
                <Button
                  variant={activePage === 'circles' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs sm:text-sm px-1.5 sm:px-2 h-7 sm:h-8"
                  onClick={() => router.push('/circles')}
                >
                  <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1" aria-hidden="true" />
                  Circles
                </Button>
                <Button
                  variant={activePage === 'discover' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs sm:text-sm px-1.5 sm:px-2 h-7 sm:h-8"
                  onClick={() => router.push('/discover')}
                >
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1" aria-hidden="true" />
                  Discover
                </Button>
              </nav>
            </div>

            {/* Right: Notifications + User dropdown */}
            <div className="flex items-center shrink-0 gap-1">
              {/* Notification bell */}
              {notifications.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="relative px-2 h-11 [&_svg]:size-auto">
                      <Bell className="h-4 w-4 text-brand-carbon" aria-hidden="true" />
                      <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red text-[10px] font-semibold text-white px-1">
                        {notifications.length}
                      </span>
                      <span className="sr-only">{notifications.length} notification{notifications.length !== 1 ? 's' : ''}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-1rem)]">
                    <div className="px-3 py-2">
                      <span className="text-xs font-medium text-brand-carbon/60 uppercase tracking-wide">Activity</span>
                    </div>
                    <DropdownMenuSeparator />
                    {notifications.slice(0, 5).map((n) => (
                      <DropdownMenuItem key={n.id} onClick={() => router.push(n.href)} className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer">
                        <span className="text-sm font-medium text-brand-carbon leading-tight">{n.title}</span>
                        <span className="text-xs text-brand-carbon/60 leading-tight">{n.context || n.ctaLabel}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm gap-1 px-2 h-11">
                    {loggingOut ? (
                      <BrandedSpinner size="sm" />
                    ) : (
                      <>
                        <span className="max-w-[100px] sm:max-w-[140px] truncate">
                          {userName?.split(' ')[0] || 'Account'}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push('/settings')}>
                    <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/terms')}>
                    <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                    Terms of Use
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/privacy')}>
                    <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                    Privacy Policy
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/help')}>
                    <HelpCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                    Help & Support
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
                    <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
    </header>
  )
}
