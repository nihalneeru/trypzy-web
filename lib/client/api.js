// API Helper
export const api = async (endpoint, options = {}, token = null) => {
  const headers = {}
  
  // Set Content-Type if body exists and is not FormData
  if (options.body) {
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }
  } else if (options.method && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
    // For POST/PUT/PATCH without body, still set Content-Type
    headers['Content-Type'] = 'application/json'
  }
  
  // Always set Authorization if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }
  
  return data
}
