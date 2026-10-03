import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Groups() {
  const [groups, setGroups] = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [groupLabels, setGroupLabels] = useState({})
  const [myGroupIds, setMyGroupIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGroups() {
    const [groupsRes, myRes, memberData, labelData] = await Promise.all([
      supabase.from('groups').select('*').order('created_at', { ascending: false }),
      supabase.from('group_members').select('group_id').eq('user_id', user.id),
      supabase.from('group_members').select('group_id'),
      supabase.from('group_label_assignments').select('group_id, group_labels(id, name)')
    ])

    const counts = {}
    ;(memberData.data || []).forEach(r => {
      counts[r.group_id] = (counts[r.group_id] || 0) + 1
    })

    const labels = {}
    ;(labelData.data || []).forEach(r => {
      if (!labels[r.group_id]) labels[r.group_id] = []
      if (r.group_labels) labels[r.group_id].push(r.group_labels)
    })

    setGroups(groupsRes.data || [])
    setMemberCounts(counts)
    setGroupLabels(labels)
    setMyGroupIds(new Set((myRes.data || []).map(m => m.group_id)))
    setLoading(false)
  }

  const filtered = groups.filter(g => {
    const q = search.toLowerCase()
    if (!q) return true
    const nameMatch = g.name.toLowerCase().includes(q)
    const descMatch = (g.description || '').toLowerCase().includes(q)
    const labelMatch = (groupLabels[g.id] || []).some(l => l.name.toLowerCase().includes(q))
    return nameMatch || descMatch || labelMatch
  })

  const joinModeLabel = { open: 'Open', request: 'Request to join', invite: 'Invite only' }
  const joinModeBadge = { open: '#2ecc71', request: '#f39c12', invite: '#e74c3c' }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="home-page">
        <div className="feed-header">
          <div>
            <h1>Groups</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Find communities near you</p>
          </div>
          <Link to="/groups/create" className="btn btn-primary" style={{ width: 'auto' }}>
            + New Group
          </Link>
        </div>

        <input
          placeholder="Search by name, description or label..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ marginBottom: 20 }}
        />

        {filtered.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.4 }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <h3>No groups found</h3>
            <p>Try a different search or create one</p>
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
                  width: 48, height: 48, borderRadius: 12, background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, flexShrink: 0
                }}>
                  {group.name[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{group.name}</h3>
                    {myGroupIds.has(group.id) && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,92,53,0.15)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member</span>
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

              {group.description && <p className="event-desc">{group.description}</p>}

              {/* Labels */}
              {(groupLabels[group.id] || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {(groupLabels[group.id] || []).map(l => (
                    <span key={l.id} style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 10px', borderRadius: 20,
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      color: 'var(--muted)'
                    }}>
                      {l.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
