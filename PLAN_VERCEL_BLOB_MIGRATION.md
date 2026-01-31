# Vercel Blob Storage - Simple MVP Plan

## Goal

Fix the EROFS error so image uploads work on Vercel. Minimal changes, no over-engineering.

---

## What We're Building

1. **Client-direct uploads** via Vercel Blob (bypasses 4.5MB limit and EROFS)
2. **New token endpoint** for upload authorization
3. **Update 3 client components** to use new upload flow
4. **Update discover posts endpoint** to accept URLs instead of FormData

That's it. No tracking collection, no cron jobs, no migration scripts.

---

## Architecture

```
CURRENT (broken on Vercel):
  Browser → POST /api/upload (FormData) → writeFile() → EROFS error

NEW (works on Vercel):
  Browser → Vercel Blob (direct upload)
         ↓
  Token exchange: POST /api/upload/token
         ↓
  Returns blob URL to client
         ↓
  Client includes URL in post creation
```

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `package.json` | Add `@vercel/blob` |
| `app/api/upload/token/route.js` | **NEW** - Token endpoint for client uploads |
| `hooks/use-blob-upload.ts` | **NEW** - Client upload hook |
| `components/trip/.../MemoriesOverlay.tsx` | Use new upload hook |
| `components/circles/CreatePostDialog.tsx` | Use new upload hook |
| `components/discover/ShareToDiscoverDialog.tsx` | Use new upload hook + JSON body |
| `app/api/discover/posts/route.js` | Accept JSON with URLs (not FormData) |

---

## Implementation

### Step 1: Install Package

```bash
npm install @vercel/blob
```

### Step 2: Create Token Endpoint

**File: `app/api/upload/token/route.js`**

```javascript
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
        // Optional: log successful uploads
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
```

### Step 3: Create Upload Hook

**File: `hooks/use-blob-upload.ts`**

```typescript
'use client'

import { upload } from '@vercel/blob/client'
import { useState, useCallback } from 'react'

export function useBlobUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true)
    setError(null)

    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/token',
      })
      return blob.url
    } catch (err: any) {
      console.error('Upload error:', err)
      setError(err.message || 'Upload failed')
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  const uploadFiles = useCallback(async (files: File[]): Promise<string[]> => {
    setUploading(true)
    setError(null)

    try {
      const results = await Promise.all(
        files.map(async (file) => {
          try {
            const blob = await upload(file.name, file, {
              access: 'public',
              handleUploadUrl: '/api/upload/token',
            })
            return blob.url
          } catch (err) {
            console.error('Failed to upload file:', file.name, err)
            return null
          }
        })
      )
      return results.filter((url): url is string => url !== null)
    } finally {
      setUploading(false)
    }
  }, [])

  return { uploadFile, uploadFiles, uploading, error }
}
```

### Step 4: Update MemoriesOverlay

Replace the upload logic to use the new hook.

### Step 5: Update CreatePostDialog

Replace the upload logic to use the new hook.

### Step 6: Update ShareToDiscoverDialog

1. Use new hook for uploads
2. Send JSON body with URLs instead of FormData

### Step 7: Update Discover Posts Endpoint

Accept both FormData (backwards compat) and JSON with mediaUrls.

---

## Environment Setup

1. Create Blob store in Vercel dashboard (Storage → Create → Blob)
2. Add `BLOB_READ_WRITE_TOKEN` to Vercel environment variables

For local dev: uploads work without token (falls back to local storage in existing `/api/upload`).

---

## What We're NOT Doing (deferred)

- ❌ Image tracking collection
- ❌ Cleanup cron job
- ❌ Migration of existing images
- ❌ Signed URLs for privacy
- ❌ Server-side upload fallback refactor

These can be added post-MVP if needed.

---

## Testing

1. Local: Works with existing `/api/upload` fallback
2. Vercel preview: Test with Blob token
3. Production: Same as preview

---

## Rollback

If issues occur, revert the client components to use `/api/upload` directly. Won't work on Vercel but works locally for debugging.
