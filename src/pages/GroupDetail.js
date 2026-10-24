import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import MembersPanel from '../components/MembersPanel'
import GroupAvatar from '../components/GroupAvatar'
import SidePanel from '../components/SidePanel'
import GroupNav from '../components/GroupNav'
import NewPostChooser from '../components/NewPostChooser'
import Modal from '../components/Modal'
import EventForm from '../components/EventForm'
import EventLabels from '../components/EventLabels'
import { formatEventRange } from '../lib/eventUtils'
import { describeJoinAccess, getAttendState, getJoinStatus, normalizeRole } from '../lib/eventAccess'

const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }

// ── Lightbox ─────────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24
      }}
    >
      <img
        src={src}
        alt="Full size"
        style={{
          maxWidth: '100%', maxHeight: '90vh',
          borderRadius: 10, objectFit: 'contain',
          boxShadow: '0 8px 48px rgba(0,0,0,0.6)'
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

// ── Announcement Form (create + edit) ────────────────────────
function AnnouncementForm({ groupId, userId, editAnnouncement, onSuccess, onCancel }) {
  const [title, setTitle] = useState(editAnnouncement?.title || '')
  const [body, setBody] = useState(editAnnouncement?.body || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    if (editAnnouncement) {
      const { data, error: err } = await supabase
        .from('announcements').update({ title, body }).eq('id', editAnnouncement.id).select('id')
      if (err) { setError(err.message); setLoading(false); return }
      if (!data || data.length === 0) { setError("You don't have permission to edit this announcement"); setLoading(false); return }
    } else {
      const { error: err } = await supabase.from('announcements').insert({ group_id: groupId, user_id: userId, title, body })
      if (err) { setError(err.message); setLoading(false); return }
    }
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" required autoFocus /></div>
      <div className="field"><label>Message</label><textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What do you want to tell your members?" rows={5} required /></div>
      {error && <div className="error-msg">{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ background: '#9b59b6' }}>
          {loading ? 'Saving...' : editAnnouncement ? 'Save changes' : 'Post Announcement'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
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
  // null | 'choose' | 'event' | 'announcement'  (what the "New post" flow is showing)
  const [composer, setComposer] = useState(null)
  const [editingEvent, setEditingEvent] = useState(null)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [labels, setLabels] = useState([])
  const [membersOpen, setMembersOpen] = useState(() => window.innerWidth > 900)
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 900)
  const [view, setView] = useState('feed')
  const [attendingIds, setAttendingIds] = useState(new Set())   // events here that I'm going to
  const [interestIds, setInterestIds] = useState(new Set())     // events here that I'm interested in
  const [attendCounts, setAttendCounts] = useState({})          // event id -> number going
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('event')                 // set when arriving from the Planner
  const { user } = useAuth()
  const navigate = useNavigate()

  const isOwner = myMembership?.role === 'owner'
  const isAdmin = ['owner', 'admin'].includes(myMembership?.role)
  const isMember = !!myMembership

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrived from the Planner: scroll to the event that was clicked
  useEffect(() => {
    if (loading || !highlightId) return
    const el = document.getElementById(`event-${highlightId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [loading, highlightId, events.length])

  async function fetchAll() {
    const [groupRes, membersRes, eventsRes, announcementsRes, myRes, memberData, requestRes, myRequestRes, labelData] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*, profiles(id, username, avatar_url)').eq('group_id', id).order('joined_at', { ascending: true }),
      supabase.from('events').select('*, profiles(username), event_label_assignments(group_labels(id, name))').eq('group_id', id).order('event_date', { ascending: true }).gte('event_date', new Date().toISOString()),
      supabase.from('announcements').select('*, profiles(username)').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('user_id').eq('group_id', id),
      supabase.from('group_join_requests').select('*, profiles(username)').eq('group_id', id),
      supabase.from('group_join_requests').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_label_assignments').select('label_id, group_labels(id, name)').eq('group_id', id)
    ])
    setGroup(groupRes.data)
    setMembers(membersRes.data || [])
    setEvents(eventsRes.data || [])
    fetchEventStatus(eventsRes.data || [])
    setAnnouncements(announcementsRes.data || [])
    setMyMembership(myRes.data)
    setMemberCount((memberData.data || []).length)
    setPendingRequests(requestRes.data || [])
    setHasRequested(!!myRequestRes.data)
    setLabels((labelData.data || []).map(l => l.group_labels).filter(Boolean))
    setLoading(false)
  }

  // Who's going to this group's events, and what I've said about them
  async function fetchEventStatus(list) {
    const ids = list.map(e => e.id)
    if (ids.length === 0) {
      setAttendingIds(new Set()); setInterestIds(new Set()); setAttendCounts({})
      return
    }
    const [att, int] = await Promise.all([
      supabase.from('attendees').select('event_id, user_id').in('event_id', ids),
      supabase.from('event_interests').select('event_id').eq('user_id', user.id).in('event_id', ids)
    ])
    const counts = {}
    const mine = new Set()
    ;(att.data || []).forEach(r => {
      counts[r.event_id] = (counts[r.event_id] || 0) + 1
      if (r.user_id === user.id) mine.add(r.event_id)
    })
    setAttendCounts(counts)
    setAttendingIds(mine)
    setInterestIds(new Set((int.data || []).map(r => r.event_id)))
  }

  async function toggleAttend(e, eventId) {
    e.stopPropagation()
    if (attendingIds.has(eventId)) {
      await supabase.from('attendees').delete().eq('event_id', eventId).eq('user_id', user.id)
    } else {
      const { error } = await supabase.from('attendees').insert({ event_id: eventId, user_id: user.id })
      if (error) { alert(error.message); fetchEventStatus(events); return }
      await supabase.from('event_interests').delete().eq('event_id', eventId).eq('user_id', user.id)
    }
    fetchEventStatus(events)
  }

  async function toggleInterest(e, eventId) {
    e.stopPropagation()
    if (interestIds.has(eventId)) {
      await supabase.from('event_interests').delete().eq('event_id', eventId).eq('user_id', user.id)
    } else {
      const { error } = await supabase.from('event_interests').insert({ event_id: eventId, user_id: user.id })
      if (error) { alert(error.message); return }
    }
    fetchEventStatus(events)
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

  const modalOpen = !!(composer || editingEvent || editingAnnouncement)
  const modalTitle = editingEvent ? 'Edit event'
    : editingAnnouncement ? 'Edit announcement'
    : composer === 'event' ? 'New event'
    : composer === 'announcement' ? 'New announcement'
    : 'What would you like to post?'
  function closeComposer() { setComposer(null); setEditingEvent(null); setEditingAnnouncement(null) }
  function afterPost() { closeComposer(); fetchAll() }

  return (
    <div className="page">
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {modalOpen && (
        <Modal title={modalTitle} onClose={closeComposer} width={composer === 'choose' ? 640 : 760}>
          {composer === 'choose' && <NewPostChooser onSelect={setComposer} />}
          {(composer === 'event' || editingEvent) && (
            <EventForm groupId={id} userId={user.id} editEvent={editingEvent} onSuccess={afterPost} onCancel={closeComposer} />
          )}
          {(composer === 'announcement' || editingAnnouncement) && (
            <AnnouncementForm groupId={id} userId={user.id} editAnnouncement={editingAnnouncement} onSuccess={afterPost} onCancel={closeComposer} />
          )}
        </Modal>
      )}

      <div className="group-layout">
      <SidePanel side="left" open={navOpen} onToggle={() => setNavOpen(o => !o)} label="menu" width={200}>
        <GroupNav active={view} onSelect={setView} />
      </SidePanel>

      <main className="group-main">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }} onClick={() => navigate('/groups')}>
          ← Groups
        </button>

        {/* Header */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
          <GroupAvatar group={group} size={64} />
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

        {group.description && <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: labels.length > 0 ? 12 : 24 }}>{group.description}</p>}

        {labels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
            {labels.map(l => (
              <span key={l.id} style={{
                fontSize: 12, fontWeight: 600,
                padding: '4px 12px', borderRadius: 20,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                color: 'var(--muted)'
              }}>
                {l.name}
              </span>
            ))}
          </div>
        )}

        {/* Join / Leave (owners manage the group from Settings) */}
        {!isOwner && <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
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
        </div>}

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

        {/* Feed header + New post */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem' }}>Group Feed</h3>
          {isAdmin && (
            <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }} onClick={() => setComposer('choose')}>
              ＋ New post
            </button>
          )}
        </div>

        {/* Feed */}
        {feed.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            {isAdmin ? 'No posts yet — hit "New post" to get started!' : 'Nothing posted yet'}
          </p>
        ) : (
          feed.map(item => item._type === 'event' ? (
            <div key={`event-${item.id}`}>
              <div
                id={`event-${item.id}`}
                className={`event-card ${String(item.id) === highlightId ? 'event-highlight' : ''}`}
                onClick={() => navigate(`/event/${item.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <EventLabels event={item} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {formatDistanceToNow(new Date(item.created_at || item.event_date), { addSuffix: true })}
                  </span>
                </div>
                <h3 className="event-title">{item.title}</h3>
                <div className="event-meta">
                  <span>🗓 {formatEventRange(item.event_date, item.event_end)}</span>
                  <span>{item.location_type === 'online' ? '💻' : '📍'} {item.location_name}</span>
                  <span>🎟 {describeJoinAccess(item).replace('This event is open', 'Open')}</span>
                </div>
                {item.description && <p className="event-desc">{item.description}</p>}
                {(() => {
                  const myRole = normalizeRole(myMembership?.role)
                  const going = attendingIds.has(item.id)
                  const interested = interestIds.has(item.id)
                  const count = attendCounts[item.id] || 0
                  const state = getAttendState({ event: item, myRole, isAttending: going, attendeeCount: count })
                  const canInterest = !going && getJoinStatus(item, myRole) === 'ok'
                  return (
                    <div className="group-event-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className={`attend-btn ${going ? 'attending' : ''}`}
                        disabled={!state.canClick}
                        onClick={e => toggleAttend(e, item.id)}
                      >
                        {going ? '✓ Going' : state.canClick ? "I'm going" : state.label}
                      </button>
                      {canInterest && (
                        <button
                          className={`interest-btn ${interested ? 'interested' : ''}`}
                          onClick={e => toggleInterest(e, item.id)}
                        >
                          {interested ? '★ Interested' : '☆ Interested'}
                        </button>
                      )}
                      <span className="group-event-count">
                        {item.max_attendees != null ? `${count} / ${item.max_attendees} going` : `${count} going`}
                      </span>
                    </div>
                  )
                })()}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}
                    onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => { setEditingEvent(item); setComposer(null) }}>
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
                <div style={{ marginTop: 12, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
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
                  <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                    onClick={() => { setEditingAnnouncement(item); setComposer(null) }}>
                    ✏ Edit
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}
                    onClick={() => handleDeleteAnnouncement(item.id)}>
                    🗑 Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </main>

      <MembersPanel
        members={members}
        memberCount={memberCount}
        canSeeMembers={canSeeMembers}
        isOwner={isOwner}
        currentUserId={user.id}
        onChangeRole={changeRole}
        onRemove={removeMember}
        open={membersOpen}
        onToggle={() => setMembersOpen(o => !o)}
      />
      </div>
    </div>
  )
}
