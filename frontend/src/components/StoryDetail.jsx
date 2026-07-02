import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import feedback from '../utils/feedback'
import { useUserKeys } from '../hooks/useUserKeys'

const CONFIDENCE_COLORS = {
  HIGH:   'text-secondary',
  MEDIUM: 'text-primary',
  LOW:    'text-error',
}

export default function StoryDetail({ story, allStories = [] }) {
  const navigate = useNavigate()
  const [extractedText, setExtractedText] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const { getKey } = useUserKeys()
  const [optimizing, setOptimizing] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  const relatedStories = allStories.filter(s => s.id !== story.id).slice(0, 2)

  const handleDeepDivePrepare = async (text) => {
    feedback.tap()
    setOptimizing(true)
    try {
      const res = await fetch('/api/extract-for-deepdive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-groq-key': getKey('groq') || ''
        },
        body: JSON.stringify({ text })
      })
      const data = await res.json()
      if (data.prompt) {
        navigator.clipboard.writeText(data.prompt)
        setToastMessage("INTEL OPTIMIZED: DeepDive search prompt successfully copied to clipboard!")
        feedback.success()
        setTimeout(() => setToastMessage(''), 4000)
      } else {
        feedback.warning()
        alert(data.message || "Optimization failed.")
      }
    } catch (e) {
      feedback.warning()
      alert("Network error during optimization.")
    } finally {
      setOptimizing(false)
    }
  }

  return (
    <div className="animate-fade-in relative">
      
      {/* Tactical Toast Overlay */}
      {toastMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-fade-in pointer-events-none">
          <div className="bg-primary-container border-2 border-primary px-lg py-sm shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]">
            <div className="flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px] text-on-primary-container">psychology</span>
              <span className="font-mono text-[12px] text-on-primary-container font-bold tracking-[1px]">{toastMessage}</span>
            </div>
          </div>
        </div>
      )}

      {/* Category + Confidence header */}
      <div className="flex items-center gap-sm mb-md flex-wrap">
        <span className="chip-category">{story.category}</span>
        <span className={`font-mono text-[11px] ${CONFIDENCE_COLORS[story.confidence]} tracking-[1px] uppercase`}>
          {story.confidence} Confidence
        </span>
        <span className="font-mono text-[10px] text-outline tracking-[1px] ml-auto">
          SOURCES: {story.source_count}
        </span>
      </div>

      {/* Headline */}
      <h1 className="headline-3d font-headline-lg-mobile md:font-headline-lg text-on-surface mb-md leading-tight text-balance">
        {story.headline}
      </h1>

      {/* Summary */}
      <p className="font-body-lg text-on-surface-variant mb-lg leading-relaxed">
        {story.summary}
      </p>

      {/* Intelligence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-lg">
        {/* Why It Matters */}
        <div className="bg-surface-container-low border-2 border-primary-container p-md tactical-card">
          <div className="flex items-center gap-xs mb-sm">
            <span className="material-symbols-outlined text-[16px] text-primary">insights</span>
            <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Why It Matters</span>
          </div>
          <p className="font-body-md text-on-surface">{story.why_it_matters}</p>
        </div>

        {/* Escalation Context */}
        {story.escalation_context && (
          <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card">
            <div className="flex items-center gap-xs mb-sm">
              <span className="material-symbols-outlined text-[16px] text-error">trending_up</span>
              <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Escalation Context</span>
            </div>
            <p className="font-body-md text-on-surface">{story.escalation_context}</p>
          </div>
        )}
      </div>

      {/* Dissenting View */}
      {story.dissenting_view && (
        <div className="bg-surface-container border border-outline-variant p-md mb-lg">
          <div className="flex items-center gap-xs mb-sm">
            <span className="material-symbols-outlined text-[16px] text-tertiary">forum</span>
            <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Analyst Disagreement</span>
          </div>
          <p className="font-body-md text-on-surface-variant italic">{story.dissenting_view}</p>
        </div>
      )}

      {/* Entities */}
      {story.entities?.length > 0 && (
        <div className="mb-lg">
          <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-sm">Key Entities</span>
          <div className="flex flex-wrap gap-xs">
            {story.entities.map(entity => (
              <span key={entity} className="chip-category font-mono text-[11px] px-sm py-xs">
                <span className="material-symbols-outlined text-[12px] mr-1">person</span>
                {entity}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Full Context Extraction */}
      {story.url && (
        <div className="bg-surface-container border border-outline-variant p-md mb-lg">
          <div className="flex items-center justify-between mb-sm flex-wrap gap-sm">
            <div className="flex items-center gap-xs">
              <span className="material-symbols-outlined text-[16px] text-primary">plagiarism</span>
              <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Full Context Extraction</span>
            </div>
            {extractedText ? (
              <div className="flex flex-col sm:flex-row gap-sm">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(extractedText);
                    feedback.success();
                  }}
                  className="btn-ghost text-[10px] py-xs px-sm"
                  title="Copy context to clipboard"
                >
                  <span className="material-symbols-outlined text-[12px]">content_copy</span>
                  COPY FULL CONTEXT
                </button>
                <button
                  onClick={() => handleDeepDivePrepare(extractedText)}
                  disabled={optimizing}
                  className="btn-primary text-[10px] py-xs"
                >
                  {optimizing ? (
                     <><span className="material-symbols-outlined text-[14px] animate-spin">refresh</span> PROCESSING INTEL...</>
                  ) : (
                     <><span className="material-symbols-outlined text-[14px]">psychology</span> PREPARE FOR DEEPDIVE</>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  setExtracting(true);
                  feedback.tap();
                  try {
                    const res = await fetch(`/api/extract?url=${encodeURIComponent(story.url)}`, {
                      headers: {
                        'x-groq-key': getKey('groq') || '',
                        'x-ai-key': getKey('gemini') || '',
                      }
                    });
                    const data = await res.json();
                    if (data.text) {
                      setExtractedText(data.text);
                      feedback.success();
                    } else {
                      setExtractedText("Failed to extract context.");
                      feedback.warning();
                    }
                  } catch (e) {
                    setExtractedText("Failed to extract context due to network error.");
                    feedback.warning();
                  }
                  setExtracting(false);
                }}
                disabled={extracting}
                className="btn-primary text-[10px] py-xs"
              >
                {extracting ? (
                  <><span className="material-symbols-outlined text-[14px] animate-spin">refresh</span> Fetching...</>
                ) : (
                  <><span className="material-symbols-outlined text-[14px]">download</span> Fetch Full Context</>
                )}
              </button>
            )}
          </div>
          
          {extractedText && (
            <div className="bg-black border border-outline-variant p-md max-h-[400px] overflow-y-auto mt-sm shadow-inner font-mono">
              <div className="text-primary text-[10px] mb-xs uppercase tracking-[2px]">RAW SCRAPED INTEL</div>
              <p className="text-on-surface whitespace-pre-wrap text-[12px] leading-relaxed">{extractedText}</p>
            </div>
          )}
          {!extractedText && !extracting && (
            <p className="font-body-md text-on-surface-variant text-sm mt-md">
              Click to fetch and scrape the full text of the original article.
            </p>
          )}
        </div>
      )}

      {/* Section divider */}
      <div className="flex items-center gap-md mb-md">
        <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase">Related Briefs</span>
        <div className="flex-1 h-px bg-outline-variant" />
      </div>

      {/* Related stories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-lg">
        {relatedStories.map(s => (
          <div
            key={s.id}
            className="bg-surface-container-low border border-surface-container-highest p-md interactive-card cursor-pointer"
            onClick={() => { feedback.tap(); navigate(`/story/${s.id}`, { state: { story: s, allStories } }) }}
          >
            <span className="chip-category block w-fit mb-sm">{s.category}</span>
            <h4 className="font-headline-md text-on-surface text-sm leading-tight mb-xs">{s.headline}</h4>
            <p className="font-mono text-[11px] text-on-surface-variant line-clamp-2">{s.summary}</p>
          </div>
        ))}
      </div>

      {/* Chat CTA */}
      <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card flex items-center justify-between gap-md flex-wrap">
        <div>
          <p className="font-mono text-[11px] text-outline tracking-[1.5px] uppercase mb-xs">Deep Dive</p>
          <p className="font-body-md text-on-surface">Ask the AI analyst about this story</p>
        </div>
        <button
          onClick={() => { feedback.tap(); navigate('/chat', { state: { preload: `Tell me more about this intelligence report: "${story.headline}". Context: ${story.summary}` } }) }}
          className="btn-primary"
        >
          <span className="material-symbols-outlined text-[14px]">chat</span>
          Open Chat
        </button>
      </div>
    </div>
  )
}
