import '@testing-library/jest-dom'

// Mock environment variables
process.env.MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017'
process.env.DB_NAME = process.env.DB_NAME || 'trypzy_test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key'

