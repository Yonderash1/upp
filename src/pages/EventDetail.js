import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format, formatDistanceToNow } from 'date-fns'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const CalIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const PinIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
const UserIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [isAttending, setIsAttending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchEvent()
    fetchAttendees()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Gives up after a while, so a stuck request shows an error instead of an endless spinner
  function withTimeout(promise, ms = 10000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('The request timed out')), ms))
    ])
  }

  async function fetchEvent() {
    setLoading(true); setLoadError('')
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('events')
          .select('*, profiles(username, id), groups(id, name)')
          .eq('id', id)
          .maybeSingle()
      )
      if (error) throw error
      setEvent(data)
    } catch (err) {
      console.error('Failed to load event:', err)
      setLoadError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function fetchAttendees() {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('attendees')
          .select('user_id, profiles(username)')
          .eq('event_id', id)
      )
      if (error) throw error
      setAttendees(data || [])
      setIsAttending((data || []).some(a => a.user_id === user.id))
    } catch (err) {
      console.error('Failed to load attendees:', err)
    }
  }

  async function toggleAttend() {
    if (isAttending) {
      await supabase.from('attendees').delete().eq('event_id', id).eq('user_id', user.id)
    } else {
      await supabase.from('attendees').insert({ event_id: id, user_id: user.id })
    }
    fetchAttendees()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (loadError) return (
    <div className="page">
      <div className="detail-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }} onClick={() => navigate(-1)}>← Back</button>
        <h2 style={{ marginBottom: 8 }}>Couldn't load this event</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>{loadError}</p>
        <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }}
          onClick={() => { fetchEvent(); fetchAttendees() }}>Try again</button>
      </div>
    </div>
  )
  if (!event) return <div className="page"><div className="detail-page"><h2>Event not found</h2></div></div>

  return (
    <div className="page">
      <div className="detail-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }} onClick={() => navigate(-1)}>
          ← Back
        </button>

        {event.lat && event.lng && (
          <div className="detail-map">
            <MapContainer center={[event.lat, event.lng]} zoom={15} style={{ height: 260 }} zoomControl={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[event.lat, event.lng]} />
            </MapContainer>
          </div>
        )}

        <div className="detail-header">
          <span className="event-category">{event.category}</span>
          <h1>{event.title}</h1>
        </div>

        <div className="detail-meta">
          <div className="detail-meta-row">
            <CalIcon />
            {format(new Date(event.event_date), 'EEEE, MMMM d yyyy · h:mm a')}
          </div>
          <div className="detail-meta-row">
            <PinIcon />
            {event.location_name}
          </div>
          {event.groups && (
            <div className="detail-meta-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/groups/${event.groups.id}`)}>
              <UserIcon />
              Organised by <strong style={{ color: 'var(--accent)', marginLeft: 4 }}>{event.groups.name}</strong>
            </div>
          )}
          <div className="detail-meta-row" style={{ fontSize: 12, color: 'var(--muted)' }}>
            <span>🕐 Posted {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
          </div>
        </div>

        {event.description && <p className="detail-desc">{event.description}</p>}

        <div className="attendees-section">
          <h3 className="section-title">{attendees.length} {attendees.length === 1 ? 'person' : 'people'} going</h3>
          <div className="attendees-list">
            {attendees.map(a => (
              <div key={a.user_id} className="attendee-chip">
                <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 11 }}>
                  {a.profiles?.username?.[0]?.toUpperCase() || '?'}
                </div>
                {a.profiles?.username}
              </div>
            ))}
          </div>
        </div>

        <button className={`big-attend-btn ${isAttending ? 'attending' : ''}`} onClick={toggleAttend}>
          {isAttending ? "✓ You're going — click to cancel" : "I'm going to this!"}
        </button>
      </div>
    </div>
  )
}
