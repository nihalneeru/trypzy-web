/**
 * Lightweight token estimation for prompt size guards
 *
 * Uses rough approximation: 1 token ≈ 4 characters for English text
 * This is intentionally conservative to avoid hitting context limits.
 *
 * Note: Actual tokenization varies by model and content. This estimate
 * errs on the side of caution for safety.
 */

const CHARS_PER_TOKEN = 4

// Default max prompt tokens (leaves room for response in 16k context)
// Can be overridden via ITINERARY_MAX_PROMPT_TOKENS env var
const DEFAULT_MAX_PROMPT_TOKENS = 12000

/**
 * Get configured max prompt tokens
 * @returns {number}
 */
export function getMaxPromptTokens() {
  const envValue = process.env.ITINERARY_MAX_PROMPT_TOKENS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_MAX_PROMPT_TOKENS
}

/**
 * Estimate token count for a string
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total tokens for system + user prompt
 * @param {string} systemPrompt - System prompt text
 * @param {string} userPrompt - User prompt text
 * @returns {number} Combined estimated token count
 */
export function estimateTotalPromptTokens(systemPrompt, userPrompt) {
  return estimateTokens(systemPrompt) + estimateTokens(userPrompt)
}

/**
 * Check if prompt exceeds max tokens
 * @param {number} estimatedTokens - Estimated token count
 * @param {number} maxTokens - Maximum allowed (defaults to configured max)
 * @returns {{ exceeds: boolean, estimated: number, max: number, overage: number }}
 */
export function checkPromptSize(estimatedTokens, maxTokens = getMaxPromptTokens()) {
  const overage = estimatedTokens - maxTokens
  return {
    exceeds: overage > 0,
    estimated: estimatedTokens,
    max: maxTokens,
    overage: Math.max(0, overage)
  }
}

/**
 * Log a warning about prompt size
 * @param {string} context - Context (e.g., 'generateItinerary')
 * @param {number} estimated - Estimated tokens
 * @param {number} max - Max tokens
 */
export function logPromptSizeWarning(context, estimated, max) {
  console.warn(`[tokenEstimate] ${context}: Prompt exceeds limit (${estimated} estimated > ${max} max). Applying truncation.`)
}
