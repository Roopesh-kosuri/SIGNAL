/**
 * SIGNAL — AI API Client (Client-Side BYOK)
 * ===========================================
 * All requests go DIRECTLY from the browser to the AI provider's API.
 * The SIGNAL backend NEVER receives or processes user API keys.
 *
 * FIX 2: Grounded search is ONLY available for Gemini (the only model
 * with real web access). All other providers answer from training data.
 *
 * FIX 3: Added NVIDIA NIM, Kimi (Moonshot), DeepSeek, Qwen providers.
 *
 * FIX 4: Increased max_tokens and added detailed-response system prompts.
 */

import { sanitizeInput } from '../hooks/useUserKeys'

// ─── Debounce tracking ────────────────────────────────────────────────────────
const lastCallTime = {}
const DEBOUNCE_MS = 1500

function isDebounced(key) {
  const now = Date.now()
  if (lastCallTime[key] && now - lastCallTime[key] < DEBOUNCE_MS) return true
  lastCallTime[key] = now
  return false
}

// ─── Shared system prompt for intelligence analysis ───────────────────────────
// NOTE: This prompt does NOT tell models to "search the web" — non-Gemini
// models cannot do that. Gemini uses real Google Search grounding via its API.
const INTEL_SYSTEM_PROMPT = `You are SIGNAL's intelligence analyst AI. You provide geopolitical, defense, technology, space, crypto, and market intelligence analysis.
Communication style: precise, factual, analytical. Use structured paragraphs with clear logical flow.
For Stock Market and Crypto/Markets, stay strictly informational and explanatory (e.g., "what this signals"). NEVER provide financial, trading, or investment advice.
When you don't know something or it is beyond your training data cutoff, say so explicitly — do not speculate as if it were fact.
Never fabricate sources, statistics, or events. Provide thorough, well-reasoned answers with multiple paragraphs of depth.
When analyzing a topic, cover: what happened, why it matters, the key actors involved, and what analysts debate about it.`

// ─── Gemini (Google Generative AI) ───────────────────────────────────────────
// ONLY Gemini has real Google Search grounding. The `grounded` param is
// intentionally only supported here — not in any other provider function.
export async function callGemini({ apiKey, prompt, history = [], grounded = false, systemPrompt = null }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safePrompt = sanitizeInput(prompt, 5000)

  const contents = []
  if (history.length > 0) {
    for (const msg of history.slice(-20)) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: sanitizeInput(msg.content, 2000) }],
      })
    }
  }
  contents.push({ role: 'user', parts: [{ text: safePrompt }] })

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      // FIX 4: Gemini 2.0 Flash supports up to 8192 output tokens on free tier
      maxOutputTokens: 8192,
    },
  }

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: sanitizeInput(systemPrompt, 2000) }] }
  }

  // FIX 2: Only Gemini gets the googleSearch grounding tool.
  // Groq, Claude, OpenAI, NVIDIA, Kimi, DeepSeek, Qwen do NOT get this.
  if (grounded) {
    body.tools = [{ googleSearch: {} }]
  }

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const status = res.status
    console.error(`[AI Client] Gemini API Error (${status}):`, JSON.stringify(err, null, 2))
    
    if (status === 429) throw new Error('RATE_LIMITED')
    if (status === 400 && err?.error?.message?.includes('API_KEY')) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || `Gemini error ${status}`)
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  const finishReason = candidate?.finishReason

  // Handle blocked/filtered responses before trying to read text
  if (finishReason === 'SAFETY') {
    throw new Error('Gemini blocked this request due to safety filters. Try rephrasing your query.')
  }
  if (finishReason === 'RECITATION') {
    throw new Error('Gemini blocked this response due to recitation policy. Try a more specific query.')
  }
  if (finishReason === 'MAX_TOKENS') {
    // Partial response is still useful — continue with whatever text we have
  }

  const text = candidate?.content?.parts?.[0]?.text
  if (!text) {
    const reason = finishReason ? ` (finish_reason: ${finishReason})` : ''
    throw new Error(`Empty response from Gemini${reason}`)
  }

  const sources = data?.candidates?.[0]?.groundingMetadata?.webSearchQueries || []
  return { text, sources, provider: 'Gemini' }
}

// ─── Fact-Check with structured response (Gemini primary, fallback aware) ─────────────────
export async function callGeminiFactCheck({ apiKey, claim, searchContext = '' }) {
  if (!apiKey) throw new Error('NO_KEY')
  // NOTE: Debounce intentionally removed — fact-check should always re-run on user request

  const safeClaim = sanitizeInput(claim, 1000)

  const prompt = `You are an intelligence analyst fact-checking a claim. Analyze this claim with rigorous methodology.

REAL-TIME WEB SEARCH RESULTS FOR CONTEXT:
${searchContext || "(No live search results retrieved. Rely on search grounding or built-in knowledge.)"}

CRITICAL RULE: If the input is NOT a factual claim (e.g., it is a greeting like "hello", a random word, gibberish, a question, casual conversation, or anything that does not make a verifiable factual assertion), you MUST return verdict "UNVERIFIED" with confidence 0 and a summary explaining that the input is not a verifiable factual claim. Do NOT invent a score or fabricate analysis for non-claims.

CLAIM: "${safeClaim}"

Provide a thorough, detailed analysis. Return ONLY a JSON object (no markdown fences, no extra text):
{
  "verdict": "VERIFIED" | "MISLEADING" | "UNVERIFIED" | "DISPUTED",
  "confidence": <integer 0-100, dynamically computed based on available evidence — NOT a static default>,
  "summary": "3-5 sentence detailed explanation of your verdict — include what is true, what is false or misleading, and how you reached this conclusion. If input is not a claim, explain why it cannot be fact-checked.",
  "flagged_phrases": ["phrase1", "phrase2"],
  "supporting_sources": ["Detailed description of source/evidence that supports this claim", "another source"],
  "contradicting_sources": ["Detailed description of source/evidence that contradicts this claim"],
  "analyst_note": "What a careful intelligence analyst should know about this claim — include historical context, related events, and why this matters",
  "missing_context": "Important context that changes how this claim should be interpreted — include what is being omitted or oversimplified"
}`

  const { text } = await callGemini({ apiKey, prompt, grounded: true })

  // Robust JSON extraction — handles markdown fences and leading text
  let raw = text.trim()
  raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Gemini returned a non-JSON response for fact-check')

  const result = JSON.parse(jsonMatch[0])
  return {
    verdict: String(result.verdict || 'UNVERIFIED').toUpperCase().slice(0, 20),
    confidence: Math.max(0, Math.min(100, parseInt(result.confidence) ?? 0)),
    summary: String(result.summary || '').slice(0, 2000),
    flagged_phrases: (result.flagged_phrases || []).map(p => String(p).slice(0, 200)),
    supporting_sources: (result.supporting_sources || []).map(s => String(s).slice(0, 500)),
    contradicting_sources: (result.contradicting_sources || []).map(s => String(s).slice(0, 500)),
    analyst_note: String(result.analyst_note || '').slice(0, 1000),
    missing_context: String(result.missing_context || '').slice(0, 1000),
  }
}

// ─── Quiz Generation ──────────────────────────────────────────────────────────
export async function callGeminiQuiz({ apiKey, feedStories }) {
  if (!apiKey) throw new Error('NO_KEY')
  if (isDebounced('quiz')) throw new Error('DEBOUNCED')

  const storyContext = feedStories.slice(0, 5).map(s =>
    `- ${s.headline}: ${s.summary}`
  ).join('\n')

  // FIX 7: Add a cache-busting timestamp to the prompt to force fresh question generation every time
  const prompt = `You are an intelligence analyst creating a quiz based on these real current events:

${storyContext || '(No live feed available — generate questions on recent geopolitical, defense, or technology topics)'}

[Generation Timestamp: ${Date.now()}]

Generate 5 multiple-choice questions that deeply test analytical understanding of these topics. Return ONLY a JSON array (no markdown):
[
  {
    "id": "q1",
    "question": "Question text based on the real stories above — focus on WHY and WHAT IT MEANS, not just what happened",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_index": 0,
    "explanation": "Thorough explanation (3-5 sentences) of why this is correct, the strategic implications, historical context, and what an analyst would look for. Do not be terse.",
    "topic": "GEOPOLITICS|DEFENSE|TECH|CYBER|ENERGY|ECONOMY|CRYPTO_MARKETS|STOCK_MARKET|SPACE",
    "difficulty": "EASY|MEDIUM|HARD"
  }
]`

  const { text } = await callGemini({ apiKey, prompt, grounded: false })

  let raw = text.trim()
  raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')

  const questions = JSON.parse(raw)
  if (!Array.isArray(questions)) throw new Error('Invalid quiz response')

  return questions.slice(0, 5).map((q, i) => ({
    id: String(q.id || `q${i + 1}`),
    question: String(q.question || '').slice(0, 500),
    options: (q.options || []).slice(0, 4).map(o => String(o).slice(0, 200)),
    correct_index: Math.max(0, Math.min(3, parseInt(q.correct_index) || 0)),
    explanation: String(q.explanation || '').slice(0, 1500),
    topic: String(q.topic || 'GEOPOLITICS').slice(0, 20),
    difficulty: String(q.difficulty || 'MEDIUM').slice(0, 10),
  }))
}

// ─── Foundations / Concept Generation ────────────────────────────────────────
export async function callGeminiFoundation({ apiKey, concept, currentNewsContext }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safeContext = sanitizeInput(currentNewsContext, 500)
  const safeConcept = sanitizeInput(concept, 200)

  // FIX 4: Request much more detailed overview with proper depth
  const prompt = `You are a geopolitical analyst writing a comprehensive intelligence briefing document for a smart non-expert audience. Be thorough and detailed — this is a reference document, not a summary.

Explain: "${safeConcept}"

Current news context for the "Live Example" section: "${safeContext}"

Return ONLY a JSON object (no markdown fences):
{
  "title": "${safeConcept}",
  "tagline": "One punchy sentence about why this matters right now",
  "overview": "5-7 paragraph comprehensive explanation. Paragraph 1: What it is and its core purpose. Paragraph 2: Historical origins and how it developed. Paragraph 3: How it works mechanically — the technical/procedural details. Paragraph 4: Who the key actors/institutions are and what power they hold. Paragraph 5: Current state and recent developments. Paragraph 6: Why it matters in today's geopolitical environment. Paragraph 7: What critics say and where the real debates are.",
  "key_mechanisms": [
    {"name": "Mechanism Name", "description": "Detailed 2-3 sentence explanation of how this mechanism works and why it matters"}
  ],
  "live_example_analysis": "2-3 paragraph analysis of how the current news context specifically illustrates this concept. Be very concrete — name the actors, the specific actions taken, and connect them clearly to the concept being explained.",
  "common_misconceptions": ["Detailed misconception with explanation of why it is wrong", "Another misconception"],
  "further_questions": ["A specific, substantive follow-up question that a smart person would ask next", "Another deep follow-up question"]
}`

  const { text } = await callGemini({ apiKey, prompt, grounded: false })

  let raw = text.trim()
  raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')

  const result = JSON.parse(raw)
  return {
    title: String(result.title || safeConcept).slice(0, 100),
    tagline: String(result.tagline || '').slice(0, 300),
    overview: String(result.overview || '').slice(0, 10000),
    key_mechanisms: (result.key_mechanisms || []).map(m => ({
      name: String(m.name || '').slice(0, 100),
      description: String(m.description || '').slice(0, 1000),
    })),
    live_example_analysis: String(result.live_example_analysis || '').slice(0, 3000),
    common_misconceptions: (result.common_misconceptions || []).map(m => String(m).slice(0, 500)),
    further_questions: (result.further_questions || []).map(q => String(q).slice(0, 300)),
  }
}

// ─── Claude (Anthropic) ───────────────────────────────────────────────────────
// FIX 2: Claude has NO web search. Answers come from training data.
// FIX 4: Increased max_tokens to 4096
export async function callClaude({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  const messages = history.slice(-20).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: sanitizeInput(msg.content, 2000),
  }))
  messages.push({ role: 'user', content: sanitizeInput(prompt, 5000) })

  // FIX 2: System prompt does NOT mention web search (Claude cannot search)
  const safeSystem = sanitizeInput(
    systemPrompt || INTEL_SYSTEM_PROMPT,
    2000
  )

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'claude',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096, // FIX 4
      system: safeSystem,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `Claude error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.content?.[0]?.text || '', sources: [], provider: 'Claude' }
}

// ─── OpenAI (GPT) ─────────────────────────────────────────────────────────────
// FIX 2: GPT has NO real-time web search in this integration.
// FIX 4: Increased max_tokens to 4096
export async function callOpenAI({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  // FIX 2: No mention of web search in system prompt
  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'openai',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 4096, // FIX 4
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `OpenAI error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'GPT-4o mini' }
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
// FIX 2: Groq (Llama/Mixtral) has NO web search. It answers from training data
// and honestly discloses its knowledge cutoff. The "grounded" toggle in the UI
// is hidden/disabled for Groq — this function does not accept a grounded param.
// FIX 4: Increased max_tokens to 8000 (Groq free tier supports large outputs)
export async function callGroq({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  // FIX 2: No mention of web search — Groq models cannot search the internet
  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 8000, // FIX 4: Groq free tier supports large outputs
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || `Groq error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'Groq / Llama 3.3' }
}

// ─── FIX 3: NVIDIA NIM ────────────────────────────────────────────────────────
// Free tier at build.nvidia.com/nim — OpenAI-compatible endpoint.
// NO web search capability. Answers from model training data.
export async function callNvidia({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'nvidia',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'meta/llama-3.1-70b-instruct',
      messages,
      max_tokens: 8000,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `NVIDIA error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'NVIDIA / Llama 3.1' }
}

// ─── FIX 3: Kimi (Moonshot AI) ───────────────────────────────────────────────
// platform.moonshot.cn — OpenAI-compatible API. Free tier available.
// NO web search. Answers from training data.
export async function callKimi({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'kimi',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'moonshot-v1-32k',
      messages,
      max_tokens: 8000,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `Kimi error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'Kimi / Moonshot' }
}

// ─── FIX 3: DeepSeek ─────────────────────────────────────────────────────────
// platform.deepseek.com — OpenAI-compatible API. Free/cheap tier.
// NO web search. Answers from training data.
export async function callDeepSeek({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'deepseek',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: 8000,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `DeepSeek error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'DeepSeek' }
}

// ─── FIX 3: Qwen (Alibaba DashScope) ─────────────────────────────────────────
// dashscope.aliyuncs.com — OpenAI-compatible API. Free tier available.
// NO web search. Answers from training data.
export async function callQwen({ apiKey, prompt, history = [], systemPrompt = '' }) {
  if (!apiKey) throw new Error('NO_KEY')

  const safeSystem = sanitizeInput(systemPrompt || INTEL_SYSTEM_PROMPT, 2000)

  const messages = [
    { role: 'system', content: safeSystem },
    ...history.slice(-20).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: sanitizeInput(msg.content, 2000),
    })),
    { role: 'user', content: sanitizeInput(prompt, 5000) },
  ]

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ai-provider': 'qwen',
      'x-ai-key': apiKey,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages,
      max_tokens: 8000,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 429) throw new Error('RATE_LIMITED')
    if (res.status === 401) throw new Error('INVALID_KEY')
    throw new Error(err?.error?.message || err?.message || `Qwen error ${res.status}`)
  }

  const data = await res.json()
  return { text: data?.choices?.[0]?.message?.content || '', sources: [], provider: 'Qwen' }
}

// ─── FIX 1: Provider fallback chain ──────────────────────────────────────────
/**
 * Ordered fallback chain. Tries each provider in sequence.
 * Skips providers for which the user has no key configured.
 * Returns { text, sources, provider, wasFallback } where:
 *   - provider: the name of the model that actually answered
 *   - wasFallback: true if primary (gemini) was rate-limited and we fell back
 *
 * Note: `grounded` is only passed for Gemini. All other providers ignore it
 * and use training data only (FIX 2).
 */
export async function callWithFallback({
  prompt,
  history = [],
  systemPrompt,
  getKey,
  hasKey,
  primaryProvider = 'gemini',
  grounded = false,
}) {
  // Define the fallback chain order
  const CHAIN = [
    {
      id: 'gemini',
      name: 'Gemini',
      fn: (key) => callGemini({ apiKey: key, prompt, history, grounded, systemPrompt }),
    },
    {
      id: 'groq',
      name: 'Groq / Llama 3.3',
      fn: (key) => callGroq({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'claude',
      name: 'Claude',
      fn: (key) => callClaude({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'openai',
      name: 'GPT-4o mini',
      fn: (key) => callOpenAI({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'nvidia',
      name: 'NVIDIA / Llama 3.1',
      fn: (key) => callNvidia({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'kimi',
      name: 'Kimi / Moonshot',
      fn: (key) => callKimi({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      fn: (key) => callDeepSeek({ apiKey: key, prompt, history, systemPrompt }),
    },
    {
      id: 'qwen',
      name: 'Qwen',
      fn: (key) => callQwen({ apiKey: key, prompt, history, systemPrompt }),
    },
  ]

  // Start from the preferred primary provider
  const startIdx = CHAIN.findIndex(p => p.id === primaryProvider)
  const orderedChain = startIdx >= 0
    ? [...CHAIN.slice(startIdx), ...CHAIN.slice(0, startIdx)]
    : CHAIN

  let primaryRateLimited = false
  let firstAvailable = true

  for (const provider of orderedChain) {
    if (!hasKey(provider.id)) continue

    const key = getKey(provider.id)
    try {
      const result = await provider.fn(key)
      const wasFallback = !firstAvailable || (provider.id !== primaryProvider)
      return {
        ...result,
        provider: result.provider || provider.name,
        wasFallback: primaryRateLimited && provider.id !== primaryProvider,
        usedProvider: provider.id,
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        if (firstAvailable && provider.id === primaryProvider) {
          primaryRateLimited = true
        }
        firstAvailable = false
        continue // Try next provider
      }
      // Non-rate-limit errors propagate immediately
      throw err
    }
  }

  // All available providers exhausted with rate limits
  throw new Error('ALL_RATE_LIMITED')
}

// ─── Universal error message formatter ────────────────────────────────────────
export function formatApiError(err, provider = 'AI') {
  const msg = err?.message || ''
  if (msg === 'NO_KEY') return `Add your ${provider} API key in Settings to use this feature.`
  if (msg === 'RATE_LIMITED') return `${provider} rate limit reached — try again in a moment.`
  if (msg === 'ALL_RATE_LIMITED') return `All your configured AI models are currently rate-limited. Wait a moment, then try again. Add more backup keys in Settings for better failover coverage.`
  if (msg === 'INVALID_KEY') return `Your ${provider} API key appears to be invalid. Check Settings.`
  if (msg === 'DEBOUNCED') return null // silently ignore debounced duplicate calls
  return `${provider} error: ${msg.slice(0, 200)}`
}
