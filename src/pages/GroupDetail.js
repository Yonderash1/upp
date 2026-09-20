import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }

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
  const { user } = useAuth()
  const navigate = useNavigate()

  const isAdmin = myMembership?.role === 'owner' || myMembership?.role === 'admin'
  const isOwner = myMembership?.role === 'owner'

  useEffect(() => {
    fetchAll()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [groupRes, membersRes, eventsRes, myRes, countRes, requestRes, myRequestRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*, profiles(id, username)').eq('group_id', id),
      supabase.from('events').select('*').eq('group_id', id).order('event_date', { ascending: true }),
      supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('count').eq('group_id', id),
      supabase.from('group_join_requests').select('*, profiles(username)').eq('group_id', id),
      supabase.from('group_join_requests').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle()
    ])

    setGroup(groupRes.data)
    setMembers(membersRes.data || [])
    setEvents(eventsRes.data || [])
    setMyMembership(myRes.data)
    setMemberCount(countRes.data?.[0]?.count || 0)
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
    if (isOwner) { alert("You're the owner — transfer ownership in settings before leaving."); return }
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
            <div style={{ display: 'flex', gap: 16, color: 'var(--muted)', fontSize: 13 }}>
              <span>{memberCount} members</span>
              <span>{joinModeLabel[group.join_mode]}</span>
              {myMembership && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{roleLabel[myMembership.role]}</span>}
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
        {myMembership && !isOwner && (
          <button className="btn btn-ghost" onClick={handleLeave} style={{ marginBottom: 28, fontSize: 13 }}>
            Leave group
          </button>
        )}

        {/* Pending requests (admins only) */}
        {isAdmin && pendingRequests.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <h3 className="section-title">
              Join Requests <span style={{ color: 'var(--accent)' }}>{pendingRequests.length}</span>
            </h3>
            {pendingRequests.map(req => (
              <div key={req.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: '1px solid var(--border)'
              }}>
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

        {/* Events */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 className="section-title" style={{ marginBottom: 0, borderBottom: 'none' }}>Upcoming Events</h3>
            {isAdmin && (
              <Link to="/create" className="attend-btn" style={{ textDecoration: 'none' }}>+ Post Event</Link>
            )}
          </div>
          {!isAdmin && !myMembership && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Join this group to post events</p>
          )}
          {events.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No upcoming events yet</p>
          ) : (
            events.map(event => (
              <div key={event.id} className="event-card" onClick={() => navigate(`/event/${event.id}`)}>
                <span className="event-category">{event.category}</span>
                <h3 className="event-title">{event.title}</h3>
                <div className="event-meta">
                  <span>{format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}</span>
                  <span>{event.location_name}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Members */}
        <div>
          <h3 className="section-title">{canSeeMembers ? `Members (${members.length})` : `${memberCount} members`}</h3>
          {!canSeeMembers && (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Member list is only visible to admins</p>
          )}
          {canSeeMembers && members.map(m => (
            <div key={m.user_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0', borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar-sm">{m.profiles?.username?.[0]?.toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>@{m.profiles?.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{roleLabel[m.role]}</div>
                </div>
              </div>
              {isOwner && m.user_id !== user.id && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.role === 'member' && (
                    <button className="attend-btn" onClick={() => changeRole(m.user_id, 'admin')} style={{ fontSize: 12 }}>
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
