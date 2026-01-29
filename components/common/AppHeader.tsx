'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { Users, Sparkles, LogOut } from 'lucide-react'

interface AppHeaderProps {
  userName?: string
  activePage?: 'circles' | 'discover'
}

export function AppHeader({ userName, activePage }: AppHeaderProps) {
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem('trypzy_token')
    localStorage.removeItem('trypzy_user')
    router.replace('/')
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Logo + Navigation */}
          <div className="flex items-center shrink-0">
            <Link href="/dashboard" className="flex items-center shrink-0" data-testid="logo-home">
              <TrypzyLogo variant="full" className="h-6 sm:h-8 w-auto" />
              <span className="sr-only">Trypzy</span>
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
          {/* Right: User info + Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {userName && (
              <span className="hidden md:block text-sm text-gray-600 max-w-[140px] truncate">
                Hi, {userName}
              </span>
            )}
            <Link
              href="/settings/privacy"
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 whitespace-nowrap"
            >
              Privacy
            </Link>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
