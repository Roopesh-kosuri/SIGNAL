/**
 * SIGNAL — useVoice Hook
 * =======================
 * Encapsulates Web Speech API for both STT (input) and TTS (output).
 * NO dependencies, NO API keys, NO backend changes.
 *
 * Browser support (honest):
 * - SpeechRecognition (STT): Chrome/Edge ✅, Firefox ❌, Safari ⚠️ (partial)
 * - SpeechSynthesis (TTS): Chrome/Edge ✅, Firefox ✅, Safari ✅
 *
 * STT approach: INTERIM results (real-time fill as user speaks).
 * This is more satisfying than waiting for final — text appears live in input.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Feature detection ─────────────────────────────────────────
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null

const isTTSSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window

const isSTTSupported = Boolean(SpeechRecognitionAPI)

// ─── Voice list loader ─────────────────────────────────────────
// getVoices() is async in Chrome — voices arrive via onvoiceschanged
function loadVoices() {
  return new Promise((resolve) => {
    if (!isTTSSupported) return resolve([])
    const voices = window.speechSynthesis.getVoices()
    if (voices.length > 0) return resolve(voices)
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices())
    }
    // Timeout fallback — some browsers never fire onvoiceschanged
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000)
  })
}

export function useVoice({ onTranscript, selectedVoiceURI = '', autoRead = false } = {}) {
  // STT state
  const [isListening, setIsListening] = useState(false)
  const [sttError, setSttError] = useState(null)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [speakingMsgId, setSpeakingMsgId] = useState(null)
  const [voices, setVoices] = useState([])
  const utteranceRef = useRef(null)

  // Load available voices
  useEffect(() => {
    if (!isTTSSupported) return
    loadVoices().then(setVoices)
  }, [])

  // ── STT: Start listening ──────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSTTSupported) return
    if (isListening) return

    setSttError(null)
    finalTranscriptRef.current = ''

    const recognition = new SpeechRecognitionAPI()
    recognition.continuous = true          // Keep listening until stopped
    recognition.interimResults = true       // Real-time interim fill
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      console.log('[STT] Started listening')
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      let interimTranscript = ''
      let finalTranscript = finalTranscriptRef.current

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t
          finalTranscriptRef.current = finalTranscript
        } else {
          interimTranscript = t
        }
      }

      // Pass combined text to parent (fills the textarea in real time)
      if (onTranscript) {
        onTranscript(finalTranscript + interimTranscript)
      }
    }

    recognition.onerror = (event) => {
      console.warn('[STT] Error:', event.error, event.message || '')
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setSttError('Microphone access denied. Please allow mic access in your browser settings.')
      } else if (event.error === 'no-speech') {
        setSttError(null) // Silence is not an error — just stop naturally
      } else if (event.error !== 'aborted') {
        setSttError(`Voice input error: ${event.error}`)
      }
      setIsListening(false)
    }

    recognition.onend = () => {
      console.log('[STT] Ended')
      setIsListening(false)
      recognitionRef.current = null
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isListening, onTranscript])

  // ── STT: Stop listening ───────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  // ── STT: Toggle ───────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  // ── TTS: Speak text ───────────────────────────────────────────
  const speak = useCallback((text, msgId = null) => {
    if (!isTTSSupported) return

    // Stop any in-progress speech first, then wait for cancel to settle
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setSpeakingMsgId(null)

    if (!text) return

    // 80ms delay: Chrome fires onstart before cancel fully resolves without this
    setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text)

    // Apply selected voice
    if (selectedVoiceURI) {
      const allVoices = window.speechSynthesis.getVoices()
      const voice = allVoices.find(v => v.voiceURI === selectedVoiceURI)
      if (voice) utterance.voice = voice
    }

    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onstart = () => {
      setIsSpeaking(true)
      setSpeakingMsgId(msgId)
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      setSpeakingMsgId(null)
    }

    utterance.onerror = (e) => {
      // 'interrupted' is expected when we cancel — not a real error
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS error:', e.error)
      }
      setIsSpeaking(false)
      setSpeakingMsgId(null)
    }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    }, 80) // 80ms settle time after cancel
  }, [selectedVoiceURI])

  // ── TTS: Stop speaking ────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (isTTSSupported) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
    setSpeakingMsgId(null)
  }, [])

  // ── Stop everything when unmounting ──────────────────────────
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      if (isTTSSupported) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Chrome TTS bug: speechSynthesis pauses after ~15s in Chrome.
  // Workaround: resume every 10s while speaking.
  useEffect(() => {
    if (!isSpeaking) return
    const interval = setInterval(() => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [isSpeaking])

  return {
    // STT
    isSTTSupported,
    isListening,
    startListening,
    stopListening,
    toggleListening,
    sttError,
    // TTS
    isTTSSupported,
    isSpeaking,
    speakingMsgId,
    speak,
    stopSpeaking,
    voices,
  }
}
