import { NextResponse } from 'next/server'
import { handleUpload } from '@vercel/blob/client'
import { requireAuth } from '@/lib/server/auth.js'
import { handleCORS, OPTIONS as handleOPTIONS } from '@/lib/server/cors.js'

export { handleOPTIONS as OPTIONS }

export async function POST(request) {
  try {
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }

    const body = await request.json()

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        maximumSizeInBytes: 5 * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('Upload completed:', blob.url)
      },
    })

    return handleCORS(jsonResponse)
  } catch (error) {
    console.error('Upload token error:', error)
    return handleCORS(NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    ))
  }
}
