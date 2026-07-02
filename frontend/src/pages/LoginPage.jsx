import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isFirebaseConfigured } from '../firebase'
import PageMeta from '../components/PageMeta'
import feedback from '../utils/feedback'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [requestTutorial, setRequestTutorial] = useState(false)
  const { login, signup, loginWithGoogle, resetPassword, enterDemoMode } = useAuth()
  const navigate = useNavigate()

  function validateEmail(e) {
    const safe = e.slice(0, 254)
    const emailRegex = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/
    return emailRegex.test(safe)
  }

  function validatePassword(p) {
    return p.length >= 8 && p.length <= 128
  }

  async function handleDemo() {
    feedback.success()
    localStorage.setItem('show_tutorial', requestTutorial ? 'true' : 'false')
    enterDemoMode()
    navigate('/')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    const safeEmail = email.slice(0, 254).trim()
    const safePassword = password.slice(0, 128)

    if (!validateEmail(safeEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    if (mode !== 'reset' && !validatePassword(safePassword)) {
      setError('Password must be 8-128 characters.')
      return
    }
    if (mode === 'signup' && safePassword !== confirmPassword.slice(0, 128)) {
      setError('Passwords do not match.')
      return
    }
    if (mode === 'signup' && !agreed) {
      setError('You must agree to the Terms of Service and Privacy Policy.')
      return
    }

    setLoading(true)
    try {
      localStorage.setItem('show_tutorial', requestTutorial ? 'true' : 'false')
      if (mode === 'login') {
        await login(safeEmail, safePassword)
        feedback.success()
        navigate('/')
      } else if (mode === 'signup') {
        await signup(safeEmail, safePassword)
        feedback.success()
        navigate('/')
      } else {
        await resetPassword(safeEmail)
        setSuccess('Password reset email sent. Check your inbox.')
        feedback.tap()
      }
    } catch (err) {
      feedback.warning()
      const msg = err.message || ''
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Invalid email or password.')
      } else if (msg.includes('email-already-in-use')) {
        setError('An account with this email already exists.')
      } else if (msg.includes('Too many attempts')) {
        setError(msg)
      } else if (msg.includes('Password reset requires Firebase')) {
        setError(msg)
      } else {
        setError('Authentication failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    try {
      localStorage.setItem('show_tutorial', requestTutorial ? 'true' : 'false')
      await loginWithGoogle()
      feedback.success()
      navigate('/')
    } catch (err) {
      feedback.warning()
      if (err.message?.includes('Too many attempts')) {
        setError(err.message)
      } else if (err.message?.includes('popup-closed-by-user')) {
        setError('Sign-in cancelled.')
      } else {
        setError('Google sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-margin-mobile page-enter">
      <PageMeta title="Login | SIGNAL" description="Access the SIGNAL Intelligence Platform." />
      {/* Grid texture */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, #dfc391 0px, #dfc391 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, #dfc391 0px, #dfc391 1px, transparent 1px, transparent 32px)',
      }} />

      <div className="w-full max-w-md relative animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-lg">
          <h1 className="headline-3d font-display-lg text-display-lg text-primary tracking-tight">SIGNAL</h1>
          <p className="font-mono text-[11px] text-outline tracking-[3px] uppercase mt-1">INTELLIGENCE PLATFORM</p>
          <p className="font-body-md text-on-surface-variant text-sm mt-sm max-w-xs mx-auto leading-relaxed">
            Other apps tell you what happened. SIGNAL tells you what it means, who disagrees, and why.
          </p>
        </div>

        {/* ── DEMO MODE BANNER (shown when Firebase not configured) ─── */}
        {!isFirebaseConfigured && (
          <div className="mb-md animate-fade-in">
            <div className="bg-primary-container border-2 border-primary p-md tactical-card text-center">
              <div className="flex items-center justify-center gap-xs mb-xs">
                <span className="material-symbols-outlined text-[18px] text-on-primary-container">science</span>
                <span className="font-mono text-[11px] text-on-primary-container tracking-[1.5px] uppercase font-medium">Demo Mode Available</span>
              </div>
              <p className="font-mono text-[11px] text-on-primary-container tracking-[0.5px] mb-sm opacity-80">
                Firebase not configured — click below to explore the full app without login
              </p>
              <button
                id="demo-mode-btn"
                onClick={handleDemo}
                className="w-full bg-on-primary-container text-primary-container font-mono text-[12px] font-medium tracking-[1.5px] uppercase py-sm px-md flex items-center justify-center gap-xs border-2 border-on-primary-container hover:opacity-90 transition-opacity tactical-card"
              >
                <span className="material-symbols-outlined text-[16px]">play_circle</span>
                Enter Demo Mode — No Login Required
              </button>

              <div className="flex items-center justify-center gap-xs mt-sm bg-on-primary-container/10 py-1.5 px-sm border border-on-primary-container/20">
                <input
                  type="checkbox"
                  id="tutorial-checkbox-demo"
                  checked={requestTutorial}
                  onChange={(e) => { setRequestTutorial(e.target.checked); feedback.tap() }}
                  className="mt-0.5"
                />
                <label htmlFor="tutorial-checkbox-demo" className="font-mono text-[10px] text-on-primary-container cursor-pointer select-none">
                  LAUNCH INTERACTIVE WORKTHROUGH GUIDE
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Auth Card */}
        <div className="bg-surface-container-low border-2 border-outline-variant p-md tactical-card">
          {/* Mode tabs */}
          <div className="flex border-b border-outline-variant mb-md">
            {[['login', 'Sign In'], ['signup', 'Create Account']].map(([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); feedback.tap() }}
                className={`flex-1 py-sm font-mono text-[11px] tracking-[1.5px] uppercase transition-colors border-b-2 -mb-[2px] ` +
                  (mode === m ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface')}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'reset' && (
            <div className="mb-md">
              <button onClick={() => { setMode('login'); setError(''); setSuccess('') }} className="font-mono text-[11px] text-outline tracking-[1px] uppercase flex items-center gap-xs hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Back to Sign In
              </button>
            </div>
          )}

          {/* Firebase not configured warning inside auth form */}
          {!isFirebaseConfigured && (
            <div className="bg-surface-container border border-outline-variant p-xs mb-sm flex items-start gap-xs">
              <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
              <p className="font-mono text-[10px] text-outline tracking-[0.5px] leading-relaxed">
                Firebase not configured. Sign-in will auto-enter Demo Mode. Add Firebase config to use real auth.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-sm">
            <div>
              <label className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Email</label>
              <input
                id="email-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value.slice(0, 254))}
                maxLength={254}
                required
                className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-sm focus:outline-none focus:border-primary transition-colors"
                placeholder="analyst@agency.gov"
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Password</label>
                <input
                  id="password-input"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value.slice(0, 128))}
                  maxLength={128}
                  required
                  className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                />
              </div>
            )}

            {mode === 'signup' && (
              <>
                <div>
                  <label className="font-mono text-[10px] text-outline tracking-[1.5px] uppercase block mb-xs">Confirm Password</label>
                  <input
                    id="confirm-password-input"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value.slice(0, 128))}
                    maxLength={128}
                    required
                    className="tactical-input w-full bg-surface-container-lowest border border-outline-variant text-on-surface font-body-md text-body-md p-sm focus:outline-none focus:border-primary transition-colors"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex items-start gap-xs mt-sm">
                  <input
                    type="checkbox"
                    id="agree-checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-1"
                  />
                  <label htmlFor="agree-checkbox" className="font-mono text-[10px] text-on-surface-variant leading-relaxed">
                    I agree to the <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</a> and <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>, understanding this is a BYOK platform.
                  </label>
                </div>
              </>
            )}

            {error && (
              <div className="bg-surface-container-low border-2 border-error p-sm tactical-card animate-fade-in flex items-start gap-sm">
                <span className="material-symbols-outlined text-[16px] text-error mt-0.5">error</span>
                <p className="font-mono text-[11px] text-on-surface tracking-[0.5px] flex-1">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-secondary-container border border-secondary-fixed p-sm animate-fade-in">
                <p className="font-mono text-[11px] text-on-secondary-container tracking-[0.5px]">{success}</p>
              </div>
            )}

            {mode !== 'reset' && (
              <div className="flex items-center gap-xs py-xs">
                <input
                  type="checkbox"
                  id="tutorial-checkbox-auth"
                  checked={requestTutorial}
                  onChange={(e) => { setRequestTutorial(e.target.checked); feedback.tap() }}
                  className="mt-0.5"
                />
                <label htmlFor="tutorial-checkbox-auth" className="font-mono text-[10px] text-on-surface-variant cursor-pointer select-none">
                  LAUNCH INTERACTIVE WORKTHROUGH GUIDE
                </label>
              </div>
            )}

            <button
              id="submit-btn"
              type="submit"
              disabled={loading}
              className="btn-primary justify-center w-full mt-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>Processing...</>
              ) : mode === 'login' ? (
                <><span className="material-symbols-outlined text-[16px]">login</span>Access Intelligence</>
              ) : mode === 'signup' ? (
                <><span className="material-symbols-outlined text-[16px]">person_add</span>Create Account</>
              ) : (
                <><span className="material-symbols-outlined text-[16px]">mail</span>Send Reset Link</>
              )}
            </button>

            {mode !== 'reset' && (
              <>
                <div className="flex items-center gap-sm">
                  <div className="flex-1 h-px bg-outline-variant" />
                  <span className="font-mono text-[10px] text-outline tracking-[1px] uppercase">or</span>
                  <div className="flex-1 h-px bg-outline-variant" />
                </div>
                <button
                  id="google-signin-btn"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="btn-ghost justify-center w-full disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                {/* Data transparency notice */}
                <div className="bg-surface-container border border-outline-variant p-sm flex items-start gap-xs mt-xs">
                  <span className="material-symbols-outlined text-[13px] text-outline mt-0.5 flex-shrink-0">privacy_tip</span>
                  <p className="font-mono text-[9px] text-outline tracking-[0.3px] leading-relaxed">
                    Firebase Auth collects your <strong className="text-on-surface-variant">email, display name & profile picture</strong> for account management. API keys are stored <strong className="text-on-surface-variant">only in your browser</strong> and never sent to our servers.{' '}
                    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</a>
                  </p>
                </div>
              </>
            )}

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setSuccess('') }}
                className="font-mono text-[10px] text-outline tracking-[1px] uppercase hover:text-on-surface transition-colors text-center mt-xs"
              >
                Forgot Password?
              </button>
            )}
          </form>
        </div>

        <div className="text-center mt-md flex items-center justify-center gap-md flex-wrap">
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase opacity-60">
            SIGNAL — All intelligence, zero assumptions
          </p>
          <div className="flex items-center gap-sm">
            <a href="/legal/terms" className="font-mono text-[9px] text-outline hover:text-primary transition-colors tracking-[0.5px]">Terms</a>
            <span className="text-outline opacity-40">·</span>
            <a href="/legal/privacy" className="font-mono text-[9px] text-outline hover:text-primary transition-colors tracking-[0.5px]">Privacy</a>
          </div>
        </div>
      </div>
    </div>
  )
}
