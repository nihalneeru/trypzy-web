# Trypzy Web Setup Guide

## Prerequisites

- Node.js 18+ 
- MongoDB (local or remote connection)
- npm or yarn

## Environment Variables

Create a `.env.local` file in the root directory:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=trypzy
JWT_SECRET=your-secret-key-here
CORS_ORIGINS=http://localhost:3000

# OpenAI API (for itinerary generation)
OPENAI_API_KEY=your-openai-api-key-here
# OPENAI_API_URL=https://api.openai.com/v1/chat/completions  # optional, defaults shown
# OPENAI_MODEL=gpt-4o-mini                                    # optional
# ITINERARY_MAX_VERSIONS=3                                    # optional

# Feature flags
# NEXT_PUBLIC_NUDGES_ENABLED=false  # set to 'false' to disable nudge system messages in chat
```

## Installation

```bash
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Seeding Discover Posts

To populate the Discover feed with sample posts, run:

```bash
npm run seed
```

This will create:
- 2 seed users (Alex and Sam)
- 2 seed circles (Adventure Seekers and Weekend Warriors)
- 2 seed trips (optional)
- 6 seed discover posts

**Note:** The seed script is idempotent - it checks for existing seed data and won't create duplicates. If you want to reseed, you can:

1. Delete existing seed posts from the database (posts with captions starting with `[SEED]`)
2. Or reset your database and run the seed script again

### Seed Accounts

After seeding, you can use these accounts to test:

- **Email:** `alex.traveler@example.com`
- **Password:** `password123`

- **Email:** `sam.explorer@example.com`
- **Password:** `password123`

### Dev-Only API Endpoint

For development convenience, you can also trigger seeding via API:

```bash
POST /api/seed/discover
```

**Note:** This endpoint only works when `NODE_ENV !== 'production'`

## Building for Production

```bash
npm run build
npm start
```

## Scripts

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run seed         # Seed sample data
npm run test         # Run unit tests (vitest)
npm run test:e2e     # Run E2E tests (playwright)
npm run test:all     # Run all tests
```

## Troubleshooting

**MongoDB not running**
- Ensure `mongod` is running locally or your `MONGO_URL` points to a valid MongoDB instance
- Check connection with `mongosh` before starting the dev server

**Node version mismatch**
- Requires Node.js 18+. Check with `node --version`
- Use `nvm use 18` if using nvm

**Build fails with ESLint error**
- ESLint is referenced in the build but not in devDependencies — this warning can be ignored; the build still completes successfully

**JWT_SECRET error on startup**
- In production, `JWT_SECRET` must be set. For local development, a fallback is used but you should set it in `.env.local`

## Project Structure

- `/app` - Next.js app directory (pages, API routes, layouts)
- `/components` - React components
- `/lib` - Utility functions and shared code
- `/scripts` - Utility scripts (e.g., seeding)
- `/public` - Static assets
