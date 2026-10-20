import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function ClickHandler({ onPick }) {
  useMapEvents({ click(e) { onPick(e.latlng) } })
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

// Click-to-pin map with scroll-wheel zoom, an expanded full-screen view, and a reset button.
export default function LocationMapPicker({ latlng, onPick, onReset, hint }) {
  const [expanded, setExpanded] = useState(false)

  // Esc leaves the expanded view
  useEffect(() => {
    if (!expanded) return
    const onKey = e => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <div className={`location-picker ${expanded ? 'expanded' : ''}`}>
      <div className="map-frame">
        <MapContainer
          center={latlng ? [latlng.lat, latlng.lng] : [54.5, -3]}
          zoom={latlng ? 13 : 5}
          style={{ height: '100%' }}
          scrollWheelZoom
        >
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPick={onPick} />
          <ResizeOnToggle expanded={expanded} />
          {latlng && <Marker position={latlng} />}
        </MapContainer>

        <div className="map-toolbar">
          {latlng && (
            <button type="button" onClick={onReset} title="Remove the pin and location name">↺ Reset</button>
          )}
          <button type="button" onClick={() => setExpanded(e => !e)}>
            {expanded ? '✕ Exit expanded view' : '⤢ Expand'}
          </button>
        </div>
      </div>
      <div className="location-hint">{hint}</div>
    </div>
  )
}
