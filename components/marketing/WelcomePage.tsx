'use client'

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
  // Trip progress milestones in order
  const milestones = [
    { icon: Lightbulb, label: 'Trip Idea' },
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
      <header className="border-b border-gray-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <Link href="/" className="flex items-center">
              <TriptiLogo variant="full" className="h-6 sm:h-8 w-auto" />
              <span className="sr-only">Tripti</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="sm" asChild className="text-sm">
                <Link href="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild className="text-sm">
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - fills remaining space */}
      <main className="flex-1 flex flex-col justify-center overflow-y-auto">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12 lg:py-20">
          <div className="text-center">
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 sm:mb-10">
              Plan trips together — without coordination chaos.
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
                          <Icon className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
                        </div>
                        <span className="text-[10px] sm:text-xs font-medium text-gray-700">
                          {milestone.label}
                        </span>
                      </div>
                      {index < milestones.length - 1 && (
                        <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mx-1 sm:mx-2 hidden sm:block" />
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
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">Great for</h3>
                    <ul className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600 text-left">
                      <li>• Friend groups</li>
                      <li>• Up to ~15 people</li>
                      <li>• Low-pressure planning</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border border-gray-200">
                  <CardContent className="py-3 px-3 sm:py-4 sm:px-5">
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-2">Not for (yet)</h3>
                    <ul className="space-y-0.5 sm:space-y-1 text-xs sm:text-sm text-gray-600 text-left">
                      <li>• Booking travel</li>
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
      <section className="bg-primary/5 py-4 sm:py-6 shrink-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">
            Ready to try it with your group?
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
            <Button size="default" asChild className="text-sm sm:text-base px-6 sm:px-10">
              <Link href="/signup">Get started</Link>
            </Button>
            <Button size="default" variant="outline" asChild className="text-sm sm:text-base px-6 sm:px-10">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
          {/* Inline footer */}
          <div className="mt-4 pt-3 border-t border-gray-200/50">
            <TriptiLogo variant="full" className="h-5 w-auto mx-auto opacity-60" />
          </div>
        </div>
      </section>
    </div>
  )
}
