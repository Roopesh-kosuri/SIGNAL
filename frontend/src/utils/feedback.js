/**
 * SIGNAL — Haptics & Sound Utility
 * ===================================
 * Centralized feedback system with named functions.
 * Fails silently on unsupported browsers/devices.
 * Respects OS reduced-motion and mute toggle.
 */

// ─── Audio Context (lazy init) ────────────────────────────────────────────────
let audioCtx = null

function getAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    } catch {
      return null
    }
  }
  return audioCtx
}

function isMuted() {
  return localStorage.getItem('signal_sound') === 'false'
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ─── Haptics ──────────────────────────────────────────────────────────────────
function haptic(pattern) {
  try {
    if (prefersReducedMotion()) return
    if (!navigator.vibrate) return
    navigator.vibrate(pattern)
  } catch {
    // silently fail
  }
}

// ─── Sound Generator ─────────────────────────────────────────────────────────
function playTone({ frequency = 440, duration = 80, type = 'sine', volume = 0.1, attack = 0.01, decay = 0.05 } = {}) {
  try {
    if (isMuted()) return
    if (prefersReducedMotion()) return
    const ctx = getAudioCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume()

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

    gainNode.gain.setValueAtTime(0, ctx.currentTime)
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + attack)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + attack + decay + duration / 1000)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + attack + decay + duration / 1000 + 0.05)
  } catch {
    // silently fail
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const feedback = {
  /**
   * Light tap — nav switch, card tap, toggle
   * Pattern: [10ms vibrate]
   * Sound: soft mechanical click at 800Hz, 60ms
   */
  tap() {
    haptic([10])
    playTone({ frequency: 800, duration: 60, type: 'square', volume: 0.04, attack: 0.005, decay: 0.04 })
  },

  /**
   * Success — verified result, correct quiz answer
   * Pattern: [15, 5, 25ms] — double pulse
   * Sound: ascending two-tone
   */
  success() {
    haptic([15, 5, 25])
    playTone({ frequency: 523, duration: 80, type: 'sine', volume: 0.08, attack: 0.01, decay: 0.06 })
    setTimeout(() => {
      playTone({ frequency: 659, duration: 100, type: 'sine', volume: 0.08, attack: 0.01, decay: 0.08 })
    }, 100)
  },

  /**
   * Warning — misleading verdict, wrong quiz answer
   * Pattern: [30, 10, 30ms] — heavier double pulse
   * Sound: descending two-tone stamp
   */
  warning() {
    haptic([30, 10, 30])
    playTone({ frequency: 440, duration: 100, type: 'sawtooth', volume: 0.07, attack: 0.005, decay: 0.08 })
    setTimeout(() => {
      playTone({ frequency: 330, duration: 120, type: 'sawtooth', volume: 0.06, attack: 0.005, decay: 0.1 })
    }, 120)
  },

  /**
   * Stamp — fact-check verdict reveal
   * Medium haptic + distinctive stamp sound
   */
  stamp() {
    haptic([20, 5, 20, 5, 40])
    playTone({ frequency: 200, duration: 120, type: 'square', volume: 0.1, attack: 0.005, decay: 0.1 })
  },

  /**
   * Send — message sent in chat
   */
  send() {
    haptic([8])
    playTone({ frequency: 1000, duration: 40, type: 'sine', volume: 0.05, attack: 0.002, decay: 0.03 })
  },
}

export default feedback
