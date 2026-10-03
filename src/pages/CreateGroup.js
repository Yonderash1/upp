import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LabelPicker from '../components/LabelPicker'

const JOIN_MODES = [
  { value: 'open', label: 'Open', desc: 'Anyone can join instantly' },
  { value: 'request', label: 'Request to join', desc: 'Users request, admins approve' },
  { value: 'invite', label: 'Invite only', desc: 'Admins add members manually' }
]

const TOTAL_STEPS = 2

function ProgressBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: i < step ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.3s'
        }} />
      ))}
    </div>
  )
}

export default function CreateGroup() {
  const [step, setStep] = useState(1)
  // Step 1 fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [joinMode, setJoinMode] = useState('open')
  const [membersVisible, setMembersVisible] = useState(true)
  const [step1Errors, setStep1Errors] = useState({})
  // Step 2 fields
  const [selectedLabels, setSelectedLabels] = useState([])
  const [labelError, setLabelError] = useState('')
  // Submit
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  function validateStep1() {
    const e = {}
    if (!name.trim()) e.name = 'Group name is required'
    if (name.trim().length > 60) e.name = 'Keep it under 60 characters'
    setStep1Errors(e)
    return Object.keys(e).length === 0
  }

  function goToStep2() {
    if (validateStep1()) setStep(2)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (selectedLabels.length < 1) {
      setLabelError('Please add at least one label')
      return
    }
    setLabelError('')
    setLoading(true)
    setError('')

    // Create the group — trigger auto-adds user as owner
    const { data: group, error: groupErr } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description.trim(),
        join_mode: joinMode,
        members_visible: membersVisible,
        created_by: user.id
      })
      .select()
      .single()

    if (groupErr) { setError(groupErr.message); setLoading(false); return }

    // Assign labels
    if (selectedLabels.length > 0) {
      await supabase.from('group_label_assignments').insert(
        selectedLabels.map(l => ({ group_id: group.id, label_id: l.id }))
      )
    }

    navigate(`/groups/${group.id}`)
  }

  return (
    <div className="page">
      <div className="create-page">
        <div className="auth-logo" style={{ fontSize: '1.8rem', marginBottom: 4 }}>Upp</div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 24 }}>Creating a new group</p>

        <ProgressBar step={step} />

        {error && <div className="error-msg">{error}</div>}

        {/* ── Step 1: Details & Settings ── */}
        {step === 1 && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Tell us about your group</h1>
            <p style={{ color: 'var(--muted)', marginBottom: 28, fontSize: 14 }}>
              Give it a name, a description, and set how people can join
            </p>

            <div className="field">
              <label>Group Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Bristol Badminton Society"
              />
              {step1Errors.name && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{step1Errors.name}</div>}
            </div>

            <div className="field">
              <label>Description (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this group about? Who is it for?"
                rows={3}
              />
            </div>

            <div className="field">
              <label>How can people join?</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {JOIN_MODES.map(mode => (
                  <div
                    key={mode.value}
                    onClick={() => setJoinMode(mode.value)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                      border: `1.5px solid ${joinMode === mode.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: joinMode === mode.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                    }}
                  >
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: joinMode === mode.value ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>
                      {mode.label}
                    </div>
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
                  <div
                    key={String(opt.value)}
                    onClick={() => setMembersVisible(opt.value)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                      border: `1.5px solid ${membersVisible === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                      background: membersVisible === opt.value ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                    }}
                  >
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: membersVisible === opt.value ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-primary" type="button" onClick={goToStep2} style={{ marginTop: 8 }}>
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Labels ── */}
        {step === 2 && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Label your group 🏷</h1>
            <p style={{ color: 'var(--muted)', marginBottom: 8, fontSize: 14 }}>
              Labels help people discover your group. Add between 1 and 5 — search existing ones or create your own.
            </p>

            <div style={{
              background: 'var(--bg3)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '12px 14px', marginBottom: 24, fontSize: 13
            }}>
              <strong style={{ color: 'var(--text)' }}>Tips for good labels:</strong>
              <ul style={{ color: 'var(--muted)', marginTop: 6, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Use activity labels to describe what you do <span style={{ color: 'var(--text)' }}>(e.g. Cycling, Gaming)</span></li>
                <li>Use identity labels to show who's welcome <span style={{ color: 'var(--text)' }}>(e.g. LGBTQ+, Autism-Friendly)</span></li>
                <li>Keep custom labels clean and descriptive</li>
              </ul>
            </div>

            <div className="field">
              <label>Labels</label>
              <LabelPicker
                selected={selectedLabels}
                onChange={setSelectedLabels}
                error={labelError}
              />
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Creating group...' : 'Create Group 🚀'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                  ← Back
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
