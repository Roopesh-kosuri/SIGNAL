import React from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * LockedState — shown when user has no API key for a BYOK feature.
 * Never silently fails. Always shows a clear, actionable state.
 */
export default function LockedState({ feature = 'this feature', keyName = 'Gemini' }) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-lg animate-fade-in">
      <div className="bg-surface-container-low border-2 border-dashed border-outline-variant p-lg max-w-md w-full text-center tactical-card">
        {/* Lock icon */}
        <div className="w-16 h-16 bg-surface-container border-2 border-outline-variant mx-auto mb-md flex items-center justify-center tactical-card">
          <span className="material-symbols-outlined text-[32px] text-outline">lock</span>
        </div>

        <h2 className="font-mono text-[12px] font-medium tracking-[2px] uppercase text-outline mb-sm">
          Uplink Credential Required
        </h2>
        <h3 className="font-headline-md text-on-surface mb-sm">
          {feature} requires an active security key
        </h3>
        <p className="font-body-md text-on-surface-variant mb-md text-sm leading-relaxed">
          {feature} utilizes your local decryption credentials to process requests. All credentials remain secure in your browser sandbox.
        </p>

        <div className="bg-surface-container border border-outline-variant p-sm mb-md text-left">
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mb-xs">Affected Features</p>
          <p className="font-mono text-[11px] text-on-surface-variant">
            Fact Checker · Primary Intel Chat · Assessment Quiz · Geopolitical Foundations
          </p>
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-sm mb-xs">Works without a key</p>
          <p className="font-mono text-[11px] text-on-surface-variant">
            News Feed Ingestion
          </p>
        </div>

        <button
          onClick={() => navigate('/settings')}
          className="btn-primary w-full justify-center"
        >
          <span className="material-symbols-outlined text-[16px]">settings</span>
          Add Key in Settings
        </button>
      </div>
    </div>
  )
}
