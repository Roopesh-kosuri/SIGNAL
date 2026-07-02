import React from 'react'
import { useNavigate } from 'react-router-dom'
import PageMeta from '../components/PageMeta'
import feedback from '../utils/feedback'

export default function PrivacyPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background p-margin-mobile md:p-margin-desktop page-enter">
      <PageMeta title="Privacy Policy | SIGNAL" description="SIGNAL Intelligence Platform Privacy Policy — what data we collect and how we use it." />
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => { navigate(-1); feedback.tap() }}
          className="btn-ghost mb-lg text-[11px]"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back
        </button>

        <div className="mb-lg">
          <h1 className="font-headline-lg text-primary mb-xs headline-3d">Privacy Policy</h1>
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase">Effective date: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="tactical-card bg-surface-container-low border border-outline-variant p-lg space-y-lg text-on-surface">

          <section>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              At <strong className="text-on-surface">SIGNAL</strong>, privacy-by-design is core to our architecture. This policy explains exactly what data is collected, what is not, and how your information is handled.
            </p>
          </section>

          {/* ── Data Collected ─────────────────────────────────────── */}
          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">database</span>
              1. Data We Collect (Firebase Authentication)
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              When you create an account or sign in, SIGNAL uses <strong className="text-on-surface">Firebase Authentication</strong> (provided by Google). The following data is collected and stored securely by Firebase:
            </p>

            {/* Email/Password Login */}
            <div className="bg-surface-container border border-outline-variant p-md mb-sm">
              <p className="font-mono text-[10px] text-primary tracking-[1.5px] uppercase mb-sm">Email & Password Registration</p>
              <ul className="space-y-xs font-body-md text-on-surface-variant list-none">
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Your email address
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Hashed and salted password (managed by Firebase — we never see your raw password)
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Unique User ID (Firebase UID)
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Account creation timestamp
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Last sign-in timestamp
                </li>
              </ul>
            </div>

            {/* Google Login */}
            <div className="bg-surface-container border border-outline-variant p-md">
              <p className="font-mono text-[10px] text-primary tracking-[1.5px] uppercase mb-sm">Google Sign-In (OAuth)</p>
              <p className="font-body-md text-on-surface-variant text-sm mb-sm">
                When you choose "Continue with Google", Firebase OAuth retrieves the following from your Google account:
              </p>
              <ul className="space-y-xs font-body-md text-on-surface-variant list-none">
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Your Google account email address
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Your Google display name
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Your Google profile picture URL
                </li>
                <li className="flex items-center gap-sm">
                  <span className="material-symbols-outlined text-[14px] text-outline">fiber_manual_record</span>
                  Unique User ID (Firebase UID, derived from your Google account)
                </li>
              </ul>
              <p className="font-mono text-[10px] text-outline mt-sm">
                This is the minimum required by Firebase OAuth to uniquely identify your account. SIGNAL does not request access to your Google Drive, Gmail, Calendar, or any other Google services.
              </p>
            </div>
          </section>

          {/* ── Data NOT Collected ─────────────────────────────────── */}
          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">security</span>
              2. Data We Do NOT Collect
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              SIGNAL's architecture is designed so that the following data never leaves your device or reaches our servers:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
              {[
                ['key', 'API Keys', 'Your Gemini, Groq, Claude, OpenAI, NewsAPI, and all other provider keys stay only in your browser localStorage.'],
                ['chat', 'Chat Messages', 'Your conversations with the AI assistant are processed directly between your browser and the AI provider API.'],
                ['fact_check', 'Fact-Check Queries', 'Claims and headlines you submit for verification are sent directly from your browser to the AI provider.'],
                ['newspaper', 'News Browsing History', 'The news stories you read are not tracked or logged by SIGNAL.'],
                ['settings', 'App Preferences', 'Your theme, voice, and UI preferences are stored locally in your browser.'],
                ['quiz', 'Quiz Answers', 'Your quiz responses are processed locally; only final IQ scores are optionally stored.'],
              ].map(([icon, title, desc]) => (
                <div key={title} className="bg-surface-container border border-outline-variant p-sm flex items-start gap-sm">
                  <span className="material-symbols-outlined text-[16px] text-primary mt-0.5">{icon}</span>
                  <div>
                    <p className="font-mono text-[10px] text-on-surface tracking-[1px] uppercase mb-xs">{title}</p>
                    <p className="font-body-md text-on-surface-variant text-sm">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Local Storage ────────────────────────────────────── */}
          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">storage</span>
              3. Local Browser Storage (localStorage)
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              SIGNAL uses your browser's <strong className="text-on-surface">localStorage</strong> to store the following data locally on your device. This data is never sent to SIGNAL servers.
            </p>
            <div className="bg-surface-container border border-outline-variant p-md font-mono text-[11px] space-y-xs">
              <div className="flex justify-between gap-md border-b border-outline-variant pb-xs mb-xs">
                <span className="text-outline uppercase tracking-[1px]">Key</span>
                <span className="text-outline uppercase tracking-[1px]">What it stores</span>
              </div>
              {[
                ['signal_keys', 'All your configured AI & news API keys'],
                ['newsProvider / newsConfig', 'Your active news feed provider selection'],
                ['signal_dynamic_foundations_*', 'Cached geopolitical concept briefings (30 min TTL)'],
                ['signal_quiz_*', 'Quiz scores and Signal IQ history'],
                ['signal_theme / signal_voice', 'UI theme and voice preferences'],
                ['show_tutorial', 'Whether the onboarding guide has been shown'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-start justify-between gap-md">
                  <code className="text-primary text-[10px] min-w-0 flex-shrink-0">{key}</code>
                  <span className="text-on-surface-variant text-right text-[10px]">{desc}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[10px] text-outline mt-sm">
              You can clear all locally stored data at any time by clearing your browser's localStorage for this site, or by using the "Clear All" options in the Settings page.
            </p>
          </section>

          {/* ── Third-Party Services ────────────────────────────── */}
          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">lan</span>
              4. Third-Party Services & Data Flows
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              When you use AI or news features, your browser communicates directly with those providers' APIs. Each provider has its own privacy policy:
            </p>
            <div className="space-y-xs">
              {[
                ['Firebase (Google)', 'https://firebase.google.com/support/privacy', 'Authentication & account management'],
                ['Google Gemini', 'https://ai.google.dev/terms', 'AI analysis, fact-checking, summarization'],
                ['Groq', 'https://groq.com/privacy-policy/', 'AI inference fallback & news synthesis'],
                ['Anthropic Claude', 'https://www.anthropic.com/legal/privacy', 'AI intelligence analysis'],
                ['OpenAI', 'https://openai.com/policies/privacy-policy', 'AI intelligence analysis'],
                ['NewsAPI / GNews / NewsData', 'Various', 'News feed ingestion'],
                ['Cesium ION', 'https://cesium.com/legal/privacy-policy/', 'Orbital globe 3D tile data'],
              ].map(([name, url, purpose]) => (
                <div key={name} className="bg-surface-container border border-outline-variant p-sm flex items-center justify-between gap-sm flex-wrap">
                  <div>
                    <p className="font-mono text-[10px] text-on-surface tracking-[1px] uppercase">{name}</p>
                    <p className="font-body-md text-on-surface-variant text-sm">{purpose}</p>
                  </div>
                  {url !== 'Various' && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-primary tracking-[0.5px] hover:underline flex items-center gap-xs flex-shrink-0">
                      <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                      Privacy Policy
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── Your Rights ────────────────────────────────────── */}
          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              5. Your Data Rights
            </h2>
            <ul className="space-y-xs font-body-md text-on-surface-variant list-none">
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check</span>
                <span><strong className="text-on-surface">Access:</strong> Your Firebase account data can be accessed via Firebase's user management system.</span>
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check</span>
                <span><strong className="text-on-surface">Deletion:</strong> You can delete your SIGNAL account at any time. This will remove your Firebase authentication record. Local data stored in your browser can be cleared by you at any time.</span>
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check</span>
                <span><strong className="text-on-surface">Portability:</strong> Your API keys are stored locally and portable — you own them completely.</span>
              </li>
            </ul>
          </section>

          <div className="pt-lg border-t border-outline-variant flex items-center justify-between flex-wrap gap-sm">
            <p className="font-mono text-[10px] text-outline tracking-[1px]">
              Last updated: {new Date().toLocaleDateString()}
            </p>
            <button
              onClick={() => { navigate('/legal/terms'); feedback.tap() }}
              className="font-mono text-[10px] text-primary tracking-[1px] hover:underline flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[12px]">gavel</span>
              View Terms of Service
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
