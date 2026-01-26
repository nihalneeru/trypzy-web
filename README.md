# Trypzy

**Trips made easy** - Private, trust-based trip planning for friend groups.

## Overview

Trypzy helps friend groups plan trips together through a progressive scheduling model that respects everyone's availability without requiring unanimous participation. The primary trip experience is the **Command Center V2** — a chat-centric interface where coordination happens through conversation, system messages, and slide-in overlays for actions like scheduling, itinerary planning, and accommodation.

## Key Features

- **Progressive Scheduling**: Propose trip → Share date windows → Build support → Lock dates
- **Chat-First Coordination**: Trip Chat is the primary interactive surface; all decisions and nudges happen in context
- **Circle-Based Groups**: Private circles for organizing friend groups
- **Date Windows**: Travelers propose date ranges and signal support; leaders propose and lock when ready
- **Collaborative Planning**: Itinerary ideas, accommodation options, and prep tracking after dates are locked
- **Lightweight Nudges**: System messages in chat celebrate progress and clarify next steps without pressuring
- **Privacy-First**: Trust-based design where privacy never blocks collaboration

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
- **[date_locking_funnel.md](./date_locking_funnel.md)** - Date scheduling flow (current default)
- **[scheduling_mvp.md](./scheduling_mvp.md)** - Earlier scheduling model (historical reference)
- **[docs/](./docs/)** - Additional documentation
  - `docs/api/` - API endpoint documentation
  - `docs/features/` - Feature specifications and guides
  - `docs/NUDGE_ENGINE_SURFACING.md` - Nudge engine architecture notes

## Key Concepts

### Trip Flow

Trips progress through explicit stages:
1. **Proposed** — Trip created within a circle, broad intent established
2. **Scheduling** — Travelers share date windows and signal support
3. **Locked** — Leader locks dates; planning begins
4. **Itinerary** — Ideas collected, itinerary generated (LLM-assisted)
5. **Stay** — Accommodation selected
6. **Prep** — Transport, packing, documents organized
7. **Ongoing** — Trip dates are active
8. **Completed** — Trip has ended

### Availability ≠ Commitment

- Sharing date windows is **not** a commitment
- Only **locking dates** represents commitment
- The system can progress without unanimous participation

### How Trypzy Keeps Trips Moving

Trypzy uses lightweight system nudges in chat to celebrate milestones and clarify next steps. For example, when the first person shares their availability or when dates are locked, a short system message appears in the trip chat. Nudges are informational and non-blocking — they never pressure or shame.

### Circles

- Private groups for organizing friend trips
- Circle-scoped content and discover posts
- Circle owners have management privileges

## Beta Notes

- **No email or push notifications**: All updates happen within the app via chat polling
- **Discover feed**: May be empty for new users until posts are created
- **Dates are final**: Once locked, dates cannot be unlocked (MVP constraint)
- **Single leader**: Each trip has one leader who can transfer leadership

## Development

### Code Organization

- **Frontend**: Dashboard at `app/dashboard/page.js`; trip detail via Command Center V2 (`components/trip/command-center-v2/`)
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
