import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AvatarCropper from '../components/AvatarCropper'
import GroupAvatar from '../components/GroupAvatar'
import LabelPicker from '../components/LabelPicker'
import ConfirmDialog from '../components/ConfirmDialog'
import { useLocationPrefs } from '../contexts/LocationContext'
import { formatEventRange } from '../lib/eventUtils'
import { visibilityFromRow, visibilityLevel } from '../lib/privacy'

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say']
const BASE_TABS = ['About', 'Groups', 'Connections', 'Attending', 'Interested']
const EMPTY_VIEW = { visible: true, items: [] }

// Small round picture (or first letter) used in the people lists
function PersonAvatar({ p, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
      {p.avatar_url
        ? <img src={p.avatar_url} alt={p.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: size, height: size, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>{p.username[0].toUpperCase()}</div>}
    </div>
  )
}

function PrivateNote({ children }) {
  return <div className="private-note">🔒 {children}</div>
}

function eventPlace(e) {
  if (e.location_type === 'online') return '🖱️ Online'
  if (e.location_type === 'tbc') return '📆 Location to be confirmed'
  return e.location_name ? `📍 ${e.location_name}` : null
}

// A short list of events: upcoming first, then past ones
function EventList({ view, emptyText, privateText, navigate }) {
  if (!view.visible) return <PrivateNote>{privateText}</PrivateNote>
  if (view.items.length === 0) return <div className="empty-state" style={{ padding: '32px 0' }}><p>{emptyText}</p></div>

  const now = new Date()
  const endOf = e => new Date(e.event_end || e.event_date)
  const upcoming = view.items.filter(e => endOf(e) >= now).sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
  const past = view.items.filter(e => endOf(e) < now).sort((a, b) => new Date(b.event_date) - new Date(a.event_date))

  const row = e => (
    <div key={e.id} className="event-card simple-event" onClick={() => navigate(`/event/${e.id}`)}>
      <div className="simple-event-title">{e.title}</div>
      <div className="simple-event-meta">🗓 {formatEventRange(e.event_date, e.event_end)}</div>
      {eventPlace(e) && <div className="simple-event-meta">{eventPlace(e)}</div>}
      {e.group_name && <div className="simple-event-meta">👥 {e.group_name}</div>}
    </div>
  )

  return (
    <div>
      {upcoming.length > 0 && <>
        <div className="event-section-label">Upcoming ({upcoming.length})</div>
        {upcoming.map(row)}
      </>}
      {past.length > 0 && <>
        <div className="event-section-label">Past ({past.length})</div>
        <div style={{ opacity: 0.7 }}>{past.map(row)}</div>
      </>}
    </div>
  )
}

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [interestsView, setInterestsView] = useState(EMPTY_VIEW)
  const [groupsView, setGroupsView] = useState(EMPTY_VIEW)
  const [connectionsView, setConnectionsView] = useState(EMPTY_VIEW)
  const [attendingView, setAttendingView] = useState(EMPTY_VIEW)
  const [interestedView, setInterestedView] = useState(EMPTY_VIEW)
  const [privateInterests, setPrivateInterests] = useState([])   // own profile only
  const [visibility, setVisibility] = useState(visibilityFromRow(null))   // own profile only
  const [blocked, setBlocked] = useState([])                      // own profile only
  const [loadError, setLoadError] = useState('')
  const [unblockTarget, setUnblockTarget] = useState(null)
  const [pendingReceived, setPendingReceived] = useState([])
  const [pendingSent, setPendingSent] = useState([])
  const [myConnection, setMyConnection] = useState(null)
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab || 'About')
  const [loading, setLoading] = useState(true)
  const [avatarHover, setAvatarHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [editInterests, setEditInterests] = useState([])
  const [editPrivateInterests, setEditPrivateInterests] = useState([])
  const [editError, setEditError] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSuggestions, setLocationSuggestions] = useState([])
  const [locationTouched, setLocationTouched] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState(null)
  const [savingUsername, setSavingUsername] = useState(false)

  const fileInputRef = useRef(null)
  const { refreshPrefs } = useLocationPrefs()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === id
  const tabs = isOwnProfile ? [...BASE_TABS, 'Blocked'] : BASE_TABS
  const activeTab = tabs.includes(tab) ? tab : 'About'
  const firstLoad = useRef(true)

  // Moving to a different person's profile starts back on About
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false } else { setTab('About'); setEditing(false) }
    fetchAll()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    // Each of these functions only returns what the person looking is allowed to see
    const [profileRes, interestsRes, groupsRes, connectionsRes, attendingRes, interestedRes, myConnRes] = await Promise.all([
      supabase.rpc('get_profile_view', { p_user: id }),
      supabase.rpc('profile_interests_view', { p_user: id }),
      supabase.rpc('profile_groups_view', { p_user: id }),
      supabase.rpc('profile_connections_view', { p_user: id }),
      supabase.rpc('profile_events_view', { p_user: id, p_kind: 'attending' }),
      supabase.rpc('profile_events_view', { p_user: id, p_kind: 'interested' }),
      !isOwnProfile
        ? supabase.from('connections').select('*')
            .or(`and(from_user.eq.${user.id},to_user.eq.${id}),and(from_user.eq.${id},to_user.eq.${user.id})`)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ])

    const firstError = [profileRes, interestsRes, groupsRes, connectionsRes, attendingRes, interestedRes].find(r => r.error)
    setLoadError(firstError ? firstError.error.message : '')

    setProfile(profileRes.data || null)
    setInterestsView(interestsRes.data || EMPTY_VIEW)
    setGroupsView(groupsRes.data || EMPTY_VIEW)
    setConnectionsView(connectionsRes.data || EMPTY_VIEW)
    setAttendingView(attendingRes.data || EMPTY_VIEW)
    setInterestedView(interestedRes.data || EMPTY_VIEW)
    setMyConnection(myConnRes.data)

    if (isOwnProfile) {
      const [rec, sent, settingsRes, privateRes, blockedRes] = await Promise.all([
        supabase.from('connections').select('*, from_profile:from_user(id, username, avatar_url)').eq('to_user', id).eq('status', 'pending'),
        supabase.from('connections').select('*, to_profile:to_user(id, username, avatar_url)').eq('from_user', id).eq('status', 'pending'),
        supabase.from('user_settings').select('*').eq('user_id', id).maybeSingle(),
        supabase.from('profile_private_label_assignments').select('label_id, group_labels(id, name)').eq('user_id', id),
        supabase.from('user_blocks').select('blocked_id, created_at, profile:blocked_id(id, username, avatar_url)').eq('blocker_id', id).order('created_at', { ascending: false }),
      ])
      setPendingReceived(rec.data || [])
      setPendingSent(sent.data || [])
      setVisibility(visibilityFromRow(settingsRes.data))
      setPrivateInterests((privateRes.data || []).map(i => i.group_labels).filter(Boolean))
      setBlocked((blockedRes.data || []).filter(b => b.profile))
    }
    setLoading(false)
  }

  async function unblock(blockedId) {
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
    if (!error) setBlocked(list => list.filter(b => b.blocked_id !== blockedId))
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

  // Edit profile — reset locationTouched so dropdown doesn't open on load
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
    setLocationSuggestions([])
    setLocationTouched(false)
    setEditInterests([...interestsView.items])
    setEditPrivateInterests([...privateInterests])
    setEditError('')
    setEditing(true)
  }

  // Only search when the user has actively typed
  async function handleLocationChange(val) {
    setLocationQuery(val)
    setLocationTouched(true)
    setEditData(d => ({ ...d, city: null, city_lat: null, city_lng: null }))
    if (!val || val.length < 2) { setLocationSuggestions([]); return }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&featuretype=city,town,village`)
      const data = await res.json()
      setLocationSuggestions(data.map(r => ({
        short: r.name + (r.address?.country ? `, ${r.address.country}` : ''),
        display: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon)
      })))
    } catch { setLocationSuggestions([]) }
  }

  async function saveEdit() {
    setSavingEdit(true); setEditError('')
    const { error: profileErr } = await supabase.from('profiles').update({
      first_name: editData.first_name, last_name: editData.last_name,
      age: parseInt(editData.age), gender: editData.gender,
      city: editData.city, city_lat: editData.city_lat, city_lng: editData.city_lng
    }).eq('id', user.id)
    if (profileErr) { setEditError('Could not save: ' + profileErr.message); setSavingEdit(false); return }

    await supabase.from('profile_label_assignments').delete().eq('user_id', user.id)
    if (editInterests.length > 0) {
      await supabase.from('profile_label_assignments').insert(
        editInterests.map(l => ({ user_id: user.id, label_id: l.id }))
      )
    }

    // Private interests: same idea, but only ever visible to you
    await supabase.from('profile_private_label_assignments').delete().eq('user_id', user.id)
    if (editPrivateInterests.length > 0) {
      await supabase.from('profile_private_label_assignments').insert(
        editPrivateInterests.map(l => ({ user_id: user.id, label_id: l.id }))
      )
    }

    await fetchAll()
    refreshPrefs()
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
  if (!profile) return (
    <div className="page"><div className="profile-page">
      <h2>{loadError ? 'Couldn’t load this profile' : 'User not found'}</h2>
      {loadError && <div className="error-msg" style={{ marginTop: 12 }}>{loadError}</div>}
    </div></div>
  )

  const hidden = profile.hidden || []
  const isHidden = key => hidden.includes(key)
  const initial = profile.first_name?.[0]?.toUpperCase() || profile.username?.[0]?.toUpperCase() || '?'
  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username
  const count = view => (view.visible ? view.items.length : '—')

  // On your own profile, a small icon shows who can currently see each thing
  const VisBadge = ({ k }) => {
    if (!isOwnProfile) return null
    const level = visibilityLevel(visibility[k])
    return <span className="vis-badge" title={`Visible to: ${level.short}`}>{level.icon}</span>
  }

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
              <div className="stat"><div className="stat-num">{count(groupsView)}</div><div className="stat-label">Groups</div></div>
              <div className="stat"><div className="stat-num">{count(connectionsView)}</div><div className="stat-label">Connections</div></div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          {isOwnProfile ? (
            <>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={startEdit}>✏ Edit Profile</button>
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate('/settings')}>⚙ Settings</button>
              <button className="btn btn-ghost" style={{ fontSize: 14 }} onClick={async () => { await signOut(); navigate('/login') }}>Sign Out</button>
            </>
          ) : (
            <>
              {renderConnectionAction()}
              <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate(`/messages/${id}`)}>✉ Message</button>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="profile-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 600, fontFamily: 'Syne, sans-serif', color: activeTab === t ? 'var(--accent)' : 'var(--muted)', borderBottom: `2px solid ${activeTab === t ? 'var(--accent)' : 'transparent'}`, marginBottom: -1, transition: 'all 0.2s' }}>
              {t}
              {t === 'Connections' && isOwnProfile && pendingReceived.length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 20, fontSize: 11, padding: '1px 6px', fontWeight: 700 }}>{pendingReceived.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── About tab — view ── */}
        {activeTab === 'About' && !editing && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
              {[
                { key: 'first_name', label: 'First Name' },
                { key: 'last_name', label: 'Last Name' },
                { key: 'age', label: 'Age' },
                { key: 'gender', label: 'Gender' },
                { key: 'city', label: 'Home Town' },
              ].map(({ key, label }) => (
                <div key={key} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label} <VisBadge k={key} /></div>
                  <div style={{ fontWeight: 600 }}>
                    {isHidden(key) ? <span className="private-note inline">🔒 Private</span> : (profile[key] || '—')}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Interests <VisBadge k="interests" /></div>
              {!interestsView.visible ? (
                <PrivateNote>{isOwnProfile ? 'Hidden' : `${profile.username} keeps their interests private`}</PrivateNote>
              ) : interestsView.items.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {interestsView.items.map(i => (
                    <span key={i.id} style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(255,92,53,0.1)', border: '1px solid rgba(255,92,53,0.3)', color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
                      {i.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>None yet</div>
              )}
            </div>

            {isOwnProfile && privateInterests.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Private interests <span className="private-pill">🔒 Only you</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {privateInterests.map(i => (
                    <span key={i.id} style={{ padding: '6px 14px', borderRadius: 20, background: 'var(--bg3)', border: '1px dashed var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── About tab — edit ── */}
        {activeTab === 'About' && editing && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div className="form-grid">
              <div className="field">
                <label>First Name</label>
                <input value={editData.first_name} onChange={e => setEditData(d => ({ ...d, first_name: e.target.value }))} />
              </div>
              <div className="field">
                <label>Last Name</label>
                <input value={editData.last_name} onChange={e => setEditData(d => ({ ...d, last_name: e.target.value }))} />
              </div>
              <div className="field">
                <label>Age</label>
                <input type="number" min="13" max="120" value={editData.age} onChange={e => setEditData(d => ({ ...d, age: e.target.value }))} />
              </div>
              <div className="field">
                <label>Gender</label>
                <select
                  value={editData.gender}
                  onChange={e => setEditData(d => ({ ...d, gender: e.target.value }))}
                  style={{ appearance: 'none', WebkitAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b80' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36, cursor: 'pointer' }}
                >
                  <option value="">Select gender</option>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {/* City — only shows suggestions after user types */}
            <div className="field" style={{ position: 'relative', marginBottom: 20 }}>
              <label>Home Town / City</label>
              <input
                value={locationQuery}
                onChange={e => handleLocationChange(e.target.value)}
                placeholder="Start typing your city..."
              />
              {locationTouched && locationSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 10, overflow: 'hidden', marginTop: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                }}>
                  {locationSuggestions.map((s, i) => (
                    <div key={i}
                      onClick={() => {
                        setLocationQuery(s.short)
                        setEditData(d => ({ ...d, city: s.short, city_lat: s.lat, city_lng: s.lng }))
                        setLocationSuggestions([])
                      }}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < locationSuggestions.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ fontWeight: 600 }}>{s.short}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{s.display}</div>
                    </div>
                  ))}
                </div>
              )}
              {editData.city && (
                <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 6 }}>✓ {editData.city}</div>
              )}
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

            <div className="field" style={{ marginBottom: 24 }}>
              <label>Private interests <span className="private-pill">🔒 Only you</span></label>
              <div className="field-hint" style={{ marginTop: 4 }}>Works just like interests, but nobody else can ever see these.</div>
              <div style={{ marginTop: 8 }}>
                <LabelPicker
                  selected={editPrivateInterests}
                  onChange={setEditPrivateInterests}
                  min={0}
                  max={10}
                  placeholder="e.g. Things you’d rather keep to yourself..."
                />
              </div>
            </div>

            {editError && <div className="error-msg" style={{ marginBottom: 14 }}>{editError}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Groups tab ── */}
        {activeTab === 'Groups' && (
          !groupsView.visible ? (
            <PrivateNote>{profile.username} keeps their groups private</PrivateNote>
          ) : groupsView.items.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>{isOwnProfile ? "You haven't joined any groups yet" : `${profile.username} isn't in any groups yet`}</p>
              {isOwnProfile && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/groups/create')}>Create a Group</button>
                  <button className="btn btn-ghost" onClick={() => navigate('/groups')}>Browse Groups</button>
                </div>
              )}
            </div>
          ) : groupsView.items.map(g => (
            <div key={g.id} className="event-card" onClick={() => navigate(`/groups/${g.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <GroupAvatar group={g} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{g.name}</div>
                  <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: `${g.role_color || '#99aab5'}22`, color: g.role_color || '#99aab5', border: `1px solid ${g.role_color || '#99aab5'}44` }}>
                    {g.is_owner ? '👑 ' : ''}{g.role_name || 'Member'}
                  </span>
                </div>
              </div>
              {g.description && <p className="event-desc" style={{ marginTop: 10 }}>{g.description}</p>}
            </div>
          ))
        )}

        {/* ── Connections tab ── */}
        {activeTab === 'Connections' && (
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
            <h3 className="section-title">Connections{connectionsView.visible ? ` (${connectionsView.items.length})` : ''}</h3>
            {!connectionsView.visible ? (
              <PrivateNote>{profile.username} keeps their connections private</PrivateNote>
            ) : connectionsView.items.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>{isOwnProfile ? 'No connections yet — find people in the People tab' : `${profile.username} has no connections yet`}</p>
              </div>
            ) : connectionsView.items.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => navigate(`/profile/${p.id}`)}>
                <PersonAvatar p={p} />
                <div style={{ fontWeight: 600 }}>@{p.username}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Events attending ── */}
        {activeTab === 'Attending' && (
          <EventList
            view={attendingView} navigate={navigate}
            emptyText={isOwnProfile ? "You're not going to any events yet" : `${profile.username} isn't going to any events yet`}
            privateText={`${profile.username} keeps the events they're attending private`}
          />
        )}

        {/* ── Events interested in ── */}
        {activeTab === 'Interested' && (
          <EventList
            view={interestedView} navigate={navigate}
            emptyText={isOwnProfile ? "You haven't marked any events as interested yet" : `${profile.username} hasn't marked any events as interested yet`}
            privateText={`${profile.username} keeps the events they're interested in private`}
          />
        )}

        {/* ── Blocked users (only on your own profile) ── */}
        {activeTab === 'Blocked' && isOwnProfile && (
          blocked.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>You haven't blocked anyone</p>
            </div>
          ) : (
            <div>
              <h3 className="section-title">Blocked users ({blocked.length})</h3>
              {blocked.map(b => (
                <div key={b.blocked_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <PersonAvatar p={b.profile} />
                  <div style={{ flex: 1, fontWeight: 600 }}>@{b.profile.username}</div>
                  <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => setUnblockTarget(b)}>Unblock</button>
                </div>
              ))}
              <div className="field-hint" style={{ marginTop: 14 }}>Blocked people can’t message you or send you connection requests.</div>
            </div>
          )
        )}

        {unblockTarget && (
          <ConfirmDialog
            title={`Unblock @${unblockTarget.profile.username}?`}
            confirmLabel="Unblock"
            onConfirm={() => unblock(unblockTarget.blocked_id)}
            onCancel={() => setUnblockTarget(null)}
          >
            They’ll be able to message you and send connection requests again, as your settings allow.
          </ConfirmDialog>
        )}
      </div>
    </div>
  )
}
