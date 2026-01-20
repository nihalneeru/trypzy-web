'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TrypzyLogo } from '@/components/brand/TrypzyLogo'
import { 
  Calendar, 
  Users, 
  CheckCircle2, 
  XCircle,
  Sparkles
} from 'lucide-react'

export function WelcomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center">
              <TrypzyLogo variant="full" className="h-8 w-auto" />
              <span className="sr-only">Trypzy</span>
            </Link>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Plan trips together — without the chaos.
          </h1>
          <p className="text-xl sm:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Trypzy helps groups plan trips even when not everyone participates equally.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Who it's for Section */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Who it's for</h2>
          <ul className="space-y-4 max-w-2xl mx-auto">
            <li className="flex items-start gap-3">
              <Users className="h-6 w-6 text-primary mt-0.5 shrink-0" />
              <span className="text-lg text-gray-700">Couples and small friend groups</span>
            </li>
            <li className="flex items-start gap-3">
              <Sparkles className="h-6 w-6 text-primary mt-0.5 shrink-0" />
              <span className="text-lg text-gray-700">Groups where one or two people usually organize</span>
            </li>
            <li className="flex items-start gap-3">
              <Calendar className="h-6 w-6 text-primary mt-0.5 shrink-0" />
              <span className="text-lg text-gray-700">Trips planned over days or weeks, not one sitting</span>
            </li>
          </ul>
          <p className="text-sm text-gray-500 text-center mt-6">
            Best for groups up to ~10–15 people (for now).
          </p>
        </div>
      </section>

      {/* How it works Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">1</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Pick when works</h3>
                    <p className="text-gray-600">Everyone shares availability; organizer can finalize.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">2</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Shape the plan</h3>
                    <p className="text-gray-600">Generate an itinerary; revise together.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">3</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Decide where to stay (optional)</h3>
                    <p className="text-gray-600">Add up to 3 options; choose later.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-bold text-lg">4</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Move forward without waiting</h3>
                    <p className="text-gray-600">Nothing blocks progress; organizer can mark steps done.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Key principles Section */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Key principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span className="text-gray-700">Optional steps (skip what you don't need)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span className="text-gray-700">Clear ownership (organizer can finalize)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span className="text-gray-700">Built for real groups (not everyone has to participate)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <span className="text-gray-700">Everything in one place (chat + planning)</span>
            </div>
          </div>
        </div>
      </section>

      {/* What Trypzy is not Section */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">What Trypzy is not</h2>
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
              <span className="text-gray-700">A booking site</span>
            </div>
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
              <span className="text-gray-700">A rigid checklist you must complete</span>
            </div>
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-gray-400 mt-0.5 shrink-0" />
              <span className="text-gray-700">A solo itinerary generator (yet)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bg-primary/5 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Ready to plan your next trip?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="text-lg px-8">
              <Link href="/signup">Create an account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg px-8">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center">
            <TrypzyLogo variant="icon" className="h-6 w-6" />
            <span className="ml-2 text-sm text-gray-500">Trypzy</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
