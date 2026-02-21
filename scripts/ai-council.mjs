#!/usr/bin/env node

/**
 * AI Council — Multi-model review orchestrator (3 members)
 *
 * Sends a prompt + context to Gemini, OpenAI, and Claude in parallel,
 * collects structured feedback, and optionally runs a second round where
 * each model sees the other two's feedback before refining.
 *
 * Usage:
 *   node scripts/ai-council.mjs --prompt "Review this spec" --context-file docs/SPEC.md
 *   node scripts/ai-council.mjs --prompt "Review this code" --context "$(cat lib/foo.js)"
 *   echo "review text" | node scripts/ai-council.mjs --prompt "Review this"
 *
 * Environment:
 *   GEMINI_API_KEY       — Google AI Studio API key
 *   OPENAI_API_KEY       — OpenAI API key
 *   ANTHROPIC_API_KEY    — Anthropic API key
 *   GEMINI_MODEL         — Model ID (default: gemini-3-pro-preview, fallback: gemini-2.5-flash)
 *   OPENAI_MODEL_COUNCIL — Model ID (default: gpt-5.2)
 *   CLAUDE_MODEL_COUNCIL — Model ID (default: claude-sonnet-4-6)
 *
 * Options:
 *   --prompt           — The review prompt / question
 *   --context          — Inline context string
 *   --context-file     — Path to file(s) to include as context (comma-separated)
 *   --system           — Custom system prompt (default: senior reviewer persona)
 *   --round2           — Enable second feedback round (each model sees the other two's feedback)
 *   --json             — Output raw JSON instead of formatted text
 */

import { readFileSync, existsSync } from 'fs'
import { request } from 'https'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ============ Load .env.local ============

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

// ============ Config ============

const GEMINI_KEY = process.env.GEMINI_API_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-preview'
const GEMINI_FALLBACK = 'gemini-2.5-flash'
const OPENAI_MODEL = process.env.OPENAI_MODEL_COUNCIL || 'gpt-5.2'
const CLAUDE_MODEL = process.env.CLAUDE_MODEL_COUNCIL || 'claude-sonnet-4-6'

const DEFAULT_SYSTEM = `You are a senior software architect and UX reviewer for Tripti.ai, a group travel coordination app.

Brand voice: calm, friendly, non-preachy. Never guilt or shame users.
Tech stack: Next.js 14, React 18, MongoDB, Tailwind CSS, Capacitor for native.

Provide your review as structured feedback:
1. PASS items (what's good, no changes needed)
2. MUST-FIX items (issues that need to change before shipping)
3. SHOULD-FIX items (improvements that would be nice)
4. CONCERNS (risks, edge cases, or questions)

Be specific — reference exact text, code, or section numbers. Be concise.`

// ============ Parse Args ============

const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  if (idx === -1) return null
  return args[idx + 1] || null
}
const hasFlag = (name) => args.includes(`--${name}`)

const prompt = getArg('prompt')
const contextInline = getArg('context')
const contextFiles = getArg('context-file')
const systemPrompt = getArg('system') || DEFAULT_SYSTEM
const enableRound2 = hasFlag('round2')
const outputJson = hasFlag('json')

if (!prompt) {
  console.error('Usage: node scripts/ai-council.mjs --prompt "Your review prompt" [--context-file path]')
  process.exit(1)
}

// Build context
let context = ''
if (contextFiles) {
  for (const f of contextFiles.split(',')) {
    const path = f.trim()
    try {
      const content = readFileSync(path, 'utf-8')
      context += `\n\n--- FILE: ${path} ---\n${content}`
    } catch (err) {
      console.error(`Warning: Could not read ${path}: ${err.message}`)
    }
  }
}
if (contextInline) {
  context += `\n\n${contextInline}`
}

// Read from stdin if piped
if (!process.stdin.isTTY) {
  try {
    const stdin = readFileSync('/dev/stdin', 'utf-8')
    if (stdin.trim()) {
      context += `\n\n${stdin}`
    }
  } catch {
    // stdin not available (EAGAIN in some environments) — skip
  }
}

const fullPrompt = context ? `${prompt}\n\n--- CONTEXT ---\n${context}` : prompt

// ============ API Callers ============

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    req.write(JSON.stringify(body))
    req.end()
  })
}

async function callGemini(userPrompt, systemText, model) {
  if (!GEMINI_KEY) return { model: 'gemini (skipped)', response: 'GEMINI_API_KEY not set', error: true }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ parts: [{ text: userPrompt }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
  }

  try {
    const res = await httpsPost(url, {}, body)
    if ((res.status === 429 || res.status === 503) && model !== GEMINI_FALLBACK) {
      console.error(`[council] ${model} quota exceeded, falling back to ${GEMINI_FALLBACK}`)
      return callGemini(userPrompt, systemText, GEMINI_FALLBACK)
    }
    if (res.status !== 200) {
      const errMsg = res.body?.error?.message || JSON.stringify(res.body).slice(0, 200)
      return { model, response: `API error ${res.status}: ${errMsg}`, error: true }
    }
    const text = res.body?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return { model, response: text, error: false }
  } catch (err) {
    return { model, response: `Network error: ${err.message}`, error: true }
  }
}

async function callOpenAI(userPrompt, systemText) {
  if (!OPENAI_KEY) return { model: 'openai (skipped)', response: 'OPENAI_API_KEY not set', error: true }

  const url = 'https://api.openai.com/v1/chat/completions'
  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemText },
      { role: 'user', content: userPrompt },
    ],
    max_completion_tokens: 4096,
    temperature: 0.3,
  }

  try {
    const res = await httpsPost(url, { Authorization: `Bearer ${OPENAI_KEY}` }, body)
    if (res.status !== 200) {
      const errMsg = res.body?.error?.message || JSON.stringify(res.body).slice(0, 200)
      return { model: OPENAI_MODEL, response: `API error ${res.status}: ${errMsg}`, error: true }
    }
    const text = res.body?.choices?.[0]?.message?.content || ''
    return { model: OPENAI_MODEL, response: text, error: false }
  } catch (err) {
    return { model: OPENAI_MODEL, response: `Network error: ${err.message}`, error: true }
  }
}

async function callClaude(userPrompt, systemText) {
  if (!ANTHROPIC_KEY) return { model: 'claude (skipped)', response: 'ANTHROPIC_API_KEY not set', error: true }

  const url = 'https://api.anthropic.com/v1/messages'
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: systemText,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  }

  try {
    const res = await httpsPost(url, {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    }, body)
    if (res.status !== 200) {
      const errMsg = res.body?.error?.message || JSON.stringify(res.body).slice(0, 200)
      return { model: CLAUDE_MODEL, response: `API error ${res.status}: ${errMsg}`, error: true }
    }
    const text = res.body?.content?.[0]?.text || ''
    return { model: CLAUDE_MODEL, response: text, error: false }
  } catch (err) {
    return { model: CLAUDE_MODEL, response: `Network error: ${err.message}`, error: true }
  }
}

// ============ Orchestration ============

async function runCouncil() {
  const activeModels = [
    GEMINI_KEY ? `Gemini (${GEMINI_MODEL})` : 'Gemini (skipped — no key)',
    OPENAI_KEY ? `OpenAI (${OPENAI_MODEL})` : 'OpenAI (skipped — no key)',
    ANTHROPIC_KEY ? `Claude (${CLAUDE_MODEL})` : 'Claude (skipped — no key)',
  ]

  console.error('[council] Starting Round 1 — parallel review...')
  console.error(`[council] ${activeModels.join(' | ')}`)

  // Round 1: All three models review in parallel
  const [gemini1, openai1, claude1] = await Promise.all([
    callGemini(fullPrompt, systemPrompt, GEMINI_MODEL),
    callOpenAI(fullPrompt, systemPrompt),
    callClaude(fullPrompt, systemPrompt),
  ])

  console.error(`[council] Round 1 complete — Gemini: ${gemini1.error ? 'ERROR' : 'OK'}, OpenAI: ${openai1.error ? 'ERROR' : 'OK'}, Claude: ${claude1.error ? 'ERROR' : 'OK'}`)

  let gemini2 = null
  let openai2 = null
  let claude2 = null

  // Round 2 (optional): Each model sees the other two's feedback
  const successfulR1 = [gemini1, openai1, claude1].filter(r => !r.error)
  if (enableRound2 && successfulR1.length >= 2) {
    console.error('[council] Starting Round 2 — cross-review...')

    const buildRound2Prompt = (ownReview, otherReviews) => {
      const othersText = otherReviews
        .map(({ name, response }) => `**${name}** said:\n${response}`)
        .join('\n\n---\n\n')
      return `You previously reviewed this:\n\n${fullPrompt}\n\nYour review was:\n${ownReview}\n\nThe other council members also reviewed it:\n\n${othersText}\n\nConsidering their feedback, are there any points you want to change, add, or push back on? Be specific. If you agree with everything, say "No changes to my review."`
    }

    const round2Calls = []

    if (!gemini1.error) {
      const others = []
      if (!openai1.error) others.push({ name: `OpenAI (${openai1.model})`, response: openai1.response })
      if (!claude1.error) others.push({ name: `Claude (${claude1.model})`, response: claude1.response })
      round2Calls.push(callGemini(buildRound2Prompt(gemini1.response, others), systemPrompt, GEMINI_MODEL).then(r => { gemini2 = r }))
    }

    if (!openai1.error) {
      const others = []
      if (!gemini1.error) others.push({ name: `Gemini (${gemini1.model})`, response: gemini1.response })
      if (!claude1.error) others.push({ name: `Claude (${claude1.model})`, response: claude1.response })
      round2Calls.push(callOpenAI(buildRound2Prompt(openai1.response, others), systemPrompt).then(r => { openai2 = r }))
    }

    if (!claude1.error) {
      const others = []
      if (!gemini1.error) others.push({ name: `Gemini (${gemini1.model})`, response: gemini1.response })
      if (!openai1.error) others.push({ name: `OpenAI (${openai1.model})`, response: openai1.response })
      round2Calls.push(callClaude(buildRound2Prompt(claude1.response, others), systemPrompt).then(r => { claude2 = r }))
    }

    await Promise.all(round2Calls)

    console.error(`[council] Round 2 complete — Gemini: ${gemini2?.error === false ? 'OK' : gemini2 ? 'ERROR' : 'N/A'}, OpenAI: ${openai2?.error === false ? 'OK' : openai2 ? 'ERROR' : 'N/A'}, Claude: ${claude2?.error === false ? 'OK' : claude2 ? 'ERROR' : 'N/A'}`)
  }

  // Build output
  const result = {
    prompt,
    models: {
      gemini: { model: gemini1.model, round1: gemini1.response, round2: gemini2?.response || null },
      openai: { model: openai1.model, round1: openai1.response, round2: openai2?.response || null },
      claude: { model: claude1.model, round1: claude1.response, round2: claude2?.response || null },
    },
    errors: [
      ...(gemini1.error ? [`Gemini: ${gemini1.response}`] : []),
      ...(openai1.error ? [`OpenAI: ${openai1.response}`] : []),
      ...(claude1.error ? [`Claude: ${claude1.response}`] : []),
    ],
  }

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const separator = '═══════════════════════════════════════════════════'
    const divider = '───────────────────────────────────────────────────'
    console.log(separator)
    console.log('  AI COUNCIL REVIEW (3 members)')
    console.log(separator)

    // Gemini
    console.log()
    console.log(`Gemini (${gemini1.model})`)
    console.log(divider)
    console.log(gemini1.response)
    if (gemini2 && !gemini2.error) {
      console.log()
      console.log('  [Round 2 — after seeing OpenAI + Claude feedback]')
      console.log(gemini2.response)
    }

    // OpenAI
    console.log()
    console.log(`OpenAI (${openai1.model})`)
    console.log(divider)
    console.log(openai1.response)
    if (openai2 && !openai2.error) {
      console.log()
      console.log('  [Round 2 — after seeing Gemini + Claude feedback]')
      console.log(openai2.response)
    }

    // Claude
    console.log()
    console.log(`Claude (${claude1.model})`)
    console.log(divider)
    console.log(claude1.response)
    if (claude2 && !claude2.error) {
      console.log()
      console.log('  [Round 2 — after seeing Gemini + OpenAI feedback]')
      console.log(claude2.response)
    }

    console.log()
    console.log(separator)
    if (result.errors.length > 0) {
      console.log('ERRORS:', result.errors.join('; '))
    }
    console.log(`Council members: ${successfulR1.length} of 3 responded`)
  }
}

runCouncil().catch((err) => {
  console.error('[council] Fatal error:', err)
  process.exit(1)
})
