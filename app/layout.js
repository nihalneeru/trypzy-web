import './globals.css'
import { Toaster } from 'sonner'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/SessionProvider'
import { PushHandler } from '@/components/common/PushHandler'
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
    title: 'Tripti.ai — Nifty plans. Happy circles.',
    description: 'Private, trust-based trip planning for friend groups',
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
      description: 'Private, trust-based trip planning for friend groups',
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
      card: 'summary',
      title: 'Tripti.ai — Nifty plans. Happy circles.',
      description: 'Private, trust-based trip planning for friend groups',
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-brand-blue focus:text-white focus:rounded focus:text-sm focus:font-medium"
        >
          Skip to main content
        </a>
        <SessionProvider>
          {children}
          <PushHandler />
        </SessionProvider>
        <Toaster position="top-right" />
        <CookieBanner />
      </body>
    </html>
  )
}
