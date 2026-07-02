import React, { useState, useEffect } from 'react'
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp } from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import LockedState from '../components/LockedState'
import PageMeta from '../components/PageMeta'
import { useUserKeys } from '../hooks/useUserKeys'
import { callGeminiQuiz, callWithFallback, formatApiError } from '../utils/aiClient'
import feedback from '../utils/feedback'

export default function QuizPage() {
  const [phase, setPhase] = useState('start') // 'start' | 'loading' | 'active' | 'done' | 'error'
  const [questions, setQuestions] = useState([])
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState([])
  const [selected, setSelected] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [feedStories, setFeedStories] = useState([])
  const { hasKey, getKey } = useUserKeys()
  const { user } = useAuth()

  // FIX 1: No longer hard-locked to Gemini
  const hasAnyKey = hasKey('gemini') || hasKey('groq') || hasKey('claude') || hasKey('openai') ||
                    hasKey('nvidia') || hasKey('kimi') || hasKey('deepseek') || hasKey('qwen')
  if (!hasAnyKey) {
    return <LockedState feature="Daily Quiz" keyName="Gemini" />
  }

  // Fetch feed stories on mount (for quiz context)
  useEffect(() => {
    fetch('/api/feed')
      .then(r => r.json())
      .then(data => {
        if (data.stories?.length) setFeedStories(data.stories)
      })
      .catch(() => {})
  }, [])

  async function startQuiz() {
    setPhase('loading')
    setError('')
    try {
      // Primary: Gemini quiz generation (structured output)
      if (hasKey('gemini')) {
        try {
          const apiKey = getKey('gemini')
          const qs = await callGeminiQuiz({ apiKey, feedStories })
          setQuestions(qs)
          setCurrentQ(0)
          setAnswers([])
          setSelected(null)
          setConfirmed(false)
          setPhase('active')
          return
        } catch (err) {
          if (err.message !== 'RATE_LIMITED' && err.message !== 'DEBOUNCED') throw err
          // Rate limited — fall through to fallback
        }
      }

      // FIX 1: Fallback — ask other models to generate quiz questions
      const storyContext = feedStories.slice(0, 5).map(s => `- ${s.headline}: ${s.summary}`).join('\n')
      const prompt = `Generate 5 intelligence quiz questions based on these current events:\n\n${storyContext || '(No live feed — use recent geopolitical and technology events)'}\n\n[Generation Timestamp: ${Date.now()}]\n\nReturn ONLY a JSON array (no markdown):\n[{"id":"q1","question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"3-5 sentence detailed explanation","topic":"GEOPOLITICS|DEFENSE|TECH|CYBER|ENERGY|ECONOMY|CRYPTO_MARKETS|STOCK_MARKET|SPACE","difficulty":"EASY|MEDIUM|HARD"}]`
      const fallbackResult = await callWithFallback({
        prompt,
        systemPrompt: 'You are an intelligence analyst creating quiz questions. Return only valid JSON arrays.',
        getKey, hasKey,
        primaryProvider: 'groq',
        grounded: false,
      })
      let raw = fallbackResult.text.trim()
      raw = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '')
      const arrMatch = raw.match(/\[\s*\{[\s\S]*\}\s*\]/)
      if (!arrMatch) throw new Error('Could not parse quiz from fallback model')
      const questions = JSON.parse(arrMatch[0])
      if (!Array.isArray(questions)) throw new Error('Invalid quiz response')
      setQuestions(questions.slice(0, 5).map((q, i) => ({
        id: String(q.id || `q${i+1}`),
        question: String(q.question || '').slice(0, 500),
        options: (q.options || []).slice(0, 4).map(o => String(o).slice(0, 200)),
        correct_index: Math.max(0, Math.min(3, parseInt(q.correct_index) || 0)),
        explanation: String(q.explanation || '').slice(0, 1500),
        topic: String(q.topic || 'GEOPOLITICS').slice(0, 20),
        difficulty: String(q.difficulty || 'MEDIUM').slice(0, 10),
      })))
      setCurrentQ(0)
      setAnswers([])
      setSelected(null)
      setConfirmed(false)
      setPhase('active')
    } catch (err) {
      const msg = formatApiError(err, 'Quiz')
      setError(msg || 'Failed to generate quiz.')
      setPhase('error')
      feedback.warning()
    }
  }

  function selectAnswer(idx) {
    if (confirmed) return
    setSelected(idx)
    feedback.tap()
  }

  function confirmAnswer() {
    if (selected === null || confirmed) return
    setConfirmed(true)
    const q = questions[currentQ]
    const isCorrect = selected === q.correct_index
    if (isCorrect) feedback.success()
    else feedback.warning()
    setAnswers(prev => [...prev, { questionId: q.id, topic: q.topic, correct: isCorrect, difficulty: q.difficulty }])
  }

  async function nextQuestion() {
    if (currentQ + 1 < questions.length) {
      setCurrentQ(q => q + 1)
      setSelected(null)
      setConfirmed(false)
    } else {
      // Done
      setPhase('done')
      const finalAnswers = [...answers, { questionId: questions[currentQ].id, topic: questions[currentQ].topic, correct: selected === questions[currentQ].correct_index, difficulty: questions[currentQ].difficulty }]
      const correctCount = finalAnswers.filter(a => a.correct).length

      // Always save to localStorage for Signal IQ (works without Firebase)
      try {
        const newResult = {
          id: `local_${Date.now()}`,
          score: correctCount,
          total: questions.length,
          answers: finalAnswers,
          topics: [...new Set(finalAnswers.map(a => a.topic))],
          timestamp: { toDate: () => new Date() },
          _ts: Date.now(),
        }
        const existing = JSON.parse(localStorage.getItem('signal_quiz_history') || '[]')
        existing.unshift(newResult)
        localStorage.setItem('signal_quiz_history', JSON.stringify(existing.slice(0, 50))) // keep last 50
      } catch (e) {
        console.warn('Failed to save quiz result to localStorage:', e)
      }

      // Also save to Firestore when Firebase is configured
      if (isFirebaseConfigured && user) {
        try {
          await addDoc(collection(db, 'quiz_results'), {
            userId: user.uid,
            timestamp: serverTimestamp(),
            score: correctCount,
            total: questions.length,
            answers: finalAnswers,
            topics: [...new Set(finalAnswers.map(a => a.topic))],
          })
        } catch (e) {
          console.warn('Failed to save quiz result to Firestore:', e)
        }
      }
    }
  }

  const q = questions[currentQ]
  const score = answers.filter(a => a.correct).length

  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title="Daily Quiz" description="Test your intelligence with daily geopolitical and tech questions." />
      {/* Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm">
        <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Daily Intelligence Quiz</h1>
        <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
          Assessment compiled from live feed telemetry · Decentralized verification active
        </p>
      </div>

      <div className="max-w-2xl mx-auto p-margin-mobile md:p-margin-desktop">
        {/* Start screen */}
        {phase === 'start' && (
          <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card text-center mt-lg animate-fade-in">
            <span className="material-symbols-outlined text-[48px] text-primary mb-md block">quiz</span>
            <h2 className="font-headline-md text-on-surface mb-sm">Ready for Today's Briefing?</h2>
            <p className="font-body-md text-on-surface-variant mb-md max-w-sm mx-auto">
              5 assessment targets compiled from today's active intelligence feed.
              {feedStories.length > 0 ? ` Based on ${feedStories.length} live stories.` : ' Connect to the news feed for best results.'}
            </p>
            <button id="start-quiz-btn" onClick={startQuiz} className="btn-primary justify-center">
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              Begin Quiz
            </button>
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="animate-fade-in max-w-2xl mx-auto mt-lg">
            <div className="flex items-center justify-center mb-md gap-sm text-center">
              <span className="material-symbols-outlined text-[16px] text-outline animate-spin">refresh</span>
              <p className="font-mono text-[11px] text-outline tracking-[2px] uppercase">Compiling assessment from live feed...</p>
            </div>
            <div className="flex items-center gap-md mb-md">
              <div className="h-3 w-24 bg-surface-container skeleton-pulse" />
              <div className="flex-1 bg-surface-container h-1 skeleton-pulse" />
              <div className="h-3 w-8 bg-surface-container skeleton-pulse" />
            </div>
            <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card mb-md h-32 skeleton-pulse" />
            <div className="flex flex-col gap-sm">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-surface-container-low border-2 border-outline-variant skeleton-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="bg-surface-container-low border-2 border-error p-md md:p-lg tactical-card text-center mt-lg animate-fade-in">
            <span className="material-symbols-outlined text-[32px] text-error mb-sm block">error</span>
            <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Briefing Failed</p>
            <p className="font-body-md text-on-surface-variant mb-md text-balance">{error}</p>
            <button onClick={startQuiz} className="btn-primary justify-center">
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Try Again
            </button>
          </div>
        )}

        {/* Active quiz */}
        {phase === 'active' && q && (
          <div className="animate-slide-up">
            {/* Progress */}
            <div className="flex items-center gap-md mb-md">
              <span className="font-mono text-[11px] text-outline tracking-[1px] uppercase">
                Question {currentQ + 1} of {questions.length}
              </span>
              <div className="flex-1 bg-surface-container-high h-1">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${((currentQ) / questions.length) * 100}%` }}
                />
              </div>
              <span className="font-mono text-[11px] text-outline">{score}/{answers.length}</span>
            </div>

            {/* Topic + difficulty chips */}
            <div className="flex gap-xs mb-md">
              <span className="chip-category">{q.topic}</span>
              <span className={`font-mono text-[10px] px-2 py-1 border ${
                q.difficulty === 'HARD' ? 'border-error text-error' :
                q.difficulty === 'MEDIUM' ? 'border-primary text-primary' :
                'border-secondary text-secondary'
              }`}>
                {q.difficulty}
              </span>
            </div>

            {/* Question */}
            <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card mb-md">
              <p className="font-headline-md text-on-surface leading-relaxed">{q.question}</p>
            </div>

            {/* Options */}
            <div className="flex flex-col gap-sm mb-md">
              {q.options.map((opt, idx) => {
                let borderStyle = 'border-outline-variant'
                let bgStyle = 'bg-surface-container-low'
                let textStyle = 'text-on-surface'

                if (confirmed) {
                  if (idx === q.correct_index) {
                    borderStyle = 'border-secondary-fixed'; bgStyle = 'bg-secondary-container'; textStyle = 'text-on-secondary-container'
                  } else if (idx === selected && idx !== q.correct_index) {
                    borderStyle = 'border-error'; bgStyle = 'bg-error-container'; textStyle = 'text-on-error-container'
                  }
                } else if (selected === idx) {
                  borderStyle = 'border-primary'; bgStyle = 'bg-surface-container'
                }

                return (
                  <button
                    key={idx}
                    id={`option-${idx}`}
                    onClick={() => selectAnswer(idx)}
                    disabled={confirmed}
                    className={`text-left p-sm border-2 ${borderStyle} ${bgStyle} ${textStyle} transition-all ${!confirmed ? 'hover:border-primary hover:bg-surface-container cursor-pointer' : 'cursor-default'} flex items-center gap-sm`}
                  >
                    <span className="font-mono text-[11px] text-outline tracking-[1px] flex-shrink-0">
                      {String.fromCharCode(65 + idx)}.
                    </span>
                    <span className="font-body-md text-sm">{opt}</span>
                    {confirmed && idx === q.correct_index && (
                      <span className="ml-auto material-symbols-outlined text-[16px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    )}
                    {confirmed && idx === selected && idx !== q.correct_index && (
                      <span className="ml-auto material-symbols-outlined text-[16px] text-error" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Explanation */}
            {confirmed && (
              <div className="bg-surface-container border border-outline-variant p-md mb-md animate-fade-in">
                <span className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Analyst Explanation</span>
                <p className="font-body-md text-on-surface-variant text-sm">{q.explanation}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-sm">
              {!confirmed ? (
                <button
                  id="confirm-answer-btn"
                  onClick={confirmAnswer}
                  disabled={selected === null}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[14px]">check</span>
                  Lock In Answer
                </button>
              ) : (
                <button
                  id="next-question-btn"
                  onClick={nextQuestion}
                  className="btn-primary"
                >
                  {currentQ + 1 < questions.length ? (
                    <><span className="material-symbols-outlined text-[14px]">arrow_forward</span>Next Question</>
                  ) : (
                    <><span className="material-symbols-outlined text-[14px]">done_all</span>See Results</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Done screen */}
        {phase === 'done' && (
          <div className="text-center animate-slide-up">
            <div className="bg-surface-container-low border-2 border-outline-variant p-lg tactical-card mb-md">
              <span className="material-symbols-outlined text-[48px] text-primary mb-md block" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
              <h2 className="font-headline-md text-on-surface mb-sm">Briefing Complete</h2>
              <div className="flex items-baseline justify-center gap-xs mb-md">
                <span className="font-display-lg text-primary text-[48px] font-bold">{score}</span>
                <span className="font-headline-md text-outline">/ {questions.length}</span>
              </div>
              <p className="font-mono text-[11px] text-outline tracking-[1px] uppercase mb-md">
                {score === questions.length ? 'Perfect Score — Elite Analyst'
                  : score >= 3 ? 'Strong Performance'
                  : score >= 2 ? 'Developing Proficiency'
                  : 'Keep Studying'}
              </p>
              <p className="font-mono text-[10px] text-outline tracking-[1px]">
                Results saved to your Signal IQ dashboard
              </p>
            </div>
            <div className="flex gap-sm justify-center flex-wrap">
              <button onClick={startQuiz} className="btn-primary">
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                New Quiz
              </button>
              <button onClick={() => window.location.href = '/iq'} className="btn-ghost">
                <span className="material-symbols-outlined text-[14px]">analytics</span>
                View Signal IQ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
