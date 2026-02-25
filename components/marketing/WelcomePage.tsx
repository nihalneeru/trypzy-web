'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TriptiLogo } from '@/components/brand/TriptiLogo'
import {
  Users,
  Calendar as CalendarIcon,
  Map,
} from 'lucide-react'

export function WelcomePage() {
  const [loginPath, setLoginPath] = useState('/login')
  const [signupPath, setSignupPath] = useState('/signup')
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (window.Capacitor?.isNativePlatform?.()) {
      setLoginPath('/native-login')
      setSignupPath('/native-login')
    }
  }, [])

  // Fetch live stats
  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {})
  }, [])

  const steps = [
    {
      icon: Users,
      title: 'Create a circle',
      description: 'Invite your friends with a link. No app download required — it works on any device.',
    },
    {
      icon: CalendarIcon,
      title: 'Find dates',
      description: 'Everyone suggests when they\'re free. Tripti finds the overlap and helps your group converge.',
    },
    {
      icon: Map,
      title: 'Plan together',
      description: 'Build an itinerary, pick a stay, and prep as a group — at your own pace.',
    },
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col">
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
              <Button size="sm" asChild className="text-sm bg-brand-red hover:bg-brand-red/90 text-white">
                <Link href={signupPath}>Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="flex-1">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28 text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-brand-carbon mb-4 sm:mb-6 leading-tight">
            Plan trips together —<br className="hidden sm:block" /> without the chaos.
          </h1>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8 sm:mb-10">
            Share availability, pick dates, and coordinate your next adventure — all in one calm, friendly space.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button size="lg" asChild className="bg-brand-red hover:bg-brand-red/90 text-white text-base px-8 w-full sm:w-auto">
              <Link href={signupPath}>Start planning</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild className="text-brand-blue hover:text-brand-blue/80 text-base w-full sm:w-auto">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-brand-sand/30 py-12 sm:py-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-brand-carbon text-center mb-10 sm:mb-14">
              How it works
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10">
              {steps.map((step, i) => {
                const Icon = step.icon
                return (
                  <div key={i} className="text-center">
                    <div className="w-14 h-14 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-6 w-6 text-brand-red" />
                    </div>
                    <div className="text-xs font-semibold text-brand-red uppercase tracking-wide mb-2">
                      Step {i + 1}
                    </div>
                    <h3 className="text-lg font-semibold text-brand-carbon mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Social proof / Stats */}
        {stats?.trips > 0 && (
          <section className="py-10 sm:py-16 text-center">
            <div className="max-w-4xl mx-auto px-4">
              <p className="text-3xl sm:text-4xl font-bold text-brand-carbon">
                {stats.trips.toLocaleString()} trips
              </p>
              <p className="text-base text-gray-500 mt-2">
                planned on Tripti and counting
              </p>
            </div>
          </section>
        )}

        {/* Scoping */}
        <section className="py-10 sm:py-16">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-brand-carbon mb-4">
              Built for friend circles.
            </h2>
            <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
              Tripti is made for friend groups and families planning trips together —
              weekend getaways, bachelor parties, family reunions, you name it.
              It&apos;s not a booking engine or a rigid planner.
              It&apos;s the calm space between &quot;we should do a trip&quot; and &quot;we&apos;re actually going.&quot;
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-10 sm:py-16 text-center">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-brand-carbon mb-4">
              Ready to plan your next trip?
            </h2>
            <p className="text-gray-600 mb-6">
              It takes 30 seconds to create a circle and invite your crew.
            </p>
            <Button size="lg" asChild className="bg-brand-red hover:bg-brand-red/90 text-white text-base px-10">
              <Link href={signupPath}>Get started — it&apos;s free</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-6 shrink-0" style={{ backgroundColor: '#09173D' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <img
              src="/brand/tripti.ai-logo-final-versions/full-logo/tripti-fl-gray-dark-bg-v3.svg"
              alt="Tripti.ai"
              className="h-6 w-auto"
            />
            <p className="text-sm text-white/60 italic">
              Nifty plans. Happy circles.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
