'use client'

import { useState } from 'react'
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
import { DeleteAccountDialog } from '@/components/account/DeleteAccountDialog'
import { Users, Sparkles, ChevronDown, Shield, Trash2, LogOut } from 'lucide-react'

interface AppHeaderProps {
  userName?: string | null
  activePage?: 'circles' | 'discover'
}

export function AppHeader({ userName, activePage }: AppHeaderProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null

  const handleLogout = async () => {
    setLoggingOut(true)
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
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 safe-top">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: Logo + Navigation */}
            <div className="flex items-center shrink-0">
              <Link href="/dashboard" className="flex items-center shrink-0" data-testid="logo-home">
                <TriptiLogo variant="full" className="h-6 sm:h-8 w-auto" />
                <span className="sr-only">Tripti</span>
              </Link>
              <nav className="flex items-center ml-2 sm:ml-4">
                <Button
                  variant={activePage === 'circles' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs sm:text-sm px-1.5 sm:px-2 h-7 sm:h-8"
                  onClick={() => router.push('/dashboard')}
                >
                  <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Circles
                </Button>
                <Button
                  variant={activePage === 'discover' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs sm:text-sm px-1.5 sm:px-2 h-7 sm:h-8"
                  onClick={() => router.push('/discover')}
                >
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                  Discover
                </Button>
              </nav>
            </div>

            {/* Right: User dropdown */}
            <div className="flex items-center shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm gap-1 px-2 h-8">
                    {loggingOut ? (
                      <BrandedSpinner size="sm" />
                    ) : (
                      <>
                        <span className="max-w-[100px] sm:max-w-[140px] truncate">
                          {userName || 'Account'}
                        </span>
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push('/settings/privacy')}>
                    <Shield className="h-4 w-4 mr-2" />
                    Privacy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-brand-red focus:text-brand-red"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete account
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} disabled={loggingOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <DeleteAccountDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        token={token}
      />
    </>
  )
}
