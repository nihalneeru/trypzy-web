'use client'

import { useState, useEffect } from 'react'
import { Edit } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface Post {
  id: string
  caption?: string
  destinationText?: string
  [key: string]: any
}

interface EditPostDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  post: Post | null
  token: string
  onSaved?: () => void
}

export function EditPostDialog({ open, onOpenChange, post, token, onSaved }: EditPostDialogProps) {
  const [caption, setCaption] = useState('')
  const [destinationText, setDestinationText] = useState('')
  const [saving, setSaving] = useState(false)

  // Populate form when post changes
  useEffect(() => {
    if (post) {
      setCaption(post.caption || '')
      setDestinationText(post.destinationText || '')
    }
  }, [post])

  const handleSave = async () => {
    if (!post) return

    setSaving(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          caption: caption.trim() || null,
          destinationText: destinationText.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update post')
      }

      toast.success('Post updated')
      onOpenChange(false)
      onSaved?.()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Post
          </DialogTitle>
          <DialogDescription>
            Update your post caption and destination
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Caption</Label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Share your story..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Destination</Label>
            <Input
              value={destinationText}
              onChange={(e) => setDestinationText(e.target.value)}
              placeholder="Destination name..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
