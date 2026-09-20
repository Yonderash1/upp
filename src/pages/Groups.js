import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [myGroupIds, setMyGroupIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGroups() {
    // Fetch all groups — simple, no aggregates
    const { data: allGroups, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Groups fetch error:', error)
      setLoading(false)
      return
    }

    // Fetch which groups the current user belongs to
    const { data: myMemberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id)

    // Fetch member counts separately for each group
    const counts = {}
    if (allGroups && allGroups.length > 0) {
      const { data: memberData } = await supabase
        .from('group_members')
        .select('group_id')

      if (memberData) {
        memberData.forEach(row => {
          counts[row.group_id] = (counts[row.group_id] || 0) + 1
        })
      }
    }

    setGroups(allGroups || [])
    setMemberCounts(counts)
    setMyGroupIds(new Set((myMemberships || []).map(m => m.group_id)))
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
              style={{ borderColor: myGroupIds.has(group.id) ? 'var(--accent)' : undefined }}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{group.name}</h3>
                    {myGroupIds.has(group.id) && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 20, background: 'rgba(255,92,53,0.15)',
                        color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em'
                      }}>Member</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {memberCounts[group.id] || 0} member{memberCounts[group.id] !== 1 ? 's' : ''}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: joinModeBadge[group.join_mode] }}>
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
