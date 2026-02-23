export async function generateMetadata({ params }) {
  const { shareId } = params
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  try {
    const res = await fetch(`${baseUrl}/api/public/trips/${shareId}`, { cache: 'no-store' })
    if (!res.ok) return { title: 'Trip not found | Tripti.ai' }

    const data = await res.json()
    const trip = data.trip

    const title = `${trip.name}${trip.destinationHint ? ` \u2014 ${trip.destinationHint}` : ''} | Tripti.ai`
    const description = `${trip.duration || 'A'} trip with ${trip.travelerCount} traveler${trip.travelerCount !== 1 ? 's' : ''}. Plan yours on Tripti.`
    const ogImageUrl = `${baseUrl}/p/${shareId}/og`

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${baseUrl}/p/${shareId}`,
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
        type: 'article',
        siteName: 'Tripti.ai',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl],
      },
      robots: { index: false, follow: false },
    }
  } catch {
    return { title: 'Trip Preview | Tripti.ai' }
  }
}

export default function ShareLayout({ children }) {
  return children
}
