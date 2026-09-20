import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const JOIN_MODES = [
  {
    value: 'open',
    label: 'Open',
    desc: 'Anyone can join instantly'
  },
  {
    value: 'request',
    label: 'Request to join',
    desc: 'Users request, admins approve'
  },
  {
    value: 'invite',
    label: 'Invite only',
    desc: 'Admins add members manually'
  }
]

export default function CreateGroup() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [joinMode, setJoinMode] = useState('open')
  const [membersVisible, setMembersVisible] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({
        name,
        description,
        join_mode: joinMode,
        members_visible: membersVisible,
        created_by: user.id
      })
      .select()
      .single()

    if (groupErr) {
      setError(groupErr.message)
      setLoading(false)
      return
    }

    // Make the creator the owner
    const { error: memberErr } = await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id, role: 'owner' })

    if (memberErr) {
      setError(memberErr.message)
      setLoading(false)
      return
    }

    navigate(`/groups/${group.id}`)
  }

  return (
    <div className="page">
      <div className="create-page">
        <h1>Create a Group</h1>
        <p className="subtitle">Build your community on Upp</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Group Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Bristol Badminton Society"
              required
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this group about?"
              rows={3}
            />
          </div>

          <div className="field">
            <label>How can people join?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {JOIN_MODES.map(mode => (
                <div
                  key={mode.value}
                  onClick={() => setJoinMode(mode.value)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1.5px solid ${joinMode === mode.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: joinMode === mode.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 700,
                    fontSize: 14,
                    color: joinMode === mode.value ? 'var(--accent)' : 'var(--text)',
                    marginBottom: 3
                  }}>
                    {mode.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{mode.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Member list visibility</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {[
                { value: true, label: 'Visible to all members', desc: 'Everyone in the group can see the full member list' },
                { value: false, label: 'Admins only', desc: 'Only owners and admins can see the full member list' }
              ].map(opt => (
                <div
                  key={String(opt.value)}
                  onClick={() => setMembersVisible(opt.value)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 10,
                    border: `1.5px solid ${membersVisible === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: membersVisible === opt.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 700,
                    fontSize: 14,
                    color: membersVisible === opt.value ? 'var(--accent)' : 'var(--text)',
                    marginBottom: 3
                  }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </div>
    </div>
  )
}
