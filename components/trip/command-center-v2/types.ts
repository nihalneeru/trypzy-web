export type OverlayType =
  | 'proposed'
  | 'scheduling'
  | 'itinerary'
  | 'accommodation'
  | 'travelers'
  | 'prep'
  | 'expenses'
  | 'memories'
  | 'member'
  | null

export type OverlayParams = { memberId?: string; [key: string]: any }
