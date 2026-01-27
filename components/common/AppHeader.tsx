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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center" data-testid="logo-home">
              <TrypzyLogo variant="full" className="h-8 w-auto" />
              <span className="sr-only">Trypzy</span>
            </Link>
            <div className="flex items-center gap-1 ml-2 md:ml-8">
              <Button
                variant={activePage === 'circles' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => router.push('/dashboard')}
              >
                <Users className="h-4 w-4 mr-2" />
                Circles
              </Button>
              <Button
                variant={activePage === 'discover' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => router.push('/discover')}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Discover
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {userName && (
              <span className="text-sm text-gray-600">Hi, {userName}</span>
            )}
            <Link
              href="/settings/privacy"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Privacy
            </Link>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
