import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AvatarCropper from '../components/AvatarCropper'

const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }
const roleColor = { owner: '#f39c12', admin: '#9b59b6', member: 'var(--muted)' }

const TABS = ['Groups', 'Connections']

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [connections, setConnections] = useState([])
  const [pendingReceived, setPendingReceived] = useState([])
  const [pendingSent, setPendingSent] = useState([])
  const [myConnection, setMyConnection] = useState(null)
  const [tab, setTab] = useState('Groups')
  const [loading, setLoading] = useState(true)
  const [avatarHover, setAvatarHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  // Username editing
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [savingUsername, setSavingUsername] = useState(false)
  const fileInputRef = useRef(null)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === id

  useEffect(() => {
    fetchAll()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [profileRes, membershipsRes, connectionsRes, myConnRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('group_members').select('role, groups(id, name, description)').eq('user_id', id).order('joined_at', { ascending: true }),
      // All accepted connections for this profile
      supabase.from('connections').select('*, from_profile:from_user(id, username, avatar_url), to_profile:to_user(id, username, avatar_url)')
        .or(`from_user.eq.${id},to_user.eq.${id}`)
        .eq('status', 'accepted'),
      // My relationship to this profile (if viewing someone else)
      !isOwnProfile ? supabase.from('connections').select('*')
        .or(`and(from_user.eq.${user.id},to_user.eq.${id}),and(from_user.eq.${id},to_user.eq.${user.id})`)
        .maybeSingle()
        : Promise.resolve({ data: null })
    ])

    setProfile(profileRes.data)
    setMemberships(membershipsRes.data || [])
    setConnections(connectionsRes.data || [])
    setMyConnection(myConnRes.data)

    // If own profile, also fetch pending requests
    if (isOwnProfile) {
      const [receivedRes, sentRes] = await Promise.all([
        supabase.from('connections').select('*, from_profile:from_user(id, username, avatar_url)').eq('to_user', id).eq('status', 'pending'),
        supabase.from('connections').select('*, to_profile:to_user(id, username, avatar_url)').eq('from_user', id).eq('status', 'pending')
      ])
      setPendingReceived(receivedRes.data || [])
      setPendingSent(sentRes.data || [])
    }

    setLoading(false)
  }

  // Username availability check
  const checkUsername = useCallback(async (val) => {
    if (!val || val === profile?.username) { setUsernameAvailable(null); return }
    if (val.length < 3) { setUsernameAvailable(false); return }
    const { data } = await supabase.from('profiles').select('id').eq('username', val).maybeSingle()
    setUsernameAvailable(!data)
  }, [profile?.username])

  useEffect(() => {
    const t = setTimeout(() => checkUsername(newUsername), 400)
    return () => clearTimeout(t)
  }, [newUsername, checkUsername])

  async function saveUsername() {
    if (!usernameAvailable) return
    setSavingUsername(true)
    const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', user.id)
    if (!error) {
      setProfile(p => ({ ...p, username: newUsername }))
      setEditingUsername(false)
      setUsernameAvailable(null)
    }
    setSavingUsername(false)
  }

  // Avatar
  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCropSrc(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCropSave(blob) {
    setUploadingAvatar(true); setCropSrc(null)
    const path = `${user.id}/avatar.jpg`
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (uploadErr) { alert('Upload failed: ' + uploadErr.message); setUploadingAvatar(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatar_url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url }).eq('id', user.id)
    setProfile(p => ({ ...p, avatar_url }))
    setUploadingAvatar(false)
  }

  // Connections
  async function sendRequest() {
    const { data } = await supabase.from('connections').insert({ from_user: user.id, to_user: id, status: 'pending' }).select().single()
    setMyConnection(data)
  }

  async function cancelOrRemove(connId) {
    await supabase.from('connections').delete().eq('id', connId)
    setMyConnection(null)
    fetchAll()
  }

  async function acceptRequest(connId) {
    await supabase.from('connections').update({ status: 'accepted' }).eq('id', connId)
    fetchAll()
  }

  async function declineRequest(connId) {
    await supabase.from('connections').delete().eq('id', connId)
    fetchAll()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="page"><div className="profile-page"><h2>User not found</h2></div></div>

  const initial = profile.username?.[0]?.toUpperCase() || '?'

  // Connection button for viewing someone else's profile
  function renderConnectionAction() {
    if (!myConnection) return (
      <button className="btn btn-primary" style={{ width: 'auto' }} onClick={sendRequest}>+ Connect</button>
    )
    if (myConnection.status === 'accepted') return (
      <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => cancelOrRemove(myConnection.id)}>✓ Connected</button>
    )
    if (myConnection.status === 'pending' && myConnection.from_user === user.id) return (
      <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => cancelOrRemove(myConnection.id)}>Request sent — cancel</button>
    )
    if (myConnection.status === 'pending' && myConnection.to_user === user.id) return (
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => acceptRequest(myConnection.id)}>Accept</button>
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => declineRequest(myConnection.id)}>Decline</button>
      </div>
    )
  }

  return (
    <div className="page">
      {cropSrc && <AvatarCropper imageSrc={cropSrc} onSave={handleCropSave} onCancel={() => setCropSrc(null)} />}

      <div className="profile-page">
        {/* Header */}
        <div className="profile-header">
          {/* Avatar */}
          <div
            style={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}
            onMouseEnter={() => isOwnProfile && setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
          >
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', display: 'block' }} />
            ) : (
              <div className="avatar-lg" style={{ width: 80, height: 80, fontSize: '2rem' }}>
                {uploadingAvatar ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /> : initial}
              </div>
            )}
            {isOwnProfile && (
              <div onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2, opacity: avatarHover ? 1 : 0, transition: 'opacity 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>EDIT</span>
              </div>
            )}
            {uploadingAvatar && (
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

          <div className="profile-info">
            {/* Username with edit */}
            {isOwnProfile && editingUsername ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      placeholder={profile.username}
                      autoFocus
                      style={{ paddingRight: 28, width: 160 }}
                    />
                    {newUsername && newUsername !== profile.username && (
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>
                        {usernameAvailable === null ? '...' : usernameAvailable ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
                    onClick={saveUsername} disabled={!usernameAvailable || savingUsername}>
                    {savingUsername ? '...' : 'Save'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: 13 }}
                    onClick={() => { setEditingUsername(false); setNewUsername(''); setUsernameAvailable(null) }}>
                    Cancel
                  </button>
                </div>
                {newUsername && newUsername !== profile.username && usernameAvailable !== null && (
                  <div style={{ fontSize: 12, marginTop: 5, color: usernameAvailable ? 'var(--success)' : '#e74c3c' }}>
                    {usernameAvailable ? '✓ Username available' : '✗ Username taken'}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ margin: 0 }}>@{profile.username}</h2>
                {isOwnProfile && (
                  <button
                    onClick={() => { setEditingUsername(true); setNewUsername(profile.username) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                    title="Edit username"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>{profile.email}</p>
            <div className="profile-stats" style={{ marginTop: 8 }}>
              <div className="stat">
                <div className="stat-num">{memberships.length}</div>
                <div className="stat-label">Groups</div>
              </div>
              <div className="stat">
                <div className="stat-num">{connections.length}</div>
                <div className="stat-label">Connections</div>
              </div>
            </div>
          </div>
        </div>

        {/* Connect button for other profiles */}
        {!isOwnProfile && (
          <div style={{ marginBottom: 24 }}>{renderConnectionAction()}</div>
        )}

        {/* Sign out for own profile */}
        {isOwnProfile && (
          <button className="btn btn-ghost" style={{ marginBottom: 28, fontSize: 14 }}
            onClick={async () => { await signOut(); navigate('/login') }}>
            Sign Out
          </button>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 16px', fontSize: 14, fontWeight: 600,
              fontFamily: 'Syne, sans-serif',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.2s'
            }}>
              {t}
              {t === 'Connections' && isOwnProfile && pendingReceived.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 20, fontSize: 11, padding: '1px 6px', fontWeight: 700 }}>
                  {pendingReceived.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Groups tab */}
        {tab === 'Groups' && (
          memberships.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>{isOwnProfile ? "You haven't joined any groups yet" : `${profile.username} isn't in any groups yet`}</p>
              {isOwnProfile && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/groups/create')}>Create a Group</button>
                  <button className="btn btn-ghost" onClick={() => navigate('/groups')}>Browse Groups</button>
                </div>
              )}
            </div>
          ) : memberships.map(m => (
            <div key={m.groups?.id} className="event-card" onClick={() => navigate(`/groups/${m.groups?.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20 }}>
                  {m.groups?.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{m.groups?.name}</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: `${roleColor[m.role]}22`, color: roleColor[m.role], border: `1px solid ${roleColor[m.role]}44` }}>
                    {roleLabel[m.role]}
                  </span>
                </div>
              </div>
              {m.groups?.description && <p className="event-desc" style={{ marginTop: 10 }}>{m.groups.description}</p>}
            </div>
          ))
        )}

        {/* Connections tab */}
        {tab === 'Connections' && (
          <div>
            {/* Pending received — own profile only */}
            {isOwnProfile && pendingReceived.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 className="section-title">Connection Requests ({pendingReceived.length})</h3>
                {pendingReceived.map(c => {
                  const p = c.from_profile
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        {p.avatar_url
                          ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{p.username[0].toUpperCase()}</div>
                        }
                      </div>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        <div style={{ fontWeight: 600 }}>@{p.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>wants to connect</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="attend-btn" onClick={() => acceptRequest(c.id)}>Accept</button>
                        <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => declineRequest(c.id)}>Decline</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pending sent — own profile only */}
            {isOwnProfile && pendingSent.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 className="section-title">Sent Requests ({pendingSent.length})</h3>
                {pendingSent.map(c => {
                  const p = c.to_profile
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        {p.avatar_url
                          ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{p.username[0].toUpperCase()}</div>
                        }
                      </div>
                      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        <div style={{ fontWeight: 600 }}>@{p.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>request pending</div>
                      </div>
                      <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => cancelOrRemove(c.id)}>Cancel</button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Accepted connections */}
            <h3 className="section-title">
              {isOwnProfile ? `Your Connections (${connections.length})` : `${profile.username}'s Connections (${connections.length})`}
            </h3>
            {connections.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>{isOwnProfile ? "No connections yet — find people in the People tab" : `${profile.username} has no connections yet`}</p>
              </div>
            ) : connections.map(c => {
              const other = c.from_user === id ? c.to_profile : c.from_profile
              if (!other) return null
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/profile/${other.id}`)}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    {other.avatar_url
                      ? <img src={other.avatar_url} alt={other.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{other.username[0].toUpperCase()}</div>
                    }
                  </div>
                  <div style={{ fontWeight: 600 }}>@{other.username}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
