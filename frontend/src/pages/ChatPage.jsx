import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import LockedState from '../components/LockedState'
import PageMeta from '../components/PageMeta'
import { useUserKeys } from '../hooks/useUserKeys'
import { useTheme } from '../contexts/ThemeContext'
import { useVoice } from '../hooks/useVoice'
import {
  callGemini, callClaude, callOpenAI, callGroq,
  callNvidia, callKimi, callDeepSeek, callQwen,
  formatApiError
} from '../utils/aiClient'
import feedback from '../utils/feedback'

// FIX 3: All model providers including new ones
const MODELS = [
  { id: 'gemini',   label: 'GEMINI',   icon: 'memory',          provider: 'gemini',   keyName: 'Gemini',     supportsGrounded: true  },
  { id: 'claude',   label: 'CLAUDE',   icon: 'psychology',      provider: 'claude',   keyName: 'Claude',     supportsGrounded: false },
  { id: 'gpt',      label: 'GPT',      icon: 'smart_toy',       provider: 'openai',   keyName: 'OpenAI',     supportsGrounded: false },
  { id: 'groq',     label: 'GROQ',     icon: 'bolt',            provider: 'groq',     keyName: 'Groq',       supportsGrounded: false },
  { id: 'nvidia',   label: 'NVIDIA',   icon: 'developer_board', provider: 'nvidia',   keyName: 'NVIDIA NIM', supportsGrounded: false },
  { id: 'kimi',     label: 'KIMI',     icon: 'rocket_launch',   provider: 'kimi',     keyName: 'Kimi',       supportsGrounded: false },
  { id: 'deepseek', label: 'DEEPSEEK', icon: 'explore',         provider: 'deepseek', keyName: 'DeepSeek',   supportsGrounded: false },
  { id: 'qwen',     label: 'QWEN',     icon: 'hub',             provider: 'qwen',     keyName: 'Qwen',       supportsGrounded: false },
]

const SYSTEM_PROMPT = `You are SIGNAL's intelligence analyst AI. You provide geopolitical, defense, technology, space, crypto, and market intelligence analysis.
Communication style: precise, factual, analytical. Use well-structured multi-paragraph responses.
When you don't know something or it is beyond your training data cutoff, say so explicitly.
For Stock Market and Crypto/Markets, stay strictly informational and explanatory. NEVER provide financial, trading, or investment advice.
Never fabricate sources, statistics, or events.
Provide thorough, detailed answers — not just summaries. Each response should cover the full context, key actors, implications, and what analysts debate.`

export default function ChatPage() {
  const [model, setModel] = useState('gemini')
  const [grounded, setGrounded] = useState(true)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'SIGNAL Intelligence AI online. What would you like to analyze?', id: 'init' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const { getKey, hasKey } = useUserKeys()
  const { autoReadAloud, selectedVoiceURI } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  // Dynamic trending recommendation chips
  const [trendingChips, setTrendingChips] = useState([])
  useEffect(() => {
    async function fetchChips() {
      try {
        const groqKey = getKey('groq') || ''
        // Always bust cache so we get fresh trending topics, not 10-min stale chips
        const bust = Math.floor(Date.now() / 600000) // changes every 10 min
        const res = await fetch(`/api/trending-chips?bust=${bust}`, {
          headers: { 'x-groq-key': groqKey }
        })
        const data = await res.json()
        if (data.chips && Array.isArray(data.chips) && data.chips.length > 0) {
          setTrendingChips(data.chips)
        }
      } catch (e) {
        console.warn('Failed to fetch trending chips:', e)
      }
    }
    fetchChips()
  }, [])

  const selectedModel = MODELS.find(m => m.id === model)
  const hasCurrentKey = hasKey(selectedModel.provider)

  // ── Voice: handle real-time transcript filling input ─────────
  const handleTranscript = useCallback((text) => {
    setInput(text)
    // Auto-resize textarea as text fills in
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [])

  const {
    isSTTSupported, isListening, toggleListening, sttError,
    isTTSSupported, isSpeaking, speakingMsgId, speak, stopSpeaking,
    voices,
  } = useVoice({
    onTranscript: handleTranscript,
    selectedVoiceURI,
    autoRead: autoReadAloud,
  })

  // FIX 2: Only Gemini supports grounded search
  useEffect(() => {
    if (!selectedModel.supportsGrounded) setGrounded(false)
  }, [model, selectedModel.supportsGrounded])

  // Preload from navigation state (e.g. from story detail)
  useEffect(() => {
    if (location.state?.preload) setInput(location.state.preload)
  }, [location.state])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Stop voice when navigating away
  useEffect(() => {
    return () => stopSpeaking()
  }, [stopSpeaking])

  // ── Speak a message bubble ───────────────────────────────────
  function handleSpeakMessage(msg) {
    if (speakingMsgId === msg.id && isSpeaking) {
      stopSpeaking()
      feedback.tap()
    } else {
      speak(msg.content, msg.id)
      feedback.tap()
    }
  }

  // ── Send message ─────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return
    if (!hasCurrentKey) {
      setError(`Add your ${selectedModel.keyName} API key in Settings to chat with ${selectedModel.label}.`)
      return
    }

    // Stop listening if active — prevents it from capturing AI response
    if (isListening) toggleListening()

    const userMsg = { role: 'user', content: input.trim(), id: Date.now().toString() }
    const history = messages.filter(m => m.id !== 'init')

    setMessages(prev => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = '52px'
    setLoading(true)
    setError('')
    feedback.send?.() || feedback.tap()

    try {
      const apiKey = getKey(selectedModel.provider)
      let result

      if (model === 'gemini') {
        result = await callGemini({ apiKey, prompt: userMsg.content, history, grounded, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'claude') {
        result = await callClaude({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'gpt') {
        result = await callOpenAI({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'groq') {
        result = await callGroq({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'nvidia') {
        result = await callNvidia({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'kimi') {
        result = await callKimi({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'deepseek') {
        result = await callDeepSeek({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      } else if (model === 'qwen') {
        result = await callQwen({ apiKey, prompt: userMsg.content, history, systemPrompt: SYSTEM_PROMPT })
      }

      const msgId = (Date.now() + 1).toString()
      const aiMsg = {
        role: 'assistant',
        content: result.text,
        sources: result.sources || [],
        model: selectedModel.label,
        id: msgId,
      }
      setMessages(prev => [...prev, aiMsg])
      feedback.tap?.()

      // Auto-read aloud if enabled
      if (autoReadAloud && isTTSSupported) {
        speak(result.text, msgId)
      }

    } catch (err) {
      const errMsg = formatApiError(err, selectedModel.keyName)
      if (errMsg) setError(errMsg)
      feedback.warning?.()
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Mic button handler ───────────────────────────────────────
  function handleMicClick() {
    feedback.tap?.()
    setSttErrorDismissed(false)
    toggleListening()
  }

  const [sttErrorDismissed, setSttErrorDismissed] = useState(false)

  const now = new Date()
  const timeStr = `${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')}Z`

  return (
    <div className="flex flex-col h-screen md:h-[100dvh] bg-background page-enter">
      <PageMeta title="Deep Dive Chat" description="Ask the AI analyst about geopolitical, defense, and market intelligence." />

      {/* ── Header ────────────────────────────────────────────── */}
      <header className="bg-surface border-b-2 border-outline-variant px-margin-mobile md:px-margin-desktop py-md sticky top-0 z-30 ambient-shadow flex-shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
          <div>
            <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Chat with Intel AI</h1>
            <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
              Session only · History clears on refresh
            </p>
          </div>

          {/* Model switcher */}
          <div className="flex items-center gap-xs bg-surface-container-lowest p-xs border border-outline-variant flex-wrap">
            {MODELS.map(m => {
              const keyAvailable = hasKey(m.provider)
              return (
                <button
                  key={m.id}
                  onClick={() => { setModel(m.id); setError(''); feedback.tap?.() }}
                  disabled={!keyAvailable}
                  title={keyAvailable ? `Switch to ${m.label}` : `Add your ${m.keyName} key in Settings`}
                  className={
                    `tactical-card font-mono text-[11px] tracking-[1.5px] px-sm py-xs border border-outline-variant flex items-center gap-xs transition-colors ` +
                    (model === m.id
                      ? 'bg-primary-container text-on-primary-container'
                      : keyAvailable
                        ? 'bg-surface-container text-on-surface-variant hover:bg-surface-container-highest'
                        : 'bg-surface-container text-outline opacity-40 cursor-not-allowed')
                  }
                >
                  <span className="material-symbols-outlined text-[14px]">{m.icon}</span>
                  {m.label}
                  {!keyAvailable && <span className="material-symbols-outlined text-[12px]">lock</span>}
                </button>
              )
            })}
          </div>

          {/* Grounded toggle (Gemini only) / training-data note (others) */}
          {selectedModel.supportsGrounded ? (
            <div className="flex items-center gap-sm bg-surface-container-lowest px-sm py-xs border border-outline-variant">
              <span className="font-mono text-[10px] text-on-surface-variant tracking-[1px] uppercase">Reasoning</span>
              <button
                id="grounded-toggle"
                onClick={() => { setGrounded(g => !g); feedback.tap?.() }}
                className="settings-toggle bg-surface-container"
                aria-label={grounded ? 'Disable grounded search' : 'Enable grounded search'}
              >
                <span className={`settings-toggle-thumb ${grounded ? 'on' : 'off'}`} />
              </button>
              <span className={`font-mono text-[10px] tracking-[1px] uppercase ${grounded ? 'text-primary' : 'text-outline'}`}>
                {grounded ? 'Grounded' : 'Reasoning'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-xs bg-surface-container-lowest px-sm py-xs border border-outline-variant opacity-70">
              <span className="material-symbols-outlined text-[12px] text-outline">database</span>
              <span className="font-mono text-[10px] text-outline tracking-[1px] uppercase">
                {selectedModel.label} — Training data only
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Messages ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scroll p-margin-mobile md:p-margin-desktop flex flex-col gap-lg bg-surface-dim">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex flex-col gap-xs max-w-3xl animate-slide-up ${msg.role === 'user' ? 'self-end items-end' : 'self-start'}`}
          >
            {/* Label */}
            <div className={`flex items-center gap-xs text-on-surface-variant opacity-70 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <span className="material-symbols-outlined text-[14px]">{msg.role === 'user' ? 'person' : 'memory'}</span>
              <span className="font-mono text-[10px] tracking-[1px] uppercase">{msg.role === 'user' ? 'You' : (msg.model || 'INTEL AI')}</span>
              <span className="font-mono text-[10px] opacity-60">{timeStr}</span>
            </div>

            {/* Message bubble */}
            <div className={`tactical-card p-md border border-outline-variant ambient-shadow ${
              msg.role === 'user'
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-low text-on-surface'
            }`}>
              <p className="font-body-md text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>

              {/* Grounded search sources */}
              {msg.sources?.length > 0 && (
                <div className="mt-md pt-sm border-t border-outline-variant">
                  <span className="font-mono text-[10px] text-outline tracking-[1px] uppercase block mb-xs">Search Queries Used</span>
                  <div className="flex flex-wrap gap-xs">
                    {msg.sources.map((s, i) => (
                      <span key={i} className="font-mono text-[10px] bg-surface-container px-xs py-0.5 border border-outline-variant text-on-surface-variant">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* TTS speaker button — AI messages only */}
              {msg.role === 'assistant' && isTTSSupported && (
                <div className="mt-sm pt-sm border-t border-outline-variant flex items-center justify-end">
                  <button
                    onClick={() => handleSpeakMessage(msg)}
                    title={speakingMsgId === msg.id && isSpeaking ? 'Stop reading' : 'Read aloud'}
                    className={`flex items-center gap-xs font-mono text-[10px] tracking-[1px] uppercase px-xs py-0.5 border border-outline-variant transition-all
                      ${speakingMsgId === msg.id && isSpeaking
                        ? 'text-primary border-primary bg-surface-container'
                        : 'text-outline hover:text-on-surface hover:border-outline bg-transparent'
                      }`}
                  >
                    <span className={`material-symbols-outlined text-[14px] ${speakingMsgId === msg.id && isSpeaking ? 'voice-playing' : ''}`}>
                      {speakingMsgId === msg.id && isSpeaking ? 'stop_circle' : 'volume_up'}
                    </span>
                    {speakingMsgId === msg.id && isSpeaking ? 'Stop' : 'Listen'}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ── Empty State / Suggestions ── */}
        {messages.length === 1 && !loading && (
          <div className="flex flex-col items-center mt-xl max-w-2xl mx-auto text-center animate-fade-in">
            <span className="material-symbols-outlined text-[48px] text-outline mb-md">chat_bubble</span>
            <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Awaiting Query</p>
            <p className="font-body-md text-on-surface-variant mb-lg text-balance">
              The analyst is ready. Ask a question about recent geopolitical events, market shifts, or request a deep dive on a specific topic.
            </p>
            <div className="flex flex-wrap justify-center gap-sm">
              {(trendingChips.length > 0 ? trendingChips : ['Global security briefing', 'Market disruptions today', 'Emerging tech analysis']).map((chip, idx) => (
                <button 
                  key={idx}
                  onClick={() => {
                    // Set input and send in the same tick using functional update
                    setInput(chip)
                    // Use a small delay so React re-renders input before sendMessage reads it
                    setTimeout(() => {
                      if (textareaRef.current) {
                        // Manually trigger send with the chip text (bypass stale closure)
                        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
                        textareaRef.current.dispatchEvent(event)
                      }
                    }, 20)
                  }}
                  className="btn-ghost text-[10px]"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {loading && (
          <div className="flex flex-col gap-xs max-w-3xl self-start animate-fade-in">
            <div className="flex items-center gap-xs text-on-surface-variant opacity-70">
              <span className="material-symbols-outlined text-[14px]">memory</span>
              <span className="font-mono text-[10px] tracking-[1px] uppercase">Analyzing...</span>
            </div>
            <div className="tactical-card bg-surface-container-low p-md border border-outline-variant">
              <div className="flex gap-1">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-surface-container-low border-2 border-error p-md tactical-card self-center max-w-2xl w-full animate-fade-in mb-sm">
            <div className="flex items-start gap-md">
              <span className="material-symbols-outlined text-[32px] text-error">error</span>
              <div>
                <p className="font-mono text-[14px] text-on-surface tracking-[1.5px] uppercase mb-xs">Comms Failure</p>
                <p className="font-body-md text-on-surface-variant mb-md text-balance">{error}</p>
                <button onClick={() => navigate('/settings')} className="btn-ghost text-[11px]">
                  <span className="material-symbols-outlined text-[14px]">settings</span>
                  Check API Keys
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Voice status bar ───────────────────────────────────── */}
      {isListening && (
        <div className="bg-surface-container border-t border-outline-variant px-margin-mobile py-xs flex items-center gap-sm animate-fade-in flex-shrink-0">
          <span className="material-symbols-outlined text-[16px] mic-listening">mic</span>
          <span className="font-mono text-[10px] text-primary tracking-[1.5px] uppercase animate-pulse">
            Listening — speak now...
          </span>
          <button
            onClick={() => { toggleListening(); feedback.tap?.() }}
            className="ml-auto font-mono text-[10px] text-outline hover:text-on-surface uppercase tracking-[1px] transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* STT error bar */}
      {sttError && !sttErrorDismissed && (
        <div className="bg-error-container border-t border-error px-margin-mobile py-xs flex items-center gap-sm flex-shrink-0">
          <span className="material-symbols-outlined text-[14px] text-on-error-container">mic_off</span>
          <p className="font-mono text-[10px] text-on-error-container flex-1">{sttError}</p>
          <button onClick={() => setSttErrorDismissed(true)} className="font-mono text-[10px] text-on-error-container opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Input bar ─────────────────────────────────────────── */}
      <div className="bg-surface-container-high border-t-2 border-outline-variant p-margin-mobile md:p-margin-desktop pb-safe flex-shrink-0">
        {!hasCurrentKey && (
          <div className="bg-surface-container border border-outline-variant p-xs mb-sm flex items-center gap-xs">
            <span className="material-symbols-outlined text-[14px] text-outline">lock</span>
            <p className="font-mono text-[10px] text-outline tracking-[1px] flex-1">
              Add your {selectedModel.keyName} key in Settings to send messages
            </p>
          </div>
        )}

        <div className="flex items-center gap-sm max-w-4xl mx-auto">

          {/* Mic button — STT */}
          {isSTTSupported ? (
            <button
              id="voice-input-btn"
              onClick={handleMicClick}
              disabled={loading || !hasCurrentKey}
              title={isListening ? 'Stop listening' : 'Voice input'}
              className={`tactical-card flex-shrink-0 w-[52px] h-[52px] flex items-center justify-center border border-outline-variant transition-all
                ${isListening
                  ? 'bg-error-container border-error'
                  : 'bg-surface-container-lowest hover:bg-surface-container'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <span className={`material-symbols-outlined text-[20px] ${isListening ? 'mic-listening' : 'text-on-surface-variant'}`}>
                {isListening ? 'mic' : 'mic_none'}
              </span>
            </button>
          ) : (
            /* Hidden mic on unsupported browsers (Firefox etc.) */
            <div
              title="Voice input not supported in this browser — try Chrome or Edge"
              className="flex-shrink-0 w-[52px] h-[52px] flex items-center justify-center border border-outline-variant bg-surface-container-lowest opacity-30 cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[20px] text-outline">mic_off</span>
            </div>
          )}

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              id="chat-input"
              ref={textareaRef}
              value={input}
              onChange={e => {
                setInput(e.target.value.slice(0, 5000))
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={handleKeyDown}
              disabled={loading || !hasCurrentKey}
              rows={1}
              maxLength={5000}
              placeholder={
                isListening
                  ? 'Listening... speak now'
                  : hasCurrentKey
                    ? 'Enter query or press mic to speak... (Enter to send)'
                    : `Add ${selectedModel.keyName} key in Settings`
              }
              className={`tactical-input w-full border text-on-surface font-body-md text-body-md p-sm focus:outline-none resize-none min-h-[52px] max-h-40 overflow-y-auto transition-colors disabled:opacity-50
                ${isListening
                  ? 'bg-error-container bg-opacity-10 border-error'
                  : 'bg-surface-container-lowest border-outline-variant focus:border-primary'
                }`}
            />
          </div>

          {/* Send button */}
          <button
            id="send-btn"
            onClick={sendMessage}
            disabled={loading || !input.trim() || !hasCurrentKey}
            className="tactical-card bg-primary-container text-on-primary-container border border-outline-variant h-[52px] w-[52px] flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <span className="material-symbols-outlined">{loading ? 'hourglass_empty' : 'send'}</span>
          </button>
        </div>

        {/* Character count */}
        {input.length > 0 && (
          <p className="font-mono text-[9px] text-outline text-right mt-xs max-w-4xl mx-auto">
            {input.length}/5000
          </p>
        )}
      </div>
    </div>
  )
}
