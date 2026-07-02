import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LockedState from '../components/LockedState'
import PageMeta from '../components/PageMeta'
import { useUserKeys } from '../hooks/useUserKeys'
import { callGeminiFactCheck, callWithFallback, formatApiError } from '../utils/aiClient'
import { runDeepDiveAgent } from '../utils/aiAgent'
import feedback from '../utils/feedback'

const VERDICT_STYLES = {
  VERIFIED:    { bg: 'bg-secondary-container',  border: 'border-secondary-fixed', text: 'text-on-secondary-container', icon: 'verified', label: 'VERIFIED' },
  MISLEADING:  { bg: 'bg-error-container',      border: 'border-error',            text: 'text-on-error-container',    icon: 'warning',  label: 'MISLEADING' },
  UNVERIFIED:  { bg: 'bg-surface-container',    border: 'border-outline-variant',  text: 'text-on-surface',            icon: 'help',     label: 'UNVERIFIED' },
  DISPUTED:    { bg: 'bg-surface-container',    border: 'border-tertiary',         text: 'text-tertiary',              icon: 'forum',    label: 'DISPUTED' },
}

// FIX 4: Detailed fact-check prompt passed to fallback models (non-Gemini)
const FACTCHECK_SYSTEM_PROMPT = `You are an intelligence analyst fact-checking claims. You have deep knowledge of geopolitics, defense, technology, economics, space, and financial/crypto markets.
When fact-checking, provide thorough analysis covering: what is verifiably true, what is misleading or missing context, and what remains uncertain.
For market-related claims, remain strictly informational and never provide financial advice.
Return detailed, well-reasoned assessments — not terse summaries.`

function buildFactCheckPromptForFallback(claim, searchContext = '') {
  return `Fact-check the following claim as an intelligence analyst. Be thorough and detailed.

REAL-TIME WEB SEARCH RESULTS FOR CONTEXT:
${searchContext || "(No live search results retrieved. Rely on your internal knowledge.)"}

CLAIM TO INVESTIGATE: "${claim}"

Return ONLY a JSON object (no markdown fences):
{
  "verdict": "VERIFIED" | "MISLEADING" | "UNVERIFIED" | "DISPUTED",
  "confidence": <integer 0-100, dynamically computed based on evidence — NOT a static default>,
  "summary": "3-5 sentence detailed explanation of your verdict. If the input is not a claim, explain why.",
  "flagged_phrases": ["specific phrase from the claim that is misleading or inaccurate"],
  "supporting_sources": ["Description of evidence or sources that support this claim"],
  "contradicting_sources": ["Description of evidence or sources that contradict this claim"],
  "analyst_note": "What a careful intelligence analyst should know about this claim — include historical context and why it matters",
  "missing_context": "Important context that changes how this claim should be interpreted"
}`
}

function LiveInvestigationTrail({ steps }) {
  const ICONS = {
    search_web: 'search',
    check_source_credibility: 'shield',
    analyze_language: 'text_snippet',
    final_verdict: 'gavel',
  }
  
  const LABELS = {
    search_web: 'Searching live sources',
    check_source_credibility: 'Vetting source credibility',
    analyze_language: 'Analyzing text patterns',
    final_verdict: 'Formulating final verdict',
  }

  return (
    <div className="bg-surface-container-low border-2 border-outline-variant p-md md:p-lg tactical-card animate-fade-in max-w-2xl mx-auto mb-md">
      <div className="flex items-center gap-sm mb-md pb-sm border-b border-outline-variant">
        <span className="material-symbols-outlined text-[18px] text-primary animate-pulse">memory</span>
        <span className="font-mono text-[12px] text-on-surface tracking-[1.5px] uppercase">Active Deep Dive Investigation</span>
      </div>
      <div className="space-y-sm">
        {steps.map((s, i) => {
          const isActive = s.status === 'active'
          const isDone = s.status === 'done'

          return (
            <div key={i} className={`flex items-center gap-md animate-fade-in ${isActive ? 'opacity-100' : 'opacity-60'}`}>
              <div className={`w-6 h-6 flex items-center justify-center border ${isDone ? 'bg-primary-container border-primary text-on-primary-container' : 'bg-surface-container-lowest border-outline text-outline'}`}>
                {isDone ? (
                  <span className="material-symbols-outlined text-[12px]">check</span>
                ) : (
                  <span className="material-symbols-outlined text-[12px] animate-spin">refresh</span>
                )}
              </div>
              <div className="flex items-center gap-sm">
                <span className={`material-symbols-outlined text-[14px] ${isActive ? 'text-primary' : 'text-outline'}`}>{ICONS[s.tool] || 'settings'}</span>
                <span className="font-mono text-[11px] tracking-[1px] uppercase text-on-surface">
                  {LABELS[s.tool] || s.tool}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function FactCheckerPage() {
  const [claim, setClaim] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('standard') // 'standard' | 'deep_dive'
  const [agentSteps, setAgentSteps] = useState([])
  const [groqReview, setGroqReview] = useState(null)
  const [fallbackNote, setFallbackNote] = useState(null) // FIX 1: fallback banner
  const { hasKey, getKey } = useUserKeys()
  const navigate = useNavigate()

  // FIX 1: No longer hard-locked to Gemini. Show locked only if NO keys at all.
  const hasAnyKey = hasKey('gemini') || hasKey('groq') || hasKey('claude') || hasKey('openai') ||
                    hasKey('nvidia') || hasKey('kimi') || hasKey('deepseek') || hasKey('qwen')

  if (!hasAnyKey) {
    return <LockedState feature="Fact Checker" keyName="Gemini" />
  }

  async function handleCheck() {
    if (!claim.trim() || loading) return
    setLoading(true)
    setError('')
    setResult(null)
    setFallbackNote(null)
    setGroqReview(null)
    setAgentSteps([])

    const safeClaim = claim.trim()

    // Frontend guard: catch trivially non-factual inputs immediately
    // so we don't waste an API call and get a meaningless 60% score
    const isNonClaim = (
      safeClaim.length < 8 ||
      /^(hi|hello|hey|ok|okay|yes|no|maybe|thanks|lol|test|foo|bar|ping)\b/i.test(safeClaim) ||
      /^[^a-z]*$/i.test(safeClaim) // pure symbols/numbers with no words
    )
    if (isNonClaim) {
      setResult({
        verdict: 'UNVERIFIED',
        confidence: 0,
        summary: `"${safeClaim.slice(0, 60)}" is not a verifiable factual claim. The Fact Checker requires a clear, assertive statement that can be investigated with evidence \u2014 for example: "Country X did Y" or "Study shows Z". Please enter a factual assertion.`,
        flagged_phrases: [],
        supporting_sources: [],
        contradicting_sources: [],
        analyst_note: 'Non-claims cannot be fact-checked.',
        missing_context: '',
      })
      setLoading(false)
      return
    }

    try {
      if (mode === 'deep_dive') {
        const { finalResult, groqReview: review } = await runDeepDiveAgent({
          claim: safeClaim,
          geminiKey: getKey('gemini'),
          groqKey: getKey('groq'),
          onStepUpdate: (stepObj) => {
            setAgentSteps(prev => {
              const newSteps = [...prev]
              const lastIdx = newSteps.length - 1
              if (lastIdx >= 0 && newSteps[lastIdx].tool === stepObj.tool && newSteps[lastIdx].status === 'active') {
                newSteps[lastIdx] = stepObj
              } else {
                newSteps.push(stepObj)
              }
              return newSteps
            })
          }
        })
        
        setResult(finalResult)
        if (review) setGroqReview(review)
        
        feedback.stamp()
        if (finalResult.verdict === 'VERIFIED') feedback.success()
        else if (finalResult.verdict === 'MISLEADING') feedback.warning()
        return
      }

      // Fetch live web search results from backend to ground fallback models (or Gemini)
      let searchContext = ""
      try {
        const searchRes = await fetch(`/api/search-grounding?query=${encodeURIComponent(safeClaim)}`)
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          if (searchData.results && searchData.results.length > 0) {
            searchContext = searchData.results.map((r, idx) => 
              `[Source ${idx + 1}] Title: ${r.title}\nSnippet: ${r.body}\nURL: ${r.href}`
            ).join("\n\n")
          }
        }
      } catch (err) {
        console.error("Failed to fetch search grounding context:", err)
      }

      // Primary path: use Gemini's dedicated fact-check (with grounded search)
      if (hasKey('gemini')) {
        try {
          const data = await callGeminiFactCheck({ apiKey: getKey('gemini'), claim: safeClaim, searchContext })
          setResult(data)
          setFallbackNote(null)
          feedback.stamp()
          if (data.verdict === 'VERIFIED') feedback.success()
          else if (data.verdict === 'MISLEADING') feedback.warning()
          return
        } catch (err) {
          if (err.message !== 'RATE_LIMITED' && err.message !== 'DEBOUNCED') {
            throw err // Not a rate limit, propagate
          }
          // Gemini rate-limited — fall through to callWithFallback
        }
      }

      // FIX 1: Fallback chain — ask other models to fact-check via text prompt
      const fallbackResult = await callWithFallback({
        prompt: buildFactCheckPromptForFallback(safeClaim, searchContext),
        systemPrompt: FACTCHECK_SYSTEM_PROMPT,
        getKey,
        hasKey,
        primaryProvider: hasKey('gemini') ? 'groq' : (hasKey('groq') ? 'groq' : 'claude'),
        grounded: false,
      })

      // Parse JSON from fallback response
      let raw = fallbackResult.text.trim()
      raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')
      // Find JSON object in the response
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Could not parse fact-check response from fallback model')
      const parsed = JSON.parse(jsonMatch[0])

      const data = {
        verdict: String(parsed.verdict || 'UNVERIFIED').toUpperCase().slice(0, 20),
        confidence: Math.max(0, Math.min(100, parseInt(parsed.confidence) || 50)),
        summary: String(parsed.summary || '').slice(0, 2000),
        flagged_phrases: (parsed.flagged_phrases || []).map(p => String(p).slice(0, 200)),
        supporting_sources: (parsed.supporting_sources || []).map(s => String(s).slice(0, 500)),
        contradicting_sources: (parsed.contradicting_sources || []).map(s => String(s).slice(0, 500)),
        analyst_note: String(parsed.analyst_note || '').slice(0, 1000),
        missing_context: String(parsed.missing_context || '').slice(0, 1000),
      }
      setResult(data)
      // FIX 1: Show fallback banner
      setFallbackNote(`Uplink synchronized via ${fallbackResult.provider} — Primary Network Channel offline`)
      feedback.stamp()

    } catch (err) {
      const msg = formatApiError(err, 'Fact Checker')
      if (msg) setError(msg + (err.message === 'ALL_RATE_LIMITED' ? ' Go to Settings to add more backup keys.' : ''))
      feedback.warning()
    } finally {
      setLoading(false)
    }
  }

  const style = result ? (VERDICT_STYLES[result.verdict] || VERDICT_STYLES.UNVERIFIED) : null

  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title="Fact Checker" description="AI-powered truth and context verification." />
      {/* Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm">
        <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Fact Checker</h1>
        <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
          {hasKey('gemini') ? 'Primary Node Active · Grounded search enabled' : 'Secondary Node Active · Offline search cache only'}
        </p>
      </div>

      <div className="max-w-3xl mx-auto p-margin-mobile md:p-margin-desktop">
        {/* Input section */}
        <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card mb-md">
          {/* Mode tabs */}
          <div className="flex border-b border-outline-variant mb-md">
            {[['standard', 'Standard Check'], ['deep_dive', 'Deep Dive (Agent)']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setResult(null); feedback.tap() }}
                className={`flex-1 py-sm font-mono text-[11px] tracking-[1.5px] uppercase transition-colors border-b-2 -mb-[2px] ` +
                  (mode === m ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface')}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-sm">
            <label className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block">
              Paste Claim or Headline to Verify
            </label>
            <button
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  setClaim(text.slice(0, 1000))
                  feedback.tap()
                } catch (err) {
                  console.warn('Clipboard read failed:', err)
                }
              }}
              className="btn-ghost text-[10px] py-0 px-sm"
              title="Paste from clipboard"
            >
              <span className="material-symbols-outlined text-[12px]">content_paste</span>
              Paste
            </button>
          </div>
          
          {mode === 'deep_dive' && !hasKey('gemini') ? (
            <div className="bg-surface-container border border-outline-variant p-md text-center mb-sm">
              <span className="material-symbols-outlined text-[24px] text-outline mb-sm block">lock</span>
              <p className="font-mono text-[11px] text-on-surface tracking-[1.5px] uppercase mb-xs">Primary Synthesis Key Required</p>
              <p className="font-body-md text-on-surface-variant text-sm mb-md text-balance mx-auto max-w-sm">Deep Dive mode utilizes the primary agent's multi-step search scrapers and live web search grounding. Please configure the primary key in Settings to unlock.</p>
              <button onClick={() => navigate('/settings')} className="btn-primary text-[11px] inline-flex">
                <span className="material-symbols-outlined text-[14px]">settings</span>
                Go to Settings
              </button>
            </div>
          ) : (
            <textarea
              id="claim-input"
              value={claim}
              onChange={e => setClaim(e.target.value.slice(0, 1000))}
              rows={4}
              maxLength={1000}
              placeholder="Paste a claim, headline, or statement to fact-check..."
              className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-sm focus:outline-none focus:border-primary transition-colors resize-none mb-sm"
            />
          )}

          <div className="flex items-center justify-between flex-wrap gap-sm">
            <span className="font-mono text-[10px] text-outline tracking-[1px]">
              {claim.length}/1000 chars
            </span>
            <button
              id="check-claim-btn"
              onClick={handleCheck}
              disabled={loading || !claim.trim() || (mode === 'deep_dive' && !hasKey('gemini'))}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">fact_check</span>
                  Verify Claim
                </>
              )}
            </button>
          </div>
        </div>

        {/* Loading state: Investigation Trail */}
        {loading && (mode === 'deep_dive' ? <LiveInvestigationTrail steps={agentSteps} /> : <LiveInvestigationTrail steps={[
          { tool: 'search_web', status: 'done' },
          { tool: 'analyze_language', status: 'done' },
          { tool: 'final_verdict', status: 'active' }
        ]} />)}

        {/* Error */}
        {error && !loading && (
          <div className="bg-surface-container-low border-2 border-error p-md md:p-lg tactical-card animate-fade-in max-w-2xl mx-auto mb-md">
            <div className="flex items-start gap-md">
              <span className="material-symbols-outlined text-[32px] text-error">error</span>
              <div>
                <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Analysis Failed</p>
                <p className="font-body-md text-on-surface-variant mb-md text-balance">{error}</p>
                <button onClick={() => navigate('/settings')} className="btn-ghost text-[11px]">
                  <span className="material-symbols-outlined text-[14px]">settings</span>
                  Check API Keys
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FIX 1: Fallback model banner */}
        {fallbackNote && !loading && (
          <div className="bg-surface-container border border-outline-variant p-sm mb-md animate-fade-in flex items-center gap-xs">
            <span className="material-symbols-outlined text-[14px] text-outline">swap_horiz</span>
            <p className="font-mono text-[10px] text-outline tracking-[0.5px]">{fallbackNote}</p>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="animate-slide-up">
            {/* Verdict Banner */}
            <div className={`${style.bg} border-2 ${style.border} p-md tactical-card mb-md relative overflow-hidden`}>
              <div className="absolute top-0 right-0 w-24 h-24 opacity-10 rounded-bl-full" style={{ background: 'currentColor' }} />
              <div className="flex items-center gap-md flex-wrap">
                <div className={`w-14 h-14 border-2 ${style.border} flex items-center justify-center tactical-card flex-shrink-0`}
                  style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <span className={`material-symbols-outlined text-[32px] ${style.text}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                    {style.icon}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase block mb-xs">Verdict</span>
                  <span className={`font-display-lg text-[32px] ${style.text} font-semibold tracking-tight`}>
                    {style.label}
                  </span>
                </div>
                <div className="ml-auto text-right">
                  <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Confidence</span>
                  <span className={`font-display-lg text-[40px] font-bold ${style.text}`}>
                    {result.confidence}%
                  </span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-surface-container-low border border-outline-variant p-md mb-md">
              <div className="flex items-center justify-between mb-sm">
                <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block">Analysis Summary</span>
                <button
                  onClick={() => {
                    const text = `Verdict: ${style.label} (${result.confidence}%)\n\nSummary:\n${result.summary}\n\nAnalyst Note:\n${result.analyst_note || 'N/A'}`
                    navigator.clipboard.writeText(text)
                    feedback.success()
                  }}
                  className="btn-ghost text-[10px] py-0 px-sm"
                >
                  <span className="material-symbols-outlined text-[12px]">content_copy</span>
                  Copy Brief
                </button>
              </div>
              <p className="font-body-md text-on-surface whitespace-pre-wrap leading-relaxed">{result.summary}</p>
            </div>

            {/* Intelligence Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-md">
              {/* Supporting */}
              {result.supporting_sources.length > 0 && (
                <div className="bg-surface-container-low border border-secondary-container p-md">
                  <div className="flex items-center gap-xs mb-sm">
                    <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
                    <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Supporting Evidence</span>
                  </div>
                  <ul className="space-y-xs">
                    {result.supporting_sources.map((s, i) => (
                      <li key={i} className="font-body-md text-on-surface-variant text-sm flex gap-xs">
                        <span className="text-secondary mt-0.5">›</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Contradicting */}
              {result.contradicting_sources.length > 0 && (
                <div className="bg-surface-container-low border border-error-container p-md">
                  <div className="flex items-center gap-xs mb-sm">
                    <span className="material-symbols-outlined text-[14px] text-error">cancel</span>
                    <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Contradicting Evidence</span>
                  </div>
                  <ul className="space-y-xs">
                    {result.contradicting_sources.map((s, i) => (
                      <li key={i} className="font-body-md text-on-surface-variant text-sm flex gap-xs">
                        <span className="text-error mt-0.5">›</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Flagged phrases */}
            {result.flagged_phrases.length > 0 && (
              <div className="bg-surface-container border border-outline-variant p-md mb-md">
                <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Flagged Phrases</span>
                <div className="flex flex-wrap gap-xs">
                  {result.flagged_phrases.map((phrase, i) => (
                    <span key={i} className="chip-alert">{phrase}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Analyst note + Missing context */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {result.analyst_note && (
                <div className="bg-surface-container-low border border-primary-container p-md">
                  <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Analyst Note</span>
                  <p className="font-body-md text-on-surface-variant text-sm whitespace-pre-wrap leading-relaxed">{result.analyst_note}</p>
                </div>
              )}
              {result.missing_context && (
                <div className="bg-surface-container-low border border-outline-variant p-md">
                  <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Missing Context</span>
                  <p className="font-body-md text-on-surface-variant text-sm whitespace-pre-wrap leading-relaxed">{result.missing_context}</p>
                </div>
              )}
            </div>

            {/* Groq Second Opinion */}
            {groqReview && (
              <div className="mt-md bg-surface-container-low border-2 border-outline-variant p-md tactical-card animate-slide-up">
                <div className="flex items-center gap-sm mb-sm border-b border-outline-variant pb-xs">
                  <span className={`material-symbols-outlined text-[18px] ${groqReview.agrees ? 'text-secondary' : 'text-error'}`}>
                    {groqReview.agrees ? 'verified' : 'gavel'}
                  </span>
                  <span className="font-mono text-[11px] text-on-surface tracking-[1.5px] uppercase">Groq Second Opinion</span>
                </div>
                <p className="font-mono text-[11px] text-outline tracking-[1px] uppercase mb-xs">
                  {groqReview.agrees ? 'Agreement Confirmed' : 'Dissenting View'}
                </p>
                <p className="font-body-md text-on-surface-variant text-sm whitespace-pre-wrap leading-relaxed">
                  {groqReview.feedback}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
