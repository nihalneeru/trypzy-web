/**
 * Test script for 3-user collaborative trip scenario
 * Run with: npx tsx test-scenarios.ts
 */

const BASE_URL = 'http://localhost:3000/api'

interface User {
  id?: string
  email: string
  name: string
  password: string
  session?: string
}

async function createUser(email: string, name: string, password: string): Promise<User> {
  const response = await fetch(`${BASE_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Failed to create user: ${data.error}`)
  }
  return { email, name, password, id: data.user.id }
}

async function signIn(email: string, password: string): Promise<string> {
  // In a real scenario, we'd use NextAuth session cookies
  // For testing, we'll need to handle this differently
  // For now, let's just return a placeholder
  return 'session-token'
}

async function createCircle(user: User, name: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/circles`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      // Note: In real test, we'd need proper auth headers
    },
    body: JSON.stringify({ name }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(`Failed to create circle: ${data.error}`)
  }
  return data.circle.id
}

async function testScenario() {
  console.log('🧪 Starting 3-user collaborative trip test...\n')
  
  try {
    // Step 1: Create users
    console.log('1. Creating users...')
    const userA = await createUser('user-a@test.com', 'User A', 'password123')
    const userB = await createUser('user-b@test.com', 'User B', 'password123')
    const userC = await createUser('user-c@test.com', 'User C', 'password123')
    console.log('✅ Users created')
    
    // Note: This test script needs proper authentication setup
    // For now, let's check the API routes directly to see if they're structured correctly
    console.log('\n⚠️  Note: Full E2E testing requires proper session management')
    console.log('Testing API route structure instead...')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// testScenario()

