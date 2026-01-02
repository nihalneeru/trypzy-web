# Trypzy Web - Setup Instructions

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret-key-here"
   ```
   
   Generate a secret key:
   ```bash
   openssl rand -base64 32
   ```

3. **Set up the database:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:migrate` - Create and run migrations

## Project Structure

```
trypzy-web/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   └── circles/           # Circle and trip pages
├── components/            # React components
├── lib/                   # Utility libraries
│   ├── auth.ts           # NextAuth configuration
│   ├── prisma.ts         # Prisma client
│   └── trip-consensus.ts # Consensus calculation logic
├── prisma/                # Database schema
│   └── schema.prisma
└── types/                 # TypeScript type definitions
```

## Next Steps

1. Create an account at `/auth/signup`
2. Create a circle at `/circles/new`
3. Invite friends using the invite link
4. Create a collaborative trip
5. Submit availability and vote on dates

