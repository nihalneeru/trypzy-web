// LLM integration for itinerary generation, revision, and trip intelligence
// Uses OpenAI API (or compatible endpoint)

import { fetchWithRetry } from './fetchWithRetry.js'
import {
  estimateTokens,
  estimateTotalPromptTokens,
  checkPromptSize,
  getMaxPromptTokens,
  logPromptSizeWarning
} from './tokenEstimate.js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

// Export MODEL for llmMeta observability
export { MODEL as LLM_MODEL }

/**
 * Detect the primary blocker for a trip using LLM analysis
 * Phase 6 - LLM #1: Blocker Detection with confidence scoring
 *
 * @param {Object} params - Detection parameters
 * @param {Object} params.trip - Trip object with status, dates, itinerary info
 * @param {Array} params.messages - Recent chat messages (last 20-50)
 * @param {Object} params.participation - Participation data (responded, voted counts)
 * @param {Object} params.heuristicBlocker - Fallback blocker from rule-based detection
 * @returns {Promise<Object>} Blocker detection result with confidence
 */
export async function detectBlocker({ trip, messages = [], participation = {}, heuristicBlocker }) {
  if (!OPENAI_API_KEY) {
    // Fallback to heuristic if no API key
    return {
      type: heuristicBlocker?.type || 'DATES',
      confidence: 0,
      reasoning: 'LLM unavailable - using heuristic',
      recommendedAction: heuristicBlocker?.cta || 'Continue planning',
      usedLLM: false
    }
  }

  // Build trip context
  const tripContext = {
    status: trip?.status || 'proposed',
    datesLocked: trip?.status === 'locked' || !!(trip?.lockedStartDate && trip?.lockedEndDate),
    lockedDates: trip?.lockedStartDate ? `${trip.lockedStartDate} to ${trip.lockedEndDate}` : null,
    itineraryStatus: trip?.itineraryStatus || 'not_started',
    accommodationChosen: trip?.progress?.steps?.accommodationChosen || false,
    totalMembers: participation.totalMembers || trip?.activeTravelerCount || 1,
    respondedCount: participation.respondedCount || trip?.respondedCount || 0,
    votedCount: participation.votedCount || trip?.votedCount || 0,
    isVoting: trip?.status === 'voting'
  }

  // Format recent messages for context (last 20, anonymized)
  const recentMessages = messages.slice(-20).map(m => ({
    isSystem: m.isSystem,
    content: m.content?.substring(0, 200) || '', // Truncate long messages
    subtype: m.subtype || null
  }))

  const messagesText = recentMessages.length > 0
    ? recentMessages.map((m, i) => `${i + 1}. [${m.isSystem ? 'SYSTEM' : 'USER'}${m.subtype ? `:${m.subtype}` : ''}] ${m.content}`).join('\n')
    : 'No recent messages'

  const prompt = `Analyze this trip's current state and determine the PRIMARY blocker preventing progress.

TRIP STATE:
- Status: ${tripContext.status}
- Dates locked: ${tripContext.datesLocked ? 'YES' : 'NO'}${tripContext.lockedDates ? ` (${tripContext.lockedDates})` : ''}
- Itinerary status: ${tripContext.itineraryStatus}
- Accommodation chosen: ${tripContext.accommodationChosen ? 'YES' : 'NO'}
- Members: ${tripContext.totalMembers} total
- Date responses: ${tripContext.respondedCount}/${tripContext.totalMembers}
${tripContext.isVoting ? `- Voting: ${tripContext.votedCount}/${tripContext.totalMembers} voted` : ''}

RECENT CHAT ACTIVITY:
${messagesText}

BLOCKER TYPES (in typical progression order):
1. DATES - Trip dates not yet locked (need availability, voting, or decision)
2. ITINERARY - Dates locked but itinerary not finalized (need ideas, generation, or selection)
3. ACCOMMODATION - Itinerary ready but accommodation not decided
4. READY - All major decisions made, trip is ready to execute

RULES:
- DATES blocker applies if dates are not locked, regardless of chat discussion
- ITINERARY blocker applies only AFTER dates are locked
- ACCOMMODATION blocker applies only AFTER itinerary is finalized
- READY means all three above are complete

Analyze the trip state and chat context to determine:
1. The PRIMARY blocker (most urgent thing blocking progress)
2. Your confidence level (0.0-1.0) based on clarity of the situation
3. Brief reasoning
4. Recommended next action for the group

Output ONLY valid JSON:
{
  "type": "DATES" | "ITINERARY" | "ACCOMMODATION" | "READY",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "recommendedAction": "specific next step for the group"
}`

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a trip planning assistant that analyzes group trip progress. Determine what is blocking the trip from moving forward. Be decisive and practical. Always output valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2, // Low temperature for consistent classification
        response_format: { type: 'json_object' }
      })
    }, { context: 'detectBlocker' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('OpenAI API error in detectBlocker:', error)
      // Fallback to heuristic
      return {
        type: heuristicBlocker?.type || 'DATES',
        confidence: 0,
        reasoning: 'LLM error - using heuristic fallback',
        recommendedAction: heuristicBlocker?.cta || 'Continue planning',
        usedLLM: false
      }
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      return {
        type: heuristicBlocker?.type || 'DATES',
        confidence: 0,
        reasoning: 'Empty LLM response - using heuristic',
        recommendedAction: heuristicBlocker?.cta || 'Continue planning',
        usedLLM: false
      }
    }

    let result
    try {
      result = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0])
      } else {
        return {
          type: heuristicBlocker?.type || 'DATES',
          confidence: 0,
          reasoning: 'Could not parse LLM response - using heuristic',
          recommendedAction: heuristicBlocker?.cta || 'Continue planning',
          usedLLM: false
        }
      }
    }

    // Validate blocker type
    const validTypes = ['DATES', 'ITINERARY', 'ACCOMMODATION', 'READY']
    if (!validTypes.includes(result.type)) {
      result.type = heuristicBlocker?.type || 'DATES'
    }

    // Ensure confidence is in valid range
    result.confidence = Math.max(0, Math.min(1, parseFloat(result.confidence) || 0.5))
    result.usedLLM = true

    return result
  } catch (error) {
    console.error('Error in detectBlocker:', error)
    return {
      type: heuristicBlocker?.type || 'DATES',
      confidence: 0,
      reasoning: `LLM error: ${error.message} - using heuristic`,
      recommendedAction: heuristicBlocker?.cta || 'Continue planning',
      usedLLM: false
    }
  }
}

/**
 * Generate consensus summary from chat messages
 * Phase 6 - LLM #2: Consensus Summarization
 *
 * @param {Object} params - Summarization parameters
 * @param {Array} params.messages - Chat messages to analyze
 * @param {string} params.currentBlocker - Current blocker type for context
 * @param {Object} params.tripContext - Trip context (dates, status, etc.)
 * @returns {Promise<Object>} Consensus summary
 */
export async function summarizeConsensus({ messages = [], currentBlocker, tripContext = {} }) {
  if (!OPENAI_API_KEY || messages.length < 3) {
    return null // Not enough context for meaningful summary
  }

  // Filter to user messages only (not system), last 30
  const userMessages = messages
    .filter(m => !m.isSystem)
    .slice(-30)
    .map(m => m.content?.substring(0, 300) || '')
    .filter(c => c.length > 0)

  if (userMessages.length < 3) {
    return null
  }

  const prompt = `Analyze these group chat messages about trip planning and summarize the consensus.

CURRENT FOCUS: ${currentBlocker || 'General planning'}
TRIP STATUS: ${tripContext.status || 'planning'}
${tripContext.lockedDates ? `DATES: ${tripContext.lockedDates}` : 'DATES: Not yet decided'}

RECENT MESSAGES:
${userMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Identify:
1. What the group AGREES on (clear consensus points)
2. What is still UNRESOLVED (disagreements or undecided items)
3. Any ACTION ITEMS mentioned

Be concise. Only include points with clear evidence from messages.

Output ONLY valid JSON:
{
  "agreements": ["point 1", "point 2"],
  "unresolved": ["issue 1", "issue 2"],
  "actionItems": ["action 1"],
  "summary": "One sentence overall summary"
}`

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes group discussions. Be concise and factual. Only report what is clearly evident from the messages.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    }, { context: 'summarizeConsensus' })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) return null

    const result = JSON.parse(content)

    // Only return if there's meaningful content
    if ((!result.agreements || result.agreements.length === 0) &&
        (!result.unresolved || result.unresolved.length === 0)) {
      return null
    }

    return result
  } catch (error) {
    console.error('Error in summarizeConsensus:', error)
    return null
  }
}

/**
 * Generate a decision nudge based on trip state
 * Phase 6 - LLM #3: Decision Nudging
 *
 * @param {Object} params - Nudge parameters
 * @param {Object} params.trip - Trip object
 * @param {Object} params.participation - Participation data
 * @param {string} params.currentBlocker - Current blocker type
 * @returns {Promise<Object|null>} Nudge message or null
 */
export async function generateNudge({ trip, participation = {}, currentBlocker }) {
  // Generate factual nudges without LLM first (simple rules)
  const nudges = []

  const totalMembers = participation.totalMembers || trip?.activeTravelerCount || 0
  const respondedCount = participation.respondedCount || trip?.respondedCount || 0
  const votedCount = participation.votedCount || trip?.votedCount || 0

  if (currentBlocker === 'DATES') {
    if (trip?.status === 'voting') {
      const remaining = totalMembers - votedCount
      if (remaining === 1) {
        nudges.push({ type: 'waiting', message: 'Waiting on 1 more person to vote' })
      } else if (remaining > 1 && remaining <= 3) {
        nudges.push({ type: 'waiting', message: `Waiting on ${remaining} more people to vote` })
      }
      if (votedCount > 0 && votedCount === totalMembers) {
        nudges.push({ type: 'ready', message: 'Everyone has voted! Ready to lock dates.' })
      }
    } else {
      const remaining = totalMembers - respondedCount
      if (remaining === 1) {
        nudges.push({ type: 'waiting', message: 'Waiting on 1 more person to share availability' })
      } else if (remaining > 1 && remaining <= 3) {
        nudges.push({ type: 'waiting', message: `Waiting on ${remaining} more people to share availability` })
      }
      if (respondedCount === totalMembers && totalMembers > 1) {
        nudges.push({ type: 'ready', message: 'Everyone has responded! Ready to find common dates.' })
      }
    }
  }

  if (currentBlocker === 'ITINERARY') {
    const itineraryStatus = trip?.itineraryStatus || 'not_started'
    if (itineraryStatus === 'draft') {
      nudges.push({ type: 'action', message: 'Draft itinerary is ready for review' })
    } else if (itineraryStatus === 'not_started') {
      nudges.push({ type: 'action', message: 'Dates are locked! Time to plan activities.' })
    }
  }

  if (currentBlocker === 'ACCOMMODATION') {
    nudges.push({ type: 'action', message: 'Itinerary is set! Now decide where to stay.' })
  }

  if (currentBlocker === 'READY') {
    nudges.push({ type: 'complete', message: 'All major decisions are made. Trip is ready!' })
  }

  // Return the most relevant nudge
  return nudges.length > 0 ? nudges[0] : null
}

/**
 * Extract accommodation preferences from chat messages
 * Phase 6 - LLM #4: Accommodation Preference Extraction
 *
 * @param {Object} params - Extraction parameters
 * @param {Array} params.messages - Chat messages to analyze
 * @param {number} params.groupSize - Number of travelers
 * @returns {Promise<Object|null>} Extracted preferences or null
 */
export async function extractAccommodationPreferences({ messages = [], groupSize = 1 }) {
  if (!OPENAI_API_KEY || messages.length < 2) {
    return null
  }

  // Filter to relevant messages (user messages mentioning accommodation-related terms)
  const relevantMessages = messages
    .filter(m => !m.isSystem)
    .filter(m => {
      const content = (m.content || '').toLowerCase()
      return content.includes('hotel') || content.includes('stay') ||
             content.includes('airbnb') || content.includes('hostel') ||
             content.includes('budget') || content.includes('room') ||
             content.includes('apartment') || content.includes('accommodation') ||
             content.includes('sleep') || content.includes('night') ||
             content.includes('cheap') || content.includes('expensive') ||
             content.includes('luxury') || content.includes('location') ||
             content.includes('together') || content.includes('separate')
    })
    .slice(-20)
    .map(m => m.content?.substring(0, 300) || '')

  if (relevantMessages.length < 1) {
    return null
  }

  const prompt = `Analyze these chat messages about trip accommodation and extract preferences.

GROUP SIZE: ${groupSize} people

MESSAGES:
${relevantMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Extract any mentioned preferences for:
1. Budget range (low/mid/high or specific amounts)
2. Location preference (central, near attractions, quiet area, etc.)
3. Stay arrangement (together in one place vs separate rooms/places)
4. Comfort vs cost priority
5. Specific requirements (wifi, kitchen, parking, etc.)

Only extract preferences that are CLEARLY stated or implied. Do not invent preferences.

Output ONLY valid JSON:
{
  "budgetRange": "low|mid|high" or null,
  "budgetNotes": "any specific budget mentions",
  "locationPreference": "description or null",
  "stayArrangement": "together|separate|flexible" or null,
  "comfortVsCost": "comfort|cost|balanced" or null,
  "requirements": ["requirement1", "requirement2"],
  "rawPreferences": ["direct quote or paraphrase of preferences mentioned"]
}`

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that extracts accommodation preferences from chat messages. Be conservative - only extract what is clearly stated or strongly implied. Do not make assumptions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    }, { context: 'extractAccommodationPreferences' })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) return null

    const result = JSON.parse(content)

    // Only return if there's meaningful content
    const hasContent = result.budgetRange || result.locationPreference ||
                       result.stayArrangement || result.comfortVsCost ||
                       (result.requirements && result.requirements.length > 0) ||
                       (result.rawPreferences && result.rawPreferences.length > 0)

    return hasContent ? result : null
  } catch (error) {
    console.error('Error in extractAccommodationPreferences:', error)
    return null
  }
}

/**
 * Summarize planning chat messages into a structured planning brief
 * Feature-flagged: only called when ITINERARY_INCLUDE_CHAT_BRIEF_ON_GENERATE=1
 *
 * @param {Object} trip - Trip object with id, name, destinationHint
 * @param {Array} chatMessages - Pre-filtered chat messages (formatted with date prefix)
 * @returns {Promise<Object>} Structured planning brief matching schema
 */
export async function summarizePlanningChat(trip, chatMessages) {
  // Use optional override model or default to main model
  const chatBriefModel = process.env.ITINERARY_CHAT_BRIEF_MODEL || MODEL

  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  if (!chatMessages || chatMessages.length === 0) {
    // Return empty brief if no messages
    return {
      mustDos: [],
      avoid: [],
      preferences: {
        pace: 'unknown',
        budget: 'unknown',
        focus: [],
        logistics: []
      },
      constraints: [],
      openQuestions: [],
      confidence: {
        pace: 'low',
        budget: 'low'
      }
    }
  }

  const tripContext = [
    trip.name ? `Trip name: ${trip.name}` : null,
    trip.destinationHint ? `Destination hint: ${trip.destinationHint}` : null
  ].filter(Boolean).join('\n')

  const messagesText = chatMessages.map((msg, idx) => `${idx + 1}. ${msg}`).join('\n')

  const systemPrompt = `You are a trip planning assistant that extracts structured preferences from group chat messages. Be conservative - only extract information that is CLEARLY stated or strongly implied. Do not invent consensus where none exists.`

  const userPrompt = `Analyze the following planning chat messages for a group trip and extract a structured planning brief.

${tripContext ? `TRIP CONTEXT:\n${tripContext}\n\n` : ''}CHAT MESSAGES (most recent last):
${messagesText}

RULES:
1. Use ONLY information present in the chat messages.
2. Prefer recent messages when conflicts exist.
3. If preferences are unclear, contradictory, or only mentioned by one person without agreement, mark values as "unknown" and list the ambiguity in openQuestions.
4. Do NOT invent consensus. If only one person says something without others agreeing, it's not group consensus.
5. Be conservative: when in doubt, use "unknown" or leave arrays empty.

OUTPUT SCHEMA (strict JSON):
{
  "mustDos": ["activity or experience the group explicitly wants to include"],
  "avoid": ["things the group explicitly wants to avoid"],
  "preferences": {
    "pace": "slow" | "balanced" | "fast" | "unknown",
    "budget": "lower" | "mid" | "high" | "unknown",
    "focus": ["themes like 'food', 'culture', 'adventure', 'relaxation'"],
    "logistics": ["preferences like 'central location', 'avoid early mornings', 'need wifi'"]
  },
  "constraints": ["hard constraints like 'must be back by 6pm on day 2', 'vegetarian options needed'"],
  "openQuestions": ["unresolved questions or disagreements from the chat"],
  "confidence": {
    "pace": "low" | "medium" | "high",
    "budget": "low" | "medium" | "high"
  }
}

Output ONLY the JSON object, nothing else.`

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: chatBriefModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2, // Low temperature for consistent extraction
        response_format: { type: 'json_object' }
      })
    }, { context: 'summarizePlanningChat' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    let brief
    try {
      brief = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        brief = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Ensure all required fields exist with defaults
    brief.mustDos = brief.mustDos || []
    brief.avoid = brief.avoid || []
    brief.preferences = brief.preferences || {}
    brief.preferences.pace = brief.preferences.pace || 'unknown'
    brief.preferences.budget = brief.preferences.budget || 'unknown'
    brief.preferences.focus = brief.preferences.focus || []
    brief.preferences.logistics = brief.preferences.logistics || []
    brief.constraints = brief.constraints || []
    brief.openQuestions = brief.openQuestions || []
    brief.confidence = brief.confidence || {}
    brief.confidence.pace = brief.confidence.pace || 'low'
    brief.confidence.budget = brief.confidence.budget || 'low'

    return brief
  } catch (error) {
    console.error('Error in summarizePlanningChat:', error)
    throw error
  }
}

/**
 * Generate initial itinerary from ideas and trip details
 * @param {Object} params - Generation parameters
 * @param {string} params.destination - Trip destination (optional)
 * @param {string} params.startDate - Locked start date (YYYY-MM-DD)
 * @param {string} params.endDate - Locked end date (YYYY-MM-DD)
 * @param {Array<string>} params.dateList - Canonical list of dates (YYYY-MM-DD) - must match startDate to endDate inclusive
 * @param {number} params.groupSize - Number of people (optional)
 * @param {Array} params.ideas - Top ideas sorted by priority
 * @param {Array} params.constraints - Global constraints
 * @param {Object} params.chatBrief - Optional structured planning brief from chat (feature-flagged)
 * @returns {Promise<Object>} Itinerary JSON matching schema
 */
export async function generateItinerary({ destination, startDate, endDate, dateList, groupSize, ideas, constraints = [], chatBrief = null }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  if (!dateList || !Array.isArray(dateList) || dateList.length === 0) {
    throw new Error('dateList is required and must be a non-empty array')
  }

  // Calculate number of days from dateList (authoritative)
  const numberOfDays = dateList.length

  // Build explicit date list text for prompt (fixed, not truncatable)
  const dateListText = dateList.map((date, idx) => `  Day ${idx + 1}: ${date}`).join('\n')

  const constraintsText = constraints.length > 0 ? `\nConstraints: ${constraints.join(', ')}` : ''

  const systemPrompt = 'You are a helpful travel itinerary assistant. Always output valid JSON matching the requested schema. Never include markdown formatting or explanatory text, only the JSON object.'

  // Helper to build chat brief section (if provided and non-empty)
  const buildChatBriefSection = (brief) => {
    if (!brief) return ''

    const sections = []

    // Must-dos
    if (brief.mustDos && brief.mustDos.length > 0) {
      sections.push(`Must-dos: ${brief.mustDos.join('; ')}`)
    }

    // Avoid
    if (brief.avoid && brief.avoid.length > 0) {
      sections.push(`Avoid: ${brief.avoid.join('; ')}`)
    }

    // Preferences
    const prefs = brief.preferences || {}
    const prefParts = []
    if (prefs.pace && prefs.pace !== 'unknown') {
      prefParts.push(`pace: ${prefs.pace}`)
    }
    if (prefs.budget && prefs.budget !== 'unknown') {
      prefParts.push(`budget: ${prefs.budget}`)
    }
    if (prefs.focus && prefs.focus.length > 0) {
      prefParts.push(`focus: ${prefs.focus.join(', ')}`)
    }
    if (prefs.logistics && prefs.logistics.length > 0) {
      prefParts.push(`logistics: ${prefs.logistics.join(', ')}`)
    }
    if (prefParts.length > 0) {
      sections.push(`Preferences: ${prefParts.join('; ')}`)
    }

    // Constraints
    if (brief.constraints && brief.constraints.length > 0) {
      sections.push(`Constraints: ${brief.constraints.join('; ')}`)
    }

    // Open questions (informational, may help LLM understand ambiguity)
    if (brief.openQuestions && brief.openQuestions.length > 0) {
      sections.push(`Unresolved: ${brief.openQuestions.join('; ')}`)
    }

    if (sections.length === 0) return ''

    return `

PLANNING CHAT BRIEF (derived from group chat; may be incomplete):
${sections.join('\n')}`
  }

  // Helper to build prompt with given ideas
  const buildPrompt = (ideasToInclude, chatBriefSection = '') => {
    const ideasText = ideasToInclude.length > 0
      ? ideasToInclude.map((idea, idx) => `${idx + 1}. ${idea.title}${idea.details ? ` - ${idea.details}` : ''}${idea.category ? ` [${idea.category}]` : ''}${idea.location ? ` @ ${idea.location}` : ''}${idea.constraints && idea.constraints.length > 0 ? ` (constraints: ${idea.constraints.join(', ')})` : ''}`).join('\n')
      : 'No specific ideas provided'

    return `You are a travel itinerary generator. Create a detailed, realistic itinerary for a ${numberOfDays}-day trip${destination ? ` to ${destination}` : ''}${groupSize ? ` for ${groupSize} people` : ''}.

Trip date range: ${startDate} to ${endDate} (inclusive)
Exact dates you MUST include (one day object per date, in this exact order):
${dateListText}

Suggested activities and ideas:
${ideasText}${constraintsText}${chatBriefSection}

CRITICAL REQUIREMENTS:
1. You MUST output exactly ${numberOfDays} day objects, one for each date listed above
2. Each day object's "date" field MUST exactly match the corresponding date from the list above (same order)
3. Do NOT invent dates outside this range
4. Do NOT skip any dates in this range
5. Create a day-by-day itinerary with time blocks
6. Include realistic time ranges for activities (e.g., "09:00-11:00")
7. Add transit notes between activities when needed
8. Estimate costs where appropriate
9. Balance the pace (avoid overpacking days)
10. Respect any constraints mentioned
11. Group related activities by location when possible

Output ONLY valid JSON matching this exact schema (no markdown, no extra text):
{
  "overview": {
    "pace": "chill|balanced|packed",
    "budget": "low|mid|high",
    "notes": "string"
  },
  "days": [
    {
      "date": "YYYY-MM-DD",
      "title": "string",
      "blocks": [
        {
          "timeRange": "09:00-11:00",
          "title": "string",
          "description": "string",
          "location": "string",
          "tags": ["food","sights"],
          "estCost": "string",
          "transitNotes": "string",
          "sourceIdeaIds": ["id1", "id2"]
        }
      ]
    }
  ]
}

Important: Output ONLY the JSON object, nothing else.`
  }

  // Build chat brief section if provided (feature-flagged in route.js)
  const chatBriefSection = buildChatBriefSection(chatBrief)
  const chatBriefCharCount = chatBriefSection.length

  // Token estimation guard with truncation strategy
  // Truncation order: 10 ideas -> 5 ideas -> 3 ideas -> error
  const maxTokens = getMaxPromptTokens()
  let ideasToUse = [...ideas]
  let prompt = buildPrompt(ideasToUse, chatBriefSection)
  let promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)

  // Truncation levels: [10, 5, 3]
  const truncationLevels = [10, 5, 3]
  for (const limit of truncationLevels) {
    if (promptTokenEstimate <= maxTokens) break

    if (ideasToUse.length > limit) {
      logPromptSizeWarning('generateItinerary', promptTokenEstimate, maxTokens)
      ideasToUse = ideas.slice(0, limit)
      prompt = buildPrompt(ideasToUse, chatBriefSection)
      promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[generateItinerary] Truncated ideas to ${limit}, new estimate: ${promptTokenEstimate}`)
      }
    }
  }

  // Final check after all truncation attempts
  if (promptTokenEstimate > maxTokens) {
    throw new Error('Trip has too many details for AI generation. Please reduce the number of ideas and try again.')
  }

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    }, { context: 'generateItinerary' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    // Parse JSON (should be clean since we requested json_object format)
    let itinerary
    try {
      itinerary = JSON.parse(content)
    } catch (parseError) {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        itinerary = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Validate structure
    if (!itinerary.days || !Array.isArray(itinerary.days)) {
      throw new Error('Invalid itinerary structure: missing days array')
    }

    // Ensure overview exists
    if (!itinerary.overview) {
      itinerary.overview = { pace: 'balanced', budget: 'mid', notes: '' }
    }

    // Validate and normalize dates to match dateList exactly
    const { normalizeItineraryDates, validateItineraryDates } = await import('@/lib/itinerary/normalizeItineraryDates.js')

    const validation = validateItineraryDates(itinerary, dateList)
    if (!validation.valid) {
      // Normalize dates deterministically
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Normalized itinerary dates to match trip locked range:', validation.errors)
      }
      itinerary = normalizeItineraryDates(itinerary, dateList)

      // Re-validate after normalization
      const revalidation = validateItineraryDates(itinerary, dateList)
      if (!revalidation.valid) {
        throw new Error(`Failed to normalize itinerary dates: ${revalidation.errors.join(', ')}`)
      }
    }

    // Return itinerary with meta for observability
    // Note: promptTokenEstimate, ideasUsedCount, and chatBrief info are returned for llmMeta
    return {
      ...itinerary,
      _meta: {
        promptTokenEstimate,
        ideasUsedCount: ideasToUse.length,
        chatBriefIncluded: !!chatBrief,
        chatBriefCharCount: chatBriefCharCount
      }
    }
  } catch (error) {
    console.error('Error generating itinerary:', error)
    throw error
  }
}

/**
 * Summarize feedback messages into structured change requests
 * @param {Array} feedbackMessages - Array of feedback message objects
 * @param {Array} reactions - Array of reaction objects from itinerary_reactions collection
 * @param {Array|Object} chatMessages - Either flat array of messages OR bucketed { relevant: [], other: [] }
 * @returns {Promise<Object>} Structured change requests with reaction preferences
 */
export async function summarizeFeedback(feedbackMessages, reactions = [], chatMessages = []) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  // =====================================================================
  // REACTION AGGREGATION with vote counting and tie detection
  // For exclusive categories (pace, budget): determine majority winner or tie
  // For non-exclusive categories (focus, logistics): list with counts
  // =====================================================================
  const reactionPreferences = {
    pace: null,
    budget: null,
    focus: [],
    logistics: [],
    sentiment: []
  }

  // Track ties for exclusive categories
  const ties = {}

  // Count votes per category per value
  const voteCounts = {}
  reactions.forEach(r => {
    const [category, value] = r.reactionKey.split(':')
    if (!voteCounts[category]) voteCounts[category] = {}
    voteCounts[category][value] = (voteCounts[category][value] || 0) + 1
  })

  // Process exclusive categories (pace, budget) - need majority or tie
  const exclusiveCategories = ['pace', 'budget']
  for (const category of exclusiveCategories) {
    const votes = voteCounts[category]
    if (!votes || Object.keys(votes).length === 0) continue

    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1])
    const [topValue, topCount] = sorted[0]
    const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0)

    // Check for tie: if second place has same count as first
    if (sorted.length > 1 && sorted[1][1] === topCount) {
      // TIE detected - don't set a winner, record the tie
      const tiedValues = sorted.filter(([_, count]) => count === topCount)
      ties[category] = {
        values: tiedValues.map(([val, count]) => ({ value: val, votes: count })),
        totalVotes
      }
      reactionPreferences[category] = null  // No winner on tie
    } else {
      // Clear winner
      reactionPreferences[category] = topValue
      reactionPreferences[`${category}Votes`] = { winner: topValue, votes: topCount, total: totalVotes }
    }
  }

  // Process non-exclusive categories (focus, logistics, sentiment) - aggregate with counts
  const nonExclusiveCategories = ['focus', 'logistics', 'sentiment']
  for (const category of nonExclusiveCategories) {
    const votes = voteCounts[category]
    if (!votes || Object.keys(votes).length === 0) continue

    // Build list with counts for prompt context
    reactionPreferences[category] = Object.entries(votes)
      .sort((a, b) => b[1] - a[1])  // Sort by count descending
      .map(([value, count]) => ({ value, votes: count }))
  }

  // If no feedback messages, no meaningful reactions, and no chat messages, return empty
  const hasExclusiveReaction = reactionPreferences.pace || reactionPreferences.budget || Object.keys(ties).length > 0
  const hasNonExclusiveReaction = reactionPreferences.focus.length > 0 || reactionPreferences.logistics.length > 0

  // Check for chat messages (handle both flat array and bucketed format)
  const hasChatMessages = Array.isArray(chatMessages)
    ? chatMessages.length > 0
    : (chatMessages?.relevant?.length > 0 || chatMessages?.other?.length > 0)

  if ((!feedbackMessages || feedbackMessages.length === 0) &&
      !hasChatMessages &&
      !hasExclusiveReaction && !hasNonExclusiveReaction) {
    return {
      keep: [],
      change: [],
      add: [],
      remove: [],
      constraints: [],
      reactionPreferences,
      ties
    }
  }

  const feedbackText = feedbackMessages && feedbackMessages.length > 0
    ? feedbackMessages.map((msg, idx) => {
        const target = msg.target ? ` [target: ${msg.target}]` : ''
        return `${idx + 1}. [${msg.type}] ${msg.message}${target}`
      }).join('\n')
    : 'No structured feedback provided'

  // Build chat messages section (these are informal discussions that may contain feedback)
  // Supports both flat array (legacy) and bucketed format { relevant: [], other: [] }
  let chatText = ''
  const isBucketed = chatMessages && typeof chatMessages === 'object' && !Array.isArray(chatMessages) && chatMessages.relevant

  if (isBucketed) {
    // Bucketed format: two labeled sections
    const formatMessages = (msgs) => msgs.map(msg => {
      const content = msg.content?.substring(0, 300) || ''
      return `- ${content}`
    }).join('\n')

    const relevantSection = chatMessages.relevant && chatMessages.relevant.length > 0
      ? formatMessages(chatMessages.relevant)
      : ''

    const otherSection = chatMessages.other && chatMessages.other.length > 0
      ? formatMessages(chatMessages.other)
      : ''

    if (relevantSection || otherSection) {
      const parts = []
      if (relevantSection) {
        parts.push(`Relevant chat feedback:\n${relevantSection}`)
      }
      if (otherSection) {
        parts.push(`Other recent chat context:\n${otherSection}`)
      }
      chatText = parts.join('\n\n')
    }
  } else if (Array.isArray(chatMessages) && chatMessages.length > 0) {
    // Flat array format (legacy/backwards compatible)
    chatText = chatMessages.map((msg) => {
      const content = msg.content?.substring(0, 300) || ''
      return `- ${content}`
    }).join('\n')
  }

  // Build reaction signals section with vote counts and tie handling
  const reactionSignals = []

  // Exclusive categories: show winner or SPLIT
  if (reactionPreferences.pace) {
    const votes = reactionPreferences.paceVotes
    reactionSignals.push(`Pace: ${reactionPreferences.pace} (${votes.votes}/${votes.total} votes - HARD CONSTRAINT)`)
  } else if (ties.pace) {
    const tieInfo = ties.pace.values.map(v => `${v.value}: ${v.votes}`).join(', ')
    reactionSignals.push(`Pace: SPLIT (${tieInfo}) — Leader decision required, no constraint applied`)
  }

  if (reactionPreferences.budget) {
    const votes = reactionPreferences.budgetVotes
    reactionSignals.push(`Budget: ${reactionPreferences.budget} (${votes.votes}/${votes.total} votes - HARD CONSTRAINT)`)
  } else if (ties.budget) {
    const tieInfo = ties.budget.values.map(v => `${v.value}: ${v.votes}`).join(', ')
    reactionSignals.push(`Budget: SPLIT (${tieInfo}) — Leader decision required, no constraint applied`)
  }

  // Non-exclusive categories: list with counts
  if (reactionPreferences.focus.length > 0) {
    const focusText = reactionPreferences.focus.map(f => `${f.value} (${f.votes})`).join(', ')
    reactionSignals.push(`Focus areas: ${focusText} (HARD CONSTRAINT - prioritize these)`)
  }
  if (reactionPreferences.logistics.length > 0) {
    const logisticsText = reactionPreferences.logistics.map(l => `${l.value} (${l.votes})`).join(', ')
    reactionSignals.push(`Logistics preferences: ${logisticsText} (HARD CONSTRAINT - apply these)`)
  }

  const reactionSection = reactionSignals.length > 0
    ? `\nSTRUCTURED REACTION SIGNALS (HARD CONSTRAINTS - HIGHEST PRIORITY):\n${reactionSignals.join('\n')}\n`
    : ''

  // Build chat context section
  const chatSection = chatText
    ? `\nRECENT CHAT DISCUSSION (CONTEXT - may contain informal feedback):\n${chatText}\n`
    : ''

  const prompt = `Analyze the following feedback about a travel itinerary and summarize into structured change requests.

${reactionSection}
STRUCTURED FEEDBACK (SOFT GUIDANCE):
${feedbackText}
${chatSection}
IMPORTANT:
- Structured reaction signals are HARD CONSTRAINTS and must take priority over all other feedback.
- If a reaction shows "SPLIT", it means the group is divided and no constraint should be applied for that category.
- Structured feedback from the feedback form should be prioritized over chat discussion.
- Chat discussion provides context and may contain informal suggestions - extract relevant itinerary feedback from it.
- For example, if reactions say "pace:slow" but text says "add more activities", the pace constraint wins.

Output ONLY valid JSON matching this exact schema:
{
  "keep": ["description of things to keep unchanged"],
  "change": [{"target": "day2.block3", "request": "what to change", "reason": "why"}],
  "add": ["description of new things to add"],
  "remove": ["description of things to remove"],
  "constraints": ["any new constraints mentioned, including reaction constraints"]
}

Target format: "day{N}.block{N}" where N is the day/block index (1-based).
Output ONLY the JSON object, nothing else.`

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes feedback into structured change requests. Always output valid JSON matching the requested schema.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    }, { context: 'summarizeFeedback' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    let summary
    try {
      summary = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        summary = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Ensure all arrays exist
    summary.keep = summary.keep || []
    summary.change = summary.change || []
    summary.add = summary.add || []
    summary.remove = summary.remove || []
    summary.constraints = summary.constraints || []

    // Include reaction preferences and ties in the summary
    summary.reactionPreferences = reactionPreferences
    summary.ties = ties

    return summary
  } catch (error) {
    console.error('Error summarizing feedback:', error)
    throw error
  }
}

/**
 * Revise itinerary based on current version and feedback summary
 * @param {Object} params - Revision parameters
 * @param {Object} params.currentItinerary - Current itinerary JSON
 * @param {Object} params.feedbackSummary - Structured change requests
 * @param {Array} params.newIdeas - New ideas since last version
 * @param {Array} params.chatMessages - Chat messages for context (for truncation tracking)
 * @param {string} params.destination - Trip destination (optional)
 * @param {string} params.startDate - Start date
 * @param {string} params.endDate - End date
 * @param {Array<string>} params.dateList - Canonical list of dates (YYYY-MM-DD) - must match startDate to endDate inclusive
 * @returns {Promise<{itinerary: Object, changeLog: string, _meta: Object}>} Revised itinerary, change log, and meta
 */
export async function reviseItinerary({ currentItinerary, feedbackSummary, newIdeas = [], chatMessages = [], destination, startDate, endDate, dateList }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  if (!dateList || !Array.isArray(dateList) || dateList.length === 0) {
    throw new Error('dateList is required and must be a non-empty array')
  }

  const numberOfDays = dateList.length
  const dateListText = dateList.map((date, idx) => `  Day ${idx + 1}: ${date}`).join('\n')

  const currentItineraryJson = JSON.stringify(currentItinerary, null, 2)

  // Build reaction preferences section (HARD CONSTRAINTS)
  // Updated to handle new aggregated format with vote counts and ties
  const reactionPrefs = feedbackSummary.reactionPreferences || {}
  const ties = feedbackSummary.ties || {}
  const reactionSignals = []

  // Exclusive categories: show winner with votes or SPLIT for ties
  if (reactionPrefs.pace) {
    const votes = reactionPrefs.paceVotes
    const voteInfo = votes ? ` (${votes.votes}/${votes.total} votes)` : ''
    reactionSignals.push(`- Pace: ${reactionPrefs.pace}${voteInfo} (${reactionPrefs.pace === 'slow' ? 'reduce activities, add more breaks' : 'increase activities, reduce downtime'})`)
  } else if (ties.pace) {
    const tieInfo = ties.pace.values.map(v => `${v.value}: ${v.votes}`).join(', ')
    reactionSignals.push(`- Pace: SPLIT (${tieInfo}) — no constraint applied`)
  }

  if (reactionPrefs.budget) {
    const votes = reactionPrefs.budgetVotes
    const voteInfo = votes ? ` (${votes.votes}/${votes.total} votes)` : ''
    reactionSignals.push(`- Budget: ${reactionPrefs.budget}${voteInfo} (choose cheaper options, reduce costs)`)
  } else if (ties.budget) {
    const tieInfo = ties.budget.values.map(v => `${v.value}: ${v.votes}`).join(', ')
    reactionSignals.push(`- Budget: SPLIT (${tieInfo}) — no constraint applied`)
  }

  // Non-exclusive categories: may have vote counts in new format
  if (reactionPrefs.focus && reactionPrefs.focus.length > 0) {
    const focusText = Array.isArray(reactionPrefs.focus[0])
      ? reactionPrefs.focus.join(', ')  // Old format: string array
      : reactionPrefs.focus.map(f => typeof f === 'object' ? `${f.value} (${f.votes})` : f).join(', ')
    reactionSignals.push(`- Focus areas: ${focusText} (prioritize these themes in activities)`)
  }
  if (reactionPrefs.logistics && reactionPrefs.logistics.length > 0) {
    const logisticsText = Array.isArray(reactionPrefs.logistics[0])
      ? reactionPrefs.logistics.join(', ')
      : reactionPrefs.logistics.map(l => typeof l === 'object' ? `${l.value} (${l.votes})` : l).join(', ')
    reactionSignals.push(`- Logistics: ${logisticsText}`)
  }

  const reactionSection = reactionSignals.length > 0
    ? `\nSTRUCTURED REACTION SIGNALS (HARD CONSTRAINTS - HIGHEST PRIORITY):\n${reactionSignals.join('\n')}\n`
    : ''

  const systemPrompt = 'You are a helpful travel itinerary assistant. Revise itineraries based on feedback while keeping unchanged items stable. Output ONLY valid JSON for the itinerary, then provide a brief change log in a separate message if needed.'

  // Helper to build prompt with truncatable sections
  const buildPrompt = (feedbackSummaryToUse, newIdeasToUse) => {
    const feedbackText = `Keep: ${feedbackSummaryToUse.keep.length > 0 ? feedbackSummaryToUse.keep.join('; ') : 'nothing specified'}
Change: ${feedbackSummaryToUse.change.length > 0 ? feedbackSummaryToUse.change.map(c => `${c.target}: ${c.request} (${c.reason})`).join('; ') : 'nothing specified'}
Add: ${feedbackSummaryToUse.add.length > 0 ? feedbackSummaryToUse.add.join('; ') : 'nothing specified'}
Remove: ${feedbackSummaryToUse.remove.length > 0 ? feedbackSummaryToUse.remove.join('; ') : 'nothing specified'}
Constraints: ${feedbackSummaryToUse.constraints.length > 0 ? feedbackSummaryToUse.constraints.join('; ') : 'none'}`

    const newIdeasText = newIdeasToUse.length > 0
      ? `\n\nNew ideas since last version:\n${newIdeasToUse.map((idea, idx) => `${idx + 1}. ${idea.title}${idea.details ? ` - ${idea.details}` : ''}`).join('\n')}`
      : ''

    return `Revise the following travel itinerary based on structured reaction signals and feedback.

CRITICAL: Treat "Structured Reaction Signals" as HARD CONSTRAINTS that MUST be followed.
Treat "Feedback Summary" as SOFT GUIDANCE that provides context.

Trip date range: ${startDate} to ${endDate} (inclusive)
Exact dates you MUST include (one day object per date, in this exact order):
${dateListText}

Current itinerary:
\`\`\`json
${currentItineraryJson}
\`\`\`
${reactionSection}
Feedback Summary (SOFT GUIDANCE):
${feedbackText}${newIdeasText}

CRITICAL REQUIREMENTS:
1. You MUST output exactly ${numberOfDays} day objects, one for each date listed above
2. Each day object's "date" field MUST exactly match the corresponding date from the list above (same order)
3. Do NOT change the date range - preserve the exact same dates as the trip
4. Do NOT invent dates outside this range
5. Do NOT skip any dates in this range
6. Keep unchanged items exactly as they are unless explicitly requested to change
7. Apply all requested changes precisely
8. Add any new items requested
9. Remove items explicitly requested to be removed
10. Maintain realistic time ranges and transit notes
11. Preserve the overall structure and pace
12. Respect constraints

Output ONLY valid JSON matching the exact same schema as the current itinerary (no markdown, no extra text).
Also provide a brief 1-3 sentence change log describing what was updated.`
  }

  // Token estimation guard with truncation strategy for revision
  // Truncation order: reduce newIdeas (5 -> 3 -> 0), then cap feedback arrays
  const maxTokens = getMaxPromptTokens()
  let newIdeasToUse = [...newIdeas]
  let feedbackSummaryToUse = { ...feedbackSummary }
  let prompt = buildPrompt(feedbackSummaryToUse, newIdeasToUse)
  let promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)

  // Truncation level 1: reduce newIdeas from 5 -> 3
  if (promptTokenEstimate > maxTokens && newIdeasToUse.length > 3) {
    logPromptSizeWarning('reviseItinerary', promptTokenEstimate, maxTokens)
    newIdeasToUse = newIdeas.slice(0, 3)
    prompt = buildPrompt(feedbackSummaryToUse, newIdeasToUse)
    promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[reviseItinerary] Truncated newIdeas to 3, new estimate: ${promptTokenEstimate}`)
    }
  }

  // Truncation level 2: remove newIdeas entirely
  if (promptTokenEstimate > maxTokens && newIdeasToUse.length > 0) {
    logPromptSizeWarning('reviseItinerary', promptTokenEstimate, maxTokens)
    newIdeasToUse = []
    prompt = buildPrompt(feedbackSummaryToUse, newIdeasToUse)
    promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[reviseItinerary] Removed all newIdeas, new estimate: ${promptTokenEstimate}`)
    }
  }

  // Truncation level 3: cap feedback arrays (keep, add, remove to 10 items each)
  if (promptTokenEstimate > maxTokens) {
    logPromptSizeWarning('reviseItinerary', promptTokenEstimate, maxTokens)
    feedbackSummaryToUse = {
      ...feedbackSummary,
      keep: feedbackSummary.keep.slice(0, 10),
      add: feedbackSummary.add.slice(0, 10),
      remove: feedbackSummary.remove.slice(0, 10),
      change: feedbackSummary.change.slice(0, 10),
      constraints: feedbackSummary.constraints.slice(0, 5)
    }
    prompt = buildPrompt(feedbackSummaryToUse, newIdeasToUse)
    promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, prompt)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[reviseItinerary] Capped feedback arrays, new estimate: ${promptTokenEstimate}`)
    }
  }

  // Final check
  if (promptTokenEstimate > maxTokens) {
    throw new Error('Trip revision has too many details for AI processing. Please reduce feedback and try again.')
  }

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    }, { context: 'reviseItinerary' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    let revised
    try {
      revised = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        revised = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Extract change log if embedded in response (some models include it)
    let changeLog = ''
    if (revised.changeLog) {
      changeLog = revised.changeLog
      delete revised.changeLog
    } else {
      // Generate descriptive change log from feedback summary
      const changes = []
      if (feedbackSummary.change.length > 0) {
        const details = feedbackSummary.change.map(c => c.target ? `${c.target}: ${c.request}` : c.request).join('; ')
        changes.push(`Updated: ${details}`)
      }
      if (feedbackSummary.add.length > 0) {
        changes.push(`Added: ${feedbackSummary.add.join('; ')}`)
      }
      if (feedbackSummary.remove.length > 0) {
        changes.push(`Removed: ${feedbackSummary.remove.join('; ')}`)
      }
      changeLog = changes.length > 0 ? changes.join('. ') + '.' : 'Minor adjustments based on feedback.'
    }

    // Validate structure
    if (!revised.days || !Array.isArray(revised.days)) {
      throw new Error('Invalid revised itinerary structure: missing days array')
    }

    if (!revised.overview) {
      revised.overview = currentItinerary.overview || { pace: 'balanced', budget: 'mid', notes: '' }
    }

    // Validate and normalize dates to match dateList exactly
    const { normalizeItineraryDates, validateItineraryDates } = await import('@/lib/itinerary/normalizeItineraryDates.js')

    const validation = validateItineraryDates(revised, dateList)
    if (!validation.valid) {
      // Normalize dates deterministically
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Normalized revised itinerary dates to match trip locked range:', validation.errors)
      }
      revised = normalizeItineraryDates(revised, dateList)

      // Re-validate after normalization
      const revalidation = validateItineraryDates(revised, dateList)
      if (!revalidation.valid) {
        throw new Error(`Failed to normalize revised itinerary dates: ${revalidation.errors.join(', ')}`)
      }
    }

    return {
      itinerary: revised,
      changeLog: changeLog.trim() || 'Updated based on feedback.',
      _meta: {
        promptTokenEstimate,
        newIdeasUsedCount: newIdeasToUse.length,
        chatMessagesCount: chatMessages.length
      }
    }
  } catch (error) {
    console.error('Error revising itinerary:', error)
    throw error
  }
}

// ─────────────────────────────────────────────────
// Packing Suggestions (LLM-informed)
// ─────────────────────────────────────────────────

const PACKING_PROMPT_VERSION = '1'

/**
 * Generate packing suggestions from itinerary using LLM.
 * Returns structured JSON array of personal packing items.
 *
 * Leader-gated: only leaders should call this; output is cached per itinerary version.
 *
 * @param {Object} params
 * @param {Object} params.itinerary - Itinerary content (days/blocks)
 * @param {string} params.destination - Trip destination
 * @param {string} params.startDate - Trip start date (YYYY-MM-DD)
 * @param {string} params.endDate - Trip end date (YYYY-MM-DD)
 * @param {number} params.durationDays - Number of days
 * @returns {Promise<Object>} { items: Array<{ slug, title, category, notes? }>, _meta }
 */
export async function generatePackingSuggestions({ itinerary, destination, startDate, endDate, durationDays }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set')
  }

  // Build a compact itinerary summary for the prompt
  const daySummaries = []
  if (itinerary && itinerary.days && Array.isArray(itinerary.days)) {
    for (const day of itinerary.days) {
      const blocks = (day.blocks || []).map(b => {
        let s = b.title || ''
        if (b.tags && b.tags.length > 0) s += ` [${b.tags.join(',')}]`
        if (b.location) s += ` @ ${b.location}`
        return s
      }).filter(Boolean).join('; ')
      daySummaries.push(`${day.date || 'Day'}: ${day.title || ''} — ${blocks}`)
    }
  }

  const itinerarySummary = daySummaries.join('\n')

  const systemPrompt = 'You are a helpful travel packing assistant. Output ONLY valid JSON matching the requested schema. No markdown, no extra text.'

  const userPrompt = `Based on this trip itinerary, suggest personal packing items for an individual traveler.

TRIP DETAILS:
- Destination: ${destination || 'Unknown'}
- Dates: ${startDate || '?'} to ${endDate || '?'} (${durationDays || '?'} days)

ITINERARY SUMMARY:
${itinerarySummary || 'No itinerary details available.'}

RULES:
1. Suggest ONLY items an individual traveler should pack personally.
2. Do NOT suggest shared/group items (speakers, first-aid kits, group cooking gear, board games, etc).
3. Do NOT suggest medical prescriptions, visa/legal documents, or items requiring professional advice.
4. Do NOT output exact quantities — the user decides how many to bring.
5. You MAY use general climate knowledge for the destination and time of year.
   - Climate notes must be qualitative (e.g. "warm and humid", "cool evenings", "chance of rain").
   - Do NOT output exact temperatures, daily forecasts, or guaranteed weather claims.
6. Weather-related items should be framed as "consider bringing" with climate context in the notes field.
7. Keep the list practical — max 30 items.
8. Slugs must be stable, lowercase, snake_case (e.g. "hiking_boots", "rain_jacket").
9. Categories: clothing, footwear, accessories, toiletries, electronics, health, documents, general.

Output ONLY valid JSON matching this schema:
{
  "items": [
    {
      "slug": "string (lowercase_snake_case, stable identifier)",
      "title": "string (human-readable item name)",
      "category": "clothing|footwear|accessories|toiletries|electronics|health|documents|general",
      "notes": "string or null (optional context, e.g. climate hint or activity reason)"
    }
  ]
}

Important: Output ONLY the JSON object, nothing else.`

  const promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, userPrompt)

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    }, { context: 'generatePackingSuggestions' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Validate structure
    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Invalid packing suggestions structure: missing items array')
    }

    // Sanitize and validate each item
    const validItems = parsed.items
      .filter(item => item && typeof item.slug === 'string' && typeof item.title === 'string')
      .slice(0, 30) // Hard cap
      .map(item => ({
        slug: item.slug.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50),
        title: item.title.substring(0, 100),
        category: ['clothing', 'footwear', 'accessories', 'toiletries', 'electronics', 'health', 'documents', 'general'].includes(item.category) ? item.category : 'general',
        notes: item.notes ? String(item.notes).substring(0, 200) : null
      }))

    return {
      items: validItems,
      _meta: {
        promptTokenEstimate,
        itemCount: validItems.length,
        promptVersion: PACKING_PROMPT_VERSION
      }
    }
  } catch (error) {
    console.error('Error generating packing suggestions:', error)
    throw error
  }
}

export { PACKING_PROMPT_VERSION }

// ─────────────────────────────────────────────────
// Scheduling Insights (LLM-informed)
// ─────────────────────────────────────────────────

const SCHEDULING_INSIGHTS_PROMPT_VERSION = '1'

/**
 * Generate scheduling insights from a snapshot of windows, reactions, chat, and participants.
 * Read-only analysis — never recommends a date, never ranks windows, never infers availability.
 *
 * @param {Object} params
 * @param {Object} params.snapshot - Normalized scheduling snapshot
 * @returns {Promise<Object>} { output, _meta }
 */
export async function generateSchedulingInsights({ snapshot }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set')
  }

  // Build a compact text representation of the snapshot
  const participantLines = (snapshot.participants || []).map(p =>
    `- ${p.name} (${p.role})${p.responded ? '' : ' [has not responded yet]'}`
  ).join('\n')

  const windowLines = (snapshot.windows || []).map(w =>
    `- "${w.sourceText || `${w.start} to ${w.end}`}" (${w.start} → ${w.end}): ${w.supportCount} supporter(s): ${w.supporterNames.join(', ') || 'none'}`
  ).join('\n')

  const chatLines = (snapshot.chat || []).map(c =>
    `[${c.messageId}] ${c.authorName}: ${c.text}`
  ).join('\n')

  const systemPrompt = 'You are a helpful group trip scheduling analyst. Output ONLY valid JSON matching the requested schema. No markdown, no extra text.'

  const userPrompt = `Analyze the following scheduling context for a group trip and provide neutral, informational insights to help the trip leader understand the group's preferences and conflicts.

TRIP: ${snapshot.trip?.name || 'Untitled'} (${snapshot.trip?.destinationHint || 'destination TBD'})
Status: ${snapshot.trip?.status || 'scheduling'}

PARTICIPANTS (${(snapshot.participants || []).length} total):
${participantLines || 'None'}

DATE WINDOWS SUGGESTED (${(snapshot.windows || []).length} total):
${windowLines || 'None yet'}

RECENT CHAT MESSAGES (${(snapshot.chat || []).length} messages):
${chatLines || 'No recent messages'}

STRICT RULES — you MUST follow these:
1. Do NOT recommend, select, or rank any date window.
2. Do NOT infer a person's availability unless they explicitly stated it in chat.
3. Cite evidenceMessageIds (from the [messageId] tags) for every preference, avoid, and ambiguity.
4. If evidence is weak or ambiguous, set confidence to "low".
5. missing_people must be based ONLY on the responded=false participants listed above — do not guess.
6. Keep output concise: max 5 preferences, max 5 avoids, max 3 ambiguities, max 5 followups.
7. followups should be phrased as questions the leader could ask the group — never as actions to take.
8. summary should be 2-3 sentences, neutral and factual.

Output ONLY valid JSON matching this exact schema:
{
  "summary": "neutral 2-3 sentence summary of scheduling state",
  "preferences": [
    { "text": "description of preference mentioned", "evidenceMessageIds": ["msgId1"], "confidence": "low|medium|high" }
  ],
  "avoids": [
    { "text": "description of conflict or date to avoid", "evidenceMessageIds": ["msgId1"], "confidence": "low|medium|high" }
  ],
  "missing_people": ["userId1", "userId2"],
  "ambiguities": [
    { "text": "description of unclear or ambiguous input", "evidenceMessageIds": ["msgId1"] }
  ],
  "followups": [
    { "question": "suggested question for the leader to ask", "reason": "why this question would help" }
  ]
}

Important: Output ONLY the JSON object, nothing else.`

  const promptTokenEstimate = estimateTotalPromptTokens(systemPrompt, userPrompt)

  try {
    const response = await fetchWithRetry(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      })
    }, { context: 'generateSchedulingInsights' })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No content in API response')
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse JSON from response')
      }
    }

    // Validate and sanitize structure
    const output = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.substring(0, 500) : '',
      preferences: sanitizeInsightArray(parsed.preferences, 5),
      avoids: sanitizeInsightArray(parsed.avoids, 5),
      missing_people: Array.isArray(parsed.missing_people)
        ? parsed.missing_people.filter(id => typeof id === 'string').slice(0, 20)
        : [],
      ambiguities: sanitizeInsightArray(parsed.ambiguities, 3),
      followups: Array.isArray(parsed.followups)
        ? parsed.followups
          .filter(f => f && typeof f.question === 'string')
          .slice(0, 5)
          .map(f => ({
            question: f.question.substring(0, 300),
            reason: typeof f.reason === 'string' ? f.reason.substring(0, 200) : ''
          }))
        : []
    }

    return {
      output,
      _meta: {
        promptTokenEstimate,
        promptVersion: SCHEDULING_INSIGHTS_PROMPT_VERSION,
        chatCount: (snapshot.chat || []).length,
        windowCount: (snapshot.windows || []).length,
        participantCount: (snapshot.participants || []).length
      }
    }
  } catch (error) {
    console.error('Error generating scheduling insights:', error)
    throw error
  }
}

function sanitizeInsightArray(arr, max) {
  if (!Array.isArray(arr)) return []
  return arr
    .filter(item => item && typeof item.text === 'string')
    .slice(0, max)
    .map(item => ({
      text: item.text.substring(0, 300),
      evidenceMessageIds: Array.isArray(item.evidenceMessageIds)
        ? item.evidenceMessageIds.filter(id => typeof id === 'string').slice(0, 5)
        : [],
      ...(item.confidence ? { confidence: ['low', 'medium', 'high'].includes(item.confidence) ? item.confidence : 'low' } : {})
    }))
}

export { SCHEDULING_INSIGHTS_PROMPT_VERSION }
