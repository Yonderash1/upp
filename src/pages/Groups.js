import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [myGroups, setMyGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGroups() {
    const { data: all } = await supabase
      .from('groups')
      .select('*, group_members(count)')
      .order('created_at', { ascending: false })

    const { data: mine } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    const myIds = new Set((mine || []).map(m => m.group_id))
    setMyGroups(myIds)
    setGroups(all || [])
    setLoading(false)
  }

  const filtered = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
  const joinModeBadge = { open: '#2ecc71', request: '#f39c12', invite: '#e74c3c' }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="home-page">
        <div className="feed-header">
          <div>
            <h1>Groups</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
              Find communities near you
            </p>
          </div>
          <Link to="/groups/create" className="btn btn-primary" style={{ width: 'auto' }}>
            + New Group
          </Link>
        </div>

        <input
          placeholder="Search groups..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 20 }}
        />

        {myGroups.size > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
            Groups you're in are highlighted
          </p>
        )}

        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.4 }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <h3>No groups found</h3>
            <p>Be the first to create one</p>
          </div>
        ) : (
          filtered.map(group => (
            <div
              key={group.id}
              className="event-card"
              style={{ borderColor: myGroups.has(group.id) ? 'var(--accent)' : undefined }}
              onClick={() => navigate(`/groups/${group.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'var(--accent)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Syne, sans-serif', fontWeight: 800,
                  fontSize: 20, flexShrink: 0
                }}>
                  {group.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>{group.name}</h3>
                    {myGroups.has(group.id) && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 20, background: 'rgba(255,92,53,0.15)',
                        color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em'
                      }}>Member</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {group.group_members?.[0]?.count || 0} members
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      color: joinModeBadge[group.join_mode]
                    }}>
                      {joinModeLabel[group.join_mode]}
                    </span>
                  </div>
                </div>
              </div>
              {group.description && (
                <p className="event-desc">{group.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
