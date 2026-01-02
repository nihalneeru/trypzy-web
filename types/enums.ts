// TypeScript enums for type safety (SQLite doesn't support Prisma enums)
export enum MembershipRole {
  owner = 'owner',
  member = 'member',
}

export enum TripType {
  collaborative = 'collaborative',
  hosted = 'hosted',
}

export enum TripStatus {
  proposed = 'proposed',
  scheduling = 'scheduling',
  locked = 'locked',
}

export enum AvailabilityStatus {
  available = 'available',
  maybe = 'maybe',
  unavailable = 'unavailable',
}

