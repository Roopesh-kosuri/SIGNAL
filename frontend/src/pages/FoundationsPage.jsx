import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LockedState from '../components/LockedState'
import PageMeta from '../components/PageMeta'
import { useUserKeys } from '../hooks/useUserKeys'
import { callGeminiFoundation, callWithFallback, formatApiError } from '../utils/aiClient'
import feedback from '../utils/feedback'

const DEFAULT_CONCEPTS = [
  {
    id: 'imf',
    title: 'How the IMF Works',
    tagline: 'The world\'s financial firefighter — and why countries fear calling it',
    icon: 'account_balance',
    category: 'ECONOMY',
  },
  {
    id: 'gdp',
    title: 'How GDP is Calculated',
    tagline: 'The single number that defines a nation\'s power — and its many lies',
    icon: 'bar_chart',
    category: 'ECONOMY',
  },
  {
    id: 'sanctions',
    title: 'How Sanctions Work',
    tagline: 'Economic warfare without soldiers — and why it often fails',
    icon: 'gavel',
    category: 'GEOPOLITICS',
  },
  {
    id: 'nato',
    title: 'How NATO Functions',
    tagline: 'Article 5, burden-sharing, and the alliance\'s existential tensions',
    icon: 'security',
    category: 'DEFENSE',
  },
  {
    id: 'semiconductor',
    title: 'The Semiconductor Supply Chain',
    tagline: 'Why a 2nm chip is the new oil — and who controls the chokepoints',
    icon: 'memory',
    category: 'TECH',
  },
  {
    id: 'central-banks',
    title: 'How Central Banks Control Inflation',
    tagline: 'Interest rates, money supply, and the blunt instruments of monetary policy',
    icon: 'currency_exchange',
    category: 'ECONOMY',
  },
  {
    id: 'crypto-markets',
    title: 'How Cryptocurrency Markets Work',
    tagline: 'Beyond the hype: the structural mechanics of decentralized finance',
    icon: 'currency_bitcoin',
    category: 'CRYPTO_MARKETS',
  },
]

export default function FoundationsPage() {
  const [selectedConcept, setSelectedConcept] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedContext, setFeedContext] = useState('')
  const [fallbackNote, setFallbackNote] = useState(null) // FIX 1
  const { hasKey, getKey } = useUserKeys()
  const navigate = useNavigate()
  
  const hasAnyKey = hasKey('gemini') || hasKey('groq') || hasKey('claude') || hasKey('openai') ||
                    hasKey('nvidia') || hasKey('kimi') || hasKey('deepseek') || hasKey('qwen')

  const [concepts, setConcepts] = useState(DEFAULT_CONCEPTS)
  const [generatingConcepts, setGeneratingConcepts] = useState(false)

  // Fetch feed for Live Example context (uses backend key, works without user key)
  useEffect(() => {
    fetch('/api/feed')
      .then(r => r.json())
      .then(data => {
        if (data.stories?.length) {
          setFeedContext(data.stories.slice(0, 5).map(s => s.headline + ': ' + s.summary).join(' | '))
        }
      })
      .catch(() => {})
  }, [])

  // Generate dynamic foundations concepts using AI based on latest news
  useEffect(() => {
    if (!feedContext || !hasAnyKey) return

    const cacheKey = 'signal_dynamic_foundations_list'
    const cachedTimeKey = 'signal_dynamic_foundations_list_time'
    const cached = localStorage.getItem(cacheKey)
    const cachedTime = localStorage.getItem(cachedTimeKey)
    if (cached && cachedTime && (Date.now() - Number(cachedTime) < 1800000)) {
      try {
        setConcepts(JSON.parse(cached))
        return
      } catch { /* parse fail, regenerate */ }
    }

    async function generateConcepts() {
      setGeneratingConcepts(true)
      try {
        const prompt = `Based on this current intelligence news feed summary:
"${feedContext}"

Generate exactly 6 unique, highly relevant, and deep educational/geopolitical/economic foundation concepts that help explain the structural forces behind these current events.
For each concept, provide:
1. "id": unique lowercase string (e.g. "imf-mechanics", "strait-chokepoints")
2. "title": The title of the concept (e.g. "How the IMF Works", "The Geopolitics of Chokepoints")
3. "tagline": A punchy, analytical subtitle explaining why this matters
4. "icon": A Material Symbols icon name that matches the topic (e.g. "account_balance", "gavel", "security", "memory", "public", "payments", "radar", "rocket")
5. "category": A single uppercase word category (e.g. "ECONOMY", "GEOPOLITICS", "DEFENSE", "TECH")

Return ONLY a JSON array of objects, with no markdown formatting:
[{"id": "...", "title": "...", "tagline": "...", "icon": "...", "category": "..."}]`

        const fallbackResult = await callWithFallback({
          prompt,
          systemPrompt: 'You are a geopolitical intelligence director. Output ONLY a valid JSON array.',
          getKey, hasKey,
          primaryProvider: hasKey('gemini') ? 'gemini' : 'groq',
          grounded: false
        })
        
        let raw = fallbackResult.text.trim()
        raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')
        const arrayMatch = raw.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          const parsed = JSON.parse(arrayMatch[0])
          if (Array.isArray(parsed) && parsed.length > 0) {
            const mapped = parsed.map(c => ({
              id: c.id || `ai_${Math.random()}`,
              title: c.title || 'Concept Analysis',
              tagline: c.tagline || 'Deep structural mechanics of current geopolitical trends.',
              icon: c.icon || 'auto_awesome',
              category: String(c.category || 'ANALYSIS').toUpperCase(),
              isDynamic: false
            }))
            setConcepts(mapped)
            localStorage.setItem(cacheKey, JSON.stringify(mapped))
            localStorage.setItem(cachedTimeKey, String(Date.now()))
          }
        }
      } catch (e) {
        console.warn('Failed to generate dynamic foundations list:', e)
      } finally {
        setGeneratingConcepts(false)
      }
    }

    generateConcepts()
  }, [feedContext, hasAnyKey])

  // Fetch dynamic trending concepts from the backend
  const [trendingConcepts, setTrendingConcepts] = useState([])
  useEffect(() => {
    async function fetchTrending() {
      try {
        const groqKey = getKey('groq') || ''
        const res = await fetch('/api/trending-chips', {
          headers: { 'x-groq-key': groqKey }
        })
        const data = await res.json()
        if (data.chips && Array.isArray(data.chips)) {
          const dynamicConcepts = data.chips.map((chip, i) => ({
            id: `trending_${i}_${Date.now()}`,
            title: chip,
            tagline: 'Trending topic from today\'s intelligence feed',
            icon: 'trending_up',
            category: 'TRENDING',
            isDynamic: true,
          }))
          setTrendingConcepts(dynamicConcepts)
        }
      } catch (e) {
        console.warn('Failed to fetch trending concepts:', e)
      }
    }
    fetchTrending()
  }, [])

  const allConcepts = [...trendingConcepts, ...concepts]

  async function openConcept(concept) {
    setSelectedConcept(concept)
    setFallbackNote(null)
    feedback.tap()

    // FIX 1: Check for any key, not just Gemini
    if (!hasAnyKey) return // Will show locked state in detail view

    // Check localStorage cache
    const cacheKey = `signal_foundation_${concept.id}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        setContent(JSON.parse(cached))
        return
      } catch { /* cache corrupt, regenerate */ }
    }

    setLoading(true)
    setError('')
    try {
      // Primary: Gemini with full structured output
      if (hasKey('gemini')) {
        try {
          const apiKey = getKey('gemini')
          const data = await callGeminiFoundation({
            apiKey,
            concept: concept.title,
            currentNewsContext: feedContext,
          })
          setContent(data)
          setFallbackNote(null)
          localStorage.setItem(cacheKey, JSON.stringify(data))
          return
        } catch (err) {
          if (err.message !== 'RATE_LIMITED') throw err
          // Gemini rate-limited — fall through to fallback
        }
      }

      // FIX 1: Fallback chain for foundations
      const fallbackPrompt = `Explain "${concept.title}" for an intelligence briefing. Current news context: "${feedContext}".

Return ONLY a JSON object (no markdown):
{"title":"${concept.title}","tagline":"One punchy sentence","overview":"5 paragraph comprehensive explanation covering what it is, historical origins, mechanics, key actors, and why it matters now","key_mechanisms":[{"name":"Name","description":"2-3 sentence explanation"}],"live_example_analysis":"2 paragraphs connecting current events to this concept","common_misconceptions":["Detailed misconception with correction"],"further_questions":["Deep follow-up question"]}`
      const fallbackResult = await callWithFallback({
        prompt: fallbackPrompt,
        systemPrompt: 'You are a geopolitical analyst. Return valid JSON only.',
        getKey, hasKey,
        primaryProvider: hasKey('gemini') ? 'groq' : 'groq',
        grounded: false,
      })
      let raw = fallbackResult.text.trim()
      raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse foundations response')
      const result = JSON.parse(jsonMatch[0])
      const data = {
        title: String(result.title || concept.title).slice(0, 100),
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
      setContent(data)
      setFallbackNote(`Decompiled via ${fallbackResult.provider} — Primary Uplink offline`)
      localStorage.setItem(cacheKey, JSON.stringify(data))
    } catch (err) {
      const msg = formatApiError(err, 'Foundations')
      if (msg) setError(msg)
      feedback.warning()
    } finally {
      setLoading(false)
    }
  }

  function closeConcept() {
    setSelectedConcept(null)
    setContent(null)
    setError('')
    setLoading(false)
    feedback.tap()
  }

  // Detail view
  if (selectedConcept) {
    return (
      <div className="min-h-screen bg-background page-enter">
        <PageMeta title={`${selectedConcept.title} | Foundations`} description={selectedConcept.tagline} />
        <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm flex items-center gap-md">
          <button onClick={closeConcept} className="btn-ghost text-[11px] py-xs">
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Foundations
          </button>
          <span className="font-mono text-[11px] text-outline tracking-[1px] uppercase">{selectedConcept.category}</span>
        </div>

        <div className="max-w-3xl mx-auto p-margin-mobile md:p-margin-desktop">
          {/* Show locked state in detail if no key */}
          {!hasAnyKey && (
            <>
              <h1 className="font-headline-lg text-on-surface mb-xs">{selectedConcept.title}</h1>
              <p className="font-body-md text-on-surface-variant mb-lg">{selectedConcept.tagline}</p>
              <LockedState feature="Foundations Library" keyName="Gemini" />
            </>
          )}

          {hasAnyKey && loading && (
            <div className="animate-fade-in max-w-3xl mx-auto mt-lg">
              <div className="mb-lg">
                <div className="h-6 w-24 bg-surface-container mb-sm skeleton-pulse" />
                <div className="h-10 w-3/4 max-w-md bg-surface-container mb-xs skeleton-pulse" />
                <div className="h-5 w-full max-w-lg bg-surface-container skeleton-pulse" />
              </div>
              <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card mb-md h-40 skeleton-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-sm mb-md">
                {[1, 2].map(i => (
                  <div key={i} className="h-24 bg-surface-container-low border border-outline-variant skeleton-pulse" />
                ))}
              </div>
            </div>
          )}

          {hasAnyKey && error && !loading && (
            <div className="bg-surface-container-low border-2 border-error p-md md:p-lg tactical-card animate-fade-in mb-md text-center max-w-xl mx-auto mt-lg">
              <span className="material-symbols-outlined text-[32px] text-error mb-sm block">error</span>
              <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Generation Failed</p>
              <p className="font-body-md text-on-surface-variant text-balance">{error}</p>
            </div>
          )}

          {/* FIX 1: Fallback model banner */}
          {fallbackNote && !loading && (
            <div className="bg-surface-container border border-outline-variant p-sm mb-md animate-fade-in flex items-center gap-xs">
              <span className="material-symbols-outlined text-[14px] text-outline">swap_horiz</span>
              <p className="font-mono text-[10px] text-outline tracking-[0.5px]">{fallbackNote}</p>
            </div>
          )}

          {hasAnyKey && content && !loading && (
            <div className="animate-slide-up">
              {/* Title */}
              <div className="mb-lg">
                <div className="chip-category mb-sm">{selectedConcept.category}</div>
                <h1 className="font-headline-lg text-on-surface mb-xs">{content.title}</h1>
                <p className="font-body-lg text-primary italic">{content.tagline}</p>
              </div>

              {/* Overview */}
              <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card mb-md">
                <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Overview</span>
                <p className="font-body-md text-on-surface whitespace-pre-wrap leading-relaxed">{content.overview}</p>
              </div>

              {/* Key Mechanisms */}
              {content.key_mechanisms?.length > 0 && (
                <div className="mb-md">
                  <div className="flex items-center gap-md mb-sm">
                    <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Key Mechanisms</span>
                    <div className="flex-1 h-px bg-outline-variant" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
                    {content.key_mechanisms.map((m, i) => (
                      <div key={i} className="bg-surface-container-low border border-outline-variant p-sm">
                        <span className="font-mono text-[11px] text-primary tracking-[0.5px] block mb-xs">{m.name}</span>
                        <p className="font-body-md text-on-surface-variant text-sm">{m.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Example from feed */}
              {content.live_example_analysis && (
                <div className="bg-surface-container-low border-2 border-primary-container p-md tactical-card mb-md">
                  <div className="flex items-center gap-xs mb-sm">
                    <span className="material-symbols-outlined text-[14px] text-primary">live_tv</span>
                    <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Live Example (From Today's Feed)</span>
                    <span className="chip-category ml-auto">Backend Key</span>
                  </div>
                  <p className="font-body-md text-on-surface">{content.live_example_analysis}</p>
                </div>
              )}

              {/* Common Misconceptions */}
              {content.common_misconceptions?.length > 0 && (
                <div className="bg-surface-container border border-outline-variant p-md mb-md">
                  <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Common Misconceptions</span>
                  <ul className="space-y-xs">
                    {content.common_misconceptions.map((m, i) => (
                      <li key={i} className="flex gap-xs font-body-md text-on-surface-variant text-sm">
                        <span className="text-error mt-0.5">✗</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Further Questions — clickable to explore */}
              {content.further_questions?.length > 0 && (
                <div className="bg-surface-container border border-outline-variant p-md mb-md">
                  <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">psychology</span>
                    Explore Further
                  </span>
                  <div className="flex flex-col gap-xs">
                    {content.further_questions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          feedback.tap()
                          const dynamicConcept = {
                            id: `followup_${i}_${Date.now()}`,
                            title: q,
                            tagline: `Follow-up exploration from: ${content.title}`,
                            icon: 'school',
                            category: selectedConcept.category || 'ANALYSIS',
                            isDynamic: true,
                          }
                          openConcept(dynamicConcept)
                        }}
                        className="text-left p-sm border border-outline-variant bg-surface-container-lowest hover:border-primary hover:bg-surface-container transition-all flex items-start gap-sm group"
                      >
                        <span className="material-symbols-outlined text-[14px] text-primary mt-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                        <span className="font-mono text-[11px] text-on-surface tracking-[0.5px] leading-relaxed">{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask Follow-Up */}
              <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card flex items-center justify-between gap-md flex-wrap">
                <div>
                  <p className="font-mono text-[11px] text-outline tracking-[1.5px] uppercase mb-xs">Ask Follow-Up</p>
                  <p className="font-body-md text-on-surface">Consult Command Analyst</p>
                </div>
                <button
                  onClick={() => navigate('/chat', { state: { preload: `I'm studying "${content.title}". Context: ${content.tagline}. Can you explain: ` } })}
                  className="btn-primary"
                >
                  <span className="material-symbols-outlined text-[14px]">chat</span>
                  Open Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title="Foundations Library" description="Core geopolitical and market intelligence concepts explained." />
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm flex justify-between items-center">
        <div>
          <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Foundations Library</h1>
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
            {generatingConcepts ? 'Curating dynamic geopolitical concepts...' : 'Decrypted locally · Synchronized from live feeds'}
          </p>
        </div>
        {generatingConcepts && (
          <div className="flex items-center gap-xs text-primary animate-pulse font-mono text-[10px] uppercase">
            <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
            Curation Online
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto p-margin-mobile md:p-margin-desktop">
        {!hasAnyKey && (
          <div className="mb-lg animate-fade-in">
            <div className="bg-surface-container border border-outline-variant p-sm flex items-center gap-sm mb-md">
              <span className="material-symbols-outlined text-[16px] text-outline">info</span>
              <p className="font-mono text-[11px] text-outline tracking-[0.5px]">
                Configure a synthesis model key in Settings to unlock deep geopolitical concept briefings. Real-world context examples work for everyone.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {allConcepts.map(concept => {
            const isCached = Boolean(localStorage.getItem(`signal_foundation_${concept.id}`))
            return (
              <div
                key={concept.id}
                onClick={() => openConcept(concept)}
                className={`bg-surface-container-low border p-md interactive-card flex flex-col animate-fade-in ${concept.isDynamic ? 'border-primary-container' : 'border-surface-container-highest'}`}
              >
                <div className="flex items-start justify-between mb-sm">
                  <span className={`material-symbols-outlined text-[28px] ${hasAnyKey ? 'text-primary' : 'text-outline'}`}>
                    {concept.icon}
                  </span>
                  <div className="flex gap-xs">
                    {concept.isDynamic && (
                      <span className="chip-category bg-primary-container text-on-primary-container animate-pulse">TRENDING</span>
                    )}
                    <span className="chip-category">{concept.category}</span>
                    {isCached && <span className="chip-verified" title="Cached">✓</span>}
                    {!hasAnyKey && !isCached && <span className="material-symbols-outlined text-[14px] text-outline">lock</span>}
                  </div>
                </div>
                <h3 className="font-headline-md text-on-surface mb-xs">{concept.title}</h3>
                <p className="font-body-md text-on-surface-variant text-sm flex-grow">{concept.tagline}</p>
                <div className="mt-md pt-sm border-t border-outline-variant flex items-center justify-between">
                  <span className="font-mono text-[10px] text-outline tracking-[1px]">
                    {isCached ? 'Cached' : hasAnyKey ? 'Decrypt on demand' : 'Uplink required'}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-outline">arrow_forward</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
