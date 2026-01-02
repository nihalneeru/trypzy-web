# Folder Structure

This document describes the organized folder structure of the Trypzy web application.

## Overview

The project follows a feature-based organization pattern for better scalability and maintainability.

```
trypzy-web/
├── app/                    # Next.js App Router (pages and API routes)
│   ├── api/               # API routes organized by feature
│   ├── auth/              # Auth pages
│   ├── circles/           # Circle pages
│   └── ...
│
├── components/            # React components organized by feature
│   ├── auth/             # Authentication components
│   │   └── AuthProvider.tsx
│   ├── circles/          # Circle-related components
│   │   └── InviteLink.tsx
│   ├── trips/            # Trip-related components (future)
│   ├── layout/           # Layout components
│   │   └── Navbar.tsx
│   └── ui/               # Reusable UI components (future)
│
├── lib/                   # Utility libraries organized by domain
│   ├── auth/             # Authentication utilities
│   │   └── auth.ts
│   ├── db/               # Database utilities
│   │   └── prisma.ts
│   └── trips/            # Trip-related utilities
│       ├── trip-consensus.ts
│       └── __tests__/    # Tests for trip utilities
│
├── types/                 # TypeScript types organized by domain
│   ├── auth.ts           # Auth types
│   ├── trips.ts          # Trip types (DateOption, etc.)
│   ├── enums.ts          # Shared enums
│   └── next-auth.d.ts    # NextAuth type declarations
│
├── prisma/                # Database schema and migrations
│   └── schema.prisma
│
└── e2e/                   # End-to-end tests (Playwright)
```

## Component Organization

### `components/auth/`
Components related to authentication:
- `AuthProvider.tsx` - NextAuth session provider wrapper

### `components/circles/`
Components related to circles:
- `InviteLink.tsx` - Circle invite link display and copy functionality

### `components/layout/`
Layout and navigation components:
- `Navbar.tsx` - Main navigation bar

### `components/trips/` (Future)
Components related to trips (availability forms, trip cards, etc.)

### `components/ui/` (Future)
Reusable UI components (buttons, inputs, modals, etc.)

## Library Organization

### `lib/auth/`
Authentication-related utilities:
- `auth.ts` - NextAuth configuration

### `lib/db/`
Database-related utilities:
- `prisma.ts` - Prisma client instance

### `lib/trips/`
Trip-related utilities:
- `trip-consensus.ts` - Consensus calculation logic
- `__tests__/` - Unit tests for trip utilities

## Type Organization

### `types/auth.ts`
Authentication-related types

### `types/trips.ts`
Trip-related types (DateOption, etc.)

### `types/enums.ts`
Shared TypeScript enums (MembershipRole, TripType, etc.)

### `types/next-auth.d.ts`
NextAuth type declarations

## Import Patterns

### Components
```typescript
// Specific import (recommended)
import { Navbar } from '@/components/layout/Navbar'
import { InviteLink } from '@/components/circles/InviteLink'

// Or use index file (if you prefer)
import { Navbar, InviteLink } from '@/components'
```

### Libraries
```typescript
import { prisma } from '@/lib/db/prisma'
import { authOptions } from '@/lib/auth/auth'
import { calculateConsensus } from '@/lib/trips/trip-consensus'
```

### Types
```typescript
import { DateOption } from '@/types/trips'
import { AvailabilityStatus } from '@/types/enums'
// Or use index file
import { DateOption, AvailabilityStatus } from '@/types'
```

## Adding New Features

When adding a new feature:

1. **Components**: Add to `components/[feature-name]/`
2. **Utilities**: Add to `lib/[feature-name]/`
3. **Types**: Add to `types/[feature-name].ts`
4. **Tests**: Add to `lib/[feature-name]/__tests__/` or `components/[feature-name]/__tests__/`

## Benefits of This Structure

- ✅ **Scalable**: Easy to add new features without cluttering
- ✅ **Organized**: Related code is grouped together
- ✅ **Discoverable**: Easy to find components and utilities
- ✅ **Maintainable**: Clear separation of concerns
- ✅ **Testable**: Tests live next to the code they test

