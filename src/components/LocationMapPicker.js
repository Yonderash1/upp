import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import '../lib/leafletIcons'
import { searchAddress } from '../lib/geocode'

// Only drops a pin while there isn't one yet — after that, Reset is needed to place it again
function ClickHandler({ enabled, onPick }) {
  useMapEvents({ click(e) { if (enabled) onPick(e.latlng) } })
  return null
}

// Leaflet needs to be told when its box changes size
function ResizeOnToggle({ expanded }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80)
    return () => clearTimeout(t)
  }, [expanded, map])
  return null
}

// Glides the map to an address that was picked from the search box
function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { duration: 0.8 })
  }, [target, map])
  return null
}

// Search box: type an address or place, press Enter / Search, then pick a result to pin it.
// (Searches only run on Enter or the button — never as you type — to stay friendly to the free OpenStreetMap service.)
function AddressSearch({ onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)   // null = nothing searched yet
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function run() {
    const q = query.trim()
    if (q.length < 3 || busy || disabled) return
    setBusy(true); setMessage(''); setResults(null)
    try {
      const found = await searchAddress(q)
      if (found.length === 0) setMessage('No matching addresses found')
      setResults(found)
    } catch {
      setMessage("Couldn't search just now — please try again")
    } finally {
      setBusy(false)
    }
  }

  function choose(r) {
    setResults(null); setMessage(''); setQuery(r.label)
    onSelect(r)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); run() }          // never submits the event form
    if (e.key === 'Escape' && (results || message)) {             // closes the list instead of leaving the expanded map
      e.nativeEvent.stopPropagation()
      setResults(null); setMessage('')
    }
  }

  return (
    <div className="addr-search">
      <div className="addr-row">
        <input
          value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKeyDown}
          disabled={disabled} maxLength={150} autoComplete="off"
          placeholder={disabled ? 'Reset the pin to search for another address' : '🔍 Search for an address or place…'}
          aria-label="Search for an address"
        />
        <button type="button" onClick={run} disabled={disabled || busy || query.trim().length < 3}>
          {busy ? '…' : 'Search'}
        </button>
      </div>
      {message && <div className="addr-msg">{message}</div>}
      {results && results.length > 0 && (
        <ul className="addr-results">
          {results.map(r => (
            <li key={`${r.lat},${r.lng},${r.label}`}>
              <button type="button" onClick={() => choose(r)}>📍 {r.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Click-to-pin map with scroll-wheel zoom, address search, and an expanded full-screen view.
//   onPick(point, label?)  – called with the pin position (and the address text when it came from search)
//   onReset()              – removes the pin so a new one can be placed
export default function LocationMapPicker({ latlng, onPick, onReset, hint }) {
  const [expanded, setExpanded] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null)
  const pinned = !!latlng

  // Esc leaves the expanded view
  useEffect(() => {
    if (!expanded) return
    const onKey = e => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  function pickFromSearch(r) {
    onPick({ lat: r.lat, lng: r.lng }, r.label)
    setFlyTarget({ lat: r.lat, lng: r.lng, t: Date.now() })
  }

  const resetButton = (className) => (
    <button type="button" className={className} onClick={onReset} title="Remove the pin so you can place it again">↺ Reset</button>
  )

  return (
    <div className={`location-picker ${expanded ? 'expanded' : ''} ${pinned ? 'has-pin' : 'no-pin'}`}>
      <div className="map-frame">
        <MapContainer
          center={latlng ? [latlng.lat, latlng.lng] : [54.5, -3]}
          zoom={latlng ? 13 : 5}
          style={{ height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler enabled={!pinned} onPick={onPick} />
          <ResizeOnToggle expanded={expanded} />
          <FlyTo target={flyTarget} />
          {latlng && <Marker position={latlng} />}
        </MapContainer>

        <div className="map-toolbar">
          {pinned && !expanded && resetButton('')}
          <button type="button" onClick={() => setExpanded(e => !e)}>
            {expanded ? '✕ Exit expanded view' : '⤢ Expand'}
          </button>
        </div>

        {expanded && <div className="map-search-float"><AddressSearch onSelect={pickFromSearch} disabled={pinned} /></div>}

        {expanded && pinned && (
          <div className="map-bottom-bar">
            {resetButton('map-reset')}
            <button type="button" className="map-done" onClick={() => setExpanded(false)}>✓ Done</button>
          </div>
        )}
      </div>

      {!expanded && <div className="map-search-below"><AddressSearch onSelect={pickFromSearch} disabled={pinned} /></div>}
      <div className="location-hint">{hint}</div>
    </div>
  )
}
