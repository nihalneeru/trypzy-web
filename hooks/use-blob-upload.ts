'use client'

import { upload } from '@vercel/blob/client'
import { useState, useCallback } from 'react'

function getAuthToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('tripti_token') : null
}

// Local upload — saves to public/uploads/ via the local API endpoint
async function uploadLocal(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
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

// Vercel Blob upload — used in production with BLOB_READ_WRITE_TOKEN
async function uploadBlob(file: File): Promise<string> {
  const blob = await upload(file.name, file, {
    access: 'public',
    handleUploadUrl: '/api/upload/token',
  })
  return blob.url
}

// Try local first in development, blob in production
// If one fails, fall back to the other
async function uploadWithFallback(file: File): Promise<string> {
  const isDev = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  if (isDev) {
    // In dev: try local first (no blob token needed)
    try {
      return await uploadLocal(file)
    } catch (localErr: any) {
      console.warn('Local upload failed, trying blob:', localErr.message)
      try {
        return await uploadBlob(file)
      } catch (blobErr: any) {
        throw new Error(localErr.message || 'Upload failed')
      }
    }
  } else {
    // In production: try blob first, fall back to local
    try {
      return await uploadBlob(file)
    } catch (blobErr: any) {
      console.warn('Blob upload failed, trying local fallback:', blobErr.message)
      return await uploadLocal(file)
    }
  }
}

export function useBlobUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true)
    setError(null)

    try {
      return await uploadWithFallback(file)
    } catch (err: any) {
      console.error('Upload failed:', err)
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
            return await uploadWithFallback(file)
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
