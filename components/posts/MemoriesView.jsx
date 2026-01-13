'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Camera, Plus } from 'lucide-react'
import { BrandedSpinner } from '@/components/brand/BrandedSpinner'
import { PostCard } from './PostCard'

// Memories View Component
export function MemoriesView({ posts, loading, onCreatePost, onDeletePost, onEditPost, emptyMessage = "No memories yet" }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <BrandedSpinner size="lg" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <Camera className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{emptyMessage}</h3>
          <p className="text-gray-500 mb-4">Capture and share your travel moments</p>
          {onCreatePost && (
            <Button onClick={onCreatePost}>
              <Plus className="h-4 w-4 mr-2" />
              Share your first memory
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {posts.map((post) => (
        <PostCard 
          key={post.id} 
          post={post}
          onDelete={onDeletePost}
          onEdit={onEditPost}
        />
      ))}
    </div>
  )
}
