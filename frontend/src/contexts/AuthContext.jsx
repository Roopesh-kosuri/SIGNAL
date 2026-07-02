import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { auth, googleProvider, isFirebaseConfigured } from '../firebase'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ─── Demo mode mock user ─────────────────────────────────────────────────────
const DEMO_USER = {
  uid:         'demo-user-001',
  email:       'demo@signal-intel.app',
  displayName: 'Demo Analyst',
  isDemo:      true,
}

// ─── Rate limiting for login/signup (5 per 15min) ────────────────────────────
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 15 * 60 * 1000

function checkRateLimit(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(`rl_${key}`) || '{"count":0,"windowStart":0}')
    const now = Date.now()
    if (now - stored.windowStart > RATE_WINDOW_MS) {
      const fresh = { count: 1, windowStart: now }
      localStorage.setItem(`rl_${key}`, JSON.stringify(fresh))
      return { allowed: true, remaining: RATE_LIMIT - 1 }
    }
    if (stored.count >= RATE_LIMIT) {
      const retryAfterMs = RATE_WINDOW_MS - (now - stored.windowStart)
      const retryMinutes = Math.ceil(retryAfterMs / 60000)
      return { allowed: false, retryAfterMs, message: `Too many attempts. Try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.` }
    }
    stored.count += 1
    localStorage.setItem(`rl_${key}`, JSON.stringify(stored))
    return { allowed: true, remaining: RATE_LIMIT - stored.count }
  } catch {
    return { allowed: true }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Demo mode: check if demo session is active
    if (!isFirebaseConfigured) {
      const demoActive = sessionStorage.getItem('signal_demo_active')
      if (demoActive === 'true') setUser(DEMO_USER)
      setLoading(false)
      return
    }

    // Real Firebase auth listener
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  // ─── Demo mode auth ──────────────────────────────────────────────────
  function enterDemoMode() {
    sessionStorage.setItem('signal_demo_active', 'true')
    setUser(DEMO_USER)
  }

  function exitDemoMode() {
    sessionStorage.removeItem('signal_demo_active')
    setUser(null)
  }

  // ─── Real Firebase auth ──────────────────────────────────────────────
  async function signup(email, password) {
    if (!isFirebaseConfigured) {
      enterDemoMode()
      return
    }
    const rl = checkRateLimit('signup')
    if (!rl.allowed) throw new Error(rl.message)
    return createUserWithEmailAndPassword(auth, email, password)
  }

  async function login(email, password) {
    if (!isFirebaseConfigured) {
      enterDemoMode()
      return
    }
    const rl = checkRateLimit('login')
    if (!rl.allowed) throw new Error(rl.message)
    return signInWithEmailAndPassword(auth, email, password)
  }

  async function loginWithGoogle() {
    if (!isFirebaseConfigured) {
      enterDemoMode()
      return
    }
    const rl = checkRateLimit('google')
    if (!rl.allowed) throw new Error(rl.message)
    return signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    if (!isFirebaseConfigured || user?.isDemo) {
      exitDemoMode()
      return
    }
    return signOut(auth)
  }

  async function resetPassword(email) {
    if (!isFirebaseConfigured) {
      throw new Error('Password reset requires Firebase to be configured.')
    }
    return sendPasswordResetEmail(auth, email)
  }

  const value = {
    user,
    loading,
    isDemo: !isFirebaseConfigured || user?.isDemo === true,
    signup,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    enterDemoMode,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
