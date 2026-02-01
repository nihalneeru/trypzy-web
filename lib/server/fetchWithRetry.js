/**
 * Fetch wrapper with retry logic for LLM API calls
 *
 * Retries on:
 * - HTTP 429 (rate limit)
 * - HTTP >= 500 (server errors)
 * - Network errors (ECONNRESET, ETIMEDOUT)
 *
 * Does NOT retry on:
 * - HTTP 4xx (except 429) - client errors should fail fast
 */

const MAX_RETRIES = 2  // Total 3 attempts
const BASE_DELAY_MS = 500

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt) {
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt)
  // Add small jitter (0-100ms) to avoid thundering herd
  const jitter = Math.floor(Math.random() * 100)
  return exponentialDelay + jitter
}

/**
 * Check if error is a retryable network error
 * @param {Error} error - The caught error
 * @returns {boolean}
 */
function isRetryableNetworkError(error) {
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH']
  return retryableCodes.includes(error.code) ||
         error.message?.includes('network') ||
         error.message?.includes('ECONNRESET') ||
         error.message?.includes('ETIMEDOUT')
}

/**
 * Check if HTTP status is retryable
 * @param {number} status - HTTP status code
 * @returns {boolean}
 */
function isRetryableStatus(status) {
  return status === 429 || status >= 500
}

/**
 * Fetch with automatic retry on transient failures
 *
 * @param {string} url - URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {Object} config - Retry configuration
 * @param {number} config.maxRetries - Maximum retry attempts (default: 2)
 * @param {string} config.context - Context string for logging (e.g., 'generateItinerary')
 * @returns {Promise<Response>} Fetch response
 * @throws {Error} After all retries exhausted or on non-retryable error
 */
export async function fetchWithRetry(url, options, config = {}) {
  const maxRetries = config.maxRetries ?? MAX_RETRIES
  const context = config.context || 'LLM call'

  let lastError = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Check if status is retryable
      if (isRetryableStatus(response.status)) {
        if (attempt < maxRetries) {
          const delay = calculateDelay(attempt)
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`[fetchWithRetry] ${context}: HTTP ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
          }
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        // Last attempt - return the response and let caller handle the error
      }

      // Non-retryable status (including success) - return immediately
      return response

    } catch (error) {
      lastError = error

      // Check if it's a retryable network error
      if (isRetryableNetworkError(error) && attempt < maxRetries) {
        const delay = calculateDelay(attempt)
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[fetchWithRetry] ${context}: Network error (${error.code || error.message}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
        }
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // Non-retryable error or exhausted retries - throw
      throw error
    }
  }

  // Should not reach here, but safety throw
  throw lastError || new Error(`[fetchWithRetry] ${context}: All ${maxRetries + 1} attempts failed`)
}
