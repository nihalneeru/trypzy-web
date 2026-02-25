export function generateMetadata({ params }) {
  return {
    title: 'You\'re invited to plan a trip on Tripti.ai',
    description: 'Join your circle on Tripti — share availability, pick dates, and coordinate your next trip together.',
    openGraph: {
      title: 'You\'re invited to plan a trip on Tripti.ai',
      description: 'Join your circle on Tripti — share availability, pick dates, and coordinate your next trip together.',
      url: `https://tripti.ai/join/${params.inviteCode}`,
      siteName: 'Tripti.ai',
      images: [{
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'Tripti.ai',
      }],
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: 'You\'re invited to plan a trip on Tripti.ai',
      description: 'Join your circle on Tripti — share availability, pick dates, and coordinate your next trip together.',
    },
  }
}

export default function JoinLayout({ children }) {
  return children
}
