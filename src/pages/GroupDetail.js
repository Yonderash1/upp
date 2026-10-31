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
import EventCard from '../components/EventCard'
import GroupChannel from '../components/GroupChannel'
import ChannelForm from '../components/ChannelForm'
import ConfirmDialog from '../components/ConfirmDialog'
import { AudienceSelect } from '../components/EventPermissions'
import { eventStatus, eventEndDate } from '../lib/eventUtils'
import { audienceFromEvent, audienceToStored, audienceShort, EVENT_ROLE_SELECT } from '../lib/eventAccess'
import { hasPerm, channelAccess } from '../lib/permissions'

const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }

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
function AnnouncementForm({ groupId, userId, roles, editAnnouncement, onSuccess, onCancel }) {
  const [title, setTitle] = useState(editAnnouncement?.title || '')
  const [body, setBody] = useState(editAnnouncement?.body || '')
  // Who gets to see it — new announcements start as "group members only"
  const [audience, setAudience] = useState(() =>
    editAnnouncement
      ? audienceFromEvent(editAnnouncement.visibility_access, editAnnouncement.visibility_min_role)
      : { mode: 'members', roleId: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (audience.mode === 'role' && !audience.roleId) { setError('Please choose which role can see this announcement'); return }
    setLoading(true)
    const stored = audienceToStored(audience)
    const audienceFields = { visibility_access: stored.access, visibility_min_role: stored.minRole }
    if (editAnnouncement) {
      const { data, error: err } = await supabase
        .from('announcements').update({ title, body, ...audienceFields }).eq('id', editAnnouncement.id).select('id')
      if (err) { setError(err.message); setLoading(false); return }
      if (!data || data.length === 0) { setError("You don't have permission to edit this announcement"); setLoading(false); return }
    } else {
      const { error: err } = await supabase.from('announcements').insert({ group_id: groupId, user_id: userId, title, body, ...audienceFields })
      if (err) { setError(err.message); setLoading(false); return }
    }
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field"><label>Title</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title" required autoFocus /></div>
      <div className="field"><label>Message</label><textarea value={body} onChange={e => setBody(e.target.value)} placeholder="What do you want to tell your members?" rows={5} required /></div>
      <div className="field">
        <label>Who can see this announcement?</label>
        <AudienceSelect value={audience} onChange={setAudience} roles={roles} />
        <div className="field-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Only these people will see it on the group page and get notified about it.
        </div>
      </div>
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
  const [roles, setRoles] = useState([])
  const [channels, setChannels] = useState([])
  const [channelForm, setChannelForm] = useState(null)   // null | { channel: null | row }  (create / edit a channel)
  const [membersOpen, setMembersOpen] = useState(() => window.innerWidth > 900)
  const [navOpen, setNavOpen] = useState(() => window.innerWidth > 900)
  const [view, setView] = useState('feed')
  const [attendingIds, setAttendingIds] = useState(new Set())   // events here that I'm going to
  const [interestIds, setInterestIds] = useState(new Set())     // events here that I'm interested in
  const [attendCounts, setAttendCounts] = useState({})          // event id -> number going
  const [interestCounts, setInterestCounts] = useState({})      // event id -> number interested
  const [dialog, setDialog] = useState(null)                     // the "are you sure?" pop-up, if one is open
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('event')                 // set when arriving from the Planner
  const { user } = useAuth()
  const navigate = useNavigate()

  // Who am I in this group, and what am I allowed to do?
  const rolesById = Object.fromEntries(roles.map(r => [r.id, r]))
  const myRole = myMembership ? rolesById[myMembership.role_id] || null : null
  const isOwner = !!myRole?.is_owner
  const isMember = !!myMembership
  const can = key => hasPerm(myRole, key)

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Arrived from the Planner: scroll to the event that was clicked
  useEffect(() => {
    if (loading || !highlightId) return
    const el = document.getElementById(`event-${highlightId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [loading, highlightId, events.length])

  async function fetchAll() {
    const [groupRes, membersRes, eventsRes, announcementsRes, myRes, memberData, requestRes, myRequestRes, labelData, rolesRes, channelsRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*, profiles(id, username, avatar_url)').eq('group_id', id).order('joined_at', { ascending: true }),
      supabase.from('events').select(`*, profiles(username), event_label_assignments(group_labels(id, name)), ${EVENT_ROLE_SELECT}`).eq('group_id', id).order('event_date', { ascending: true }),
      supabase.from('announcements').select('*, profiles(username)').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.from('group_members').select('role_id').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('user_id').eq('group_id', id),
      supabase.from('group_join_requests').select('*, profiles(username)').eq('group_id', id),
      supabase.from('group_join_requests').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_label_assignments').select('label_id, group_labels(id, name)').eq('group_id', id),
      supabase.from('group_roles').select('*').eq('group_id', id).order('rank', { ascending: true }),
      supabase.from('group_channels').select('*').eq('group_id', id).order('created_at', { ascending: true })
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
    setRoles(rolesRes.data || [])
    setChannels(channelsRes.data || [])
    setLoading(false)
  }

  // Who's going to this group's events, and what I've said about them
  async function fetchEventStatus(list) {
    const ids = list.map(e => e.id)
    if (ids.length === 0) {
      setAttendingIds(new Set()); setInterestIds(new Set()); setAttendCounts({}); setInterestCounts({})
      return
    }
    const [att, int] = await Promise.all([
      supabase.from('attendees').select('event_id, user_id').in('event_id', ids),
      supabase.from('event_interests').select('event_id, user_id').in('event_id', ids)
    ])
    const counts = {}
    const mine = new Set()
    ;(att.data || []).forEach(r => {
      counts[r.event_id] = (counts[r.event_id] || 0) + 1
      if (r.user_id === user.id) mine.add(r.event_id)
    })
    const interested = {}
    const myInterest = new Set()
    ;(int.data || []).forEach(r => {
      interested[r.event_id] = (interested[r.event_id] || 0) + 1
      if (r.user_id === user.id) myInterest.add(r.event_id)
    })
    setAttendCounts(counts)
    setAttendingIds(mine)
    setInterestCounts(interested)
    setInterestIds(myInterest)
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
      const base = roles.find(r => r.is_default)
      const { error } = await supabase.from('group_members').insert({ group_id: id, user_id: user.id, role_id: base?.id })
      if (error) alert(error.message)
    } else if (group.join_mode === 'request') {
      await supabase.from('group_join_requests').insert({ group_id: id, user_id: user.id })
      setHasRequested(true)
    }
    fetchAll(); setJoining(false)
  }

  // What leaving means depends on how people get into this group
  function askLeave() {
    if (isOwner) { setDialog({ title: "You can't leave", confirmLabel: 'OK', onConfirm: () => {}, children: "You're the owner of this group, so you can't leave it. You can delete the group from its settings." }); return }
    const rejoin = group.join_mode === 'invite'
      ? <p><strong>This group is invite only.</strong> If you leave, you will only be able to rejoin if an admin invites you again.</p>
      : group.join_mode === 'request'
        ? <p><strong>This group is request to join.</strong> If you leave, you will have to request to join again and be approved before you can rejoin.</p>
        : <p>This group is open, so you can rejoin at any time.</p>
    setDialog({
      title: `Leave ${group.name}?`, confirmLabel: 'Leave group', danger: true,
      children: <><p>You'll lose access to the group's posts and chat channels.</p>{rejoin}</>,
      onConfirm: async () => {
        const { error } = await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', user.id)
        if (error) return error.message
        setMyMembership(null); fetchAll()
      }
    })
  }

  function askDeleteEvent(item) {
    setDialog({
      title: 'Delete this event?', confirmLabel: 'Delete event', danger: true,
      children: <><p><strong>{item.title}</strong> will be removed for everyone.</p><p>People who said they're going or interested will be notified.</p></>,
      onConfirm: async () => {
        const { error } = await supabase.from('events').delete().eq('id', item.id)
        if (error) return error.message
        fetchAll()
      }
    })
  }

  function askCancelEvent(item) {
    setDialog({
      title: 'Cancel this event?', confirmLabel: 'Yes, cancel event', cancelLabel: 'Keep event', danger: true,
      children: <>
        <p>Are you sure you want to cancel <strong>{item.title}</strong>?</p>
        <p><strong>All attending or interested users will be notified if this event is cancelled.</strong></p>
        <p>The event won't be deleted — it will stay on the group page, greyed out and marked as cancelled.</p>
      </>,
      onConfirm: async () => {
        const { error } = await supabase.rpc('cancel_event', { p_event: item.id })
        if (error) return error.message
        fetchAll()
      }
    })
  }

  function askDeleteAnnouncement(item) {
    setDialog({
      title: 'Delete this announcement?', confirmLabel: 'Delete announcement', danger: true,
      children: <p><strong>{item.title}</strong> will be removed for everyone.</p>,
      onConfirm: async () => {
        const { error } = await supabase.from('announcements').delete().eq('id', item.id)
        if (error) return error.message
        fetchAll()
      }
    })
  }

  async function approveRequest(reqUserId) {
    const { error } = await supabase.rpc('approve_join_request', { p_group: id, p_user: reqUserId })
    if (error) alert(error.message)
    fetchAll()
  }

  async function denyRequest(reqUserId) {
    await supabase.from('group_join_requests').delete().eq('group_id', id).eq('user_id', reqUserId)
    fetchAll()
  }

  async function changeRole(memberId, roleId) {
    const { error } = await supabase.rpc('set_member_role', { p_group: id, p_user: memberId, p_role: roleId })
    if (error) alert(error.message)
    fetchAll()
  }

  async function kickMember(memberId) {
    const { error } = await supabase.rpc('kick_group_member', { p_group: id, p_user: memberId })
    if (error) return error.message   // the pop-up shows it
    fetchAll()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!group) return <div className="page"><div className="detail-page"><h2>Group not found</h2></div></div>

  const canSeeMembers = group.members_visible || can('kick_members') || can('manage_roles') || can('manage_group')

  // user id -> role, for name colours in chat and the "can I moderate them?" check
  const memberRoles = {}
  members.forEach(m => { if (rolesById[m.role_id]) memberRoles[m.user_id] = rolesById[m.role_id] })

  const activeChannel = view !== 'feed' ? channels.find(c => c.id === view) : null
  const canPost = can('create_events') || can('create_announcements')
  const allowedPosts = [can('create_events') && 'event', can('create_announcements') && 'announcement'].filter(Boolean)

  // Announcements always sit above everything else, newest first. Events follow, soonest first.
  const feed = [
    ...[...announcements]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(a => ({ ...a, _type: 'announcement' })),
    ...[...events]
      .filter(e => eventStatus(e) !== 'ended')
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
      .map(e => ({ ...e, _type: 'event' })),
    // events that have already happened stay on the group page, below the upcoming ones
    ...[...events]
      .filter(e => eventStatus(e) === 'ended')
      .sort((a, b) => eventEndDate(b) - eventEndDate(a))
      .map(e => ({ ...e, _type: 'event' }))
  ]

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
      {dialog && <ConfirmDialog {...dialog} onCancel={() => setDialog(null)} />}

      {modalOpen && (
        <Modal title={modalTitle} onClose={closeComposer} width={composer === 'choose' ? 640 : 760}>
          {composer === 'choose' && <NewPostChooser onSelect={setComposer} allowed={allowedPosts} />}
          {(composer === 'event' || editingEvent) && (
            <EventForm groupId={id} userId={user.id} editEvent={editingEvent} onSuccess={afterPost} onCancel={closeComposer} />
          )}
          {(composer === 'announcement' || editingAnnouncement) && (
            <AnnouncementForm groupId={id} userId={user.id} roles={roles} editAnnouncement={editingAnnouncement} onSuccess={afterPost} onCancel={closeComposer} />
          )}
        </Modal>
      )}

      {channelForm && (
        <ChannelForm
          groupId={id} userId={user.id} roles={roles}
          channel={channelForm.channel} canDelete={can('delete_channels')}
          onSaved={() => { setChannelForm(null); fetchAll() }}
          onDeleted={() => { if (channelForm.channel?.id === view) setView('feed'); setChannelForm(null); fetchAll() }}
          onClose={() => setChannelForm(null)}
        />
      )}

      <div className="group-layout">
      <SidePanel side="left" open={navOpen} onToggle={() => setNavOpen(o => !o)} label="menu" width={220}>
        <GroupNav
          active={activeChannel ? view : 'feed'} onSelect={setView}
          channels={channels}
          canCreateChannel={can('create_channels')} canEditChannel={can('edit_channels') || can('delete_channels')}
          onCreateChannel={() => setChannelForm({ channel: null })}
          onEditChannel={c => setChannelForm({ channel: c })}
        />
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
              {myRole && <span style={{ color: myRole.color, fontWeight: 600 }}>{myRole.is_owner ? '👑 ' : ''}{myRole.name}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {can('manage_roles') && (
              <Link to={`/groups/${id}/roles`} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}>🛡 Roles</Link>
            )}
            {can('manage_group') && (
              <Link to={`/groups/${id}/settings`} className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }}>⚙ Settings</Link>
            )}
          </div>
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

        {/* Join / Leave (the owner manages the group from Settings) */}
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
            <button className="btn btn-ghost" onClick={askLeave} style={{ fontSize: 13 }}>Leave group</button>
          )}
        </div>}

        {/* Pending join requests */}
        {can('manage_join_requests') && pendingRequests.length > 0 && (
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

        {activeChannel ? (
          <GroupChannel
            key={activeChannel.id}
            channel={activeChannel} userId={user.id} myRole={myRole}
            access={channelAccess(activeChannel, myRole, rolesById)}
            memberRoles={memberRoles}
          />
        ) : (<>
        {/* Feed header + New post */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '1rem' }}>Group Feed</h3>
          {canPost && (
            <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 18px', fontSize: 13 }} onClick={() => setComposer('choose')}>
              ＋ New post
            </button>
          )}
        </div>

        {/* Feed */}
        {feed.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            {canPost ? 'No posts yet — hit "New post" to get started!' : 'Nothing posted yet'}
          </p>
        ) : (
          feed.map(item => item._type === 'event' ? (() => {
            const status = eventStatus(item)
            const canCancel = can('edit_events') && (status === 'upcoming' || status === 'live')
            return (
            <EventCard
              key={`event-${item.id}`}
              domId={`event-${item.id}`}
              event={{ ...item, groups: group }}
              myRank={myRole ? myRole.rank : null}
              counts={{ going: attendCounts[item.id] || 0, interested: interestCounts[item.id] || 0 }}
              isGoing={attendingIds.has(item.id)}
              isInterested={interestIds.has(item.id)}
              onToggleGoing={e => toggleAttend(e, item.id)}
              onToggleInterested={e => toggleInterest(e, item.id)}
              highlight={String(item.id) === highlightId}
              actions={(can('edit_events') || can('delete_events')) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {can('edit_events') && (
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => { setEditingEvent(item); setComposer(null) }}>
                      ✏ Edit
                    </button>
                  )}
                  {canCancel && (
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e67e22', borderColor: '#e67e22' }}
                      onClick={() => askCancelEvent(item)}>
                      🚫 Cancel event
                    </button>
                  )}
                  {can('delete_events') && (
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}
                      onClick={() => askDeleteEvent(item)}>
                      🗑 Delete
                    </button>
                  )}
                </div>
              )}
            />
            )
          })() : (
            <div key={`announcement-${item.id}`} className="event-card post-card post-announcement">
              <div className="post-header">
                <span className="post-badge announcement">📢 Announcement</span>
                <span className="post-time">
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
              {(can('edit_announcements') || can('delete_announcements')) && (
                <div className="post-audience">
                  👁 Visible to: {audienceShort(audienceFromEvent(item.visibility_access, item.visibility_min_role), roles)}
                </div>
              )}
              {(can('edit_announcements') || can('delete_announcements')) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {can('edit_announcements') && (
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
                      onClick={() => { setEditingAnnouncement(item); setComposer(null) }}>
                      ✏ Edit
                    </button>
                  )}
                  {can('delete_announcements') && (
                    <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c' }}
                      onClick={() => askDeleteAnnouncement(item)}>
                      🗑 Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        </>)}
      </main>

      <MembersPanel
        members={members}
        roles={roles}
        myRole={myRole}
        memberCount={memberCount}
        canSeeMembers={canSeeMembers}
        currentUserId={user.id}
        onChangeRole={changeRole}
        onKick={kickMember}
        joinMode={group.join_mode}
        open={membersOpen}
        onToggle={() => setMembersOpen(o => !o)}
      />
      </div>
    </div>
  )
}
