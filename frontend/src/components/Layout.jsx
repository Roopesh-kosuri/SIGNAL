import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { isFirebaseConfigured } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import feedback from '../utils/feedback'
import OnboardingTour from './OnboardingTour'

const navItems = [
  { to: '/',            icon: 'newspaper',      label: 'News' },
  { to: '/chat',        icon: 'chat',           label: 'Chat' },
  { to: '/verify',      icon: 'fact_check',     label: 'Verify' },
  { to: '/quiz',        icon: 'quiz',           label: 'Quiz' },
  { to: '/foundations', icon: 'account_balance', label: 'Found.' },
  { to: '/orbital',     icon: 'satellite',      label: 'Orbital' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <OnboardingTour />
      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full p-md z-40 bg-surface-container w-64 border-r-4 border-surface-container-lowest shadow-xl overflow-y-auto">
        <div className="mb-lg">
          <h1 className="headline-3d font-display-lg text-display-lg text-primary tracking-tight leading-none">SIGNAL</h1>
          <p className="font-mono text-[10px] text-outline tracking-[2px] uppercase mt-1">INTEL</p>
          {!isFirebaseConfigured && (
            <span className="inline-flex items-center gap-xs bg-primary-container text-on-primary-container font-mono text-[9px] tracking-[1.5px] uppercase px-xs py-0.5 mt-xs border border-outline-variant">
              <span className="material-symbols-outlined text-[10px]">science</span>
              Demo Mode
            </span>
          )}
        </div>

        <div className="flex flex-col gap-xs w-full flex-1">
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => feedback.tap()}
              className={({ isActive }) =>
                `flex items-center gap-md p-sm rounded-sm border-b-4 border-r-4 mb-xs transition-all ` +
                (isActive
                  ? 'bg-primary-container text-on-primary-container border-surface-container-highest'
                  : 'text-on-surface-variant border-transparent hover:border-surface-container-high hover:bg-surface-container-high')
              }
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span className="font-mono text-[12px] font-medium tracking-[1.5px] uppercase">{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-auto pt-md border-t border-outline-variant">
          <NavLink
            to="/iq"
            onClick={() => feedback.tap()}
            className={({ isActive }) =>
              `flex items-center gap-md p-sm rounded-sm border-b-4 border-r-4 mb-xs transition-all ` +
              (isActive
                ? 'bg-primary-container text-on-primary-container border-surface-container-highest'
                : 'text-on-surface-variant border-transparent hover:border-surface-container-high hover:bg-surface-container-high')
            }
          >
            <span className="material-symbols-outlined text-[20px]">analytics</span>
            <span className="font-mono text-[12px] font-medium tracking-[1.5px] uppercase">Signal IQ</span>
          </NavLink>

          <NavLink
            to="/settings"
            onClick={() => feedback.tap()}
            className={({ isActive }) =>
              `flex items-center gap-md p-sm rounded-sm border-b-4 border-r-4 mb-xs transition-all ` +
              (isActive
                ? 'bg-primary-container text-on-primary-container border-surface-container-highest'
                : 'text-on-surface-variant border-transparent hover:border-surface-container-high hover:bg-surface-container-high')
            }
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
            <span className="font-mono text-[12px] font-medium tracking-[1.5px] uppercase">Settings</span>
          </NavLink>

          {user && (
            <div className="px-sm py-xs">
              <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase truncate mb-xs">{user.email}</p>
              <button
                onClick={handleLogout}
                className="btn-ghost w-full justify-center text-[11px] py-xs"
              >
                <span className="material-symbols-outlined text-[14px]">logout</span>
                Sign Out
              </button>
            </div>
          )}

          {/* Legal links */}
          <div className="px-sm pb-xs pt-sm border-t border-outline-variant/40 flex gap-sm justify-center">
            <a href="/legal/terms" className="font-mono text-[9px] text-outline hover:text-primary transition-colors tracking-[0.5px]">Terms</a>
            <span className="text-outline opacity-40">·</span>
            <a href="/legal/privacy" className="font-mono text-[9px] text-outline hover:text-primary transition-colors tracking-[0.5px]">Privacy</a>
          </div>
        </div>
      </nav>

      {/* ── Mobile Header ──────────────────────────────────── */}
      <header className="md:hidden sticky top-0 z-50 flex justify-between items-center h-14 px-margin-mobile bg-surface border-b-2 border-outline-variant ambient-shadow">
        <div>
          <span className="headline-3d font-display-lg text-[22px] text-primary font-semibold tracking-tight">SIGNAL</span>
          <span className="font-mono text-[9px] text-outline tracking-[2px] uppercase ml-1">INTEL</span>
        </div>
        <div className="flex items-center gap-sm">
          <NavLink to="/iq" onClick={() => feedback.tap()} className="text-on-surface-variant hover:text-primary transition-colors p-xs">
            <span className="material-symbols-outlined text-[20px]">analytics</span>
          </NavLink>
          <NavLink to="/settings" onClick={() => feedback.tap()} className="text-on-surface-variant hover:text-primary transition-colors p-xs">
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </NavLink>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="md:ml-64 pb-24 md:pb-0 min-h-screen">
        {children}
      </main>

      {/* ── Mobile Bottom Nav ─────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-stretch h-16 bg-surface-container-high border-t-2 border-outline-variant shadow-[0_-4px_20px_rgba(0,0,0,0.5)] pb-safe">
        {navItems.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => feedback.tap()}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 transition-all ` +
              (isActive
                ? 'bg-primary-container text-on-primary-container translate-x-[2px] translate-y-[2px]'
                : 'text-on-surface-variant border-r border-b border-surface-container-lowest hover:bg-surface-container-highest active:translate-x-[2px] active:translate-y-[2px]')
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span className="font-mono text-[9px] font-medium tracking-[1px] uppercase mt-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
