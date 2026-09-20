import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const roleLabel = {
  creator: '⭐ Creator',
  owner: '👑 Owner',
  admin: '⚡ Admin',
  member: 'Member'
}

const roleColor = {
  creator: 'var(--accent)',
  owner: '#f39c12',
  admin: '#9b59b6',
  member: 'var(--muted)'
}

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === id

  useEffect(() => {
    fetchProfile()
    fetchMemberships()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  async function fetchMemberships() {
    const { data } = await supabase
      .from('group_members')
      .select('role, groups(id, name, description)')
      .eq('user_id', id)
      .order('joined_at', { ascending: true })
    setMemberships(data || [])
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="page"><div className="profile-page"><h2>User not found</h2></div></div>

  return (
    <div className="page">
      <div className="profile-page">

        {/* Header */}
        <div className="profile-header">
          <div className="avatar-lg">
            {profile.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="profile-info">
            <h2>@{profile.username}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>{profile.email}</p>
            <div className="profile-stats">
              <div className="stat">
                <div className="stat-num">{memberships.length}</div>
                <div className="stat-label">Groups</div>
              </div>
            </div>
          </div>
        </div>

        {isOwnProfile && (
          <button
            className="btn btn-ghost"
            style={{ marginBottom: 28, fontSize: 14 }}
            onClick={async () => { await signOut(); navigate('/login') }}
          >
            Sign Out
          </button>
        )}

        {/* Group memberships */}
        <h3 className="section-title">
          {isOwnProfile ? 'Your Groups' : `${profile.username}'s Groups`}
        </h3>

        {memberships.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 0' }}>
            <p>{isOwnProfile ? "You haven't joined any groups yet" : "Not a member of any groups yet"}</p>
            {isOwnProfile && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/groups/create')}>
                  Create a Group
                </button>
                <button className="btn btn-ghost" onClick={() => navigate('/groups')}>
                  Browse Groups
                </button>
              </div>
            )}
          </div>
        ) : (
          memberships.map(m => (
            <div
              key={m.groups?.id}
              className="event-card"
              onClick={() => navigate(`/groups/${m.groups?.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'var(--accent)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20
                }}>
                  {m.groups?.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                    {m.groups?.name}
                  </div>
                  <span style={{
                    display: 'inline-block',
                    fontSize: 12, fontWeight: 700,
                    padding: '2px 10px', borderRadius: 20,
                    background: `${roleColor[m.role]}22`,
                    color: roleColor[m.role],
                    border: `1px solid ${roleColor[m.role]}44`
                  }}>
                    {roleLabel[m.role]}
                  </span>
                </div>
              </div>
              {m.groups?.description && (
                <p className="event-desc" style={{ marginTop: 10 }}>{m.groups.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
