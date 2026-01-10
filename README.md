# Trypzy

**Plan Trips Together** - Private, trust-based trip planning for friend groups.

## Overview

Trypzy helps friend groups plan trips together through a progressive scheduling model that respects everyone's availability without requiring unanimous participation. The platform supports collaborative trip planning with availability collection, voting, and itinerary management.

## Key Features

- 🎯 **Progressive Scheduling**: Broad intent → Availability collection → Voting → Locked dates
- 👥 **Circle-Based Groups**: Private circles for organizing friend groups
- 📅 **Flexible Availability**: Support for broad, weekly, and per-day availability submissions
- 🗳️ **Consensus Building**: Voting on top promising date windows
- 📝 **Trip Management**: Collaborative trip planning with itineraries and memories
- 🌍 **Discover Feed**: Share and discover travel stories (global or circle-scoped)
- 🔒 **Privacy-First**: Trust-based design with circle-scoped content

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: MongoDB
- **Authentication**: JWT
- **Styling**: Tailwind CSS + shadcn/ui
- **Testing**: Vitest (unit) + Playwright (E2E)

## Quick Start

See [SETUP.md](./SETUP.md) for detailed setup instructions.

### Prerequisites

- Node.js 18+
- MongoDB (local or remote)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables (create .env.local)
MONGO_URL=mongodb://localhost:27017
DB_NAME=trypzy
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=http://localhost:3000

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the app.

### Seeding Sample Data

```bash
npm run seed
```

This creates sample users, circles, trips, and discover posts. See [SETUP.md](./SETUP.md) for seed account credentials.

## Project Structure

```
trypzy-web/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── globals.css        # Global styles
│   ├── layout.js          # Root layout
│   └── page.js            # Main SPA component
├── components/            # React components
│   └── ui/                # shadcn/ui components
├── docs/                  # Documentation
│   ├── api/               # API documentation
│   ├── features/          # Feature documentation
│   └── tests/             # Testing documentation
├── e2e/                   # End-to-end tests (Playwright)
├── lib/                   # Shared utilities
│   └── server/            # Server-side utilities
├── public/                # Static assets
│   ├── brand/             # Brand assets (logos, icons)
│   └── uploads/           # User-uploaded images
├── scripts/               # Utility scripts
│   └── seed-discover.js   # Seed script
└── tests/                 # Unit tests (Vitest)
```

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run seed         # Seed sample data
npm run test         # Run unit tests
npm run test:watch   # Run tests in watch mode
npm run test:e2e     # Run E2E tests
npm run test:all     # Run all tests
```

## Documentation

- **[SETUP.md](./SETUP.md)** - Setup and installation guide
- **[scheduling_mvp.md](./scheduling_mvp.md)** - Scheduling MVP specification
- **[docs/](./docs/)** - Additional documentation
  - `docs/api/` - API endpoint documentation
  - `docs/features/` - Feature specifications and guides
  - `docs/tests/` - Testing documentation and results

## Key Concepts

### Progressive Scheduling Model

Trips progress through explicit states:
1. **Proposed** - Initial state, broad date window established
2. **Scheduling** - Collecting availability from members
3. **Voting** - Voting on top promising date windows
4. **Locked** - Dates finalized, planning can begin

### Availability ≠ Commitment

- Marking availability is **not** a commitment
- Only **locking dates** represents commitment
- The system can progress without unanimous participation

### Circles

- Private groups for organizing friend trips
- Circle-scoped content and discover posts
- Circle owners have management privileges

## Development

### Code Organization

- **Frontend**: Single-page application in `app/page.js` (refactor only when necessary)
- **API**: Centralized in `app/api/[[...path]]/route.js` with dedicated routes for specific features
- **Server Utilities**: Shared helpers in `lib/server/`

### Testing

- Unit tests: `tests/` directory (Vitest)
- E2E tests: `e2e/` directory (Playwright)
- See `docs/tests/` for testing documentation

## Contributing

1. Follow the existing code patterns
2. Maintain backward compatibility for API endpoints
3. Add tests for new features
4. Update documentation as needed

## License

Private project
