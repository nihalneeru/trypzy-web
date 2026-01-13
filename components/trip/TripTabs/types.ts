/**
 * Types for Trip Tabs components
 */

export type TripTabsProps = {
  trip: any // Trip object from API
  token: string
  user: any // User object
  onRefresh: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  primaryTab?: string
  stage?: string
}

export type PlanningTabProps = TripTabsProps & {
  // Planning-specific state
  availability: Record<string, string>
  setAvailability: (availability: Record<string, string>) => void
  broadAvailability: string
  setBroadAvailability: (availability: string) => void
  weeklyAvailability: Record<string, string>
  setWeeklyAvailability: (availability: Record<string, string>) => void
  refinementAvailability: Record<string, string>
  setRefinementAvailability: (availability: Record<string, string>) => void
  activityIdeas: string[]
  setActivityIdeas: (ideas: string[]) => void
  saving: boolean
  setSaving: (saving: boolean) => void
  selectedVote: string
  setSelectedVote: (vote: string) => void
  datePicks: Array<{ rank: number; startDateISO: string }>
  setDatePicks: (picks: Array<{ rank: number; startDateISO: string }>) => void
  savingPicks: boolean
  setSavingPicks: (saving: boolean) => void
  dates: string[]
  dateRangeLength: number
  useBroadMode: boolean
  useWeeklyMode: boolean
  weeklyBlocks: Array<{ key: string; start: Date; end: Date }>
  promisingWindows: any[]
  hasPromisingWindows: boolean
  refinementDates: string[]
  // Helper functions
  getDateRangeStrings: (startDateStr: string, endDateStr: string) => string[]
  setDayAvailability: (date: string, status: string) => void
  setRefinementDayAvailability: (date: string, status: string) => void
  setWindowBulkAvailability: (window: any, status: string) => void
  hasAnyAvailability: () => boolean
  hasAnyRefinementAvailability: () => boolean
  hasRespondedBroadly: boolean
  hasSubmittedAnyAvailability: boolean
  isSchedulingOpenForMe: () => boolean
  saveAvailability: () => Promise<void>
  submitVote: () => Promise<void>
  lockTrip: (optionKey: string) => Promise<void>
  openVoting: () => Promise<void>
  promoteRefinement: boolean
  votersByOption: Record<string, any[]>
  voteCounts: Record<string, number>
}

export type ItineraryTabProps = TripTabsProps & {
  // Itinerary-specific state
  ideas: any[]
  setIdeas: (ideas: any[]) => void
  loadingIdeas: boolean
  newIdea: any
  setNewIdea: (idea: any) => void
  addingIdea: boolean
  setAddingIdea: (adding: boolean) => void
  itineraryVersions: any[]
  setItineraryVersions: (versions: any[]) => void
  latestVersion: any
  setLatestVersion: (version: any) => void
  loadingVersions: boolean
  generating: boolean
  setGenerating: (generating: boolean) => void
  revising: boolean
  setRevising: (revising: boolean) => void
  feedback: any[]
  setFeedback: (feedback: any[]) => void
  loadingFeedback: boolean
  newFeedback: any
  setNewFeedback: (feedback: any) => void
  submittingFeedback: boolean
  setSubmittingFeedback: (submitting: boolean) => void
  // Helper functions
  loadIdeas: () => Promise<void>
  addIdea: () => Promise<void>
  loadVersions: () => Promise<void>
  generateItinerary: () => Promise<void>
  reviseItinerary: () => Promise<void>
  loadFeedback: () => Promise<void>
  submitFeedback: () => Promise<void>
}

export type MemoriesTabProps = TripTabsProps & {
  posts: any[]
  setPosts: (posts: any[]) => void
  loadingPosts: boolean
  showCreatePost: boolean
  setShowCreatePost: (show: boolean) => void
  loadPosts: () => Promise<void>
}

export type ChatTabProps = TripTabsProps & {
  messages: any[]
  setMessages: (messages: any[]) => void
  newMessage: string
  setNewMessage: (message: string) => void
  sendingMessage: boolean
  setSendingMessage: (sending: boolean) => void
  showTripChatHint: boolean
  dismissTripChatHint: () => void
  loadMessages: () => Promise<void>
  sendMessage: () => Promise<void>
}
