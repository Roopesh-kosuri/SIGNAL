import React from 'react'

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

export default function NewsCard({ story, allStories, readerMode, onClick }) {
  const categoryIcon = CATEGORY_ICONS[story.category] || 'article'
  const isAlert = story.confidence === 'LOW'
  const isVerified = story.confidence === 'HIGH'

  return (
    <article
      className="bg-surface-container-low border border-surface-container-highest p-md interactive-card flex flex-col h-full relative animate-fade-in"
      onClick={onClick}
    >
      {/* Category chip */}
      <div className="absolute top-md right-md chip-category">
        {story.category}
      </div>

      {/* Icon */}
      <span className="material-symbols-outlined text-[24px] text-outline mb-sm mt-xs">{categoryIcon}</span>

      <h3 className="font-headline-md text-on-surface mb-sm pr-12 text-balance">
        {story.headline}
      </h3>
      <p className={`font-body-md text-on-surface-variant mb-md flex-grow ${readerMode ? '' : 'line-clamp-2'} text-sm`}>
        {story.summary ? story.summary.replace(/<[^>]+>/g, '') : ''}
      </p>

      <div className="mt-auto">
        <div className="h-px bg-outline-variant w-full mb-sm" />
        <div className="flex justify-between items-end">
          <div>
            <span className="block font-mono text-[10px] text-outline tracking-[1px] uppercase mb-0.5">
              Sources: {story.source_count}
            </span>
            <span className="block font-mono text-[11px] text-on-surface-variant line-clamp-1 max-w-[160px]">
              {story.why_it_matters}
            </span>
          </div>
          <span className={isVerified ? 'chip-verified' : isAlert ? 'chip-alert' : 'chip-category'}>
            {isVerified ? 'VERIFIED' : isAlert ? 'ALERT' : 'MEDIUM'}
          </span>
        </div>
      </div>
    </article>
  )
}
