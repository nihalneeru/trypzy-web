'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import {
  Users,
  XCircle,
  ArrowRight,
  Lightbulb,
  Calendar as CalendarIcon,
  ListTodo,
  Home,
  Luggage,
  Rocket,
  Camera,
  DollarSign
} from 'lucide-react'

export function WelcomePage() {
  const [loginPath, setLoginPath] = useState('/login')
  const [signupPath, setSignupPath] = useState('/signup')

  useEffect(() => {
    if (window.Capacitor?.isNativePlatform?.()) {
      setLoginPath('/native-login')
      setSignupPath('/native-login')
    }
  }, [])
  // Trip progress milestones in order
  const milestones = [
    { icon: Lightbulb, label: 'Trip idea' },
    { icon: CalendarIcon, label: 'Dates' },
    { icon: ListTodo, label: 'Itinerary' },
    { icon: Home, label: 'Stay' },
    { icon: Luggage, label: 'Prep' },
    { icon: Rocket, label: 'Travel' },
    { icon: Camera, label: 'Memories' },
    { icon: DollarSign, label: 'Expenses' }
  ]

  return (
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-gray-200 shrink-0 safe-top">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link href="/" className="flex items-center">
              <TriptiLogo variant="full" className="h-6 sm:h-8 w-auto" />
              <span className="sr-only">Tripti.ai</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" asChild className="text-sm">
                <Link href={loginPath}>Log in</Link>
              </Button>
              <Button size="sm" asChild className="text-sm">
                <Link href={signupPath}>Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - fills remaining space */}
      <main id="main-content" className="flex-1 flex flex-col justify-center overflow-y-auto">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-20">
          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-brand-carbon mb-6 sm:mb-10">
              Plan trips together — without the chaos.
            </h1>

            {/* Visual Flow Graphic - All 8 milestones */}
            <div className="mb-6 sm:mb-10">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 max-w-4xl mx-auto">
                {milestones.map((milestone, index) => {
                  const Icon = milestone.icon
                  return (
                    <div key={milestone.label} className="flex items-center">
                      <div className="flex flex-col items-center gap-1 sm:gap-2">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 sm:h-6 sm:w-6 text-primary" aria-hidden="true" />
                        </div>
                        <span className="text-[10px] sm:text-xs font-medium text-gray-700">
                          {milestone.label}
                        </span>
                      </div>
                      {index < milestones.length - 1 && (
                        <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mx-1 sm:mx-2 hidden sm:block" aria-hidden="true" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Great for / Not for - inline on mobile */}
            <div className="max-w-3xl mx-auto">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Card className="border border-primary/20">
                  <CardContent className="py-3 px-3 sm:py-4 sm:px-5">
                    <h3 className="text-sm sm:text-base font-semibold text-brand-carbon mb-2">Great for</h3>
                    <ul className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600 text-left">
                      <li>• Friend groups</li>
                      <li>• Up to ~15 people</li>
                      <li>• Plan at your own pace</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200">
                  <CardContent className="py-3 px-3 sm:py-4 sm:px-5">
                    <h3 className="text-sm sm:text-base font-semibold text-brand-carbon mb-2">Not for (yet)</h3>
                    <ul className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600 text-left">
                      <li>• Flights & hotels</li>
                      <li>• Rigid checklists</li>
                      <li>• Planning alone</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom CTA Section - always visible */}
      <section className="py-4 sm:py-6 shrink-0" style={{ backgroundColor: '#09173D' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile: logo left (cols 1-2), text+CTAs right (cols 3-4), all top-aligned */}
          <div className="grid grid-cols-4 gap-x-3 items-start sm:hidden">
            <div className="col-span-2 pt-0.5">
              <img
                src="/brand/tripti.ai-logo-final-versions/full-logo/tripti-fl-gray-dark-bg-v3.svg"
                alt="Tripti.ai"
                className="h-6 w-auto"
              />
            </div>
            <div className="col-span-2">
              <p className="text-sm font-medium text-white mb-2">
                Ready to try it with your group?
              </p>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" asChild className="bg-brand-red hover:bg-brand-red/90 text-white text-sm px-4 w-full">
                  <Link href={signupPath}>Get started</Link>
                </Button>
                <Button size="sm" variant="ghost" asChild className="border border-white/30 text-white hover:bg-white/10 text-sm px-4 w-full">
                  <Link href={loginPath}>Log in</Link>
                </Button>
              </div>
            </div>
          </div>
          {/* Desktop: logo left-aligned (cols 1-2), text+CTAs right (cols 3-12), all top-aligned */}
          <div className="hidden sm:grid grid-cols-12 gap-x-6 items-start">
            <div className="col-span-2 pt-0.5">
              <img
                src="/brand/tripti.ai-logo-final-versions/full-logo/tripti-fl-gray-dark-bg-v3.svg"
                alt="Tripti.ai"
                className="h-7 w-auto"
              />
            </div>
            <div className="col-span-10">
              <p className="text-base font-medium text-white mb-2">
                Ready to try it with your group?
              </p>
              <div className="flex gap-3">
                <Button size="default" asChild className="bg-brand-red hover:bg-brand-red/90 text-white text-base px-8">
                  <Link href={signupPath}>Get started</Link>
                </Button>
                <Button size="default" variant="ghost" asChild className="border border-white/30 text-white hover:bg-white/10 text-base px-8">
                  <Link href={loginPath}>Log in</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
