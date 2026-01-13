'use client'

import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { MemoriesView, CreatePostDialog } from '@/app/page'

export function MemoriesTab({ 
  trip, 
  token, 
  posts, 
  loadingPosts, 
  showCreatePost, 
  setShowCreatePost, 
  loadPosts,
  deletePost 
}: any) {
  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Trip Memories</h2>
        <Button onClick={() => setShowCreatePost(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Memory
        </Button>
      </div>
      
      <MemoriesView 
        posts={posts}
        loading={loadingPosts}
        onCreatePost={() => setShowCreatePost(true)}
        onDeletePost={deletePost}
        emptyMessage="No memories from this trip yet"
      />
      
      <CreatePostDialog
        open={showCreatePost}
        onOpenChange={setShowCreatePost}
        circleId={trip.circleId}
        trips={[trip]}
        token={token}
        onCreated={loadPosts}
      />
    </>
  )
}
