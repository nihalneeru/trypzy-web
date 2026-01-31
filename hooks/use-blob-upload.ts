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
