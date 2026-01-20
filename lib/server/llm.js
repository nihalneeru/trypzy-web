// LLM integration for itinerary generation and revision
// Uses OpenAI API (or compatible endpoint)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions'
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

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
export async function summarizeFeedback(feedbackMessages, reactions = []) {
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

  // If no feedback messages and no meaningful reactions, return empty
  if ((!feedbackMessages || feedbackMessages.length === 0) &&
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
    : 'No text feedback provided'

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

  const prompt = `Analyze the following feedback about a travel itinerary and summarize into structured change requests.

${reactionSection}
TEXT FEEDBACK (SOFT GUIDANCE):
${feedbackText}

IMPORTANT: Structured reaction signals are HARD CONSTRAINTS and must take priority over text feedback.
For example, if reactions say "pace:slow" but text says "add more activities", the pace constraint wins.

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
