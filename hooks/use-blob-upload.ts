'use client'

import { upload } from '@vercel/blob/client'
import { useState, useCallback } from 'react'

// Local upload fallback — used when Vercel Blob isn't configured (dev)
async function uploadLocal(file: File, token?: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  const storedToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null)
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`
  }

  const res = await fetch('/api/upload/local', {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Local upload failed')
  }

  const data = await res.json()
  return data.url
}

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
      // Fall back to local upload if blob upload fails (e.g. no BLOB_READ_WRITE_TOKEN)
      console.warn('Blob upload failed, trying local fallback:', err.message)
      try {
        return await uploadLocal(file)
      } catch (localErr: any) {
        console.error('Local upload also failed:', localErr)
        setError(localErr.message || 'Upload failed')
        return null
      }
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
          } catch (err: any) {
            // Fall back to local upload
            console.warn('Blob upload failed for', file.name, '- trying local fallback')
            try {
              return await uploadLocal(file)
            } catch (localErr) {
              console.error('Failed to upload file:', file.name, localErr)
              return null
            }
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
