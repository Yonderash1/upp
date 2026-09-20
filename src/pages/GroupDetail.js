import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const CATEGORIES = ['Music', 'Sport', 'Food', 'Art', 'Social', 'Tech', 'Outdoor', 'Festival', 'Other']

const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
const roleLabel = { creator: '⭐ Creator', owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }

function LocationPicker({ onSelect }) {
  useMapEvents({ click(e) { onSelect(e.latlng) } })
  return null
}

function PostEventForm({ groupId, userId, onSuccess, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [locationName, setLocationName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [category, setCategory] = useState('Social')
  const [latlng, setLatlng] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!latlng) { setError('Please click the map to pin the location'); return }
    if (!date || !time) { setError('Please set a date and time'); return }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('events').insert({
      title, description,
      location_name: locationName,
      lat: latlng.lat, lng: latlng.lng,
      event_date: new Date(`${date}T${time}`).toISOString(),
      category,
      user_id: userId,
      group_id: groupId,
    })
    if (err) { setError(err.message); setLoading(false) }
    else onSuccess()
  }

  return (
    <div style={{
      background: 'var(--bg2)', border: '1.5px solid var(--accent)',
      borderRadius: 14, padding: 24, marginBottom: 24
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.1rem' }}>Post a New Event</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Event Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your event a name" required />
        </div>

        <div className="field">
          <label>Category</label>
          <div className="category-grid">
            {CATEGORIES.map(cat => (
              <button type="button" key={cat}
                className={`category-btn ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}>{cat}
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
          <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. The Sports Centre, Bristol" required />
        </div>

        <div className="field">
          <label>Pin on the map</label>
          <div className="location-picker">
            <MapContainer center={[54.5, -3]} zoom={5} style={{ height: 200 }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LocationPicker onSelect={setLatlng} />
              {latlng && <Marker position={latlng} />}
            </MapContainer>
            <div className="location-hint">
              {latlng ? `📍 ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}` : 'Click the map to drop a pin'}
            </div>
          </div>
        </div>

        <div className="field">
          <label>Description (optional)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Any details people should know..." rows={3} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Posting...' : 'Post Event'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

export default function GroupDetail() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [myMembership, setMyMembership] = useState(null)
  const [pendingRequests, setPendingRequests] = useState([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [hasRequested, setHasRequested] = useState(false)
  const [showPostForm, setShowPostForm] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const isCreator = myMembership?.role === 'creator'
  const isAdmin = ['creator', 'owner', 'admin'].includes(myMembership?.role)
  const canManageMembers = ['creator', 'owner'].includes(myMembership?.role)

  useEffect(() => {
    fetchAll()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [groupRes, membersRes, eventsRes, myRes, memberData, requestRes, myRequestRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*, profiles(id, username)').eq('group_id', id),
      supabase.from('events').select('*, profiles(username)').eq('group_id', id).order('event_date', { ascending: true }).gte('event_date', new Date().toISOString()),
      supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('user_id').eq('group_id', id),
      supabase.from('group_join_requests').select('*, profiles(username)').eq('group_id', id),
      supabase.from('group_join_requests').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle()
    ])

    setGroup(groupRes.data)
    setMembers(membersRes.data || [])
    setEvents(eventsRes.data || [])
    setMyMembership(myRes.data)
    setMemberCount((memberData.data || []).length)
    setPendingRequests(requestRes.data || [])
    setHasRequested(!!myRequestRes.data)
    setLoading(false)
  }

  async function handleJoin() {
    setJoining(true)
    if (group.join_mode === 'open') {
      await supabase.from('group_members').insert({ group_id: id, user_id: user.id, role: 'member' })
    } else if (group.join_mode === 'request') {
      await supabase.from('group_join_requests').insert({ group_id: id, user_id: user.id })
      setHasRequested(true)
    }
    fetchAll()
    setJoining(false)
  }

  async function handleLeave() {
    if (isCreator) { alert("You're the creator — you cannot leave your own group."); return }
    await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', user.id)
    setMyMembership(null)
    fetchAll()
  }

  async function approveRequest(reqUserId) {
    await supabase.from('group_join_requests').delete().eq('group_id', id).eq('user_id', reqUserId)
    await supabase.from('group_members').insert({ group_id: id, user_id: reqUserId, role: 'member' })
    fetchAll()
  }

  async function denyRequest(reqUserId) {
    await supabase.from('group_join_requests').delete().eq('group_id', id).eq('user_id', reqUserId)
    fetchAll()
  }

  async function changeRole(memberId, newRole) {
    await supabase.from('group_members').update({ role: newRole }).eq('group_id', id).eq('user_id', memberId)
    fetchAll()
  }

  async function removeMember(memberId) {
    await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', memberId)
    fetchAll()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!group) return <div className="page"><div className="detail-page"><h2>Group not found</h2></div></div>

  const canSeeMembers = isAdmin || group.members_visible

  return (
    <div className="page">
      <div className="detail-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }} onClick={() => navigate('/groups')}>
          ← Groups
        </button>

        {/* Header */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, flexShrink: 0
          }}>
            {group.name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{group.name}</h1>
            <div style={{ display: 'flex', gap: 14, color: 'var(--muted)', fontSize: 13, flexWrap: 'wrap' }}>
              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
              <span>{joinModeLabel[group.join_mode]}</span>
              {myMembership && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {roleLabel[myMembership.role]}
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <Link to={`/groups/${id}/settings`} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}>
              ⚙ Settings
            </Link>
          )}
        </div>

        {group.description && (
          <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>{group.description}</p>
        )}

        {/* Join / Leave */}
        {!myMembership && group.join_mode !== 'invite' && (
          <button className="btn btn-primary" onClick={handleJoin} disabled={joining || hasRequested} style={{ marginBottom: 28 }}>
            {hasRequested ? '✓ Request sent' : joining ? 'Joining...' : group.join_mode === 'request' ? 'Request to join' : 'Join group'}
          </button>
        )}
        {!myMembership && group.join_mode === 'invite' && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', marginBottom: 28, fontSize: 14, color: 'var(--muted)' }}>
            This group is invite only — contact an admin to join.
          </div>
        )}
        {myMembership && !isCreator && (
          <button className="btn btn-ghost" onClick={handleLeave} style={{ marginBottom: 28, fontSize: 13 }}>
            Leave group
          </button>
        )}

        {/* Pending join requests */}
        {isAdmin && pendingRequests.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 className="section-title">
              Join Requests <span style={{ color: 'var(--accent)' }}>{pendingRequests.length}</span>
            </h3>
            {pendingRequests.map(req => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar-sm">{req.profiles?.username?.[0]?.toUpperCase()}</div>
                  <span style={{ fontSize: 14 }}>@{req.profiles?.username}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="attend-btn" onClick={() => approveRequest(req.user_id)}>Approve</button>
                  <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => denyRequest(req.user_id)}>Deny</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Events section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 className="section-title" style={{ marginBottom: 0, borderBottom: 'none' }}>Upcoming Events</h3>
            {isAdmin && !showPostForm && (
              <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }} onClick={() => setShowPostForm(true)}>
                + Post Event
              </button>
            )}
          </div>

          {/* Inline post event form */}
          {showPostForm && (
            <PostEventForm
              groupId={id}
              userId={user.id}
              onSuccess={() => { setShowPostForm(false); fetchAll() }}
              onCancel={() => setShowPostForm(false)}
            />
          )}

          {events.length === 0 && !showPostForm ? (
            <div style={{ padding: '20px 0', color: 'var(--muted)', fontSize: 14 }}>
              {isAdmin ? 'No upcoming events — post one above!' : 'No upcoming events yet'}
            </div>
          ) : (
            events.map(event => (
              <div key={event.id} className="event-card" onClick={() => navigate(`/event/${event.id}`)}>
                <span className="event-category">{event.category}</span>
                <h3 className="event-title">{event.title}</h3>
                <div className="event-meta">
                  <span>{format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}</span>
                  <span>{event.location_name}</span>
                </div>
                {event.description && <p className="event-desc">{event.description}</p>}
              </div>
            ))
          )}
        </div>

        {/* Members */}
        <div>
          <h3 className="section-title">
            {canSeeMembers ? `Members (${members.length})` : `${memberCount} members`}
          </h3>
          {!canSeeMembers && (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Member list is only visible to admins</p>
          )}
          {canSeeMembers && members.map(m => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar-sm" style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${m.profiles?.id}`)}>
                  {m.profiles?.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, cursor: 'pointer' }} onClick={() => navigate(`/profile/${m.profiles?.id}`)}>
                    @{m.profiles?.username}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{roleLabel[m.role]}</div>
                </div>
              </div>
              {canManageMembers && m.user_id !== user.id && m.role !== 'creator' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.role === 'member' && (
                    <button className="attend-btn" style={{ fontSize: 12 }} onClick={() => changeRole(m.user_id, 'admin')}>
                      Make Admin
                    </button>
                  )}
                  {m.role === 'admin' && (
                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => changeRole(m.user_id, 'member')}>
                      Demote
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }} onClick={() => removeMember(m.user_id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
