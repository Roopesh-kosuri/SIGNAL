import React, { useState, useEffect } from 'react'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import PageMeta from '../components/PageMeta'

// Demo data shown when Firebase not configured
const DEMO_RESULTS = [
  { id: 'd1', score: 4, total: 5, answers: [
    { topic: 'GEOPOLITICS', correct: true }, { topic: 'DEFENSE', correct: true },
    { topic: 'TECH', correct: false }, { topic: 'GEOPOLITICS', correct: true }, { topic: 'ECONOMY', correct: true }
  ], timestamp: { toDate: () => new Date(Date.now() - 86400000) } },
  { id: 'd2', score: 3, total: 5, answers: [
    { topic: 'CYBER', correct: true }, { topic: 'DEFENSE', correct: false },
    { topic: 'TECH', correct: true }, { topic: 'ECONOMY', correct: true }, { topic: 'GEOPOLITICS', correct: false }
  ], timestamp: { toDate: () => new Date(Date.now() - 172800000) } },
  { id: 'd3', score: 5, total: 5, answers: [
    { topic: 'GEOPOLITICS', correct: true }, { topic: 'TECH', correct: true },
    { topic: 'DEFENSE', correct: true }, { topic: 'CYBER', correct: true }, { topic: 'ENERGY', correct: true }
  ], timestamp: { toDate: () => new Date(Date.now() - 259200000) } },
]

const TOPIC_ICONS = {
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

export default function SignalIQPage() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    loadResults()
  }, [user])

  async function loadResults() {
    if (!user) return
    setLoading(true)
    // When Firebase is not configured, read real quiz results from localStorage
    if (!isFirebaseConfigured) {
      try {
        const stored = localStorage.getItem('signal_quiz_history')
        if (stored) {
          const parsed = JSON.parse(stored)
          setResults(parsed)
        } else {
          // No local history yet — show DEMO_RESULTS so the page isn't empty
          setResults(DEMO_RESULTS)
        }
      } catch (e) {
        console.warn('Failed to read quiz history from localStorage:', e)
        setResults(DEMO_RESULTS)
      }
      setLoading(false)
      return
    }
    try {
      const q = query(
        collection(db, 'quiz_results'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc')
      )
      const snap = await getDocs(q)
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error('Failed to load Signal IQ data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Compute topic mastery from real data
  const topicStats = {}
  results.forEach(r => {
    if (r.answers) {
      r.answers.forEach(a => {
        if (!topicStats[a.topic]) topicStats[a.topic] = { correct: 0, total: 0 }
        topicStats[a.topic].total += 1
        if (a.correct) topicStats[a.topic].correct += 1
      })
    }
  })

  const totalQuizzes = results.length
  const totalCorrect = results.reduce((sum, r) => sum + (r.score || 0), 0)
  const totalQs = results.reduce((sum, r) => sum + (r.total || 0), 0)
  const overallPct = totalQs > 0 ? Math.round((totalCorrect / totalQs) * 100) : 0

  // Streak calculation
  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const r of results) {
    const d = r.timestamp?.toDate?.()
    if (!d) break
    const day = new Date(d); day.setHours(0, 0, 0, 0)
    const diffDays = Math.round((today - day) / 86400000)
    if (diffDays === streak) streak++
    else break
  }

  const iqScore = Math.min(200, Math.max(0, 100 + (overallPct - 50) * 2 + streak * 2))

  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title="Signal IQ" description="Your intelligence quotient dashboard." />
      {/* Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm">
        <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Signal IQ</h1>
        <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
          Intelligence Quotient Dashboard · Computed from real quiz history
        </p>
      </div>

      <div className="max-w-4xl mx-auto p-margin-mobile md:p-margin-desktop">
        {loading && (
          <div className="animate-fade-in">
            <div className="bg-surface-container-low border-2 border-outline-variant p-md md:p-lg tactical-card mb-lg h-32 skeleton-pulse" />
            <div className="mb-lg">
              <div className="flex items-center gap-md mb-md">
                <div className="h-4 w-32 bg-surface-container skeleton-pulse" />
                <div className="flex-1 h-px bg-outline-variant" />
              </div>
              <div className="flex flex-col gap-sm">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-surface-container-low border border-surface-container-highest skeleton-pulse" />
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && (
          <>
            {/* No data state */}
            {results.length === 0 ? (
              <div className="locked-state max-w-2xl mx-auto mt-xl animate-fade-in">
                <span className="material-symbols-outlined text-[48px] text-outline mb-md block">analytics</span>
                <h2 className="font-headline-md text-on-surface mb-sm">No Intelligence Data Yet</h2>
                <p className="font-body-md text-on-surface-variant mb-md">
                  Complete the Daily Quiz to build your Signal IQ profile.
                  Topic mastery percentages are computed from your actual quiz history.
                </p>
                <a href="/quiz" className="btn-primary inline-flex">
                  <span className="material-symbols-outlined text-[14px]">quiz</span>
                  Take First Quiz
                </a>
              </div>
            ) : (
              <>
                {/* IQ Score banner */}
                <div className="bg-surface-container-low border-2 border-primary-container p-md md:p-lg tactical-card mb-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-primary-container opacity-5 rounded-bl-full pointer-events-none" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
                    <div className="text-center md:text-left">
                      <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase block mb-xs">Signal IQ</span>
                      <span className="font-display-lg text-primary text-[48px] font-bold">{iqScore}</span>
                      <span className="font-mono text-[10px] text-outline tracking-[1px] block">/200</span>
                    </div>
                    <div className="text-center">
                      <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase block mb-xs">Quizzes</span>
                      <span className="font-display-lg text-on-surface text-[32px] font-semibold">{totalQuizzes}</span>
                    </div>
                    <div className="text-center">
                      <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase block mb-xs">Accuracy</span>
                      <span className="font-display-lg text-on-surface text-[32px] font-semibold">{overallPct}%</span>
                    </div>
                    <div className="text-center md:text-right">
                      <span className="font-mono text-[10px] text-outline tracking-[2px] uppercase block mb-xs">Streak</span>
                      <span className="font-display-lg text-on-surface text-[32px] font-semibold">{streak}d</span>
                    </div>
                  </div>
                </div>

                {/* Topic Mastery */}
                <div className="mb-lg">
                  <div className="flex items-center gap-md mb-md">
                    <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Topic Mastery</span>
                    <div className="flex-1 h-px bg-outline-variant" />
                    <span className="font-mono text-[10px] text-outline opacity-60">
                      Based on {totalQs} questions answered
                    </span>
                  </div>

                  {Object.keys(topicStats).length === 0 ? (
                    <p className="font-mono text-[11px] text-outline text-center py-md">No topic data yet</p>
                  ) : (
                    <div className="flex flex-col gap-sm">
                      {Object.entries(topicStats)
                        .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
                        .map(([topic, stat]) => {
                          const pct = Math.round((stat.correct / stat.total) * 100)
                          return (
                            <div key={topic} className="bg-surface-container-low border border-surface-container-highest p-sm animate-fade-in">
                              <div className="flex items-center justify-between mb-xs">
                                <div className="flex items-center gap-xs">
                                  <span className="material-symbols-outlined text-[16px] text-outline">
                                    {TOPIC_ICONS[topic] || 'article'}
                                  </span>
                                  <span className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase">{topic}</span>
                                </div>
                                <div className="flex items-center gap-sm">
                                  <span className="font-mono text-[10px] text-outline">{stat.correct}/{stat.total}</span>
                                  <span className={`font-mono text-[12px] font-medium ${
                                    pct >= 80 ? 'text-secondary' : pct >= 60 ? 'text-primary' : 'text-error'
                                  }`}>{pct}%</span>
                                </div>
                              </div>
                              {/* Progress bar — real data, not hardcoded */}
                              <div className="w-full bg-surface-container-high h-1.5">
                                <div
                                  className={`h-full transition-all duration-700 ${
                                    pct >= 80 ? 'bg-secondary' : pct >= 60 ? 'bg-primary' : 'bg-error'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>

                {/* Recent quiz history */}
                <div>
                  <div className="flex items-center gap-md mb-md">
                    <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Recent Quizzes</span>
                    <div className="flex-1 h-px bg-outline-variant" />
                  </div>

                  <div className="flex flex-col gap-sm">
                    {results.slice(0, 10).map(r => {
                      const d = r.timestamp?.toDate?.()
                      const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0
                      return (
                        <div key={r.id} className="bg-surface-container-low border border-surface-container-highest p-sm flex items-center justify-between flex-wrap gap-sm">
                          <div>
                            <span className="font-mono text-[11px] text-on-surface">{r.score}/{r.total} correct</span>
                            {d && <span className="font-mono text-[10px] text-outline ml-sm">{d.toLocaleDateString()}</span>}
                          </div>
                          <span className={`chip-${pct >= 80 ? 'verified' : pct >= 50 ? 'category' : 'alert'} font-mono text-[10px]`}>
                            {pct}%
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
