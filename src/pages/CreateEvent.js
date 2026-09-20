import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const CATEGORIES = ['Music', 'Sport', 'Food', 'Art', 'Social', 'Tech', 'Outdoor', 'Festival', 'Other']

function LocationPicker({ onSelect }) {
  useMapEvents({ click(e) { onSelect(e.latlng) } })
  return null
}

export default function CreateEvent() {
  const [adminGroups, setAdminGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationName, setLocationName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [category, setCategory] = useState('Social')
  const [latlng, setLatlng] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchAdminGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAdminGroups() {
    const { data } = await supabase
      .from('group_members')
      .select('group_id, role, groups(id, name)')
      .eq('user_id', user.id)
      .in('role', ['creator', 'owner', 'admin'])
    const groups = (data || []).map(m => m.groups).filter(Boolean)
    setAdminGroups(groups)
    if (groups.length === 1) setSelectedGroup(groups[0].id)
    setLoadingGroups(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedGroup) { setError('Please select a group to post this event under'); return }
    if (!latlng) { setError('Please click the map to set the event location'); return }
    if (!date || !time) { setError('Please set a date and time'); return }
    setLoading(true)
    setError('')
    const eventDate = new Date(`${date}T${time}`)
    const { error: err } = await supabase.from('events').insert({
      title, description, location_name: locationName,
      lat: latlng.lat, lng: latlng.lng,
      event_date: eventDate.toISOString(),
      category, user_id: user.id, group_id: selectedGroup,
    })
    if (err) { setError(err.message); setLoading(false) }
    else navigate('/')
  }

  if (loadingGroups) return <div className="loading-screen"><div className="spinner" /></div>

  if (adminGroups.length === 0) {
    return (
      <div className="page">
        <div className="create-page">
          <h1>Post an Event</h1>
          <div style={{ marginTop: 32, padding: '28px 24px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h3 style={{ marginBottom: 10 }}>You need to be a group admin to post events</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Events on Upp are posted by groups. Create your own group and you'll automatically become its creator, letting you post events straight away.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/groups/create')}>Create a Group</button>
              <button className="btn btn-ghost" onClick={() => navigate('/groups')}>Browse Groups</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="create-page">
        <h1>Post an Event</h1>
        <p className="subtitle">Tell people what's happening near you</p>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Posting as</label>
            {adminGroups.length === 1 ? (
              <div style={{ padding: '12px 16px', background: 'var(--bg3)', border: '1.5px solid var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>
                  {adminGroups[0].name[0].toUpperCase()}
                </div>
                <span style={{ fontWeight: 600 }}>{adminGroups[0].name}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {adminGroups.map(g => (
                  <div key={g.id} onClick={() => setSelectedGroup(g.id)} style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${selectedGroup === g.id ? 'var(--accent)' : 'var(--border)'}`, background: selectedGroup === g.id ? 'rgba(255,92,53,0.08)' : 'var(--bg3)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>
                      {g.name[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, color: selectedGroup === g.id ? 'var(--accent)' : 'var(--text)' }}>{g.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <label>Event Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your event a name" required />
          </div>
          <div className="field">
            <label>Category</label>
            <div className="category-grid">
              {CATEGORIES.map(cat => (
                <button type="button" key={cat} className={`category-btn ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>{cat}</button>
              ))}
            </div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="field"><label>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} required /></div>
          </div>
          <div className="field">
            <label>Location Name</label>
            <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. Central Park, The Venue, etc." required />
          </div>
          <div className="field full">
            <label>Pin it on the map</label>
            <div className="location-picker">
              <MapContainer center={[54.5, -3]} zoom={5} style={{ height: 220 }}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <LocationPicker onSelect={setLatlng} />
                {latlng && <Marker position={latlng} />}
              </MapContainer>
              <div className="location-hint">
                {latlng ? `📍 Pinned at ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}` : 'Click on the map to drop a pin for your event location'}
              </div>
            </div>
          </div>
          <div className="field">
            <label>Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's happening? Add any details people should know..." rows={4} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Posting...' : 'Post Event'}
          </button>
        </form>
      </div>
    </div>
  )
}
