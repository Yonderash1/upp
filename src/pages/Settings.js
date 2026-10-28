import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLocationPrefs } from '../contexts/LocationContext'
import VisibilityPicker from '../components/VisibilityPicker'
import {
  ABOUT_FIELDS, PROFILE_SECTIONS, MESSAGE_AUDIENCES, MESSAGE_CHOICES,
  visibilityFromRow, messageSettingsFromRow, settingsToRow,
} from '../lib/privacy'

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refreshPrefs } = useLocationPrefs()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // What's saved in the database, and what's on screen right now
  const [original, setOriginal] = useState(null)
  const [unit, setUnit] = useState('km')
  const [visibility, setVisibility] = useState(visibilityFromRow(null))
  const [messaging, setMessaging] = useState(messageSettingsFromRow(null))

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('profiles').select('distance_unit').eq('id', user.id).maybeSingle(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([profileRes, settingsRes]) => {
      if (cancelled) return
      if (settingsRes.error) setError('Could not load your settings: ' + settingsRes.error.message)
      const u = profileRes.data?.distance_unit === 'mi' ? 'mi' : 'km'
      const v = visibilityFromRow(settingsRes.data)
      const m = messageSettingsFromRow(settingsRes.data)
      setUnit(u); setVisibility(v); setMessaging(m)
      setOriginal({ unit: u, visibility: v, messaging: m })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [user.id])

  const dirty = useMemo(() => {
    if (!original) return false
    return unit !== original.unit
      || JSON.stringify(visibility) !== JSON.stringify(original.visibility)
      || JSON.stringify(messaging) !== JSON.stringify(original.messaging)
  }, [original, unit, visibility, messaging])

  function change(setter) {
    return (key, value) => { setSaved(false); setter(s => ({ ...s, [key]: value })) }
  }
  const setVis = change(setVisibility)
  const setMsg = change(setMessaging)

  async function save() {
    setSaving(true); setError(''); setSaved(false)

    const { error: settingsErr } = await supabase
      .from('user_settings')
      .upsert(settingsToRow(user.id, visibility, messaging), { onConflict: 'user_id' })
    if (settingsErr) { setError('Could not save: ' + settingsErr.message); setSaving(false); return }

    if (unit !== original.unit) {
      const { error: unitErr } = await supabase.from('profiles').update({ distance_unit: unit }).eq('id', user.id)
      if (unitErr) { setError('Could not save your distance units: ' + unitErr.message); setSaving(false); return }
      refreshPrefs()
    }

    setOriginal({ unit, visibility, messaging })
    setSaved(true)
    setSaving(false)
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="profile-page settings-page">
        <button className="link-btn settings-back" onClick={() => navigate(`/profile/${user.id}`)}>‹ Back to profile</button>
        <h2 style={{ margin: '4px 0 20px' }}>Settings</h2>

        {error && <div className="error-msg">{error}</div>}

        {/* ── Preferences ── */}
        <section className="settings-section">
          <h3 className="section-title">Preferences</h3>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Distance units</label>
            <div className="option-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
              {[{ key: 'km', title: 'Kilometres' }, { key: 'mi', title: 'Miles' }].map(u => (
                <button type="button" key={u.key}
                  className={`option-tile ${unit === u.key ? 'selected' : ''}`}
                  aria-pressed={unit === u.key}
                  onClick={() => { setSaved(false); setUnit(u.key) }}>
                  <strong>{u.title}</strong>
                </button>
              ))}
            </div>
            <div className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>Used for how far away events are.</div>
          </div>
        </section>

        {/* ── Privacy ── */}
        <section className="settings-section">
          <h3 className="section-title">Security &amp; privacy</h3>
          <p className="settings-intro">
            Choose who can see each part of your profile. Everything starts as <strong>Only me</strong> until you change it.
          </p>

          <h4 className="settings-subtitle">About</h4>
          {ABOUT_FIELDS.map(f => (
            <div className="settings-row" key={f.key}>
              <div className="settings-row-text"><strong>{f.label}</strong></div>
              <VisibilityPicker label={f.label} value={visibility[f.key]} onChange={v => setVis(f.key, v)} />
            </div>
          ))}

          <h4 className="settings-subtitle">Profile tabs</h4>
          {PROFILE_SECTIONS.map(f => (
            <div className="settings-row" key={f.key}>
              <div className="settings-row-text"><strong>{f.label}</strong><span>{f.desc}</span></div>
              <VisibilityPicker label={f.label} value={visibility[f.key]} onChange={v => setVis(f.key, v)} />
            </div>
          ))}
        </section>

        {/* ── Messaging ── */}
        <section className="settings-section">
          <h3 className="section-title">Messages</h3>
          <p className="settings-intro">
            If someone hasn’t messaged you before and you choose <strong>Must send a request first</strong>, their message stays hidden
            until you accept it from your notifications.
          </p>
          {MESSAGE_AUDIENCES.map(a => (
            <div className="settings-row" key={a.key}>
              <div className="settings-row-text"><strong>{a.label}</strong><span>{a.desc}</span></div>
              <select
                className="settings-select"
                aria-label={a.label}
                value={messaging[a.key]}
                onChange={e => setMsg(a.key, e.target.value)}
              >
                {a.options.map(o => <option key={o} value={o}>{MESSAGE_CHOICES[o]}</option>)}
              </select>
            </div>
          ))}
          <div className="field-hint" style={{ margin: '12px 0 0' }}>
            If someone fits more than one group (say, a connection who is also in your group), the most open setting applies.
            Group members only count here if their group role has the “Message members” permission.
          </div>
        </section>

        {/* ── Blocked ── */}
        <section className="settings-section">
          <h3 className="section-title">Blocked users</h3>
          <div className="settings-row">
            <div className="settings-row-text"><span>See and unblock people you’ve blocked.</span></div>
            <button className="btn btn-ghost" style={{ fontSize: 13 }}
              onClick={() => navigate(`/profile/${user.id}`, { state: { tab: 'Blocked' } })}>
              Manage blocked users
            </button>
          </div>
        </section>

        <div className="settings-savebar">
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {dirty && !saving && <span className="settings-unsaved">You have unsaved changes</span>}
          {saved && !dirty && <span style={{ color: 'var(--success)', fontSize: 14 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
