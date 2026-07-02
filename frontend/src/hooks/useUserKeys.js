/**
 * SIGNAL — BYOK (Bring Your Own Key) Hook
 * ==========================================
 * All user API keys are stored in localStorage ONLY.
 * They are NEVER sent to or stored on the SIGNAL backend.
 * The backend only holds BACKEND_NEWS_GEMINI_KEY for the news feed.
 *
 *
 * FIX 3: Added nvidia, kimi, deepseek, qwen provider keys.
 * Step 1: Added newsProvider, newsKey, newsConfig for BYOK News.
 */

import { useState, useCallback } from 'react'

const KEYS = {
  gemini:   'signal_user_gemini_key',
  groq:     'signal_user_groq_key',
  claude:   'signal_user_claude_key',
  openai:   'signal_user_openai_key',
  // FIX 3: New model providers
  nvidia:   'signal_user_nvidia_key',
  kimi:     'signal_user_kimi_key',
  deepseek: 'signal_user_deepseek_key',
  qwen:     'signal_user_qwen_key',
  // Cesium ION token for Orbital Engine
  cesium:   'signal_user_cesium_key',
  
  // BYOK News
  newsProvider: 'signal_news_provider',
  newsKey:      'signal_news_key',
  newsConfig:   'signal_news_config',
}

export function useUserKeys() {
  const [, forceUpdate] = useState(0)

  const getKey = useCallback((provider) => {
    return localStorage.getItem(KEYS[provider]) || ''
  }, [])

  const setKey = useCallback((provider, value) => {
    if (value) {
      localStorage.setItem(KEYS[provider], value.trim())
    } else {
      localStorage.removeItem(KEYS[provider])
    }
    forceUpdate(n => n + 1)
  }, [])

  const hasKey = useCallback((provider) => {
    return Boolean(localStorage.getItem(KEYS[provider]))
  }, [])

  const clearKey = useCallback((provider) => {
    localStorage.removeItem(KEYS[provider])
    forceUpdate(n => n + 1)
  }, [])

  return { getKey, setKey, hasKey, clearKey }
}

/**
 * Validates input for ReDoS safety.
 * All user input is length-limited BEFORE any regex runs.
 */
export function sanitizeInput(input, maxLength = 5000) {
  if (typeof input !== 'string') return ''
  // Truncate before any processing — prevents ReDoS
  return input.slice(0, maxLength).trim()
}

/**
 * Validates an API key format (basic sanity check).
 * Does NOT send the key anywhere.
 */
export function validateApiKeyFormat(key, provider) {
  const k = key.trim()
  const checks = {
    gemini:   k.startsWith('AI') && k.length > 20,
    groq:     k.startsWith('gsk_') && k.length > 20,
    claude:   k.startsWith('sk-ant-') && k.length > 20,
    openai:   k.startsWith('sk-') && k.length > 20,
    // FIX 3: Basic format checks for new providers
    nvidia:   k.startsWith('nvapi-') && k.length > 20,
    kimi:     k.startsWith('sk-') && k.length > 20,
    deepseek: k.startsWith('sk-') && k.length > 20,
    qwen:     k.length > 10, // DashScope keys have varied formats
    newsKey:  k.length > 5,
  }
  return checks[provider] ?? k.length > 5
}
