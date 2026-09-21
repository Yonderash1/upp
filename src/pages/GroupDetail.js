import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
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

const CATEGORIES = ['Music', 'Sport', 'Food', 'Art', 'Social', 'Tech', 'Outdoor', 'Festival', 'Other']
const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }

function LocationPicker({ onSelect }) {
  useMapEvents({ click(e) { onSelect(e.latlng) } })
  return null
}

// ── Lightbox ─────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, cursor: 'zoom-out'
      }}
    >
      <img
        src={src}
        alt="Full size"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '90vh',
          borderRadius: 10, objectFit: 'contain',
          boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
          cursor: 'default'
        }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 24,
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: '#fff', fontSize: 24, cursor: 'pointer',
          borderRadius: '50%', width: 40, height: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >✕</button>
    </div>
  )
}

// ── Post Event Form ───────────────────────────────────────────
function PostEventForm({ groupId, userId, editEvent, onSuccess, onCancel }) {
  const [title, setTitle] = useState(editEvent?.title || '')
  const [description, setDescription] = useState(editEvent?.description || '')
  const [locationName, setLocationName] = useState(editEvent?.location_name || '')
  const [date, setDate] = useState(editEvent ? editEvent.event_date.slice(0, 10) : '')
  const [time, setTime] = useState(editEvent ? editEvent.event_date.slice(11, 16) : '')
  const [category, setCategory] = useState(editEvent?.category || 'Social')
  const [latlng, setLatlng] = useState(editEvent?.lat ? { lat: editEvent.lat, lng: editEvent.lng } : null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!latlng) { setError('Please click the map to pin the location'); return }
    if (!date || !time) { setError('Please set a date and time'); return }
    setLoading(true); setError('')
    const payload = {
      title, description, location_name: locationName,
      lat: latlng.lat, lng: latlng.lng,
      event_date: new Date(`${date}T${time}`).toISOString(),
      category, user_id: userId, group_id: groupId,
    }
    const { error: err } = editEvent
      ? await supabase.from('events').update(payload).eq('id', editEvent.id)
      : await supabase.from('events').insert(payload)
    if (err) { setError(err.message); setLoading(false) }
    else onSuccess()
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--accent)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.1rem' }}>{editEvent ? 'Edit Event' : 'Post a New Event'}</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label>Event Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your event a name" required /></div>
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
        <div className="field"><label>Location Name</label><input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="e.g. The Sports Centre, Bristol" required /></div>
        <div className="field">
          <label>Pin on the map</label>
          <div className="location-picker">
            <MapContainer center={latlng ? [latlng.lat, latlng.lng] : [54.5, -3]} zoom={latlng ? 13 : 5} style={{ height: 200 }}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker onSelect={setLatlng} />
              {latlng && <Marker position={latlng} />}
            </MapContainer>
            <div className="location-hint">{latlng ? `📍 ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}` : 'Click the map to drop a pin'}</div>
          </div>
        </div>
        <div className="field"><label>Description (optional)</label><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Any details people should know..." rows={3} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Saving...' : editEvent ? 'Save Changes' : 'Post Event'}</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

// ── Announcement Form ─────────────────────────────────────────
function AnnouncementForm({ groupId, userId, onSuccess, onCancel }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleImage(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    let image_url = null
    if (imageFile) {
      const ext = imageFile.name.split('.').pop()
      const path = `${groupId}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('announcements').upload(path, imageFile, { upsert: true })
      if (uploadErr) { setError('Image upload failed: ' + uploadErr.message); setLoading(false); return }
      const { data: urlData } = supabase.storage.from('announcements').getPublicUrl(path)
      image_url = urlData.publicUrl
    }
    const { error: err } = await supabase.from('announcements').insert({ group_id: groupId, user_id: userId, title, body, image_url })
    if (err) { setError(err.message); setLoading(false) }
    else onSuccess()
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1.5px solid #9b59b6', borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.1rem', color: '#9b59b6' }}>📢 New Announcement</h3>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      {error && <div className="error-msg">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" required /></div>
        <div className="field"><label>Message</label><textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What do you want to tell your members?" rows={4} required /></div>

        <div className="field">
          <label>Image (optional)</label>
          {!imagePreview ? (
            <input type="file" accept="image/*" onChange={handleImage} style={{ padding: '8px', cursor: 'pointer' }} />
          ) : (
            <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
              <img
                src={imagePreview} alt="preview"
                style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
              <button
                type="button"
                onClick={removeImage}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.7)', border: 'none',
                  color: '#fff', borderRadius: '50%', width: 32, height: 32,
                  fontSize: 16, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontWeight: 700
                }}
              >✕</button>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                {imageFile?.name} · <button type="button" onClick={removeImage} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: 0 }}>Remove</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ background: '#9b59b6' }}>
            {loading ? 'Posting...' : 'Post Announcement'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

// ── Main GroupDetail ──────────────────────────────────────────
export default function GroupDetail() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [events, setEvents] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [myMembership, setMyMembership] = useState(null)
  const [pendingRequests, setPendingRequests] = useState([])
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [hasRequested, setHasRequested] = useState(false)
  const [showPostForm, setShowPostForm] = useState(false)
  const [showAnnounceForm, setShowAnnounceForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  const isOwner = myMembership?.role === 'owner'
  const isAdmin = ['owner', 'admin'].includes(myMembership?.role)
  const isMember = !!myMembership

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [groupRes, membersRes, eventsRes, announcementsRes, myRes, memberData, requestRes, myRequestRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*, profiles(id, username)').eq('group_id', id),
      supabase.from('events').select('*, profiles(username)').eq('group_id', id).order('event_date', { ascending: true }).gte('event_date', new Date().toISOString()),
      supabase.from('announcements').select('*, profiles(username)').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('user_id').eq('group_id', id),
      supabase.from('group_join_requests').select('*, profiles(username)').eq('group_id', id),
      supabase.from('group_join_requests').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle()
    ])
    setGroup(groupRes.data)
    setMembers(membersRes.data || [])
    setEvents(eventsRes.data || [])
    setAnnouncements(announcementsRes.data || [])
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
    fetchAll(); setJoining(false)
  }

  async function handleLeave() {
    if (isOwner) { alert("You're the owner — you cannot leave your own group."); return }
    await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', user.id)
    setMyMembership(null); fetchAll()
  }

  async function handleDeleteGroup() {
    if (!window.confirm(`Permanently delete "${group.name}"? This will remove all events and announcements.`)) return
    const { error } = await supabase.from('groups').delete().eq('id', id)
    if (error) { alert('Delete failed: ' + error.message); return }
    navigate('/groups')
  }

  async function handleDeleteEvent(eventId) {
    if (!window.confirm('Delete this event?')) return
    await supabase.from('events').delete().eq('id', eventId)
    fetchAll()
  }

  async function handleDeleteAnnouncement(announcementId) {
    if (!window.confirm('Delete this announcement?')) return
    await supabase.from('announcements').delete().eq('id', announcementId)
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

  const feed = [
    ...events.map(e => ({ ...e, _type: 'event' })),
    ...announcements.map(a => ({ ...a, _type: 'announcement' }))
  ].sort((a, b) => {
    const dateA = a._type === 'event' ? new Date(a.event_date) : new Date(a.created_at)
    const dateB = b._type === 'event' ? new Date(b.event_date) : new Date(b.created_at)
    return dateA - dateB
  })

  return (
    <div className="page">
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="detail-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }} onClick={() => navigate('/groups')}>
          ← Groups
        </button>

        {/* Header */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, flexShrink: 0 }}>
            {group.name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: 4 }}>{group.name}</h1>
            <div style={{ display: 'flex', gap: 14, color: 'var(--muted)', fontSize: 13, flexWrap: 'wrap' }}>
              <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
              <span>{joinModeLabel[group.join_mode]}</span>
              {myMembership && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{roleLabel[myMembership.role]}</span>}
            </div>
          </div>
          {isAdmin && (
            <Link to={`/groups/${id}/settings`} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}>⚙ Settings</Link>
          )}
        </div>

        {group.description && <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 24 }}>{group.description}</p>}

        {/* Join / Leave / Delete */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          {!isMember && group.join_mode !== 'invite' && (
            <button className="btn btn-primary" onClick={handleJoin} disabled={joining || hasRequested}>
              {hasRequested ? '✓ Request sent' : joining ? 'Joining...' : group.join_mode === 'request' ? 'Request to join' : 'Join group'}
            </button>
          )}
          {!isMember && group.join_mode === 'invite' && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--bg3)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--muted)' }}>
              This group is invite only — contact an admin to join.
            </div>
          )}
          {isMember && !isOwner && (
            <button className="btn btn-ghost" onClick={handleLeave} style={{ fontSize: 13 }}>Leave group</button>
          )}
          {isOwner && (
            <button onClick={handleDeleteGroup} style={{ background: 'rgba(231,76,60,0.1)', border: '1.5px solid rgba(231,76,60,0.4)', color: '#e74c3c', borderRadius: 10, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
              🗑 Delete Group
            </button>
          )}
        </div>

        {/* Pending join requests */}
        {isAdmin && pendingRequests.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 className="section-title">Join Requests <span style={{ color: 'var(--accent)' }}>{pendingRequests.length}</span></h3>
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

        {/* Admin action buttons */}
        {isAdmin && !showPostForm && !showAnnounceForm && !editingEvent && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }} onClick={() => setShowPostForm(true)}>
              📅 Post Event
            </button>
            <button onClick={() => setShowAnnounceForm(true)} style={{ background: 'rgba(155,89,182,0.15)', border: '1.5px solid rgba(155,89,182,0.4)', color: '#9b59b6', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
              📢 Announcement
            </button>
          </div>
        )}

        {(showPostForm || editingEvent) && (
          <PostEventForm groupId={id} userId={user.id} editEvent={editingEvent}
            onSuccess={() => { setShowPostForm(false); setEditingEvent(null); fetchAll() }}
            onCancel={() => { setShowPostForm(false); setEditingEvent(null) }}
          />
        )}

        {showAnnounceForm && (
          <AnnouncementForm groupId={id} userId={user.id}
            onSuccess={() => { setShowAnnounceForm(false); fetchAll() }}
            onCancel={() => setShowAnnounceForm(false)}
          />
        )}

        {/* Feed */}
        <h3 className="section-title">Group Feed</h3>
        {feed.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            {isAdmin ? 'No posts yet — post an event or announcement above!' : 'Nothing posted yet'}
          </p>
        ) : (
          feed.map(item => item._type === 'event' ? (
            <div key={`event-${item.id}`}>
              <div className="event-card" onClick={() => navigate(`/event/${item.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span className="event-category">{item.category}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {formatDistanceToNow(new Date(item.created_at || item.event_date), { addSuffix: true })}
                  </span>
                </div>
                <h3 className="event-title">{item.title}</h3>
                <div className="event-meta">
                  <span>🗓 {format(new Date(item.event_date), 'EEE, MMM d · h:mm a')}</span>
                  <span>📍 {item.location_name}</span>
                </div>
                {item.description && <p className="event-desc">{item.description}</p>}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}
                    onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => { setEditingEvent(item); setShowPostForm(false); setShowAnnounceForm(false) }}>
                      ✏ Edit
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}
                      onClick={() => handleDeleteEvent(item.id)}>
                      🗑 Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={`announcement-${item.id}`} className="event-card" style={{ borderColor: 'rgba(155,89,182,0.4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(155,89,182,0.15)', color: '#9b59b6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  📢 Announcement
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </div>
              <h3 className="event-title">{item.title}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>{item.body}</p>
              {item.image_url && (
                <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', cursor: 'zoom-in' }}
                  onClick={() => setLightboxSrc(item.image_url)}>
                  <img
                    src={item.image_url}
                    alt={item.title}
                    style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block', transition: 'transform 0.2s' }}
                    onMouseEnter={e => e.target.style.transform = 'scale(1.02)'}
                    onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                  />
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                Posted by @{item.profiles?.username}
              </div>
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}
                    onClick={() => handleDeleteAnnouncement(item.id)}>
                    🗑 Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}

        {/* Members */}
        <div style={{ marginTop: 12 }}>
          <h3 className="section-title">{canSeeMembers ? `Members (${members.length})` : `${memberCount} members`}</h3>
          {!canSeeMembers && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Member list is only visible to admins</p>}
          {canSeeMembers && members.map(m => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate(`/profile/${m.profiles?.id}`)}>
                <div className="avatar-sm">{m.profiles?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>@{m.profiles?.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{roleLabel[m.role]}</div>
                </div>
              </div>
              {isOwner && m.user_id !== user.id && m.role !== 'owner' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.role === 'member' && <button className="attend-btn" style={{ fontSize: 12 }} onClick={() => changeRole(m.user_id, 'admin')}>Make Admin</button>}
                  {m.role === 'admin' && <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => changeRole(m.user_id, 'member')}>Demote</button>}
                  <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }} onClick={() => removeMember(m.user_id)}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
