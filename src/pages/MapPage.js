import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat' // adds L.heatLayer (must be imported after leaflet)
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { searchAddress } from '../lib/geocode'
import { eventLabels } from '../lib/eventUtils'

const DEFAULT_CENTER = [54.5, -3]   // used only if the user has no hometown saved
const DEFAULT_ZOOM = 6
const HOME_ZOOM = 12
const KM_PER_MILE = 1.609344

// Small dot for each event. The inner dot grows on hover (see .event-dot in App.css)
const dotIcon = new L.DivIcon({
  className: 'event-dot',
  html: '<div class="event-dot-inner"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -10],
})

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Heatmap layer: the more events overlap, the bigger and hotter it gets ──
function HeatLayer({ events }) {
  const map = useMap()
  useEffect(() => {
    const points = events.map(e => [e.lat, e.lng, 0.45])
    const layer = L.heatLayer(points, {
      radius: 38,
      blur: 28,
      maxZoom: 1,   // keeps intensity the same at every zoom level
      max: 1.0,
      minOpacity: 0.25,
      gradient: { 0.2: '#ffd27a', 0.5: '#ff8c6b', 0.8: '#ff5c35', 1.0: '#d4161c' },
    }).addTo(map)
    return () => { map.removeLayer(layer) }
  }, [events, map])
  return null
}

// ── Custom controls (zoom +/-, compass) so the map works without a mouse ──
function MapControls({ onLocate, locating }) {
  const map = useMap()
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  return (
    <div className="map-controls" ref={ref}>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => map.zoomIn()}>+</button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => map.zoomOut()}>−</button>
      <button
        type="button"
        aria-label="Go to my location"
        title="Go to my location"
        className={locating ? 'locating' : ''}
        onClick={onLocate}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="1" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="23" />
          <line x1="1" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="23" y2="12" />
        </svg>
      </button>
    </div>
  )
}

// Moves the map when `target` changes: { center: [lat,lng], zoom } or { bounds }
function MapMover({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    if (target.bounds) map.flyToBounds(target.bounds, { padding: [40, 40], duration: 0.8 })
    else map.flyTo(target.center, target.zoom, { duration: 0.8 })
  }, [target, map])
  return null
}

// ── A small chip-search box: type, pick from the list, chips appear ──
function ChipSearch({ placeholder, selected, onAdd, onRemove, search }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const found = await search(query.trim())
      if (!cancelled) setResults(found.filter(r => !selected.some(s => s.id === r.id)))
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {selected.length > 0 && (
        <div className="filter-chips">
          {selected.map(s => (
            <span key={s.id} className="filter-chip">
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onRemove(s.id)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => {
            if (e.key === 'Enter' && results[0]) { e.preventDefault(); onAdd(results[0]); setQuery('') }
          }}
        />
        {results.length > 0 && (
          <div className="filter-suggestions">
            {results.map(r => (
              <div key={r.id} onClick={() => { onAdd(r); setQuery('') }}>{r.name}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MatchToggle({ value, onChange }) {
  return (
    <div className="match-toggle">
      <button type="button" className={value === 'any' ? 'on' : ''} onClick={() => onChange('any')}>Any</button>
      <button type="button" className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>All</button>
    </div>
  )
}

export default function MapPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [home, setHome] = useState(null)          // [lat, lng] of saved hometown
  const [friends, setFriends] = useState([])       // accepted connections: [{id, name}]
  const [friendEvents, setFriendEvents] = useState({}) // eventId -> Set(friend ids going / interested)
  const [devicePos, setDevicePos] = useState(null)
  const [locating, setLocating] = useState(false)
  const [mapTarget, setMapTarget] = useState(null)
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 768)

  // ── Filter state ──
  const [labelFilter, setLabelFilter] = useState([])
  const [labelMode, setLabelMode] = useState('all')
  const [peopleFilter, setPeopleFilter] = useState([])
  const [peopleMode, setPeopleMode] = useState('any')
  const [allFriends, setAllFriends] = useState(false)
  const [radiusMode, setRadiusMode] = useState('off') // 'off' | 'device' | 'address'
  const [radiusValue, setRadiusValue] = useState(5)
  const [radiusUnit, setRadiusUnit] = useState('mi')
  const [addressQuery, setAddressQuery] = useState('')
  const [addressResults, setAddressResults] = useState([])
  const [addressPoint, setAddressPoint] = useState(null) // { label, lat, lng }
  const [addressError, setAddressError] = useState('')
  const [deviceError, setDeviceError] = useState('')

  // ── Load everything once ──
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    const [profileRes, eventsRes, connRes] = await Promise.all([
      supabase.from('profiles').select('city_lat, city_lng').eq('id', user.id).maybeSingle(),
      supabase
        .from('events')
        .select('*, profiles(username), event_label_assignments(group_labels(id, name))')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .gte('event_date', new Date().toISOString()),
      supabase
        .from('connections')
        .select('from_user, to_user, from_profile:from_user(id, username), to_profile:to_user(id, username)')
        .eq('status', 'accepted')
        .or(`from_user.eq.${user.id},to_user.eq.${user.id}`),
    ])

    const p = profileRes.data
    if (p?.city_lat != null && p?.city_lng != null) setHome([p.city_lat, p.city_lng])

    const evs = eventsRes.data || []
    setEvents(evs)

    const friendList = (connRes.data || []).map(c => {
      const other = c.from_user === user.id ? c.to_profile : c.from_profile
      return other ? { id: other.id, name: other.username } : null
    }).filter(Boolean)
    setFriends(friendList)

    // Which of my friends are going to / interested in which events
    if (friendList.length > 0 && evs.length > 0) {
      const friendIds = friendList.map(f => f.id)
      const eventIds = evs.map(e => e.id)
      const [going, interested] = await Promise.all([
        supabase.from('attendees').select('event_id, user_id').in('user_id', friendIds).in('event_id', eventIds),
        supabase.from('event_interests').select('event_id, user_id').in('user_id', friendIds).in('event_id', eventIds),
      ])
      const map = {}
      ;[...(going.data || []), ...(interested.data || [])].forEach(r => {
        if (!map[r.event_id]) map[r.event_id] = new Set()
        map[r.event_id].add(r.user_id)
      })
      setFriendEvents(map)
    }
    setLoading(false)
  }

  // ── Locating the device (compass button + "my location" radius) ──
  function locateDevice({ move = true } = {}) {
    if (!navigator.geolocation) { setDeviceError('Location is not available on this device'); return }
    setLocating(true)
    setDeviceError('')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const p = [pos.coords.latitude, pos.coords.longitude]
        setDevicePos(p)
        setLocating(false)
        if (move) setMapTarget({ center: p, zoom: 14, t: Date.now() })
      },
      () => {
        setLocating(false)
        setDeviceError('Could not get your location — check your browser permissions')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // ── Address search for the radius filter ──
  useEffect(() => {
    if (radiusMode !== 'address' || addressQuery.trim().length < 3 || addressPoint?.label === addressQuery) {
      setAddressResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const r = await searchAddress(addressQuery.trim())
        if (!cancelled) { setAddressResults(r); setAddressError(r.length ? '' : 'No matching address found') }
      } catch {
        if (!cancelled) setAddressError('Address search failed — try again')
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [addressQuery, radiusMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // The point the radius is measured from (null if not ready yet)
  const radiusOrigin = radiusMode === 'device' ? devicePos
    : radiusMode === 'address' && addressPoint ? [addressPoint.lat, addressPoint.lng]
    : null
  const radiusKm = (Number(radiusValue) || 0) * (radiusUnit === 'mi' ? KM_PER_MILE : 1)
  const radiusActive = radiusMode !== 'off' && radiusOrigin && radiusKm > 0

  // Move the map to show the circle whenever the origin / size changes
  useEffect(() => {
    if (!radiusActive) return
    const bounds = L.circle(radiusOrigin, { radius: radiusKm * 1000 }).getBounds()
    setMapTarget({ bounds, t: Date.now() })
  }, [radiusActive, radiusOrigin?.[0], radiusOrigin?.[1], radiusKm]) // eslint-disable-line react-hooks/exhaustive-deps

  function chooseRadiusMode(mode) {
    setRadiusMode(mode)
    if (mode === 'device' && !devicePos) locateDevice({ move: false })
  }

  // ── Apply every filter: an event must pass ALL of them ──
  const filtered = useMemo(() => {
    const friendIds = new Set(friends.map(f => f.id))
    return events.filter(ev => {
      const labelIds = new Set(eventLabels(ev).map(l => l.id))
      if (labelFilter.length > 0) {
        const test = l => labelIds.has(l.id)
        if (labelMode === 'all' ? !labelFilter.every(test) : !labelFilter.some(test)) return false
      }

      const going = friendEvents[ev.id] || new Set()
      if (peopleFilter.length > 0) {
        const test = p => going.has(p.id)
        if (peopleMode === 'all' ? !peopleFilter.every(test) : !peopleFilter.some(test)) return false
      }
      if (allFriends) {
        if (![...going].some(id => friendIds.has(id))) return false
      }

      if (radiusActive && distanceKm(radiusOrigin[0], radiusOrigin[1], ev.lat, ev.lng) > radiusKm) return false
      return true
    })
  }, [events, labelFilter, labelMode, peopleFilter, peopleMode, allFriends, friends, friendEvents, radiusActive, radiusOrigin, radiusKm])

  const filtersOn = labelFilter.length > 0 || peopleFilter.length > 0 || allFriends || radiusMode !== 'off'

  function clearFilters() {
    setLabelFilter([]); setPeopleFilter([]); setAllFriends(false)
    setRadiusMode('off'); setAddressQuery(''); setAddressPoint(null); setAddressResults([])
  }

  // ── Search helpers for the two chip boxes ──
  async function searchLabels(q) {
    const { data } = await supabase.from('group_labels').select('id, name').ilike('name', `%${q}%`).order('name').limit(8)
    return data || []
  }
  async function searchFriends(q) {
    const lower = q.toLowerCase()
    return friends.filter(f => f.name.toLowerCase().includes(lower)).slice(0, 8)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="map-page">
      <div className="map-container">
        <MapContainer
          center={home || DEFAULT_CENTER}
          zoom={home ? HOME_ZOOM : DEFAULT_ZOOM}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapMover target={mapTarget} />
          <HeatLayer events={filtered} />

          {radiusActive && (
            <Circle
              center={radiusOrigin}
              radius={radiusKm * 1000}
              pathOptions={{ color: '#ff5c35', weight: 2, dashArray: '6 6', fillColor: '#ff5c35', fillOpacity: 0.06 }}
            />
          )}

          {devicePos && (
            <CircleMarker
              center={devicePos}
              radius={7}
              pathOptions={{ color: '#fff', weight: 3, fillColor: '#3b82f6', fillOpacity: 1 }}
            />
          )}

          {filtered.map(event => (
            <Marker key={event.id} position={[event.lat, event.lng]} icon={dotIcon}>
              <Popup>
                <div style={{ fontFamily: 'DM Sans, sans-serif', minWidth: 180 }}>
                  <strong style={{ fontSize: 14 }}>{event.title}</strong>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                    {format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}
                  </div>
                  {event.location_name && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{event.location_name}</div>
                  )}
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
          ))}

          <MapControls onLocate={() => locateDevice({ move: true })} locating={locating} />
        </MapContainer>

        {deviceError && <div className="map-toast">{deviceError}</div>}

        <button type="button" className="map-panel-toggle" onClick={() => setPanelOpen(o => !o)}>
          {panelOpen ? 'Hide search' : `Search${filtersOn ? ' •' : ''}`}
        </button>

        {panelOpen && (
          <div className="map-sidebar">
            <div className="map-filter-box">
              <div className="map-filter-head">
                <strong style={{ fontFamily: 'Syne, sans-serif', fontSize: 14 }}>
                  {filtered.length} event{filtered.length !== 1 ? 's' : ''} {filtersOn ? 'match' : 'on the map'}
                </strong>
                {filtersOn && <button type="button" className="link-btn" onClick={clearFilters}>Clear all</button>}
              </div>

              {/* Labels */}
              <div className="filter-section">
                <div className="filter-title">
                  <span>Labels</span>
                  {labelFilter.length > 1 && <MatchToggle value={labelMode} onChange={setLabelMode} />}
                </div>
                <ChipSearch
                  placeholder="Search labels..."
                  selected={labelFilter}
                  search={searchLabels}
                  onAdd={l => setLabelFilter(f => [...f, l])}
                  onRemove={id => setLabelFilter(f => f.filter(l => l.id !== id))}
                />
              </div>

              {/* Connections */}
              <div className="filter-section">
                <div className="filter-title">
                  <span>Connections</span>
                  {peopleFilter.length > 1 && <MatchToggle value={peopleMode} onChange={setPeopleMode} />}
                </div>
                <label className="filter-check">
                  <input type="checkbox" checked={allFriends} onChange={e => setAllFriends(e.target.checked)} />
                  All friends
                  <span className="filter-hint">going or interested</span>
                </label>
                <ChipSearch
                  placeholder={friends.length ? 'Search your connections...' : 'No connections yet'}
                  selected={peopleFilter}
                  search={searchFriends}
                  onAdd={p => setPeopleFilter(f => [...f, p])}
                  onRemove={id => setPeopleFilter(f => f.filter(p => p.id !== id))}
                />
              </div>

              {/* Radius */}
              <div className="filter-section">
                <div className="filter-title"><span>Distance</span></div>
                <div className="radius-modes">
                  <button type="button" className={radiusMode === 'off' ? 'on' : ''} onClick={() => chooseRadiusMode('off')}>Off</button>
                  <button type="button" className={radiusMode === 'device' ? 'on' : ''} onClick={() => chooseRadiusMode('device')}>My location</button>
                  <button type="button" className={radiusMode === 'address' ? 'on' : ''} onClick={() => chooseRadiusMode('address')}>Address</button>
                </div>

                {radiusMode === 'device' && !devicePos && (
                  <div className="filter-hint" style={{ marginTop: 8 }}>
                    {locating ? 'Finding your location...' : 'Waiting for your device location'}
                  </div>
                )}

                {radiusMode === 'address' && (
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <input
                      value={addressQuery}
                      onChange={e => { setAddressQuery(e.target.value); setAddressPoint(null); setAddressError('') }}
                      placeholder="Enter an address or place..."
                    />
                    {addressResults.length > 0 && (
                      <div className="filter-suggestions">
                        {addressResults.map((r, i) => (
                          <div key={i} onClick={() => {
                            setAddressPoint(r); setAddressQuery(r.label); setAddressResults([])
                          }}>{r.label}</div>
                        ))}
                      </div>
                    )}
                    {addressError && <div className="filter-hint" style={{ marginTop: 6, color: '#e74c3c' }}>{addressError}</div>}
                  </div>
                )}

                {radiusMode !== 'off' && (
                  <div className="radius-input">
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={radiusValue}
                      onChange={e => setRadiusValue(e.target.value)}
                    />
                    <select value={radiusUnit} onChange={e => setRadiusUnit(e.target.value)}>
                      <option value="mi">miles</option>
                      <option value="km">kilometres</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Matching events */}
            {filtered.map(event => (
              <div
                key={event.id}
                className="map-event-pill"
                onClick={() => navigate(`/event/${event.id}`)}
              >
                <h4>{event.title}</h4>
                <p>{format(new Date(event.event_date), 'EEE MMM d · h:mm a')} · {event.location_name}</p>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="map-event-pill">
                <h4>{filtersOn ? 'No events match' : 'No events yet'}</h4>
                <p>{filtersOn ? 'Try removing a filter or widening the distance.' : 'Be the first to post one!'}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
