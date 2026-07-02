import React from 'react'
import { useNavigate } from 'react-router-dom'
import PageMeta from '../components/PageMeta'
import feedback from '../utils/feedback'

export default function TermsPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background p-margin-mobile md:p-margin-desktop page-enter">
      <PageMeta title="Terms of Service | SIGNAL" description="SIGNAL Intelligence Platform Terms of Service and usage conditions." />
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => { navigate(-1); feedback.tap() }}
          className="btn-ghost mb-lg text-[11px]"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back
        </button>

        <div className="mb-lg">
          <h1 className="font-headline-lg text-primary mb-xs headline-3d">Terms of Service</h1>
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase">Effective date: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="tactical-card bg-surface-container-low border border-outline-variant p-lg space-y-lg text-on-surface">

          <section>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              Welcome to <strong className="text-on-surface">SIGNAL</strong>, an intelligence aggregation and analysis platform. By creating an account, accessing, or using SIGNAL, you confirm that you have read, understood, and agree to be bound by these Terms of Service. If you do not agree, please do not use the platform.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">key</span>
              1. Bring Your Own Key (BYOK) Architecture
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              SIGNAL operates on a <strong className="text-on-surface">Bring Your Own Key (BYOK)</strong> model. This means:
            </p>
            <ul className="space-y-xs font-body-md text-on-surface-variant list-none">
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check_circle</span>
                All AI model keys (Gemini, Groq, Claude, OpenAI, etc.) are configured by you and stored <strong className="text-on-surface">exclusively in your browser's localStorage</strong> on your local device.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check_circle</span>
                All news provider API keys (NewsAPI, GNews, NewsData, etc.) are stored <strong className="text-on-surface">exclusively in your browser's localStorage</strong>.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">check_circle</span>
                Your API keys are <strong className="text-on-surface">never transmitted to SIGNAL's servers</strong>, logged, or accessed by anyone other than you.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5">warning</span>
                You are solely responsible for the security, usage, and billing of your own API keys. Clearing your browser data will remove all stored keys.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
              2. AI-Generated Content Disclaimer
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              SIGNAL uses third-party AI models (including but not limited to Google Gemini, Groq LLMs, Anthropic Claude, and OpenAI) to generate intelligence analysis, fact-checks, assessments, and geopolitical briefings. By using these features, you acknowledge that:
            </p>
            <ul className="space-y-xs mt-sm font-body-md text-on-surface-variant list-none">
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
                AI-generated output may contain inaccuracies, omissions, or outdated information.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
                SIGNAL does not guarantee the correctness, completeness, or fitness for any purpose of AI-generated content.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-outline mt-0.5">info</span>
                You should independently verify any critical or time-sensitive information before acting on it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">gavel</span>
              3. Acceptable Use Policy
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant mb-sm">
              You agree to use SIGNAL only for lawful purposes and in a manner consistent with all applicable laws and regulations. Specifically, you agree NOT to:
            </p>
            <ul className="space-y-xs font-body-md text-on-surface-variant list-none">
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5">block</span>
                Use the platform to generate or distribute misinformation, propaganda, or content intended to deceive.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5">block</span>
                Violate the Terms of Service of any third-party API provider integrated with the platform.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5">block</span>
                Attempt to reverse-engineer, scrape, or disrupt the SIGNAL platform or its backend services.
              </li>
              <li className="flex items-start gap-sm">
                <span className="material-symbols-outlined text-[14px] text-error mt-0.5">block</span>
                Use the platform for any surveillance, harassment, or harmful activity targeting any individual or group.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">account_circle</span>
              4. Account Registration & Firebase Authentication
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              Accounts are managed through <strong className="text-on-surface">Firebase Authentication</strong> (a Google service). When you register or sign in with Google, Firebase collects your email address, display name, and profile picture URL associated with your Google account. This data is managed under <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Firebase's Privacy Policy</a>. You are responsible for maintaining the security of your account credentials.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">shield</span>
              5. Limitation of Liability
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              SIGNAL is provided on an "as is" and "as available" basis without warranties of any kind. To the maximum extent permitted by law, SIGNAL and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform, including but not limited to losses resulting from reliance on AI-generated intelligence or misuse of configured API keys.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">update</span>
              6. Changes to These Terms
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              We reserve the right to modify these Terms at any time. Continued use of SIGNAL following any modification constitutes your acceptance of the revised Terms. We will update the effective date shown on this page accordingly.
            </p>
          </section>

          <section>
            <h2 className="font-headline-md text-primary mb-sm flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">mail</span>
              7. Contact
            </h2>
            <p className="font-body-md leading-relaxed text-on-surface-variant">
              For questions regarding these Terms, please refer to the project documentation or open an issue in the project repository.
            </p>
          </section>

          <div className="pt-lg border-t border-outline-variant flex items-center justify-between flex-wrap gap-sm">
            <p className="font-mono text-[10px] text-outline tracking-[1px]">
              Last updated: {new Date().toLocaleDateString()}
            </p>
            <button
              onClick={() => { navigate('/legal/privacy'); feedback.tap() }}
              className="font-mono text-[10px] text-primary tracking-[1px] hover:underline flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[12px]">privacy_tip</span>
              View Privacy Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
