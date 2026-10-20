import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import EventLabels from '../components/EventLabels'
import Linkify from '../components/Linkify'
import { formatEventRange } from '../lib/eventUtils'
import { normalizeRole, getAttendState, getJoinStatus, describeJoinAccess } from '../lib/eventAccess'

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
  const [myRole, setMyRole] = useState(null)      // this person's role in the event's group (null = not a member)
  const [interests, setInterests] = useState([])   // user ids of people who tapped "I'm interested"
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchEvent()
    fetchAttendees()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once the event is loaded, work out this person's role and who's interested
  useEffect(() => {
    if (!event) return
    fetchMembership(event.group_id)
    fetchInterests()
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMembership(groupId) {
    if (!groupId) { setMyRole(null); return }
    const { data } = await supabase
      .from('group_members').select('role').eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
    setMyRole(normalizeRole(data?.role))
  }

  async function fetchInterests() {
    const { data } = await supabase.from('event_interests').select('user_id').eq('event_id', id)
    setInterests((data || []).map(r => r.user_id))
  }

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
          .select('*, profiles(username, id), groups(id, name), event_label_assignments(group_labels(id, name))')
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
      const { error } = await supabase.from('attendees').insert({ event_id: id, user_id: user.id })
      if (error) { alert(error.message); fetchAttendees(); return }
      // Confirmed now, so no longer just "interested"
      await supabase.from('event_interests').delete().eq('event_id', id).eq('user_id', user.id)
      fetchInterests()
    }
    fetchAttendees()
  }

  async function toggleInterest() {
    if (interests.includes(user.id)) {
      await supabase.from('event_interests').delete().eq('event_id', id).eq('user_id', user.id)
    } else {
      const { error } = await supabase.from('event_interests').insert({ event_id: id, user_id: user.id })
      if (error) { alert(error.message); return }
    }
    fetchInterests()
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

  const attendState = getAttendState({ event, myRole, isAttending, attendeeCount: attendees.length })
  const canShowInterest = !isAttending && getJoinStatus(event, myRole) === 'ok'
  const interestedCount = interests.filter(uid => !attendees.some(a => a.user_id === uid)).length
  const isInterested = !isAttending && interests.includes(user.id)
  const isFull = event.max_attendees != null && attendees.length >= event.max_attendees

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
          <EventLabels event={event} />
          <h1>{event.title}</h1>
        </div>

        <div className="detail-meta">
          <div className="detail-meta-row">
            <CalIcon />
            {formatEventRange(event.event_date, event.event_end, true)}
          </div>
          <div className="detail-meta-row">
            <PinIcon />
            {event.location_name}
          </div>
          <div className="detail-meta-row">
            <span style={{ width: 18, textAlign: 'center', flexShrink: 0 }}>🎟️</span>
            {describeJoinAccess(event)}
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

        {event.description && <p className="detail-desc"><Linkify text={event.description} /></p>}

        {event.location_details && (
          <div style={{ marginBottom: 24 }}>
            <h3 className="section-title">{event.location_type === 'online' ? 'Online event details' : 'Location details'}</h3>
            <p className="detail-desc" style={{ marginBottom: 0 }}><Linkify text={event.location_details} /></p>
          </div>
        )}

        <div className="attendees-section">
          <h3 className="section-title">
            {event.max_attendees != null
              ? `${attendees.length} / ${event.max_attendees} going`
              : `${attendees.length} ${attendees.length === 1 ? 'person' : 'people'} going`}
            {isFull && <span className="full-badge">Full</span>}
          </h3>
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

        <p className="interest-count">
          ⭐ {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested
        </p>

        <button className={`big-attend-btn ${isAttending ? 'attending' : ''}`} disabled={!attendState.canClick} onClick={toggleAttend}>
          {isAttending ? "✓ You're going — click to cancel" : attendState.canClick ? "I'm going to this!" : attendState.label}
        </button>
        {canShowInterest && (
          <button className={`big-interest-btn ${isInterested ? 'interested' : ''}`} onClick={toggleInterest}>
            {isInterested ? "★ You're interested — click to remove" : "☆ I'm interested"}
          </button>
        )}
      </div>
    </div>
  )
}
