import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AvatarCropper from '../components/AvatarCropper'

const roleLabel = { owner: '👑 Owner', admin: '⚡ Admin', member: 'Member' }
const roleColor = { owner: '#f39c12', admin: '#9b59b6', member: 'var(--muted)' }

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(true)
  const [avatarHover, setAvatarHover] = useState(false)
  const [cropSrc, setCropSrc] = useState(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef(null)
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

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCropSrc(ev.target.result)
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  async function handleCropSave(blob) {
    setUploadingAvatar(true)
    setCropSrc(null)
    const path = `${user.id}/avatar.jpg`
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

    if (uploadErr) {
      alert('Upload failed: ' + uploadErr.message)
      setUploadingAvatar(false)
      return
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    // Add cache-busting param so the browser loads the new image
    const avatar_url = urlData.publicUrl + '?t=' + Date.now()

    await supabase.from('profiles').update({ avatar_url }).eq('id', user.id)
    setProfile(p => ({ ...p, avatar_url }))
    setUploadingAvatar(false)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="page"><div className="profile-page"><h2>User not found</h2></div></div>

  const initial = profile.username?.[0]?.toUpperCase() || '?'

  return (
    <div className="page">
      {cropSrc && (
        <AvatarCropper
          imageSrc={cropSrc}
          onSave={handleCropSave}
          onCancel={() => setCropSrc(null)}
        />
      )}

      <div className="profile-page">
        <div className="profile-header">

          {/* Avatar with edit overlay */}
          <div
            style={{ position: 'relative', flexShrink: 0, width: 80, height: 80 }}
            onMouseEnter={() => isOwnProfile && setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
          >
            {/* Avatar image or initial */}
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.username}
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--border)',
                  display: 'block'
                }}
              />
            ) : (
              <div className="avatar-lg" style={{ width: 80, height: 80, fontSize: '2rem' }}>
                {uploadingAvatar ? <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} /> : initial}
              </div>
            )}

            {/* Edit overlay — only on own profile */}
            {isOwnProfile && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', gap: 2,
                  opacity: avatarHover ? 1 : 0,
                  transition: 'opacity 0.2s'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>EDIT</span>
              </div>
            )}

            {/* Uploading spinner overlay */}
            {uploadingAvatar && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

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
            <div key={m.groups?.id} className="event-card" onClick={() => navigate(`/groups/${m.groups?.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: 'var(--accent)',
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20
                }}>
                  {m.groups?.name?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                    {m.groups?.name}
                  </div>
                  <span style={{
                    display: 'inline-block', fontSize: 12, fontWeight: 700,
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
