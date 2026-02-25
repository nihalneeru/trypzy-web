import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/auth.js'
import { handleCORS, OPTIONS as handleOPTIONS } from '@/lib/server/cors.js'
import { v4 as uuidv4 } from 'uuid'
import { writeFile, mkdir, access } from 'fs/promises'
import { join } from 'path'

export { handleOPTIONS as OPTIONS }

// POST /api/upload/local — Local file upload fallback (dev only, no Vercel Blob)
export async function POST(request) {
  try {
    const auth = await requireAuth(request)
    if (auth.error) {
      return handleCORS(NextResponse.json({ error: auth.error }, { status: auth.status }))
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string') {
      return handleCORS(NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      ))
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
    if (!allowedTypes.includes(file.type)) {
      return handleCORS(NextResponse.json(
        { error: `Invalid file type: ${file.type}` },
        { status: 400 }
      ))
    }

    if (file.size > 5 * 1024 * 1024) {
      return handleCORS(NextResponse.json(
        { error: 'File too large. Maximum 5MB' },
        { status: 400 }
      ))
    }

    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    try {
      await access(uploadsDir)
    } catch {
      await mkdir(uploadsDir, { recursive: true })
    }

    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg'
    const filename = `${uuidv4()}.${ext}`
    const filePath = join(uploadsDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return handleCORS(NextResponse.json({
      url: `/uploads/${filename}`
    }))
  } catch (error) {
    console.error('Local upload error:', error)

    if (error.code === 'EROFS') {
      return handleCORS(NextResponse.json(
        { error: 'Read-only filesystem — local uploads not supported in production' },
        { status: 503 }
      ))
    }

    return handleCORS(NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    ))
  }
}
