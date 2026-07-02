/**
 * SIGNAL — Theme Context
 * ========================
 * FIX A: Theme switching now works by setting data-theme on <html>.
 * All colors are CSS custom properties in index.css keyed to data-theme,
 * which Tailwind references via var(--color-*) in tailwind.config.js.
 * This means ALL Tailwind utility classes (bg-*, text-*, border-*) update
 * automatically when data-theme changes — no component-level changes needed.
 *
 * FIX B: 'blue' added as a valid theme option.
 *
 * Themes: 'dark' | 'light' | 'blue' | 'system'
 * - 'system' reads prefers-color-scheme and resolves to 'dark' or 'light'
 *   (system does not resolve to 'blue' — blue is a manual choice)
 * - Updates live if OS theme changes while app is open
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext(null)

export function useTheme() {
  return useContext(ThemeContext)
}

function resolveSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeToDOM(userTheme) {
  const html = document.documentElement
  let resolved = userTheme

  if (userTheme === 'system') {
    resolved = resolveSystemTheme()
  }

  // Set data-theme — this drives ALL CSS custom properties
  html.setAttribute('data-theme', resolved)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('signal_theme') || 'dark'
  )
  const [readerMode, setReaderMode] = useState(
    () => localStorage.getItem('signal_reader_mode') === 'reader'
  )
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('signal_sound') !== 'false'
  )
  // Voice settings (Part 2)
  const [autoReadAloud, setAutoReadAloud] = useState(
    () => localStorage.getItem('signal_voice_autoread') === 'true'
  )
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(
    () => localStorage.getItem('signal_voice_uri') || ''
  )

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyThemeToDOM(theme)
    localStorage.setItem('signal_theme', theme)
  }, [theme])

  // Live system theme listener — only active when theme === 'system'
  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeToDOM('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Also apply on first mount (handles page reload with persisted theme)
  useEffect(() => {
    applyThemeToDOM(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function changeTheme(t) {
    setTheme(t)
  }

  function toggleReaderMode() {
    const next = !readerMode
    setReaderMode(next)
    localStorage.setItem('signal_reader_mode', next ? 'reader' : 'analyst')
  }

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('signal_sound', next ? 'true' : 'false')
  }

  function toggleAutoReadAloud() {
    const next = !autoReadAloud
    setAutoReadAloud(next)
    localStorage.setItem('signal_voice_autoread', next ? 'true' : 'false')
  }

  function changeVoiceURI(uri) {
    setSelectedVoiceURI(uri)
    localStorage.setItem('signal_voice_uri', uri)
  }

  // Helper: get the currently resolved (non-system) theme name
  // Used by components that need to know the actual active theme
  function resolvedTheme() {
    return theme === 'system' ? resolveSystemTheme() : theme
  }

  return (
    <ThemeContext.Provider value={{
      theme,
      resolvedTheme,
      changeTheme,
      readerMode,
      toggleReaderMode,
      soundEnabled,
      toggleSound,
      autoReadAloud,
      toggleAutoReadAloud,
      selectedVoiceURI,
      changeVoiceURI,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
