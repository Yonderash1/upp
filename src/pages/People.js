import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function People() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [connectionStatus, setConnectionStatus] = useState({})
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const search = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .ilike('username', `%${q}%`)
      .neq('id', user.id)
      .limit(20)
    setResults(data || [])

    // Fetch connection statuses for results
    if (data && data.length > 0) {
      const ids = data.map(p => p.id)
      const { data: conns } = await supabase
        .from('connections')
        .select('id, from_user, to_user, status')
        .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
      const statusMap = {}
      ;(conns || []).forEach(c => {
        const otherId = c.from_user === user.id ? c.to_user : c.from_user
        if (ids.includes(otherId)) {
          statusMap[otherId] = { status: c.status, id: c.id, isSender: c.from_user === user.id }
        }
      })
      setConnectionStatus(statusMap)
    }
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  async function sendRequest(toUserId) {
    const { data, error } = await supabase
      .from('connections')
      .insert({ from_user: user.id, to_user: toUserId, status: 'pending' })
      .select().single()
    if (!error) {
      setConnectionStatus(s => ({ ...s, [toUserId]: { status: 'pending', id: data.id, isSender: true } }))
    }
  }

  async function cancelRequest(connId, toUserId) {
    await supabase.from('connections').delete().eq('id', connId)
    setConnectionStatus(s => { const n = { ...s }; delete n[toUserId]; return n })
  }

  function connectionButton(profile) {
    const conn = connectionStatus[profile.id]
    if (!conn) {
      return (
        <button className="attend-btn" onClick={() => sendRequest(profile.id)}>
          + Connect
        </button>
      )
    }
    if (conn.status === 'accepted') {
      return <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>✓ Connected</span>
    }
    if (conn.status === 'pending' && conn.isSender) {
      return (
        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }}
          onClick={() => cancelRequest(conn.id, profile.id)}>
          Request sent
        </button>
      )
    }
    if (conn.status === 'pending' && !conn.isSender) {
      return <span style={{ fontSize: 13, color: '#f39c12', fontWeight: 600 }}>Wants to connect</span>
    }
  }

  return (
    <div className="page">
      <div className="home-page">
        <div className="feed-header">
          <div>
            <h1>People</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Find and connect with others on Upp</p>
          </div>
        </div>

        <input
          placeholder="Search by username..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ marginBottom: 20 }}
          autoFocus
        />

        {loading && <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}

        {!loading && query && results.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <h3>No users found</h3>
            <p>Try a different username</p>
          </div>
        )}

        {!loading && !query && (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.4 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <h3>Search for people</h3>
            <p>Type a username to find people</p>
          </div>
        )}

        {results.map(profile => (
          <div key={profile.id} className="event-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              onClick={() => navigate(`/profile/${profile.id}`)}
              style={{ cursor: 'pointer', flexShrink: 0, width: 48, height: 48, borderRadius: '50%', overflow: 'hidden' }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20 }}>
                  {profile.username[0].toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${profile.id}`)}
              >
                @{profile.username}
              </div>
            </div>
            {connectionButton(profile)}
          </div>
        ))}
      </div>
    </div>
  )
}
