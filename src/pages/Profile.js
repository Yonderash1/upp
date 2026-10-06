import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AvatarCropper from '../components/AvatarCropper'
import LabelPicker from '../components/LabelPicker'

const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }
const roleColor = { owner: '#f39c12', admin: '#9b59b6', member: 'var(--muted)' }
const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say']
const TABS = ['About', 'Groups', 'Connections']

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [interests, setInterests] = useState([]) // label objects {id, name}
  const [memberships, setMemberships] = useState([])
  const [connections, setConnections] = useState([])
  const [pendingReceived, setPendingReceived] = useState([])
  const [pendingSent, setPendingSent] = useState([])
  const [myConnection, setMyConnection] = useState(null)
  const [tab, setTab] = useState('About')
  const [loading, setLoading] = useState(true)
  const [avatarHover, setAvatarHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [editInterests, setEditInterests] = useState([])
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [savingUsername, setSavingUsername] = useState(false)

  const fileInputRef = useRef(null)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === id

  useEffect(() => { fetchAll() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const [profileRes, interestsRes, membershipsRes, connectionsRes, myConnRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('profile_label_assignments').select('label_id, group_labels(id, name)').eq('user_id', id),
      supabase.from('group_members').select('role, groups(id, name, description)').eq('user_id', id).order('joined_at', { ascending: true }),
      supabase.from('connections').select('*, from_profile:from_user(id, username, avatar_url), to_profile:to_user(id, username, avatar_url)')
        .or(`from_user.eq.${id},to_user.eq.${id}`).eq('status', 'accepted'),
      !isOwnProfile
        ? supabase.from('connections').select('*')
            .or(`and(from_user.eq.${user.id},to_user.eq.${id}),and(from_user.eq.${id},to_user.eq.${user.id})`)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ])

    setProfile(profileRes.data)
    setInterests((interestsRes.data || []).map(i => i.group_labels).filter(Boolean))
    setMemberships(membershipsRes.data || [])
    setConnections(connectionsRes.data || [])
    setMyConnection(myConnRes.data)

    if (isOwnProfile) {
      const [rec, sent] = await Promise.all([
        supabase.from('connections').select('*, from_profile:from_user(id, username, avatar_url)').eq('to_user', id).eq('status', 'pending'),
        supabase.from('connections').select('*, to_profile:to_user(id, username, avatar_url)').eq('from_user', id).eq('status', 'pending')
      ])
      setPendingReceived(rec.data || [])
      setPendingSent(sent.data || [])
    }
    setLoading(false)
  }

  // Username check
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
    if (!error) { setProfile(p => ({ ...p, username: newUsername })); setEditingUsername(false); setUsernameAvailable(null) }
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
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) { alert('Upload failed'); setUploadingAvatar(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatar_url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url }).eq('id', user.id)
    setProfile(p => ({ ...p, avatar_url }))
    setUploadingAvatar(false)
  }

  // Edit profile
  function startEdit() {
    setEditData({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      age: profile.age || '',
      gender: profile.gender || '',
      city: profile.city || '',
      city_lat: profile.city_lat,
      city_lng: profile.city_lng,
    })
    setLocationQuery(profile.city || '')
    setEditInterests([...interests]) // pass full label objects
    setEditing(true)
  }

  async function searchLocation(q) {
    if (!q || q.length < 2) { setLocationSuggestions([]); return }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&featuretype=city,town,village`)
      const data = await res.json()
      setLocationSuggestions(data.map(r => ({
        short: r.name + (r.address?.country ? `, ${r.address.country}` : ''),
        display: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon)
      })))
    } catch { setLocationSuggestions([]) }
  }

  useEffect(() => {
    if (!editing) return
    const t = setTimeout(() => searchLocation(locationQuery), 400)
    return () => clearTimeout(t)
  }, [locationQuery, editing])

  async function saveEdit() {
    setSavingEdit(true)
    await supabase.from('profiles').update({
      first_name: editData.first_name, last_name: editData.last_name,
      age: parseInt(editData.age), gender: editData.gender,
      city: editData.city, city_lat: editData.city_lat, city_lng: editData.city_lng
    }).eq('id', user.id)

    // Replace label assignments
    await supabase.from('profile_label_assignments').delete().eq('user_id', user.id)
    if (editInterests.length > 0) {
      await supabase.from('profile_label_assignments').insert(
        editInterests.map(l => ({ user_id: user.id, label_id: l.id }))
      )
    }

    await fetchAll()
    setEditing(false)
    setSavingEdit(false)
  }

  // Connections
  async function sendRequest() {
    const { data } = await supabase.from('connections').insert({ from_user: user.id, to_user: id, status: 'pending' }).select().single()
    setMyConnection(data)
  }
  async function cancelOrRemove(connId) { await supabase.from('connections').delete().eq('id', connId); setMyConnection(null); fetchAll() }
  async function acceptRequest(connId) { await supabase.from('connections').update({ status: 'accepted' }).eq('id', connId); fetchAll() }
  async function declineRequest(connId) { await supabase.from('connections').delete().eq('id', connId); fetchAll() }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="page"><div className="profile-page"><h2>User not found</h2></div></div>

  const initial = profile.first_name?.[0]?.toUpperCase() || profile.username?.[0]?.toUpperCase() || '?'
  const displayName = profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.username

  function renderConnectionAction() {
    if (!myConnection) return <button className="btn btn-primary" style={{ width: 'auto' }} onClick={sendRequest}>+ Connect</button>
    if (myConnection.status === 'accepted') return <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => cancelOrRemove(myConnection.id)}>✓ Connected</button>
    if (myConnection.status === 'pending' && myConnection.from_user === user.id) return <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => cancelOrRemove(myConnection.id)}>Request sent — cancel</button>
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
        <div className="profile-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}
            onMouseEnter={() => isOwnProfile && setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={displayName} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', display: 'block' }} />
              : <div className="avatar-lg" style={{ width: 80, height: 80, fontSize: '2rem' }}>{uploadingAvatar ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /> : initial}</div>
            }
            {isOwnProfile && (
              <div onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 2, opacity: avatarHover ? 1 : 0, transition: 'opacity 0.2s' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>EDIT</span>
              </div>
            )}
            {uploadingAvatar && <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /></div>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

          <div className="profile-info" style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 2px' }}>{displayName}</h2>
            {editingUsername ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ position: 'relative' }}>
                  <input value={newUsername} onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} style={{ width: 140, padding: '6px 28px 6px 10px', fontSize: 13 }} autoFocus />
                  {newUsername && <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>{usernameAvailable === null ? '...' : usernameAvailable ? '✓' : '✗'}</span>}
                </div>
                <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={saveUsername} disabled={!usernameAvailable || savingUsername}>{savingUsername ? '...' : 'Save'}</button>
                <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => { setEditingUsername(false); setUsernameAvailable(null) }}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>@{profile.username}</span>
                {isOwnProfile && (
                  <button onClick={() => { setEditingUsername(true); setNewUsername(profile.username) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                )}
              </div>
            )}
            {profile.city && <div style={{ fontSize: 13, color: 'var(--muted)' }}>📍 {profile.city}</div>}
            <div className="profile-stats" style={{ marginTop: 8 }}>
              <div className="stat"><div className="stat-num">{memberships.length}</div><div className="stat-label">Groups</div></div>
              <div className="stat"><div className="stat-num">{connections.length}</div><div className="stat-label">Connections</div></div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          {isOwnProfile ? (
            <>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={startEdit}>✏ Edit Profile</button>
              <button className="btn btn-ghost" style={{ fontSize: 14 }} onClick={async () => { await signOut(); navigate('/login') }}>Sign Out</button>
            </>
          ) : renderConnectionAction()}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'Syne, sans-serif', color: tab === t ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, transition: 'all 0.2s' }}>
              {t}
              {t === 'Connections' && isOwnProfile && pendingReceived.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 20, fontSize: 11, padding: '1px 6px', fontWeight: 700 }}>{pendingReceived.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── About tab ── */}
        {tab === 'About' && !editing && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'First Name', value: profile.first_name },
                { label: 'Last Name', value: profile.last_name },
                { label: 'Age', value: profile.age },
                { label: 'Gender', value: profile.gender },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 600 }}>{value || '—'}</div>
                </div>
              ))}
            </div>

            {interests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Interests</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {interests.map(i => (
                    <span key={i.id} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,92,53,0.1)', border: '1px solid rgba(255,92,53,0.3)', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Edit mode ── */}
        {tab === 'About' && editing && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="form-grid">
              <div className="field"><label>First Name</label><input value={editData.first_name} onChange={e => setEditData(d => ({ ...d, first_name: e.target.value }))} /></div>
              <div className="field"><label>Last Name</label><input value={editData.last_name} onChange={e => setEditData(d => ({ ...d, last_name: e.target.value }))} /></div>
              <div className="field"><label>Age</label><input type="number" value={editData.age} onChange={e => setEditData(d => ({ ...d, age: e.target.value }))} /></div>
              <div className="field">
                <label>Gender</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {GENDERS.map(g => (
                    <div key={g} onClick={() => setEditData(d => ({ ...d, gender: g }))} style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${editData.gender === g ? 'var(--accent)' : 'var(--border)'}`, background: editData.gender === g ? 'rgba(255,92,53,0.08)' : 'var(--bg3)', color: editData.gender === g ? 'var(--accent)' : 'var(--text)', fontSize: 13, fontWeight: editData.gender === g ? 600 : 400 }}>{g}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="field" style={{ position: 'relative', marginBottom: 20 }}>
              <label>Home Town / City</label>
              <input value={locationQuery} onChange={e => { setLocationQuery(e.target.value); setEditData(d => ({ ...d, city: null, city_lat: null, city_lng: null })) }} placeholder="Start typing your city..." />
              {locationSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {locationSuggestions.map((s, i) => (
                    <div key={i} onClick={() => { setLocationQuery(s.short); setEditData(d => ({ ...d, city: s.short, city_lat: s.lat, city_lng: s.lng })); setLocationSuggestions([]) }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < locationSuggestions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontWeight: 600 }}>{s.short}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{s.display}</div>
                    </div>
                  ))}
                </div>
              )}
              {editData.city && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>✓ {editData.city}</div>}
            </div>

            <div className="field" style={{ marginBottom: 24 }}>
              <label>Interests</label>
              <div style={{ marginTop: 8 }}>
                <LabelPicker
                  selected={editInterests}
                  onChange={setEditInterests}
                  min={3}
                  max={10}
                  placeholder="e.g. Gaming, LGBTQ+, Cycling..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Groups tab ── */}
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
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20 }}>{m.groups?.name?.[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{m.groups?.name}</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: `${roleColor[m.role]}22`, color: roleColor[m.role], border: `1px solid ${roleColor[m.role]}44` }}>{roleLabel[m.role]}</span>
                </div>
              </div>
              {m.groups?.description && <p className="event-desc" style={{ marginTop: 10 }}>{m.groups.description}</p>}
            </div>
          ))
        )}

        {/* ── Connections tab ── */}
        {tab === 'Connections' && (
          <div>
            {isOwnProfile && pendingReceived.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 className="section-title">Requests ({pendingReceived.length})</h3>
                {pendingReceived.map(c => {
                  const p = c.from_profile
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        {p.avatar_url ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{p.username[0].toUpperCase()}</div>}
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
            {isOwnProfile && pendingSent.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h3 className="section-title">Sent ({pendingSent.length})</h3>
                {pendingSent.map(c => {
                  const p = c.to_profile
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                        {p.avatar_url ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{p.username[0].toUpperCase()}</div>}
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
            <h3 className="section-title">Connections ({connections.length})</h3>
            {connections.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>{isOwnProfile ? 'No connections yet — find people in the People tab' : `${profile.username} has no connections yet`}</p>
              </div>
            ) : connections.map(c => {
              const other = c.from_user === id ? c.to_profile : c.from_profile
              if (!other) return null
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/profile/${other.id}`)}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    {other.avatar_url ? <img src={other.avatar_url} alt={other.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{other.username[0].toUpperCase()}</div>}
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
