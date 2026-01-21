// Only import jest-dom for jsdom environment (not for Node API tests)
// This import adds DOM matchers like toBeInTheDocument()
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom')
}

// Set test environment variables FIRST
process.env.MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
process.env.DB_NAME = 'trypzy_test'  // Force test database
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key'
