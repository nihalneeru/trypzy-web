'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar as CalendarIcon, ListTodo, Camera, MessageCircle, Lock, Home, Luggage, Users } from 'lucide-react'
import { PlanningTab } from './tabs/PlanningTab'
import { ItineraryTab } from './tabs/ItineraryTab'
import { AccommodationTab } from './tabs/AccommodationTab'
import { PrepTab } from './tabs/PrepTab'
import { MemoriesTab } from './tabs/MemoriesTab'
import { ChatTab } from './tabs/ChatTab'
import { TravelersTab } from './tabs/TravelersTab'

// Helper to check if trip is completed
function isTripCompleted(trip) {
  if (!trip) return false
  if (trip.status === 'completed') return true
  
  const today = new Date().toISOString().split('T')[0]
  const endDate = trip.lockedEndDate || trip.endDate
  return endDate && endDate < today
}

export function TripTabs({
  trip,
  token,
  user,
  onRefresh,
  activeTab,
  setActiveTab,
  primaryTab,
  stage,
  // Planning props
  planningProps,
  // Itinerary props
  itineraryProps,
  // Accommodation props
  accommodationProps,
  // Prep props
  prepProps,
  // Memories props
  memoriesProps,
  // Chat props
  chatProps
}: any) {
  const completed = isTripCompleted(trip)
  const peopleTabLabel = completed ? 'Went' : 'Going'
  
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="sticky top-0 z-30 mb-4 bg-white/95 backdrop-blur border-b">
        <TabsList className="flex w-full flex-row items-center gap-2 whitespace-nowrap overflow-x-auto max-w-full">
          <TabsTrigger 
            value="travelers"
            className="flex-none"
          >
            <Users className="h-4 w-4 mr-2" />
            {peopleTabLabel}
          </TabsTrigger>
          <TabsTrigger 
            value="planning"
            className={`flex-none ${primaryTab === 'planning' && activeTab !== 'planning' ? 'relative' : ''}`}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            Planning
            {primaryTab === 'planning' && activeTab !== 'planning' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="itinerary"
            disabled={trip.status !== 'locked'}
            className={`flex-none ${primaryTab === 'itinerary' && activeTab !== 'itinerary' ? 'relative' : ''}`}
          >
            <ListTodo className="h-4 w-4 mr-2" />
            Itinerary
            {trip.status !== 'locked' && (
              <Lock className="h-3 w-3 ml-1 text-gray-400" />
            )}
            {primaryTab === 'itinerary' && activeTab !== 'itinerary' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="accommodation"
            disabled={trip.status !== 'locked'}
            className={`flex-none ${primaryTab === 'accommodation' && activeTab !== 'accommodation' ? 'relative' : ''}`}
          >
            <Home className="h-4 w-4 mr-2" />
            Accommodation
            {trip.status !== 'locked' && (
              <Lock className="h-3 w-3 ml-1 text-gray-400" />
            )}
            {primaryTab === 'accommodation' && activeTab !== 'accommodation' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="prep"
            disabled={trip.status !== 'locked'}
            className={`flex-none ${primaryTab === 'prep' && activeTab !== 'prep' ? 'relative' : ''}`}
          >
            <Luggage className="h-4 w-4 mr-2" />
            Prep
            {trip.status !== 'locked' && (
              <Lock className="h-3 w-3 ml-1 text-gray-400" />
            )}
            {primaryTab === 'prep' && activeTab !== 'prep' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="memories"
            className={`flex-none ${primaryTab === 'memories' && activeTab !== 'memories' ? 'relative' : ''}`}
          >
            <Camera className="h-4 w-4 mr-2" />
            Memories
            {primaryTab === 'memories' && activeTab !== 'memories' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="chat"
            className={`flex-none ${primaryTab === 'chat' && activeTab !== 'chat' ? 'relative' : ''}`}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat
            {primaryTab === 'chat' && activeTab !== 'chat' && (
              <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="travelers">
        <TravelersTab
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
        />
      </TabsContent>

      <TabsContent value="planning">
        <PlanningTab
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          setActiveTab={setActiveTab}
          {...planningProps}
        />
      </TabsContent>

      <TabsContent value="itinerary">
        <ItineraryTab
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          {...itineraryProps}
        />
      </TabsContent>

      <TabsContent value="accommodation">
        <AccommodationTab
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          {...accommodationProps}
        />
      </TabsContent>

      <TabsContent value="prep">
        <PrepTab
          trip={trip}
          token={token}
          user={user}
          onRefresh={onRefresh}
          {...prepProps}
        />
      </TabsContent>

      <TabsContent value="memories">
        <MemoriesTab
          trip={trip}
          token={token}
          {...memoriesProps}
        />
      </TabsContent>

      <TabsContent value="chat">
        <ChatTab
          trip={trip}
          user={user}
          stage={stage}
          setActiveTab={setActiveTab}
          {...chatProps}
        />
      </TabsContent>
    </Tabs>
  )
}
