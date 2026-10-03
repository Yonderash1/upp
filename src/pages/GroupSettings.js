import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LabelPicker from '../components/LabelPicker'

const JOIN_MODES = [
  { value: 'open', label: 'Open', desc: 'Anyone can join instantly' },
  { value: 'request', label: 'Request to join', desc: 'Users request, admins approve' },
  { value: 'invite', label: 'Invite only', desc: 'Admins add members manually' }
]

export default function GroupSettings() {
  const { id } = useParams()
  const [group, setGroup] = useState(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [joinMode, setJoinMode] = useState('open')
  const [membersVisible, setMembersVisible] = useState(true)
  const [selectedLabels, setSelectedLabels] = useState([])
  const [labelError, setLabelError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchGroup()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchGroup() {
    const { data } = await supabase.from('groups').select('*').eq('id', id).single()
    if (!data) { navigate('/groups'); return }

    const { data: membership } = await supabase
      .from('group_members').select('role')
      .eq('group_id', id).eq('user_id', user.id).maybeSingle()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      navigate(`/groups/${id}`); return
    }

    // Fetch current labels
    const { data: labelData } = await supabase
      .from('group_label_assignments')
      .select('label_id, group_labels(id, name)')
      .eq('group_id', id)

    const labels = (labelData || []).map(l => l.group_labels).filter(Boolean)

    setIsOwner(membership.role === 'owner')
    setGroup(data)
    setName(data.name)
    setDescription(data.description || '')
    setJoinMode(data.join_mode)
    setMembersVisible(data.members_visible)
    setSelectedLabels(labels)
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (selectedLabels.length < 1) { setLabelError('At least one label is required'); return }
    setLabelError('')
    setSaving(true); setError(''); setSaved(false)

    const { error: err } = await supabase
      .from('groups')
      .update({ name, description, join_mode: joinMode, members_visible: membersVisible })
      .eq('id', id)

    if (err) { setError(err.message); setSaving(false); return }

    // Update labels — delete all then re-insert
    await supabase.from('group_label_assignments').delete().eq('group_id', id)
    if (selectedLabels.length > 0) {
      await supabase.from('group_label_assignments').insert(
        selectedLabels.map(l => ({ group_id: id, label_id: l.id }))
      )
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    setSaving(false)
  }

  async function handleDelete() {
    if (!window.confirm(`Permanently delete "${group.name}"? This will remove all events and announcements.`)) return
    await supabase.from('groups').delete().eq('id', id)
    navigate('/groups')
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="create-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }}
          onClick={() => navigate(`/groups/${id}`)}>
          ← Back to group
        </button>
        <h1>Group Settings</h1>
        <p className="subtitle">{group.name}</p>

        {error && <div className="error-msg">{error}</div>}
        {saved && (
          <div style={{ background: 'rgba(46,204,113,0.12)', border: '1px solid rgba(46,204,113,0.3)', color: 'var(--success)', padding: '12px 16px', borderRadius: 10, marginBottom: 18, fontSize: 14 }}>
            ✓ Settings saved
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="field">
            <label>Group Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="field">
            <label>How can people join?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {JOIN_MODES.map(mode => (
                <div key={mode.value} onClick={() => setJoinMode(mode.value)} style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                  border: `1.5px solid ${joinMode === mode.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: joinMode === mode.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)'
                }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: joinMode === mode.value ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{mode.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{mode.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Member list visibility</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {[
                { value: true, label: 'Visible to all members', desc: 'Everyone in the group can see the full member list' },
                { value: false, label: 'Admins only', desc: 'Only owners and admins can see the full member list' }
              ].map(opt => (
                <div key={String(opt.value)} onClick={() => setMembersVisible(opt.value)} style={{
                  padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                  border: `1.5px solid ${membersVisible === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                  background: membersVisible === opt.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)'
                }}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: membersVisible === opt.value ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{opt.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Labels</label>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>
              1–5 labels that describe your group
            </p>
            <LabelPicker
              selected={selectedLabels}
              onChange={setSelectedLabels}
              error={labelError}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 8 }}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>

        {isOwner && (
          <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ color: '#e74c3c', marginBottom: 8, fontSize: '1rem' }}>Danger Zone</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              Deleting this group will permanently remove all events and announcements. This cannot be undone.
            </p>
            <button type="button" onClick={handleDelete} style={{
              background: 'rgba(231,76,60,0.1)', border: '1.5px solid rgba(231,76,60,0.4)',
              color: '#e74c3c', borderRadius: 10, padding: '10px 20px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Syne, sans-serif'
            }}>
              Delete Group
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
