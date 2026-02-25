'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import {
  Users,
  Calendar as CalendarIcon,
  Rocket,
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
  const steps = [
    { icon: Users, label: 'Create a circle', description: 'Invite your group' },
    { icon: CalendarIcon, label: 'Find dates', description: 'Share when you\'re free' },
    { icon: Rocket, label: 'Plan together', description: 'Build your trip as a group' },
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

            {/* 3 core steps with connecting lines */}
            <div className="mb-6 sm:mb-10">
              <div className="flex items-start justify-center max-w-2xl mx-auto">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  return (
                    <div key={step.label} className="flex items-start flex-1">
                      <div className="flex flex-col items-center text-center w-full">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-brand-red/10 flex items-center justify-center mb-2 sm:mb-3">
                          <Icon className="h-5 w-5 sm:h-7 sm:w-7 text-brand-red" aria-hidden="true" />
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-brand-carbon">
                          {step.label}
                        </span>
                        <span className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                          {step.description}
                        </span>
                      </div>
                      {index < steps.length - 1 && (
                        <div className="flex-shrink-0 w-8 sm:w-12 mt-6 sm:mt-8 border-t border-gray-300" aria-hidden="true" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Positive scoping */}
            <div className="max-w-xl mx-auto text-center">
              <p className="text-sm sm:text-base text-gray-500">
                Built for friend circles planning trips together. Not a booking tool — a coordination tool.
              </p>
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
                Ready to try it with your circle?
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
                Ready to try it with your circle?
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
