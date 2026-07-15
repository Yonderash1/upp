import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const accentIcon = new L.DivIcon({
  className: '',
  html: `<div style="
    background:#ff5c35;
    width:14px;height:14px;
    border-radius:50%;
    border:3px solid white;
    box-shadow:0 2px 8px rgba(255,92,53,0.6);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function LocationSetter({ userPos }) {
  const map = useMap()
  useEffect(() => {
    if (userPos) map.setView(userPos, 13)
  }, [userPos, map])
  return null
}

export default function MapPage() {
  const [events, setEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [userPos, setUserPos] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('events')
      .select('*, profiles(username)')
      .not('lat', 'is', null)
      .gte('event_date', new Date().toISOString())
      .then(({ data }) => setEvents(data || []))

    navigator.geolocation?.getCurrentPosition(
      pos => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => setUserPos([54.5, -3]) // UK fallback
    )
  }, [])

  return (
    <div className="map-page">
      <div className="map-container">
        <MapContainer
          center={userPos || [54.5, -3]}
          zoom={userPos ? 13 : 6}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {userPos && <LocationSetter userPos={userPos} />}

          {events.map(event => (
            event.lat && event.lng ? (
              <Marker
                key={event.id}
                position={[event.lat, event.lng]}
                icon={accentIcon}
                eventHandlers={{ click: () => setSelected(event) }}
              >
                <Popup>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 180 }}>
                    <strong style={{ fontSize: 14 }}>{event.title}</strong>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      {format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}
                    </div>
                    <button
                      onClick={() => navigate(`/event/${event.id}`)}
                      style={{
                        marginTop: 8, background: '#ff5c35', color: '#fff',
                        border: 'none', borderRadius: 6, padding: '5px 12px',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600
                      }}
                    >
                      View event
                    </button>
                  </div>
                </Popup>
              </Marker>
            ) : null
          ))}
        </MapContainer>

        {/* Sidebar */}
        <div className="map-sidebar">
          <div style={{
            background: 'rgba(10,10,15,0.92)',
            backdropFilter: 'blur(10px)',
            border: '1.5px solid var(--border)',
            borderRadius: 12,
            padding: '12px 14px',
          }}>
            <strong style={{ fontFamily: 'Syne, sans-serif', fontSize: 14 }}>
              {events.length} event{events.length !== 1 ? 's' : ''} near you
            </strong>
          </div>

          {events.map(event => (
            <div
              key={event.id}
              className={`map-event-pill ${selected?.id === event.id ? 'selected' : ''}`}
              onClick={() => { setSelected(event); navigate(`/event/${event.id}`) }}
            >
              <h4>{event.title}</h4>
              <p>{format(new Date(event.event_date), 'EEE MMM d · h:mm a')} · {event.location_name}</p>
            </div>
          ))}

          {events.length === 0 && (
            <div className="map-event-pill">
              <h4>No events yet</h4>
              <p>Be the first to post one!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
