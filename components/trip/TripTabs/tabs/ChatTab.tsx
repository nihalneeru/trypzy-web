'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageCircle, Send, X } from 'lucide-react'
import { TripPrimaryStage } from '@/lib/trips/stage'

export function ChatTab({
  trip,
  user,
  messages,
  newMessage,
  setNewMessage,
  sendingMessage,
  sendMessage,
  showTripChatHint,
  dismissTripChatHint,
  stage
}: any) {
  return (
    <Card className="h-[500px] flex flex-col">
      <CardHeader>
        <CardTitle className="text-lg">Trip Chat</CardTitle>
        <CardDescription>Decisions and updates for this trip. System updates appear here.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {showTripChatHint && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-3">
            <p className="text-sm text-blue-800 flex-1">
              {stage === TripPrimaryStage.PROPOSED && 'Discuss dates and availability'}
              {stage === TripPrimaryStage.DATES_LOCKED && 'Discuss itinerary ideas'}
              {stage === TripPrimaryStage.ITINERARY && 'Discuss itinerary details'}
              {(stage === TripPrimaryStage.STAY || stage === TripPrimaryStage.PREP) && 'Coordinate trip preparation'}
              {stage === TripPrimaryStage.ONGOING && 'Coordinate live plans'}
              {stage === TripPrimaryStage.COMPLETED && 'Share trip memories'}
              {!stage && 'Trip Chat is for decisions and updates. For general discussion, use Circle Lounge.'}
            </p>
            <button
              onClick={dismissTripChatHint}
              className="flex-shrink-0 text-blue-600 hover:text-blue-800"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</p>
            ) : (
              messages.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.isSystem ? 'justify-center' : msg.user?.id === user.id ? 'justify-end' : 'justify-start'}`}>
                  {msg.isSystem ? (
                    <div 
                      className={`bg-gray-100 rounded-full px-4 py-1 text-sm text-gray-600 ${msg.metadata?.href ? 'cursor-pointer hover:bg-gray-200 transition-colors' : ''}`}
                      onClick={msg.metadata?.href ? () => {
                        // Navigate to the href if it's a relative path
                        if (msg.metadata.href.startsWith('/')) {
                          window.location.href = msg.metadata.href
                        } else {
                          window.open(msg.metadata.href, '_blank')
                        }
                      } : undefined}
                    >
                      {msg.content}
                    </div>
                  ) : (
                    <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.user?.id === user.id ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                      {msg.user?.id !== user.id && (
                        <p className="text-xs font-medium mb-1 opacity-70">{msg.user?.name}</p>
                      )}
                      <p>{msg.content}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
