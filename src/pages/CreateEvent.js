import { useState } from 'react'
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
  useMapEvents({
    click(e) {
      onSelect(e.latlng)
    }
  })
  return null
}

export default function CreateEvent() {
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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!latlng) { setError('Please click the map to set the event location'); return }
    if (!date || !time) { setError('Please set a date and time'); return }

    setLoading(true)
    setError('')

    const eventDate = new Date(`${date}T${time}`)

    const { error: err } = await supabase.from('events').insert({
      title,
      description,
      location_name: locationName,
      lat: latlng.lat,
      lng: latlng.lng,
      event_date: eventDate.toISOString(),
      category,
      user_id: user.id,
    })

    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="page">
      <div className="create-page">
        <h1>Post an Event</h1>
        <p className="subtitle">Tell people what's happening near you</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Event Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give your event a name"
              required
            />
          </div>

          <div className="field">
            <label>Category</label>
            <div className="category-grid">
              {CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat}
                  className={`category-btn ${category === cat ? 'active' : ''}`}
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} required />
            </div>
          </div>

          <div className="field">
            <label>Location Name</label>
            <input
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
              placeholder="e.g. Central Park, The Venue, etc."
              required
            />
          </div>

          <div className="field full">
            <label>Pin it on the map</label>
            <div className="location-picker">
              <MapContainer
                center={[54.5, -3]}
                zoom={5}
                style={{ height: 220 }}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; OpenStreetMap'
                />
                <LocationPicker onSelect={setLatlng} />
                {latlng && <Marker position={latlng} />}
              </MapContainer>
              <div className="location-hint">
                {latlng
                  ? `📍 Pinned at ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`
                  : 'Click on the map to drop a pin for your event location'}
              </div>
            </div>
          </div>

          <div className="field">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's happening? Add any details people should know..."
              rows={4}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Posting...' : 'Post Event'}
          </button>
        </form>
      </div>
    </div>
  )
}
