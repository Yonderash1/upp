import { useState } from 'react'
import Modal from './Modal'
import { supabase } from '../lib/supabase'
import { CHANNEL_LEVELS, sortRoles, roleAndAboveLabel } from '../lib/permissions'

const HINTS = {
  view_min_role: 'People below this role won’t see the channel in the list at all.',
  read_min_role: 'Who can open the channel and read what’s been said.',
  send_min_role: 'Who can post messages. Everyone else can only read.',
  manage_messages_min_role: 'Who can edit and delete other people’s messages (never someone with a higher role than theirs).'
}

// Create or edit a channel: its name and who gets each level of access.
// Each level is "this role and everyone above it", so higher roles can never have less access than lower ones.
export default function ChannelForm({ groupId, userId, roles, channel, canDelete, onSaved, onDeleted, onClose }) {
  const sorted = sortRoles(roles)
  const byId = Object.fromEntries(sorted.map(r => [r.id, r]))
  const base = sorted.find(r => r.is_default)
  const firstStaff = sorted.find(r => !r.is_owner && !r.is_default) || sorted[0]

  const [name, setName] = useState(channel?.name || '')
  const [levels, setLevels] = useState(() => ({
    view_min_role: channel?.view_min_role || base.id,
    read_min_role: channel?.read_min_role || base.id,
    send_min_role: channel?.send_min_role || base.id,
    manage_messages_min_role: channel?.manage_messages_min_role || firstStaff.id
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const R = id => byId[id]?.rank ?? 0   // bigger number = lower role = more people

  // Keeps the levels sensible: you can't chat without being able to read, or read without seeing the channel
  function change(key, roleId) {
    const next = { ...levels, [key]: roleId }
    if ((key === 'send_min_role' || key === 'manage_messages_min_role') && R(next.read_min_role) < R(roleId)) {
      next.read_min_role = roleId
    }
    if (key !== 'view_min_role' && R(next.view_min_role) < R(next.read_min_role)) next.view_min_role = next.read_min_role
    if (R(next.read_min_role) > R(next.view_min_role)) next.read_min_role = next.view_min_role
    if (R(next.send_min_role) > R(next.read_min_role)) next.send_min_role = next.read_min_role
    if (R(next.manage_messages_min_role) > R(next.read_min_role)) next.manage_messages_min_role = next.read_min_role
    setLevels(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Please give the channel a name'); return }
    setSaving(true); setError('')
    const payload = { name: name.trim(), ...levels }
    let err
    if (channel) {
      const { data, error: e1 } = await supabase.from('group_channels').update(payload).eq('id', channel.id).select('id')
      err = e1 || (!data || data.length === 0 ? { message: "You don't have permission to edit this channel" } : null)
    } else {
      const { error: e2 } = await supabase.from('group_channels').insert({ ...payload, group_id: groupId, created_by: userId })
      err = e2
    }
    if (err) {
      setError(/duplicate|unique/i.test(err.message) ? 'A channel with that name already exists' : err.message)
      setSaving(false); return
    }
    onSaved()
  }

  async function handleDelete() {
    if (!window.confirm(`Delete #${channel.name}? All of its messages will be lost.`)) return
    setSaving(true)
    const { error: err } = await supabase.from('group_channels').delete().eq('id', channel.id)
    if (err) { setError(err.message); setSaving(false); return }
    onDeleted()
  }

  return (
    <Modal title={channel ? `Edit #${channel.name}` : 'New channel'} onClose={onClose} width={560}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Channel name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. general" maxLength={40} autoFocus required />
        </div>

        <h4 className="form-section-title">Who can…</h4>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Each option is a role and everyone above it. Owners always have full access.
        </p>
        {CHANNEL_LEVELS.map(l => (
          <div className="field" key={l.key}>
            <label>{l.label}</label>
            <select value={levels[l.key]} onChange={e => change(l.key, e.target.value)}>
              {sorted.map(r => <option key={r.id} value={r.id}>{roleAndAboveLabel(r)}</option>)}
            </select>
            <div className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>{HINTS[l.key]}</div>
          </div>
        ))}

        {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : channel ? 'Save channel' : 'Create channel'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {channel && canDelete && (
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={handleDelete}
              style={{ marginLeft: 'auto', color: '#e74c3c', borderColor: '#e74c3c' }}>
              🗑 Delete channel
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
