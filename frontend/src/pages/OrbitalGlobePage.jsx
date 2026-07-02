import React, { useState, useEffect, useRef } from 'react'
import { Viewer, Entity, PointGraphics } from 'resium'
import { Ion, Cartesian3, Color } from 'cesium'
import "cesium/Build/Cesium/Widgets/widgets.css"
import { useUserKeys } from '../hooks/useUserKeys'
import PageMeta from '../components/PageMeta'
import feedback from '../utils/feedback'

// ─── Critical: read token from localStorage synchronously at module level ─────
// If Ion.defaultAccessToken is set AFTER the Viewer first renders, Cesium
// will try to load base imagery with the empty default token and fail.
// We must ensure it's set before the component tree renders the Viewer.
function getStoredToken() {
  try {
    return localStorage.getItem('signal_user_cesium_key') || ''
  } catch {
    return ''
  }
}

const _initialToken = getStoredToken()
if (_initialToken) {
  Ion.defaultAccessToken = _initialToken
}

export default function OrbitalGlobePage() {
  const { getKey } = useUserKeys()
  const cesiumToken = getKey('cesium')
  const groqKey = getKey('groq')

  const [satellites, setSatellites] = useState([])
  const [selectedSat, setSelectedSat] = useState(null)
  const [intelData, setIntelData] = useState(null)
  const [loadingIntel, setLoadingIntel] = useState(false)
  const [loadingSats, setLoadingSats] = useState(false)
  const [trackError, setTrackError] = useState(null)
  const [error, setError] = useState(null)
  const viewerRef = useRef(null)

  // Sync token to Ion whenever it changes (e.g., user pastes it in settings)
  useEffect(() => {
    if (cesiumToken) {
      Ion.defaultAccessToken = cesiumToken
    }
  }, [cesiumToken])

  // Fetch satellite positions from backend
  useEffect(() => {
    if (!cesiumToken) return
    fetchTracking()
    const interval = setInterval(fetchTracking, 60000)
    return () => clearInterval(interval)
  }, [cesiumToken])

  async function fetchTracking() {
    setLoadingSats(true)
    setTrackError(null)
    try {
      const response = await fetch('/api/orbital/track', {
        headers: { 'x-cesium-token': cesiumToken || '' }
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${response.status}`)
      }
      const data = await response.json()
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No satellite data returned.')
      }
      setSatellites(data)
    } catch (err) {
      console.error('Orbital track fetch error:', err)
      setTrackError(err.message || 'Unable to establish link with tracking telemetry.')
    } finally {
      setLoadingSats(false)
    }
  }

  // Fetch AI intel for a selected satellite
  const handleEntityClick = async (sat) => {
    feedback.tap()
    setSelectedSat(sat)
    setIntelData(null)
    setLoadingIntel(true)

    try {
      const response = await fetch('/api/orbital/intel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-groq-key': groqKey || '',
          'x-cesium-token': cesiumToken || ''
        },
        body: JSON.stringify({ satellite_id: sat.name })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        if (response.status === 401) throw new Error('Groq API Key missing or invalid.')
        throw new Error(err.detail || 'Intel agent failed to analyze satellite.')
      }

      const data = await response.json()
      setIntelData(data)
    } catch (err) {
      console.error('Intel fetch error:', err)
      setIntelData({ title: 'Analysis Error', summary: err.message, content: '' })
    } finally {
      setLoadingIntel(false)
    }
  }

  // Auto-fly to ISS
  const handleTrackISS = () => {
    feedback.tap()
    const iss = satellites.find(s => s.name.toUpperCase().includes('ISS') || s.name.toUpperCase().includes('ZARYA'))
    if (iss && viewerRef.current?.cesiumElement) {
      viewerRef.current.cesiumElement.camera.flyTo({
        destination: Cartesian3.fromDegrees(iss.lon, iss.lat, iss.alt + 2000000),
        duration: 2.0
      })
      handleEntityClick(iss)
    }
  }

  const effectiveToken = cesiumToken || _initialToken

  return (
    <div className="flex flex-col h-full bg-background page-enter relative overflow-hidden">
      <PageMeta title="Orbital | SIGNAL" description="Real-time orbital tracking and intelligence" />

      {/* Header */}
      <div className="border-b-2 border-outline-variant bg-surface-container-low px-margin-mobile md:px-margin-desktop py-sm shrink-0 flex justify-between items-center z-10 ambient-shadow">
        <div>
          <h1 className="headline-3d font-headline-lg-mobile text-primary font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[24px]">satellite</span>
            Orbital Engine
          </h1>
          <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mt-0.5">
            {loadingSats ? 'Acquiring satellite positions...' : `Active Targets: ${satellites.length}`}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          {trackError && (
            <button
              onClick={fetchTracking}
              className="btn-ghost text-[11px] py-xs text-error border-error"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Retry Link
            </button>
          )}
          <button onClick={handleTrackISS} disabled={satellites.length === 0} className="btn-primary text-[11px] py-xs flex items-center gap-xs disabled:opacity-40">
            <span className="material-symbols-outlined text-[14px]">my_location</span>
            Track ISS
          </button>
        </div>
      </div>

      <div className="flex-1 relative flex">
        {/* Globe Container */}
        <div className="flex-1 relative bg-black">

          {/* No token overlay */}
          {!effectiveToken && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-surface-container/80 backdrop-blur-sm">
              <div className="tactical-card max-w-sm text-center p-lg">
                <span className="material-symbols-outlined text-error text-[48px] mb-md block">vpn_key_off</span>
                <p className="font-mono text-[12px] text-on-surface uppercase tracking-[1px] mb-sm">Missing Cesium Token</p>
                <p className="font-mono text-[10px] text-outline mb-md">Configure your Cesium ION token in Settings to enable the Orbital Engine.</p>
                <a href="/settings" className="btn-primary text-[11px]">
                  <span className="material-symbols-outlined text-[14px]">settings</span>
                  Open Settings
                </a>
              </div>
            </div>
          )}

          {/* Track error overlay */}
          {effectiveToken && trackError && satellites.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-surface-container/60 backdrop-blur-sm">
              <div className="tactical-card max-w-sm text-center p-lg">
                <span className="material-symbols-outlined text-error text-[48px] mb-md block">satellite_alt</span>
                <p className="font-mono text-[12px] text-on-surface uppercase tracking-[1px] mb-sm">Telemetry Link Lost</p>
                <p className="font-mono text-[10px] text-outline mb-md">{trackError}</p>
                <button onClick={fetchTracking} className="btn-primary text-[11px]">
                  <span className="material-symbols-outlined text-[14px]">refresh</span>
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Satellite loading indicator */}
          {effectiveToken && loadingSats && satellites.length === 0 && !trackError && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-md">
                <span className="material-symbols-outlined text-primary text-[48px] animate-pulse">satellite_alt</span>
                <span className="font-mono text-[11px] text-primary tracking-[2px] uppercase animate-pulse">Acquiring TLE Data...</span>
              </div>
            </div>
          )}

          {/* Cesium Viewer — only mounts when token is confirmed available */}
          {effectiveToken && (
            <Viewer
              ref={viewerRef}
              full
              baseLayerPicker={false}
              animation={false}
              timeline={false}
              geocoder={false}
              homeButton={false}
              infoBox={false}
              sceneModePicker={false}
              navigationHelpButton={false}
              selectionIndicator={false}
            >
              {satellites.map(sat => (
                <Entity
                  key={sat.id}
                  position={Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt)}
                  name={sat.name}
                  onClick={() => handleEntityClick(sat)}
                >
                  <PointGraphics
                    pixelSize={selectedSat?.id === sat.id ? 10 : 5}
                    color={selectedSat?.id === sat.id ? Color.YELLOW : Color.LIME}
                    outlineColor={Color.BLACK}
                    outlineWidth={1}
                  />
                </Entity>
              ))}
            </Viewer>
          )}
        </div>

        {/* Intel Panel */}
        {selectedSat && (
          <div className="w-80 bg-surface-container-low border-l-2 border-outline-variant flex flex-col z-10 shrink-0 h-full ambient-shadow">
            <div className="p-sm border-b border-outline-variant flex justify-between items-center bg-surface-container">
              <span className="font-mono text-[11px] text-primary tracking-[2px] uppercase">Telemetry Lock</span>
              <button onClick={() => setSelectedSat(null)} className="text-outline hover:text-on-surface">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="p-md flex-1 overflow-y-auto">
              <div className="mb-md">
                <p className="font-mono text-[10px] text-outline tracking-[1px] uppercase mb-1">Target ID</p>
                <p className="font-mono text-[14px] text-on-surface font-bold break-words">{selectedSat.name}</p>
                <div className="flex gap-sm mt-xs flex-wrap">
                  <span className="chip-category bg-surface-container-highest">Lat: {selectedSat.lat.toFixed(2)}°</span>
                  <span className="chip-category bg-surface-container-highest">Lon: {selectedSat.lon.toFixed(2)}°</span>
                  <span className="chip-category bg-surface-container-highest">Alt: {Math.round(selectedSat.alt / 1000)}km</span>
                </div>
              </div>

              <div className="w-full h-px bg-outline-variant my-md" />

              <div>
                <p className="font-mono text-[10px] text-primary tracking-[2px] uppercase mb-sm flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[12px]">analytics</span>
                  AI Strategic Intel
                </p>

                {!groqKey && (
                  <p className="font-mono text-[10px] text-error">Missing Groq Key. Configure in Settings for intelligence analysis.</p>
                )}

                {groqKey && loadingIntel && (
                  <div className="flex items-center gap-xs text-outline animate-pulse">
                    <span className="material-symbols-outlined text-[14px] animate-spin">hourglass_empty</span>
                    <span className="font-mono text-[10px] uppercase">Analyzing target profile...</span>
                  </div>
                )}

                {intelData && (
                  <div className="tactical-card p-sm bg-surface-container-lowest">
                    <h3 className="font-display-md text-[14px] text-on-surface mb-xs">{intelData.title}</h3>
                    <p className="font-body-sm text-[12px] text-on-surface-variant leading-relaxed mb-sm">
                      {intelData.summary}
                    </p>
                    {intelData.content && (
                      <div className="pt-sm border-t border-outline-variant/30 mt-xs font-mono text-[10px] text-outline whitespace-pre-wrap leading-relaxed">
                        {intelData.content}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
