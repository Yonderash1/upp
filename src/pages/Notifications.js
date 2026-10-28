import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationsContext'
import GroupAvatar from '../components/GroupAvatar'
import { formatEventRange } from '../lib/eventUtils'

function UserAvatar({ profile, size = 44 }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div className="avatar-sm" style={{ width: size, height: size, fontSize: size * 0.4, flexShrink: 0, cursor: 'inherit' }}>
      {profile?.username?.[0]?.toUpperCase() || '?'}
    </div>
  )
}

export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { version, refreshUnread } = useNotifications()

  const [items, setItems] = useState([])
  const [connStates, setConnStates] = useState({})        // requester id -> { id, status }
  const [newIds, setNewIds] = useState(() => new Set())   // what counts as "new" during this visit
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [groupPosts, setGroupPosts] = useState(true)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('notifications')
      .select('*, actor:actor_id(id, username, avatar_url), groups(id, name, image_url), events(id, title, event_date, event_end), announcements(id, title)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) { setError(err.message); setLoading(false); return }
    const list = data || []

    // For connection requests, find out whether they're still waiting
    const requesterIds = list.filter(n => n.type === 'connection_request' && n.actor_id).map(n => n.actor_id)
    const states = {}
    if (requesterIds.length > 0) {
      const { data: conns } = await supabase
        .from('connections').select('id, from_user, status').eq('to_user', user.id).in('from_user', requesterIds)
      ;(conns || []).forEach(c => { states[c.from_user] = { id: c.id, status: c.status } })
    }

    // Anything unread right now is "new" — it stays highlighted for this visit, then counts as old
    const unreadIds = list.filter(n => !n.read_at).map(n => n.id)
    if (unreadIds.length > 0) setNewIds(prev => new Set([...prev, ...unreadIds]))

    setItems(list)
    setConnStates(states)
    setError('')
    setLoading(false)

    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
      refreshUnread()
    }
  }, [user.id, refreshUnread])

  // Loads on arrival, and again whenever a notification arrives or changes live
  useEffect(() => { load() }, [load, version])

  useEffect(() => {
    supabase.from('notification_settings').select('group_posts').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setGroupPosts(data.group_posts) })
  }, [user.id])

  async function toggleGroupPosts() {
    const next = !groupPosts
    setGroupPosts(next)
    const { error: err } = await supabase
      .from('notification_settings')
      .upsert({ user_id: user.id, group_posts: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (err) { setGroupPosts(!next); alert('Could not save your setting: ' + err.message) }
  }

  async function acceptConnection(n) {
    const conn = connStates[n.actor_id]
    if (!conn) return
    const { error: err } = await supabase.from('connections').update({ status: 'accepted' }).eq('id', conn.id)
    if (err) { alert(err.message); return }
    setConnStates(s => ({ ...s, [n.actor_id]: { ...conn, status: 'accepted' } }))
  }

  async function declineConnection(n) {
    const conn = connStates[n.actor_id]
    if (!conn) return
    const { error: err } = await supabase.from('connections').delete().eq('id', conn.id)
    if (err) { alert(err.message); return }
    setItems(list => list.filter(i => i.id !== n.id))
  }

  function openNotification(n) {
    if (n.type === 'group_event' && n.event_id) navigate(`/event/${n.event_id}`)
    else if (n.type === 'group_announcement' && n.group_id) navigate(`/groups/${n.group_id}`)
    else if (n.type === 'event_changed' && n.event_id) navigate(`/event/${n.event_id}`)
    else if (n.type === 'connection_request' && n.actor_id) navigate(`/profile/${n.actor_id}`)
    // group_deleted / event_deleted: nothing left to open
  }

  function renderItem(n) {
    const isNew = newIds.has(n.id)
    const when = formatDistanceToNow(new Date(n.created_at), { addSuffix: true })
    let avatar, headline, detail, actions = null

    if (n.type === 'group_event') {
      avatar = n.groups ? <GroupAvatar group={n.groups} size={44} /> : null
      headline = <><strong>{n.groups?.name || 'A group'}</strong> posted a new event</>
      detail = (
        <>
          <div className="notif-title">{n.events?.title || n.title}</div>
          {n.events && <div className="notif-sub">🗓 {formatEventRange(n.events.event_date, n.events.event_end)}</div>}
        </>
      )
    } else if (n.type === 'group_announcement') {
      avatar = n.groups ? <GroupAvatar group={n.groups} size={44} /> : null
      headline = <><strong>{n.groups?.name || 'A group'}</strong> posted an announcement</>
      detail = <div className="notif-title">📢 {n.announcements?.title || n.title}</div>
    } else if (n.type === 'event_changed') {
      avatar = n.groups ? <GroupAvatar group={n.groups} size={44} /> : <UserAvatar profile={n.actor} />
      const who = n.groups?.name || n.group_name || (n.actor?.username ? `@${n.actor.username}` : 'An organiser')
      headline = <><strong>{who}</strong> changed an event you're going to</>
      detail = (
        <>
          <div className="notif-title">{n.events?.title || n.title}</div>
          {Array.isArray(n.changes) && n.changes.length > 0 && (
            <ul className="notif-changes">{n.changes.map(c => <li key={c}>{c}</li>)}</ul>
          )}
        </>
      )
    } else if (n.type === 'group_deleted') {
      avatar = <div className="notif-icon">🗑</div>
      headline = <><strong>{n.group_name || n.title || 'A group'}</strong> was deleted</>
      detail = (
        <div className="notif-sub">
          The group and all of its events and announcements have been removed{n.actor?.username ? ` by @${n.actor.username}` : ''}.
        </div>
      )
    } else if (n.type === 'event_deleted') {
      avatar = <div className="notif-icon">🗓</div>
      headline = <>An event you {n.detail === 'interested' ? 'were interested in' : 'were going to'} was deleted</>
      detail = (
        <>
          <div className="notif-title">{n.title}</div>
          {n.group_name && <div className="notif-sub">Hosted by {n.group_name}</div>}
        </>
      )
    } else {
      const state = connStates[n.actor_id]
      avatar = <UserAvatar profile={n.actor} />
      headline = <><strong>@{n.actor?.username || 'Someone'}</strong> wants to connect with you</>
      if (state?.status === 'pending') {
        actions = (
          <div className="notif-actions" onClick={e => e.stopPropagation()}>
            <button className="attend-btn" onClick={() => acceptConnection(n)}>Accept</button>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => declineConnection(n)}>Decline</button>
          </div>
        )
      } else if (state?.status === 'accepted') {
        detail = <div className="notif-sub" style={{ color: 'var(--success)' }}>✓ You're now connected</div>
      }
    }

    return (
      <div key={n.id} className={`notif-item ${isNew ? 'new' : ''} ${n.type === 'group_deleted' || n.type === 'event_deleted' ? 'static' : ''}`} onClick={() => openNotification(n)}>
        {avatar}
        <div className="notif-body">
          <div className="notif-headline">{headline}</div>
          {detail}
          {actions}
          <div className="notif-time">{when}</div>
        </div>
        {isNew && <span className="notif-new-dot" title="New" />}
      </div>
    )
  }

  // A connection request that was cancelled in the meantime has nothing left to show
  const visible = items.filter(n => n.type !== 'connection_request' || connStates[n.actor_id])
  const fresh = visible.filter(n => newIds.has(n.id))
  const earlier = visible.filter(n => !newIds.has(n.id))

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="notif-page">
        <div className="notif-header">
          <h2>Notifications</h2>
          <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => setShowSettings(s => !s)}>
            ⚙ Settings
          </button>
        </div>

        {showSettings && (
          <div className="notif-settings">
            <div className="switch-row">
              <div>
                <strong>Group events & announcements</strong>
                <span>Get notified when a group you're in posts an event or an announcement.</span>
              </div>
              <button
                type="button" role="switch" aria-checked={groupPosts}
                className={`switch ${groupPosts ? 'on' : ''}`} onClick={toggleGroupPosts}
              ><span /></button>
            </div>
            <div className="field-hint" style={{ margin: '12px 0 0' }}>Connection requests, changes to events you're going to, and deleted groups or events always appear here.</div>
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        {visible.length === 0 && !error ? (
          <div className="empty-state">
            <h3>You're all caught up</h3>
            <p>New events and announcements from your groups, changes to events you're going to, and connection requests will show up here.</p>
          </div>
        ) : (
          <>
            {fresh.length > 0 && (
              <>
                <h3 className="notif-section">New <span>{fresh.length}</span></h3>
                {fresh.map(renderItem)}
              </>
            )}
            {earlier.length > 0 && (
              <>
                <h3 className="notif-section">Earlier</h3>
                {earlier.map(renderItem)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
