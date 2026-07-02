import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { useUserKeys } from '../hooks/useUserKeys'
import feedback from '../utils/feedback'
import NewsCard from '../components/NewsCard'

const CONFIDENCE_CLASSES = {
  HIGH:   'chip-verified',
  MEDIUM: 'bg-surface-container text-on-surface-variant font-mono text-[10px] px-2 py-1 border border-outline-variant tactical-chip-offset',
  LOW:    'chip-alert',
}

const CATEGORY_ICONS = {
  GEOPOLITICS: 'public',
  DEFENSE:     'security',
  TECH:        'computer',
  CYBER:       'shield',
  ENERGY:      'bolt',
  ECONOMY:     'account_balance',
  CRYPTO_MARKETS: 'currency_bitcoin',
  STOCK_MARKET: 'trending_up',
  SPACE:       'rocket',
}

export default function NewsFeedPage() {
  const [stories, setStories] = useState([])
  const [selectedCategories, setSelectedCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cacheInfo, setCacheInfo] = useState(null)
  const [page, setPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [optimizing, setOptimizing] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const { readerMode } = useTheme()
  const { getKey } = useUserKeys()
  const navigate = useNavigate()

  useEffect(() => {
    setPage(1)
    fetchFeed(true, 1)
  }, [selectedCategories])

  const handleRefresh = () => {
    feedback.tap()
    setPage(1)
    fetchFeed(true, 1)
  }

  async function fetchFeed(isRefresh = false, pageNumber = page) {
    if (pageNumber === 1) setLoading(true)
    else setIsLoadingMore(true)
    
    setError(null)
    try {
      const provider = getKey('newsProvider') || 'rss'
      const key = getKey('newsKey') || ''
      const config = getKey('newsConfig') || ''
      
      let headers = {}
      let endpoint = '/api/feed'

      if (isRefresh) {
        endpoint += `?refresh=true&t=${Date.now()}`
      }

      const activeCategory = selectedCategories.length > 0 ? selectedCategories[0] : ''
      console.log("FETCHING CATEGORY:", activeCategory)

      if (provider === 'master_agent') {
        const excludeHeadlines = pageNumber > 1 ? stories.map(s => s.headline).join('|||') : ''
        
        endpoint = `/api/master-feed?category=${encodeURIComponent(activeCategory)}&page=${pageNumber}`
        if (isRefresh) {
          endpoint += `&refresh=true&t=${Date.now()}`
        }
        headers = {
          'x-newsapi-key': getKey('news_newsapi') || '',
          'x-newsdata-key': getKey('news_newsdata') || '',
          'x-gnews-key': getKey('news_gnews') || '',
          'x-currents-key': getKey('news_currents') || '',
          'x-mediastack-key': getKey('news_mediastack') || '',
          'x-guardian-key': getKey('news_guardian') || '',
          'x-rss-config': getKey('news_rss') ? btoa(unescape(encodeURIComponent(JSON.stringify({ urls: getKey('news_rss').split(',').map(x => x.trim()).filter(Boolean) })))) : '',
          'x-custom-key': getKey('news_custom') || '',
          'x-groq-key': getKey('groq') || '',
          'x-exclude-headlines': excludeHeadlines
        }
      } else {
        // Non-master providers: always send category + page as query params
        // so /api/feed can filter results and paginate via DDG
        let sep = endpoint.includes('?') ? '&' : '?'
        if (activeCategory) {
          endpoint += `${sep}category=${encodeURIComponent(activeCategory)}`
          sep = '&'
        }
        if (pageNumber > 1) {
          endpoint += `${sep}page=${pageNumber}`
        }
        headers = {
          'x-news-provider': provider,
          'x-news-key': key || getKey(`news_${provider}`) || '',
          'x-groq-key': getKey('groq') || '',
          'x-ai-key': getKey('gemini') || '',
        }
        if (config) {
          headers['x-news-config'] = btoa(unescape(encodeURIComponent(config)))
        }
      }

      if (selectedCategories.length > 0) {
        headers['x-news-topics'] = selectedCategories.join(',')
      }

      const res = await fetch(endpoint, { headers })
      const data = await res.json()
      console.log("Feed API Response:", data)

      if (data.error === 'feed_unavailable') {
        setError({ type: 'unavailable', message: data.message })
      } else if (data.error === 'rate_limited') {
        setError({ type: 'busy', message: data.message })
      } else if (data.stories && Array.isArray(data.stories)) {
        if (pageNumber === 1) {
          setStories(data.stories)
        } else {
          setStories(prev => {
            // Basic deduplication on client side just in case (using URL or Headline since Groq IDs are random)
            const existingUrls = new Set(prev.map(s => s.url).filter(Boolean))
            const existingHeadlines = new Set(prev.map(s => s.headline))
            const newStories = data.stories.filter(s => 
              (!s.url || !existingUrls.has(s.url)) && 
              (!s.headline || !existingHeadlines.has(s.headline))
            )
            
            // If we got no new stories from the backend, we might be out of unique intel
            if (newStories.length === 0 && data.stories.length > 0) {
              console.warn("All fetched stories were duplicates of existing intel.")
            }
            
            return [...prev, ...newStories]
          })
        }
          setCacheInfo({
            cached: data.cached,
            cacheAgeMinutes: data.cache_age_minutes,
            stale: data.stale,
            source: data.source,
          })
        } else {
        setError({ type: 'error', message: data.message || 'Unexpected response from the intelligence feed.' })
      }
    } catch (err) {
      setError({ type: 'error', message: 'Could not connect to the intelligence feed. Check your connection.' })
    } finally {
      if (pageNumber === 1) setLoading(false)
      else setIsLoadingMore(false)
    }
  }

  const toggleCategory = (cat) => {
    feedback.tap()
    setSelectedCategories(prev => prev.includes(cat) ? [] : [cat])
  }

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

  // No need for client-side filtering if backend handles it
  const filteredStories = stories

  const featuredStory = filteredStories[0]
  const otherStories = filteredStories.slice(1)

  return (
    <div className="min-h-screen bg-background animate-fade-in relative">
      
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

      {/* Page Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm hidden md:flex items-center justify-between">
        <div className="flex items-center gap-md">
          <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Intelligence Feed</span>
          {cacheInfo && (
            <span className="font-mono text-[10px] text-outline tracking-[1px] opacity-60">
              {cacheInfo.cached
                ? `Cached ${cacheInfo.cacheAgeMinutes}m ago${cacheInfo.stale ? ' · STALE' : ''} (${cacheInfo.source})`
                : `Fresh · Just fetched (${cacheInfo.source})`}
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="btn-ghost text-[11px] py-xs"
        >
          <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
          Refresh Feed
        </button>
      </div>

      <div className="max-w-7xl mx-auto p-margin-mobile md:p-margin-desktop">
        {/* Loading state: Tactical Terminal */}
        {loading && (
          <div className="animate-fade-in flex flex-col items-center justify-center py-2xl">
            <span className="material-symbols-outlined text-[48px] text-primary animate-pulse mb-md block">cell_tower</span>
            <div className="font-mono text-[12px] text-primary tracking-[2px] uppercase animate-pulse text-center">
              POLLING GLOBAL SENSORS...<br/>
              ESTABLISHING SECURE CONNECTION...
            </div>
            <div className="mt-lg flex gap-sm">
              <div className="w-2 h-8 bg-primary opacity-20 skeleton-pulse delay-75"></div>
              <div className="w-2 h-12 bg-primary opacity-40 skeleton-pulse delay-150"></div>
              <div className="w-2 h-16 bg-primary opacity-80 skeleton-pulse delay-300"></div>
              <div className="w-2 h-12 bg-primary opacity-40 skeleton-pulse delay-150"></div>
              <div className="w-2 h-8 bg-primary opacity-20 skeleton-pulse delay-75"></div>
            </div>
          </div>
        )}

        {/* Error states */}
        {!loading && error && stories.length === 0 && (
          <div className="bg-surface-container-low border-2 border-error p-md md:p-lg tactical-card animate-fade-in max-w-2xl mx-auto mt-xl">
            <div className="flex flex-col sm:flex-row items-start gap-md">
              <span className={`material-symbols-outlined text-[32px] ${error.type === 'unavailable' ? 'text-outline' : 'text-error'}`}>
                {error.type === 'unavailable' ? 'cloud_off' : error.type === 'busy' ? 'hourglass_empty' : 'error'}
              </span>
              <div>
                <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">
                  {error.type === 'unavailable' ? 'Feed Unavailable'
                    : error.type === 'busy' ? 'Feed Temporarily Busy'
                    : 'Connection Error'}
                </p>
                <p className="font-body-md text-on-surface-variant mb-lg text-balance">{error.message}</p>
                <div className="flex flex-wrap gap-md">
                  <button onClick={handleRefresh} className="btn-primary text-[11px]">
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    Retry Connection
                  </button>
                  <button onClick={() => navigate('/settings')} className="btn-ghost text-[11px]">
                    <span className="material-symbols-outlined text-[14px]">settings</span>
                    Check Provider Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {!loading && stories.length > 0 && (
          <>
            {/* Featured Brief */}
            {featuredStory && (
              <section className="mb-lg">
                <div
                  className="bg-surface-container-low border-2 border-primary-container p-md md:p-lg tactical-card interactive-card relative overflow-hidden cursor-pointer"
                  onClick={() => { 
                    feedback.tap(); 
                    navigate(`/story/${encodeURIComponent(featuredStory.id)}`, { state: { story: featuredStory, allStories: stories } });
                  }}
                >
                  {/* Decorative accent */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-container opacity-10 rounded-bl-full pointer-events-none" />

                  <div className="flex justify-between items-start mb-md flex-wrap gap-sm">
                    <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase">Daily Intelligence Brief</span>
                    <span className={CONFIDENCE_CLASSES[featuredStory.confidence] || CONFIDENCE_CLASSES.MEDIUM}>
                      {featuredStory.confidence} CONFIDENCE
                    </span>
                  </div>

                  <h2 className="font-headline-lg-mobile md:font-headline-lg text-on-surface mb-sm pr-4 text-balance">
                    {featuredStory.headline}
                  </h2>
                  <p className={`font-body-md text-on-surface-variant mb-md max-w-3xl ${readerMode ? '' : 'line-clamp-3'}`}>
                    {featuredStory.summary.replace(/<[^>]+>/g, '')}
                  </p>

                  {/* Entities */}
                  {featuredStory.entities?.length > 0 && (
                    <div className="flex flex-wrap gap-xs mb-md">
                      {featuredStory.entities.map(entity => (
                        <span key={entity} className="chip-category font-mono text-[10px] px-2 py-1">
                          {entity}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Why it matters */}
                  {featuredStory.why_it_matters && (
                    <div className="bg-surface-container border border-outline-variant p-sm mb-md">
                      <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Why It Matters</span>
                      <p className="font-mono text-[12px] text-on-surface-variant">{featuredStory.why_it_matters}</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-sm">
                    <div className="flex items-center gap-sm">
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          navigate(`/story/${encodeURIComponent(featuredStory.id)}`, { state: { story: featuredStory }});
                        }} 
                        className="btn-primary text-[11px]"
                      >
                        <span>Deep Dive</span>
                        <span className="material-symbols-outlined text-[14px]">analytics</span>
                      </button>
                      {extractedText ? (
                        <div className="flex flex-col sm:flex-row gap-sm mt-sm">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(extractedText);
                              feedback.success();
                            }}
                            className="btn-ghost text-[11px]"
                            title="Copy context to clipboard"
                          >
                            <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            COPY FULL CONTEXT
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeepDivePrepare(extractedText);
                            }}
                            disabled={optimizing}
                            className="btn-primary text-[11px]"
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            setExtracting(true);
                            feedback.tap();
                            try {
                              const res = await fetch(`/api/extract?url=${encodeURIComponent(featuredStory.url)}`, {
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
                          className="btn-secondary text-[11px]"
                        >
                          {extracting ? (
                            <><span className="material-symbols-outlined text-[14px] animate-spin">refresh</span> EXTRACTING...</>
                          ) : (
                            <><span className="material-symbols-outlined text-[14px]">plagiarism</span> Full Brief</>
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
                  </div>
                </div>
              </section>
            )}

            {/* Section divider with Filter Chips */}
            <div className="mb-md">
              <div className="flex items-center gap-md mb-sm">
                <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Live Feed</span>
                <div className="flex-1 h-px bg-outline-variant" />
                <span className="font-mono text-[10px] text-outline opacity-60">
                  {filteredStories.length} REPORTS
                </span>
              </div>
              <div className="flex flex-wrap gap-sm">
                {Object.keys(CATEGORY_ICONS).map(cat => {
                  const isSelected = selectedCategories.includes(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`font-mono text-[10px] px-3 py-1.5 transition-all ${
                        isSelected 
                          ? 'bg-primary text-on-primary border border-primary font-bold shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.5)]' 
                          : 'bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container-high'
                      }`}
                      style={{ 
                        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)'
                      }}
                    >
                      <div className="flex items-center gap-xs">
                        <span className="material-symbols-outlined text-[14px]">{CATEGORY_ICONS[cat]}</span>
                        {cat.replace('_', ' ')}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Story Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
              {otherStories.map((story, idx) => (
                <NewsCard
                  key={story.id}
                  story={story}
                  allStories={stories}
                  readerMode={readerMode}
                  onClick={() => {
                    feedback.tap();
                    navigate(`/story/${encodeURIComponent(story.id)}`, { state: { story, allStories: stories } });
                  }}
                />
              ))}
            </div>
            
            {/* Load More Button */}
            {stories.length > 0 && (
              <div className="flex flex-col items-center mt-xl mb-lg gap-md">
                {error && (
                  <div className="bg-surface-container border border-error px-md py-sm tactical-card max-w-md w-full animate-fade-in">
                    <div className="flex items-center justify-between gap-sm">
                      <div className="flex items-center gap-xs font-mono text-[11px] text-error">
                        <span className="material-symbols-outlined text-[16px]">error</span>
                        <span>LOAD ERROR: {error.message}</span>
                      </div>
                      <button
                        onClick={() => {
                          feedback.tap();
                          fetchFeed(false, page);
                        }}
                        className="btn-ghost text-[10px] text-error hover:bg-error-container border-error py-xs px-xs"
                      >
                        RETRY
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    const nextPage = page + 1
                    setPage(nextPage)
                    fetchFeed(false, nextPage)
                  }}
                  disabled={isLoadingMore}
                  className="bg-surface-container-high border border-outline-variant hover:border-primary text-on-surface px-xl py-sm font-mono text-[12px] tracking-[2px] transition-all relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-primary opacity-0 group-hover:opacity-10 transition-opacity" />
                  {isLoadingMore ? (
                    <span className="flex items-center gap-sm">
                      <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                      DECRYPTING NEXT BATCH...
                    </span>
                  ) : (
                    <span className="flex items-center gap-sm">
                      <span className="material-symbols-outlined text-[16px]">add</span>
                      LOAD MORE INTEL
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && !error && stories.length === 0 && (
          <div className="locked-state max-w-2xl mx-auto mt-xl animate-fade-in">
            <span className="material-symbols-outlined text-[48px] text-outline mb-md block">satellite_alt</span>
            <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">No Signal Detected</p>
            <p className="font-body-md text-on-surface-variant max-w-md mx-auto mb-lg text-balance">
              Your intelligence feed is empty. This usually means you haven't configured a valid news provider, or the provider returned zero results.
            </p>
            <button onClick={() => navigate('/settings')} className="btn-primary">
              <span className="material-symbols-outlined text-[16px]">settings</span>
              Configure Provider
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
