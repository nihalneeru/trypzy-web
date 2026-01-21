import { NextRequest } from 'next/server'

// Mock fs/promises - Node module with named exports only, no default
vi.mock('fs/promises', () => {
  const writeFile = vi.fn(() => Promise.resolve())
  const mkdir = vi.fn(() => Promise.resolve())
  const access = vi.fn(() => Promise.resolve())
  
  return {
    writeFile,
    mkdir,
    access,
    // Include other common fs/promises exports to avoid missing export errors
    readFile: vi.fn(() => Promise.resolve('')),
    unlink: vi.fn(() => Promise.resolve()),
    stat: vi.fn(() => Promise.resolve({})),
  }
})

vi.mock('path', () => ({
  join: (...args) => args.join('/'),
  default: {}
}))

vi.mock('@/lib/server/db.js', () => ({
  connectToMongo: vi.fn(() => Promise.resolve({
    collection: vi.fn((name) => ({
      find: vi.fn(() => ({
        sort: vi.fn(() => ({
          skip: vi.fn(() => ({
            limit: vi.fn(() => ({
              toArray: vi.fn(() => Promise.resolve([]))
            }))
          }))
        })),
        toArray: vi.fn(() => Promise.resolve([]))
      })),
      findOne: vi.fn(() => Promise.resolve(null)),
      countDocuments: vi.fn(() => Promise.resolve(0)),
      insertOne: vi.fn(() => Promise.resolve({ insertedId: 'test-id' }))
    }))
  }))
}))

vi.mock('@/lib/server/auth.js', () => ({
  requireAuth: vi.fn((req) => Promise.resolve({ user: { id: 'user-1', name: 'Test User' } })),
  getUserFromToken: vi.fn((req) => Promise.resolve({ id: 'user-1', name: 'Test User' }))
}))

vi.mock('@/lib/server/cors.js', () => ({
  handleCORS: vi.fn((res) => res),
  OPTIONS: vi.fn(() => Promise.resolve(new Response()))
}))

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-123',
  default: { v4: () => 'test-uuid-123' }
}))

// Import after mocks
let GET, POST

beforeAll(async () => {
  const module = await import('@/app/api/discover/posts/route.js')
  GET = module.GET
  POST = module.POST
})

describe('GET /api/discover/posts', () => {
  it('should return global posts when scope=global', async () => {
    const url = new URL('http://localhost:3000/api/discover/posts?scope=global')
    const request = new NextRequest(url)
    
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data).toHaveProperty('posts')
    expect(data).toHaveProperty('pagination')
  })
  
  it('should require authentication for circle scope', async () => {
    const { getUserFromToken } = await import('@/lib/server/auth.js')
    getUserFromToken.mockResolvedValueOnce(null)

    const url = new URL('http://localhost:3000/api/discover/posts?scope=circle&circleId=circle-1')
    const request = new NextRequest(url)

    const response = await GET(request)
    const data = await response.json()

    // API returns 403 Forbidden when user is not authenticated for circle scope
    expect(response.status).toBe(403)
    expect(data.error).toBeDefined()
  })
})

describe('POST /api/discover/posts', () => {
  it('should create a global post', async () => {
    const formData = new FormData()
    formData.append('scope', 'global')
    formData.append('caption', 'Test caption')
    
    // Create a mock file
    const blob = new Blob(['test'], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })
    formData.append('images', file)
    
    const request = new NextRequest('http://localhost:3000/api/discover/posts', {
      method: 'POST',
      body: formData,
    })
    
    // Mock headers for auth
    request.headers.set('Authorization', 'Bearer test-token')
    
    const response = await POST(request)
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.discoverScope).toBe('global')
    expect(data.circleId).toBeNull()
  })
  
  it('should require circleId for circle scope', async () => {
    const formData = new FormData()
    formData.append('scope', 'circle')
    formData.append('caption', 'Test caption')
    
    const blob = new Blob(['test'], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })
    formData.append('images', file)
    
    const request = new NextRequest('http://localhost:3000/api/discover/posts', {
      method: 'POST',
      body: formData,
    })
    request.headers.set('Authorization', 'Bearer test-token')
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.error).toContain('circleId is required')
  })
  
  it('should validate file count (1-5)', async () => {
    const formData = new FormData()
    formData.append('scope', 'global')
    
    // No images
    const request = new NextRequest('http://localhost:3000/api/discover/posts', {
      method: 'POST',
      body: formData,
    })
    request.headers.set('Authorization', 'Bearer test-token')
    
    const response = await POST(request)
    const data = await response.json()
    
    expect(response.status).toBe(400)
    expect(data.error).toContain('1-5 images')
  })
})
