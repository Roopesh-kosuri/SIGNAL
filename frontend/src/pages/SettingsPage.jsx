import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useUserKeys, validateApiKeyFormat } from '../hooks/useUserKeys'
import PageMeta from '../components/PageMeta'
import feedback from '../utils/feedback'

const ALL_KEYS_CONFIG = [
  // Chat Models
  { id: 'gemini', group: 'models', label: 'Primary Synthesis Key (Gemini)', placeholder: 'AIza...', description: 'Powers: Fact Checker, Interactive Chat, Daily Quiz, Foundations Library. Required for live search grounding.', docsUrl: 'https://aistudio.google.com/app/apikey', docsLabel: 'Get key at Google AI Studio' },
  { id: 'groq', group: 'models', label: 'Secondary Synthesis Key (Groq)', placeholder: 'gsk_...', description: 'Powers: Deep Dive Agent, Backup Analysis Channel, Backup news synthesis fallbacks.', docsUrl: 'https://console.groq.com/keys', docsLabel: 'Get free key at Groq Console' },
  { id: 'claude', group: 'models', label: 'Claude (Anthropic) Key', placeholder: 'sk-ant-...', description: 'Powers: Interactive Chat (Claude 3.5 model).', docsUrl: 'https://console.anthropic.com/settings/keys', docsLabel: 'Get key at Anthropic Console' },
  { id: 'openai', group: 'models', label: 'OpenAI Key', placeholder: 'sk-...', description: 'Powers: Interactive Chat (GPT-4 model).', docsUrl: 'https://platform.openai.com/api-keys', docsLabel: 'Get key at OpenAI Platform' },
  { id: 'nvidia', group: 'models', label: 'NVIDIA NIM Key', placeholder: 'nvapi-...', description: 'Powers: Interactive Chat (Llama 3.1 via NVIDIA NIM).', docsUrl: 'https://build.nvidia.com/nim', docsLabel: 'Get free key at NVIDIA NIM' },
  { id: 'kimi', group: 'models', label: 'Kimi (Moonshot) Key', placeholder: 'sk-...', description: 'Powers: Interactive Chat (Kimi model).', docsUrl: 'https://platform.moonshot.cn/console/api-keys', docsLabel: 'Get key at Moonshot Platform' },
  { id: 'deepseek', group: 'models', label: 'DeepSeek Key', placeholder: 'sk-...', description: 'Powers: Interactive Chat (DeepSeek model).', docsUrl: 'https://platform.deepseek.com/api_keys', docsLabel: 'Get key at DeepSeek Platform' },
  { id: 'qwen', group: 'models', label: 'Qwen Key', placeholder: 'sk-...', description: 'Powers: Interactive Chat (Qwen model).', docsUrl: 'https://dashscope.aliyuncs.com', docsLabel: 'Get key at Alibaba DashScope' },
  // Specialized
  { id: 'cesium', group: 'telemetry', label: 'Cesium ION Access Token', placeholder: 'ey...', description: 'Powers: Tactical Orbital Intelligence Engine. Required for 3D globe tracker rendering.', docsUrl: 'https://ion.cesium.com/tokens', docsLabel: 'Get token at Cesium ION' },
  // News Provider Keys
  { id: 'news_newsapi', group: 'feeds', label: 'NewsAPI.org Key', placeholder: 'API Key', description: 'Ingests global breaking feeds from NewsAPI.org.', docsUrl: 'https://newsapi.org', docsLabel: 'Get key at NewsAPI.org' },
  { id: 'news_newsdata', group: 'feeds', label: 'NewsData.io Key', placeholder: 'API Key', description: 'Ingests global breaking feeds from NewsData.io.', docsUrl: 'https://newsdata.io', docsLabel: 'Get key at NewsData.io' },
  { id: 'news_gnews', group: 'feeds', label: 'GNews.io Key', placeholder: 'API Key', description: 'Ingests international publication feeds from GNews.io.', docsUrl: 'https://gnews.io', docsLabel: 'Get key at GNews.io' },
  { id: 'news_currents', group: 'feeds', label: 'Currents Key', placeholder: 'API Key', description: 'Ingests real-time feeds from Currents API.', docsUrl: 'https://currentsapi.services', docsLabel: 'Get key at Currents API' },
  { id: 'news_mediastack', group: 'feeds', label: 'Mediastack Key', placeholder: 'API Key', description: 'Ingests global syndication feeds from Mediastack.', docsUrl: 'https://mediastack.com', docsLabel: 'Get key at Mediastack' },
  { id: 'news_guardian', group: 'feeds', label: 'The Guardian Key', placeholder: 'API Key', description: 'Ingests article feeds from The Guardian Open Platform.', docsUrl: 'https://open-platform.theguardian.com', docsLabel: 'Get key at The Guardian' },
  { id: 'news_rss', group: 'feeds', label: 'Public RSS Feed URLs', placeholder: 'Optional Feed URLs (comma separated)', description: 'Ingests custom public RSS syndication feeds.', docsUrl: '', docsLabel: '' },
  { id: 'news_custom', group: 'feeds', label: 'Custom News Website URL', placeholder: 'https://www.bbc.com/news', description: 'Scrapes live headlines directly from any news website URL (e.g. BBC News).', docsUrl: '', docsLabel: '' }
]

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const { theme, changeTheme, readerMode, toggleReaderMode, soundEnabled, toggleSound,
          autoReadAloud, toggleAutoReadAloud, selectedVoiceURI, changeVoiceURI } = useTheme()

  // Voice: get available voices for the picker
  const [availableVoices, setAvailableVoices] = React.useState([])
  const isTTSSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  React.useEffect(() => {
    if (!isTTSSupported) return
    const load = () => setAvailableVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.onvoiceschanged = load
  }, [isTTSSupported])
  
  const { getKey, setKey, hasKey } = useUserKeys()
  const navigate = useNavigate()

  const [activeSettingsTab, setActiveSettingsTab] = useState('models')
  const [expandedKeyId, setExpandedKeyId] = useState('gemini')

  const [customUrls, setCustomUrls] = useState(() => {
    const stored = getKey('news_custom') || ''
    if (stored) {
      const split = stored.split(',').map(x => x.trim()).filter(Boolean)
      if (split.length > 0) return split
    }
    return ['']
  })

  function saveCustomUrls() {
    const valid = customUrls.map(x => x.trim()).filter(x => x.startsWith('http://') || x.startsWith('https://'))
    if (valid.length === 0) {
      setKey('news_custom', '')
      setKey('newsConfig', '')
      setKeyInputs(prev => ({ ...prev, news_custom: '' }))
      setCustomUrls([''])
    } else {
      const valStr = valid.join(',')
      setKey('news_custom', valStr)
      setKey('newsConfig', JSON.stringify({ endpoints: valid }))
      setKeyInputs(prev => ({ ...prev, news_custom: valStr }))
      setCustomUrls(valid)
    }
    setSaved(prev => ({ ...prev, news_custom: true }))
    feedback.success()
    setTimeout(() => setSaved(prev => ({ ...prev, news_custom: false })), 2000)
  }

  function clearCustomUrls() {
    setKey('news_custom', '')
    setKey('newsConfig', '')
    setKeyInputs(prev => ({ ...prev, news_custom: '' }))
    setCustomUrls([''])
    feedback.tap()
  }

  const [keyInputs, setKeyInputs] = useState(() => {
    const init = {}
    ALL_KEYS_CONFIG.forEach(k => { init[k.id] = getKey(k.id) })
    return init
  })
  
  const [newsProviderId, setNewsProviderId] = useState(() => getKey('newsProvider') || 'rss')
  
  const [saved, setSaved] = useState({})
  const [showKeys, setShowKeys] = useState({})

  function saveKey(id) {
    const val = keyInputs[id]?.trim() || ''
    setKey(id, val)
    
    // Auto-generate newsConfig for custom provider URL
    if (id === 'news_custom') {
      if (val.startsWith('http://') || val.startsWith('https://')) {
        const configObj = { endpoint: val }
        setKey('newsConfig', JSON.stringify(configObj))
      } else {
        setKey('newsConfig', '')
      }
    }
    
    // Auto-generate newsConfig for RSS feeds list
    if (id === 'news_rss') {
      const urls = val.split(',').map(x => x.trim()).filter(Boolean)
      if (urls.length > 0) {
        const configObj = { urls }
        setKey('newsConfig', JSON.stringify(configObj))
      } else {
        setKey('newsConfig', '')
      }
    }
    
    setSaved(prev => ({ ...prev, [id]: true }))
    feedback.success()
    setTimeout(() => setSaved(prev => ({ ...prev, [id]: false })), 2000)
  }

  function clearKey(id) {
    setKey(id, '')
    setKeyInputs(prev => ({ ...prev, [id]: '' }))
    if (id === 'news_custom' || id === 'news_rss') {
      setKey('newsConfig', '')
    }
    feedback.tap()
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background page-enter">
      <PageMeta title="Settings | SIGNAL" description="Configure your API keys, theme, and application preferences." />
      {/* Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm">
        <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold">Settings</h1>
        <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
          {user?.email}
        </p>
      </div>

      <div className="max-w-2xl mx-auto p-margin-mobile md:p-margin-desktop">

        {/* ── API Keys & Ingestion ──────────────────────────────────── */}
        <section className="mb-lg">
          <SectionHeader title="Ingestion Channels & Security Keys" subtitle="Isolated sandbox · Stored locally" />

          <div className="bg-surface-container border border-outline-variant p-sm mb-md">
            <div className="flex items-start gap-xs">
              <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">shield</span>
              <p className="font-mono text-[10px] text-on-surface-variant tracking-[0.5px] leading-relaxed">
                Your credentials remain isolated inside this workstation's browser sandbox.
                No private credentials are ever transmitted to external servers.
              </p>
            </div>
          </div>

          {/* Active Ingestion Source Selector */}
          <div className="bg-surface-container-low border border-outline-variant p-md mb-md tactical-card">
            <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block mb-sm">Active Ingestion Source</label>
            <select
              value={newsProviderId}
              onChange={e => {
                const val = e.target.value
                setNewsProviderId(val)
                setKey('newsProvider', val)
                feedback.tap()
              }}
              className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[12px] p-sm focus:outline-none focus:border-primary transition-colors"
            >
              <option value="master_agent">⭐ Master Agent Mode (Aggregates all active sources + smart deduplication)</option>
              <option value="rss">Public RSS Feeds</option>
              <option value="custom">Custom News Website URL</option>
              <option value="newsapi">NewsAPI.org</option>
              <option value="newsdata">NewsData.io</option>
              <option value="gnews">GNews.io</option>
              <option value="currents">Currents API</option>
              <option value="mediastack">Mediastack</option>
              <option value="guardian">The Guardian</option>
            </select>
          </div>

          {/* Tabbed Credential Accordion Manager */}
          <div className="mb-sm">
            {/* Tab selection bar */}
            <div className="flex border-b border-outline-variant mb-md gap-xs">
              {[
                { id: 'models', label: 'Models', icon: 'psychology' },
                { id: 'feeds', label: 'Feeds', icon: 'rss_feed' },
                { id: 'telemetry', label: 'Telemetry', icon: 'satellite_alt' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => { setActiveSettingsTab(t.id); feedback.tap() }}
                  className={`flex-1 py-sm font-mono text-[10px] tracking-[1px] uppercase transition-all flex items-center justify-center gap-xs border-b-2 -mb-[2px] ` +
                    (activeSettingsTab === t.id 
                      ? 'text-primary border-primary bg-surface-container-low' 
                      : 'text-on-surface-variant border-transparent hover:text-on-surface hover:bg-surface-container/30')}
                >
                  <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Accordion container */}
            <div className="flex flex-col gap-xs">
              {ALL_KEYS_CONFIG.filter(cfg => cfg.group === activeSettingsTab).map(cfg => {
                const isSet = hasKey(cfg.id)
                const isExpanded = expandedKeyId === cfg.id
                const currentVal = keyInputs[cfg.id] || ''
                const isValid = currentVal ? validateApiKeyFormat(currentVal, cfg.id) : null
                const isSaved = saved[cfg.id]

                return (
                  <div 
                    key={cfg.id}
                    className={`bg-surface-container-low border transition-all ` + 
                      (isExpanded ? 'border-primary' : 'border-outline-variant hover:border-outline') + 
                      ' rounded-sm'}
                  >
                    {/* Header Row */}
                    <div 
                      onClick={() => { setExpandedKeyId(isExpanded ? null : cfg.id); feedback.tap() }}
                      className="p-md flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-sm">
                        <span className={`w-2 h-2 rounded-full ` + (isSet ? 'bg-secondary animate-pulse' : 'bg-outline-variant/60')} />
                        <span className="font-mono text-[11px] text-on-surface tracking-[0.5px] uppercase font-bold">{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-sm">
                        <span className="font-mono text-[9px] text-outline">
                          {isSet ? 'ACTIVE' : 'NOT CONFIGURED'}
                        </span>
                        <span className="material-symbols-outlined text-[16px] text-outline">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </div>
                    </div>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="px-md pb-md pt-xs border-t border-outline-variant/30 animate-fade-in bg-surface-container-lowest/30">
                        <p className="font-mono text-[10px] text-outline tracking-[0.5px] mb-sm leading-relaxed">
                          {cfg.description}
                        </p>

                        {cfg.id === 'news_custom' ? (
                          <div className="flex flex-col gap-sm">
                            {customUrls.map((url, idx) => (
                              <div key={idx} className="flex gap-xs items-center animate-fade-in">
                                <input
                                  type="text"
                                  value={url}
                                  onChange={e => {
                                    const updated = [...customUrls]
                                    updated[idx] = e.target.value.slice(0, 200)
                                    setCustomUrls(updated)
                                  }}
                                  placeholder="https://www.bbc.com/news"
                                  className="tactical-input flex-1 bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[12px] p-sm focus:outline-none focus:border-primary transition-colors"
                                />
                                {customUrls.length > 1 && (
                                  <button
                                    onClick={() => {
                                      const updated = customUrls.filter((_, i) => i !== idx)
                                      setCustomUrls(updated)
                                      feedback.tap()
                                    }}
                                    className="btn-ghost text-error border-error py-sm px-xs"
                                    title="Remove URL"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                setCustomUrls([...customUrls, ''])
                                feedback.tap()
                              }}
                              className="btn-ghost self-start py-xs px-sm text-[10px]"
                            >
                              <span className="material-symbols-outlined text-[12px]">add</span>
                              Add News Website URL
                            </button>
                            <div className="flex gap-xs mt-xs">
                              <button
                                onClick={() => saveCustomUrls()}
                                className={`btn-primary text-[11px] py-sm ${saved['news_custom'] ? 'bg-secondary-container text-on-secondary-container' : ''}`}
                              >
                                {saved['news_custom']
                                  ? <><span className="material-symbols-outlined text-[14px]">check</span>Saved</>
                                  : <><span className="material-symbols-outlined text-[14px]">save</span>Save Config</>
                                }
                              </button>
                              {isSet && (
                                <button onClick={() => clearCustomUrls()} className="btn-ghost text-[11px] py-sm text-error border-error">
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                  Clear All
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-xs items-center">
                              <div className="flex-1 relative">
                                <input
                                  id={`${cfg.id}-key-input`}
                                  type={showKeys[cfg.id] ? 'text' : 'password'}
                                  value={currentVal}
                                  onChange={e => setKeyInputs(prev => ({ ...prev, [cfg.id]: e.target.value.slice(0, 500) }))}
                                  maxLength={500}
                                  placeholder={cfg.placeholder}
                                  className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[12px] p-sm pr-8 focus:outline-none focus:border-primary transition-colors"
                                />
                                <button
                                  onClick={() => setShowKeys(prev => ({ ...prev, [cfg.id]: !prev[cfg.id] }))}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    {showKeys[cfg.id] ? 'visibility_off' : 'visibility'}
                                  </span>
                                </button>
                              </div>
                              <button
                                id={`save-${cfg.id}-key`}
                                onClick={() => saveKey(cfg.id)}
                                className={`btn-primary text-[11px] py-sm ${isSaved ? 'bg-secondary-container text-on-secondary-container' : ''}`}
                              >
                                {isSaved
                                  ? <><span className="material-symbols-outlined text-[14px]">check</span>Saved</>
                                  : <><span className="material-symbols-outlined text-[14px]">save</span>Save</>
                                }
                              </button>
                              {isSet && (
                                <button onClick={() => clearKey(cfg.id)} className="btn-ghost text-[11px] py-sm text-error border-error">
                                  <span className="material-symbols-outlined text-[14px]">delete</span>
                                </button>
                              )}
                            </div>

                            {currentVal && isValid === false && (
                              <p className="font-mono text-[10px] text-error mt-xs">Key format validation failed.</p>
                            )}
                          </>
                        )}

                        {cfg.docsUrl && (
                          <div className="mt-sm flex justify-end">
                            <a
                              href={cfg.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[9px] text-primary tracking-[0.5px] hover:underline flex items-center gap-xs"
                            >
                              <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                              {cfg.docsLabel}
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Theme ─────────────────────────────────────────────────── */}
        <section className="mb-lg">
          <SectionHeader title="Appearance" />

          <div className="bg-surface-container-low border border-outline-variant p-md tactical-card mb-sm">
            <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block mb-sm">Theme</label>
            {/* FIX A + FIX B: 4 theme options — Dark, Light, Crimson, System */}
            <div className="grid grid-cols-4 gap-xs">
              {[
                ['dark',   'Dark',   'dark_mode',   'Warm near-black'],
                ['light',  'Light',  'light_mode',  'Warm cream'],
                ['crimson','Crimson','water_drop',  'Black & Red'],
                ['system', 'System', 'devices',     'Follows OS'],
              ].map(([val, label, icon, hint]) => (
                <button
                  key={val}
                  id={`theme-${val}`}
                  onClick={() => { changeTheme(val); feedback.tap() }}
                  className={`flex flex-col items-center gap-xs py-sm px-xs border-2 transition-all font-mono text-[10px] tracking-[1px] uppercase interactive-card ` +
                    (theme === val
                      ? 'bg-primary-container text-on-primary-container border-primary'
                      : 'bg-surface-container text-on-surface-variant border-outline-variant hover:border-outline hover:text-on-surface'
                    )}
                >
                  <span className="material-symbols-outlined text-[22px]">{icon}</span>
                  <span>{label}</span>
                  <span className="text-[9px] opacity-60 normal-case tracking-normal">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reader / Analyst mode */}
          <div className="bg-surface-container-low border border-outline-variant p-md tactical-card mb-sm flex items-center justify-between">
            <div>
              <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block">Reader Mode</label>
              <p className="font-mono text-[10px] text-outline tracking-[0.5px] mt-xs">
                {readerMode ? 'Full text shown on feed cards' : 'Feed cards truncated (Analyst mode)'}
              </p>
            </div>
            <button
              id="reader-mode-toggle"
              onClick={() => { toggleReaderMode(); feedback.tap() }}
              className="settings-toggle bg-surface-container"
            >
              <span className={`settings-toggle-thumb ${readerMode ? 'on' : 'off'}`} />
            </button>
          </div>

          {/* Sound & Haptics */}
          <div className="bg-surface-container-low border border-outline-variant p-md tactical-card flex items-center justify-between">
            <div>
              <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block">Sound &amp; Haptics</label>
              <p className="font-mono text-[10px] text-outline tracking-[0.5px] mt-xs">
                Subtle UI sounds and haptic feedback
              </p>
            </div>
            <button
              id="sound-toggle"
              onClick={() => { toggleSound(); feedback.tap() }}
              className="settings-toggle bg-surface-container"
            >
              <span className={`settings-toggle-thumb ${soundEnabled ? 'on' : 'off'}`} />
            </button>
          </div>
        </section>

        {/* ── Voice ──────────────────────────────────────────────────── */}
        {isTTSSupported && (
          <section className="mb-lg">
            <SectionHeader title="Voice" subtitle="Browser Web Speech API · No API key needed" />

            <div className="bg-surface-container border border-outline-variant p-sm mb-sm">
              <div className="flex items-start gap-xs">
                <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
                <p className="font-mono text-[10px] text-outline tracking-[0.5px] leading-relaxed">
                  Voice uses your browser's built-in speech engine — not a premium AI voice.
                  Quality varies by browser and OS. Best in Chrome/Edge.
                  Firefox supports text-to-speech but not voice input.
                </p>
              </div>
            </div>

            {/* Auto-read toggle */}
            <div className="bg-surface-container-low border border-outline-variant p-md tactical-card flex items-center justify-between mb-sm">
              <div>
                <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block">Auto-Read AI Responses</label>
                <p className="font-mono text-[10px] text-outline tracking-[0.5px] mt-xs">
                  {autoReadAloud ? 'Every new AI response is read aloud automatically' : 'Tap the Listen button on any response to hear it'}
                </p>
              </div>
              <button
                id="autoread-toggle"
                onClick={() => { toggleAutoReadAloud(); feedback.tap() }}
                className="settings-toggle bg-surface-container"
              >
                <span className={`settings-toggle-thumb ${autoReadAloud ? 'on' : 'off'}`} />
              </button>
            </div>

            {/* Voice picker — only shown when >1 voice available */}
            {availableVoices.length > 1 && (
              <div className="bg-surface-container-low border border-outline-variant p-md tactical-card">
                <div className="flex items-center justify-between mb-sm">
                  <label className="font-mono text-[11px] text-on-surface tracking-[1px] uppercase block">Voice</label>
                  <button
                    onClick={() => {
                      if (!selectedVoiceURI) return
                      const u = new SpeechSynthesisUtterance("SIGNAL Intelligence AI online. Voice systems nominal.")
                      const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI)
                      if (voice) u.voice = voice
                      window.speechSynthesis.speak(u)
                      feedback.tap()
                    }}
                    className="btn-ghost text-[10px] py-0 px-sm"
                  >
                    <span className="material-symbols-outlined text-[12px]">play_arrow</span>
                    Preview
                  </button>
                </div>
                <select
                  id="voice-picker"
                  value={selectedVoiceURI}
                  onChange={e => { changeVoiceURI(e.target.value); feedback.tap() }}
                  className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-mono text-[12px] p-sm focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Default voice</option>
                  {availableVoices
                    .filter(v => v.lang.startsWith('en'))
                    .map(v => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))
                  }
                </select>
                <p className="font-mono text-[10px] text-outline mt-xs">
                  Showing English voices only · {availableVoices.length} total available
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Account ─────────────────────────────────────────────── */}
        <section className="mb-lg">
          <SectionHeader title="Account" />
          <div className="bg-surface-container-low border border-outline-variant p-md tactical-card">
            <p className="font-mono text-[11px] text-on-surface tracking-[1px] mb-xs">{user?.email}</p>
            <p className="font-mono text-[10px] text-outline mb-md">UID: {user?.uid?.slice(0, 12)}...</p>
            <button
              id="signout-btn"
              onClick={handleLogout}
              className="btn-ghost border-error text-error text-[11px]"
            >
              <span className="material-symbols-outlined text-[14px]">logout</span>
              Sign Out
            </button>
          </div>
        </section>

        {/* ── About ─────────────────────────────────────────────────── */}
        <section>
          <SectionHeader title="About" />
          <div className="bg-surface-container-low border border-outline-variant p-md tactical-card">
            <p className="font-display-lg text-primary text-[24px] font-semibold mb-xs">SIGNAL</p>
            <p className="font-mono text-[10px] text-outline tracking-[2px] uppercase mb-md">Intelligence Platform v1.0.0</p>
            <p className="font-body-md text-on-surface-variant text-sm mb-md">
              "Other apps tell you what happened. SIGNAL tells you what it means, who disagrees, and why."
            </p>
            <div className="flex flex-wrap gap-xs">
              <span className="chip-category">React + Vite</span>
              <span className="chip-category">FastAPI</span>
              <span className="chip-category">Firebase</span>
              <span className="chip-category">Gemini 2.0 Flash</span>
              <span className="chip-category">PWA</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-center gap-md mb-md mt-lg first:mt-0">
      <span className="font-mono text-[11px] text-outline tracking-[2px] uppercase whitespace-nowrap">{title}</span>
      <div className="flex-1 h-px bg-outline-variant" />
      {subtitle && <span className="font-mono text-[10px] text-outline opacity-60 whitespace-nowrap">{subtitle}</span>}
    </div>
  )
}
