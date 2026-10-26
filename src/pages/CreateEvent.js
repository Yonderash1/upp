import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EventForm from '../components/EventForm'

export default function CreateEvent() {
  const [adminGroups, setAdminGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchAdminGroups()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAdminGroups() {
    const { data } = await supabase
      .from('group_members')
      .select('group_id, group_roles(is_owner, permissions), groups(id, name)')
      .eq('user_id', user.id)
    const groups = (data || [])
      .filter(m => m.group_roles && (m.group_roles.is_owner || (m.group_roles.permissions || []).includes('create_events')))
      .map(m => m.groups).filter(Boolean)
    setAdminGroups(groups)
    if (groups.length === 1) setSelectedGroup(groups[0].id)
    setLoadingGroups(false)
  }

  if (loadingGroups) return <div className="loading-screen"><div className="spinner" /></div>

  if (adminGroups.length === 0) {
    return (
      <div className="page">
        <div className="create-page">
          <h1>Post an Event</h1>
          <div style={{ marginTop: 32, padding: '28px 24px', background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h3 style={{ marginBottom: 10 }}>You need permission to post events in a group</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
              Events on Upp are posted by groups. Create your own group and you'll automatically become its creator, letting you post events straight away.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/groups/create')}>Create a Group</button>
              <button className="btn btn-ghost" onClick={() => navigate('/groups')}>Browse Groups</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="create-page">
        <h1>Post an Event</h1>
        <p className="subtitle">Tell people what's happening near you</p>
        <div>
          <div className="field">
            <label>Posting as</label>
            {adminGroups.length === 1 ? (
              <div style={{ padding: '12px 16px', background: 'var(--bg3)', border: '1.5px solid var(--accent)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>
                  {adminGroups[0].name[0].toUpperCase()}
                </div>
                <span style={{ fontWeight: 600 }}>{adminGroups[0].name}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {adminGroups.map(g => (
                  <div key={g.id} onClick={() => setSelectedGroup(g.id)} style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 12, border: `1.5px solid ${selectedGroup === g.id ? 'var(--accent)' : 'var(--border)'}`, background: selectedGroup === g.id ? 'rgba(255,92,53,0.08)' : 'var(--bg3)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16 }}>
                      {g.name[0].toUpperCase()}
                    </div>
                    <span style={{ fontWeight: 600, color: selectedGroup === g.id ? 'var(--accent)' : 'var(--text)' }}>{g.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <EventForm groupId={selectedGroup} userId={user.id} onSuccess={() => navigate('/')} />
      </div>
    </div>
  )
}
