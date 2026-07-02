import React, { useState } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import feedback from '../utils/feedback'
import PageMeta from '../components/PageMeta'
import StoryDetail from '../components/StoryDetail'

const CONFIDENCE_COLORS = {
  HIGH:   'text-secondary',
  MEDIUM: 'text-primary',
  LOW:    'text-error',
}

export default function StoryDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [extractedText, setExtractedText] = useState(null)
  const [extracting, setExtracting] = useState(false)

  const story = location.state?.story
  const allStories = location.state?.allStories || []

  if (!story) {
    return (
      <div className="min-h-screen bg-background p-margin-mobile md:p-margin-desktop animate-fade-in">
        <PageMeta title="Story Not Found" />
        {/* Back nav (consistent even in error) */}
        <div className="mb-md">
          <button onClick={() => { feedback.tap(); navigate(-1) }} className="btn-ghost text-[11px] py-xs">
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Intelligence Feed
          </button>
        </div>
        
        <div className="locked-state max-w-2xl mx-auto mt-xl">
          <span className="material-symbols-outlined text-[48px] text-outline mb-md block">article_shortcut</span>
          <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Story Not Found</p>
          <p className="font-body-md text-on-surface-variant max-w-md mx-auto mb-lg text-balance">
            The intelligence report you are looking for could not be found or has expired from the cache.
          </p>
          <button onClick={() => navigate('/')} className="btn-primary">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back to Feed
          </button>
        </div>
      </div>
    )
  }

  const relatedStories = allStories.filter(s => s.id !== story.id).slice(0, 2)

  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title={story.headline} description={story.summary} />
      {/* Back nav */}
      <div className="border-b-2 border-outline-variant px-margin-mobile md:px-margin-desktop py-sm bg-surface-container-low">
        <button
          onClick={() => { feedback.tap(); navigate(-1) }}
          className="btn-ghost text-[11px] py-xs"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Intelligence Feed
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-margin-mobile md:p-margin-desktop">
        <StoryDetail story={story} allStories={allStories} />
      </div>
    </div>
  )
}
