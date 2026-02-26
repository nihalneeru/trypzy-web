import './globals.css'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PushHandler } from '@/components/common/PushHandler'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { Analytics } from '@vercel/analytics/next'
import { MixpanelProvider } from '@/components/providers/MixpanelProvider'
import { CookieBanner } from '@/components/common/CookieBanner'
import * as Sentry from '@sentry/nextjs'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export function generateMetadata() {
  return {
    metadataBase: new URL('https://tripti.ai'),
    title: 'Tripti.ai — Nifty plans. Happy circles.',
    description: 'Plan trips with your friend group — share availability, pick dates, and coordinate without the group chat chaos.',
    icons: {
      icon: [
        { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    openGraph: {
      title: 'Tripti.ai — Nifty plans. Happy circles.',
      description: 'Plan trips with your friend group — share availability, pick dates, and coordinate without the group chat chaos.',
      url: 'https://tripti.ai',
      siteName: 'Tripti.ai',
      images: [
        {
          url: '/icon-512x512.png',
          width: 512,
          height: 512,
          alt: 'Tripti.ai logo',
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Tripti.ai — Nifty plans. Happy circles.',
      description: 'Plan trips with your friend group — share availability, pick dates, and coordinate without the group chat chaos.',
      images: ['/icon-512x512.png'],
    },
    other: {
      ...Sentry.getTraceData()
    }
  }
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Georgia&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Analytics />
        <MixpanelProvider />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-brand-blue focus:text-white focus:rounded focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <SessionProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <PushHandler />
        </SessionProvider>
        <Toaster position="top-right" />
        <CookieBanner />
      </body>
    </html>
  )
}
