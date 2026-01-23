// LLM integration for itinerary generation, revision, and trip intelligence
// Uses OpenAI API (or compatible endpoint)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

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
    const response = await fetch(OPENAI_API_URL, {
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
    })

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
    const response = await fetch(OPENAI_API_URL, {
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
    })

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
    const response = await fetch(OPENAI_API_URL, {
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
    })

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
 * Generate initial itinerary from ideas and trip details
 * @param {Object} params - Generation parameters
 * @param {string} params.destination - Trip destination (optional)
 * @param {string} params.startDate - Locked start date (YYYY-MM-DD)
 * @param {string} params.endDate - Locked end date (YYYY-MM-DD)
 * @param {Array<string>} params.dateList - Canonical list of dates (YYYY-MM-DD) - must match startDate to endDate inclusive
 * @param {number} params.groupSize - Number of people (optional)
 * @param {Array} params.ideas - Top ideas sorted by priority
 * @param {Array} params.constraints - Global constraints
 * @returns {Promise<Object>} Itinerary JSON matching schema
 */
export async function generateItinerary({ destination, startDate, endDate, dateList, groupSize, ideas, constraints = [] }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  if (!dateList || !Array.isArray(dateList) || dateList.length === 0) {
    throw new Error('dateList is required and must be a non-empty array')
  }

  // Calculate number of days from dateList (authoritative)
  const numberOfDays = dateList.length

  // Format ideas for prompt
  const ideasText = ideas.length > 0
    ? ideas.map((idea, idx) => `${idx + 1}. ${idea.title}${idea.details ? ` - ${idea.details}` : ''}${idea.category ? ` [${idea.category}]` : ''}${idea.location ? ` @ ${idea.location}` : ''}${idea.constraints && idea.constraints.length > 0 ? ` (constraints: ${idea.constraints.join(', ')})` : ''}`).join('\n')
    : 'No specific ideas provided'

  const constraintsText = constraints.length > 0 ? `\nConstraints: ${constraints.join(', ')}` : ''

  // Build explicit date list text for prompt
  const dateListText = dateList.map((date, idx) => `  Day ${idx + 1}: ${date}`).join('\n')

  const prompt = `You are a travel itinerary generator. Create a detailed, realistic itinerary for a ${numberOfDays}-day trip${destination ? ` to ${destination}` : ''}${groupSize ? ` for ${groupSize} people` : ''}.

Trip date range: ${startDate} to ${endDate} (inclusive)
Exact dates you MUST include (one day object per date, in this exact order):
${dateListText}

Suggested activities and ideas:
${ideasText}${constraintsText}

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

  try {
    const response = await fetch(OPENAI_API_URL, {
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
            content: 'You are a helpful travel itinerary assistant. Always output valid JSON matching the requested schema. Never include markdown formatting or explanatory text, only the JSON object.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    })

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

    return itinerary
  } catch (error) {
    console.error('Error generating itinerary:', error)
    throw error
  }
}

/**
 * Summarize feedback messages into structured change requests
 * @param {Array} feedbackMessages - Array of feedback message objects
 * @param {Array} reactions - Array of reaction objects from itinerary_reactions collection
 * @returns {Promise<Object>} Structured change requests with reaction preferences
 */
export async function summarizeFeedback(feedbackMessages, reactions = [], chatMessages = []) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set')
  }

  // Build structured reaction preferences from reactions collection
  const reactionPreferences = {
    pace: null,
    budget: null,
    focus: [],
    logistics: [],
    sentiment: []
  }

  reactions.forEach(r => {
    const [category, value] = r.reactionKey.split(':')
    if (category === 'pace' || category === 'budget') {
      reactionPreferences[category] = value
    } else if (reactionPreferences[category]) {
      reactionPreferences[category].push(value)
    }
  })

  // If no feedback messages, no meaningful reactions, and no chat messages, return empty
  if ((!feedbackMessages || feedbackMessages.length === 0) &&
      (!chatMessages || chatMessages.length === 0) &&
      !reactionPreferences.pace &&
      !reactionPreferences.budget &&
      reactionPreferences.focus.length === 0 &&
      reactionPreferences.logistics.length === 0) {
    return {
      keep: [],
      change: [],
      add: [],
      remove: [],
      constraints: [],
      reactionPreferences
    }
  }

  const feedbackText = feedbackMessages && feedbackMessages.length > 0
    ? feedbackMessages.map((msg, idx) => {
        const target = msg.target ? ` [target: ${msg.target}]` : ''
        return `${idx + 1}. [${msg.type}] ${msg.message}${target}`
      }).join('\n')
    : 'No structured feedback provided'

  // Build chat messages section (these are informal discussions that may contain feedback)
  const chatText = chatMessages && chatMessages.length > 0
    ? chatMessages.map((msg, idx) => {
        // Truncate long messages
        const content = msg.content?.substring(0, 300) || ''
        return `- ${content}`
      }).join('\n')
    : ''

  // Build reaction signals section
  const reactionSignals = []
  if (reactionPreferences.pace) {
    reactionSignals.push(`Pace: ${reactionPreferences.pace} (HARD CONSTRAINT - must be reflected in itinerary)`)
  }
  if (reactionPreferences.budget) {
    reactionSignals.push(`Budget: ${reactionPreferences.budget} (HARD CONSTRAINT - reduce costs)`)
  }
  if (reactionPreferences.focus.length > 0) {
    reactionSignals.push(`Focus areas: ${reactionPreferences.focus.join(', ')} (HARD CONSTRAINT - prioritize these)`)
  }
  if (reactionPreferences.logistics.length > 0) {
    reactionSignals.push(`Logistics preferences: ${reactionPreferences.logistics.join(', ')} (HARD CONSTRAINT - apply these)`)
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
    const response = await fetch(OPENAI_API_URL, {
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
    })

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

    // Include reaction preferences in the summary
    summary.reactionPreferences = reactionPreferences

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
 * @param {string} params.destination - Trip destination (optional)
 * @param {string} params.startDate - Start date
 * @param {string} params.endDate - End date
 * @param {Array<string>} params.dateList - Canonical list of dates (YYYY-MM-DD) - must match startDate to endDate inclusive
 * @returns {Promise<{itinerary: Object, changeLog: string}>} Revised itinerary and change log
 */
export async function reviseItinerary({ currentItinerary, feedbackSummary, newIdeas = [], destination, startDate, endDate, dateList }) {
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
  const reactionPrefs = feedbackSummary.reactionPreferences || {}
  const reactionSignals = []
  if (reactionPrefs.pace) {
    reactionSignals.push(`- Pace: ${reactionPrefs.pace} (${reactionPrefs.pace === 'slow' ? 'reduce activities, add more breaks' : 'increase activities, reduce downtime'})`)
  }
  if (reactionPrefs.budget) {
    reactionSignals.push(`- Budget: ${reactionPrefs.budget} (choose cheaper options, reduce costs)`)
  }
  if (reactionPrefs.focus && reactionPrefs.focus.length > 0) {
    reactionSignals.push(`- Focus areas: ${reactionPrefs.focus.join(', ')} (prioritize these themes in activities)`)
  }
  if (reactionPrefs.logistics && reactionPrefs.logistics.length > 0) {
    reactionSignals.push(`- Logistics: ${reactionPrefs.logistics.join(', ')}`)
  }

  const reactionSection = reactionSignals.length > 0
    ? `\nSTRUCTURED REACTION SIGNALS (HARD CONSTRAINTS - HIGHEST PRIORITY):\n${reactionSignals.join('\n')}\n`
    : ''

  const feedbackText = `Keep: ${feedbackSummary.keep.length > 0 ? feedbackSummary.keep.join('; ') : 'nothing specified'}
Change: ${feedbackSummary.change.length > 0 ? feedbackSummary.change.map(c => `${c.target}: ${c.request} (${c.reason})`).join('; ') : 'nothing specified'}
Add: ${feedbackSummary.add.length > 0 ? feedbackSummary.add.join('; ') : 'nothing specified'}
Remove: ${feedbackSummary.remove.length > 0 ? feedbackSummary.remove.join('; ') : 'nothing specified'}
Constraints: ${feedbackSummary.constraints.length > 0 ? feedbackSummary.constraints.join('; ') : 'none'}`

  const newIdeasText = newIdeas.length > 0
    ? `\n\nNew ideas since last version:\n${newIdeas.map((idea, idx) => `${idx + 1}. ${idea.title}${idea.details ? ` - ${idea.details}` : ''}`).join('\n')}`
    : ''

  const prompt = `Revise the following travel itinerary based on structured reaction signals and feedback.

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

  try {
    const response = await fetch(OPENAI_API_URL, {
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
            content: 'You are a helpful travel itinerary assistant. Revise itineraries based on feedback while keeping unchanged items stable. Output ONLY valid JSON for the itinerary, then provide a brief change log in a separate message if needed.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' }
      })
    })

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
      // Generate simple change log from feedback summary
      const changes = []
      if (feedbackSummary.change.length > 0) {
        changes.push(`Updated ${feedbackSummary.change.length} item${feedbackSummary.change.length !== 1 ? 's' : ''}`)
      }
      if (feedbackSummary.add.length > 0) {
        changes.push(`Added ${feedbackSummary.add.length} new item${feedbackSummary.add.length !== 1 ? 's' : ''}`)
      }
      if (feedbackSummary.remove.length > 0) {
        changes.push(`Removed ${feedbackSummary.remove.length} item${feedbackSummary.remove.length !== 1 ? 's' : ''}`)
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
      changeLog: changeLog.trim() || 'Updated based on feedback.'
    }
  } catch (error) {
    console.error('Error revising itinerary:', error)
    throw error
  }
}
