import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import feedback from '../utils/feedback'

const STEPS = [
  {
    title: 'TACTICAL TERMINAL INITIATION',
    route: '/',
    description: 'Welcome to SIGNAL, an advanced geopolitical and market intelligence console. This interactive walkthrough will guide you through our core scanning nodes and help calibrate your workspace.',
  },
  {
    title: 'SIGNAL FEED INGESTION [1/5]',
    route: '/',
    description: 'The News panel aggregates global geopolitical intelligence. Under the hood, this node supports public RSS aggregation, custom HTML website scraping, and auto-failover synthesis using Llama 3.3 and Gemini models if primary news sources are rate-limited or offline.',
  },
  {
    title: 'TACTICAL VERIFICATION ENGINE [2/5]',
    route: '/verify',
    description: 'The Verify tab analyzes targeted claims. The system conducts live search grounding scrapes across independent sources, and allows launching a multi-step ReAct Deep Dive Agent to verify facts with deep internet search cross-referencing.',
  },
  {
    title: 'ORBITAL TELEMETRY GLOBE [3/5]',
    description: 'The Orbital engine tracks active spacecraft in real-time on a 3D Cesium globe. To bypass Celestrak rate-limiting bans, a local persistent telemetry database coordinates cache retrieval automatically.',
    route: '/orbital',
  },
  {
    title: 'CONCEPT DECRYPTION LIBRARY [4/5]',
    route: '/foundations',
    description: 'The Foundations Library curates a real-time geopolitical educational curriculum. It parses your news feed context and generates customized concept briefings dynamically, saving them in your local workstation sandbox.',
  },
  {
    title: 'SECURITY UPLINKS & CONSOLE [5/5]',
    route: '/settings',
    description: 'The Settings console is your secure command center. Toggle appearance theme nodes, configure local browser speech synthesis models, and securely manage API keys. Your keys are held inside local storage and never transit to external servers.',
  },
  {
    title: 'CALIBRATION COMPLETE',
    route: '/',
    description: 'Workspace calibration is complete. All nodes are functioning within nominal parameters. Tap finish to access your active console.',
  }
]

export default function OnboardingTour() {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const location = useLocation()

  // Initialize and check local storage
  useEffect(() => {
    const show = localStorage.getItem('show_tutorial') === 'true'
    if (show) {
      setActive(true)
      setStep(0)
      // Navigate to step 0 route immediately
      if (location.pathname !== STEPS[0].route) {
        navigate(STEPS[0].route)
      }
    }
  }, [])

  if (!active) return null

  const currentCfg = STEPS[step]

  const handleNext = () => {
    feedback.tap()
    if (step < STEPS.length - 1) {
      const nextStep = step + 1
      setStep(nextStep)
      if (location.pathname !== STEPS[nextStep].route) {
        navigate(STEPS[nextStep].route)
      }
    } else {
      handleComplete()
    }
  }

  const handleBack = () => {
    feedback.tap()
    if (step > 0) {
      const prevStep = step - 1
      setStep(prevStep)
      if (location.pathname !== STEPS[prevStep].route) {
        navigate(STEPS[prevStep].route)
      }
    }
  }

  const handleComplete = () => {
    feedback.success()
    localStorage.setItem('show_tutorial', 'false')
    setActive(false)
    navigate('/')
  }

  const handleSkip = () => {
    feedback.tap()
    localStorage.setItem('show_tutorial', 'false')
    setActive(false)
    navigate('/')
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[999] flex items-center justify-center px-sm pointer-events-none animate-fade-in">
      <div className="bg-surface-container/95 backdrop-blur-md border-2 border-primary p-md max-w-md w-full tactical-card pointer-events-auto shadow-2xl relative">
        {/* Glow accent */}
        <div className="absolute -inset-[1px] bg-primary/20 rounded-sm filter blur-[6px] pointer-events-none -z-10 animate-pulse" />
        
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-xs mb-sm">
          <span className="font-mono text-[10px] text-primary tracking-[1.5px] uppercase font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[14px]">terminal</span>
            {currentCfg.title}
          </span>
          <span className="font-mono text-[9px] text-outline">
            STEP {step + 1} OF {STEPS.length}
          </span>
        </div>

        {/* Step Description */}
        <p className="font-mono text-[11px] text-on-surface leading-relaxed mb-md select-none text-balance">
          {currentCfg.description}
        </p>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="font-mono text-[9px] text-outline uppercase tracking-[1px] hover:text-error transition-colors px-xs py-1"
          >
            Skip Tour
          </button>
          
          <div className="flex gap-xs">
            {step > 0 && (
              <button
                onClick={handleBack}
                className="btn-ghost py-xs px-sm text-[10px]"
              >
                <span className="material-symbols-outlined text-[12px]">chevron_left</span>
                Back
              </button>
            )}
            
            <button
              onClick={handleNext}
              className="btn-primary py-xs px-sm text-[10px]"
            >
              {step === STEPS.length - 1 ? (
                <>
                  Finish
                  <span className="material-symbols-outlined text-[12px]">check</span>
                </>
              ) : (
                <>
                  Next
                  <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
