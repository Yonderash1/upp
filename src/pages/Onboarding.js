import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AvatarCropper from '../components/AvatarCropper'

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say']
const TOTAL_STEPS = 4

function ProgressBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 36 }}>
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

// ── Step 1: Personal details ─────────────────────────────────
function StepPersonal({ data, onChange, onNext }) {
  const [errors, setErrors] = useState({})

  function validate() {
    const e = {}
    if (!data.first_name?.trim()) e.first_name = 'Required'
    if (!data.last_name?.trim()) e.last_name = 'Required'
    if (!data.age || data.age < 13 || data.age > 120) e.age = 'Enter a valid age'
    if (!data.gender) e.gender = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  return (
    <div style={{ animation: 'fadeUp 0.35s ease' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>First, let's get a few things straight 👋</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Tell us a little about yourself</p>

      <div className="form-grid">
        <div className="field">
          <label>First Name</label>
          <input value={data.first_name || ''} onChange={e => onChange('first_name', e.target.value)} placeholder="Your first name" />
          {errors.first_name && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{errors.first_name}</div>}
        </div>
        <div className="field">
          <label>Last Name</label>
          <input value={data.last_name || ''} onChange={e => onChange('last_name', e.target.value)} placeholder="Your last name" />
          {errors.last_name && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{errors.last_name}</div>}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label>Age</label>
          <input type="number" min="13" max="120" value={data.age || ''} onChange={e => onChange('age', e.target.value)} placeholder="Your age" />
          {errors.age && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{errors.age}</div>}
        </div>
        <div className="field">
          <label>Gender</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {GENDERS.map(g => (
              <div key={g} onClick={() => onChange('gender', g)} style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                border: `1.5px solid ${data.gender === g ? 'var(--accent)' : 'var(--border)'}`,
                background: data.gender === g ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                color: data.gender === g ? 'var(--accent)' : 'var(--text)',
                fontWeight: data.gender === g ? 600 : 400, fontSize: 14
              }}>
                {g}
              </div>
            ))}
          </div>
          {errors.gender && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{errors.gender}</div>}
        </div>
      </div>

      <button className="btn btn-primary" onClick={() => validate() && onNext()} style={{ marginTop: 8 }}>
        Continue →
      </button>
    </div>
  )
}

// ── Step 2: Profile photo ─────────────────────────────────────
function StepPhoto({ userId, onNext, onSkip }) {
  const [cropSrc, setCropSrc] = useState(null)
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCropSrc(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCropSave(blob) {
    setUploading(true)
    setCropSrc(null)
    const path = `${userId}/avatar.jpg`
    const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (error) { alert('Upload failed: ' + error.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    setPreview(url)
    setUploading(false)
  }

  return (
    <div style={{ animation: 'fadeUp 0.35s ease', textAlign: 'center' }}>
      {cropSrc && <AvatarCropper imageSrc={cropSrc} onSave={handleCropSave} onCancel={() => setCropSrc(null)} />}

      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>Pose for the camera 📸</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 36 }}>Add a profile picture — be as creative or generic as you like</p>

      {/* Avatar preview */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <div
          onClick={() => !uploading && fileRef.current?.click()}
          style={{
            width: 140, height: 140, borderRadius: '50%',
            border: `3px dashed ${preview ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--bg3)', cursor: uploading ? 'default' : 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, overflow: 'hidden', transition: 'border-color 0.2s',
            position: 'relative'
          }}
        >
          {uploading ? (
            <div className="spinner" />
          ) : preview ? (
            <img src={preview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Upload photo</span>
            </>
          )}
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280, margin: '0 auto' }}>
        {preview ? (
          <>
            <button className="btn btn-primary" onClick={onNext}>Looks great, continue →</button>
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>Change photo</button>
          </>
        ) : (
          <>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Choose a photo</button>
            <button className="btn btn-ghost" onClick={onSkip} style={{ color: 'var(--muted)' }}>
              I'm feeling camera shy, skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Step 3: Interests ─────────────────────────────────────────
function StepInterests({ selected, onToggle, onNext }) {
  const [interests, setInterests] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('interests').select('*').order('name')
      .then(({ data }) => setInterests(data || []))
  }, [])

  function handleNext() {
    if (selected.length < 3) { setError('Please select at least 3 interests'); return }
    setError('')
    onNext()
  }

  return (
    <div style={{ animation: 'fadeUp 0.35s ease' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>What are you into? 🎯</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 8 }}>Select at least three interests</p>
      {error && <div style={{ color: '#e74c3c', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 28 }}>
        {interests.map(interest => {
          const isSelected = selected.includes(interest.id)
          return (
            <div
              key={interest.id}
              onClick={() => onToggle(interest.id)}
              style={{
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s',
                border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                background: isSelected ? 'rgba(255,92,53,0.08)' : 'var(--bg3)',
                display: 'flex', alignItems: 'center', gap: 10
              }}
            >
              <span style={{ fontSize: 24 }}>{interest.emoji}</span>
              <span style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--accent)' : 'var(--text)', fontSize: 14 }}>
                {interest.name}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        {selected.length} selected {selected.length < 3 ? `(${3 - selected.length} more to go)` : '✓'}
      </div>

      <button className="btn btn-primary" onClick={handleNext}>Continue →</button>
    </div>
  )
}

// ── Step 4: Location ──────────────────────────────────────────
function StepLocation({ data, onChange, onFinish, saving }) {
  const [query, setQuery] = useState(data.city || '')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  async function searchPlaces(q) {
    if (!q.trim() || q.length < 2) { setSuggestions([]); return }
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&featuretype=city,town,village`
      )
      const results = await res.json()
      setSuggestions(results.map(r => ({
        display: r.display_name,
        short: r.name + (r.address?.country ? `, ${r.address.country}` : ''),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon)
      })))
    } catch {
      setSuggestions([])
    }
    setSearching(false)
  }

  useEffect(() => {
    const t = setTimeout(() => searchPlaces(query), 400)
    return () => clearTimeout(t)
  }, [query])

  function selectPlace(place) {
    setQuery(place.short)
    setSuggestions([])
    onChange('city', place.short)
    onChange('city_lat', place.lat)
    onChange('city_lng', place.lng)
  }

  function handleFinish() {
    if (!data.city || !data.city_lat) { setError('Please select a location from the list'); return }
    setError('')
    onFinish()
  }

  return (
    <div style={{ animation: 'fadeUp 0.35s ease' }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>Where do you call home? 🏡</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 32 }}>
        This helps us show you events near you. Start typing your town or city.
      </p>

      <div className="field" style={{ position: 'relative' }}>
        <label>Your home town or city</label>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange('city', null); onChange('city_lat', null) }}
          placeholder="e.g. Bristol, Manchester, New York..."
        />
        {searching && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Searching...</div>}

        {suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--card)', border: '1.5px solid var(--border)',
            borderRadius: 10, overflow: 'hidden', marginTop: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
          }}>
            {suggestions.map((s, i) => (
              <div key={i} onClick={() => selectPlace(s)} style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 14, transition: 'background 0.15s'
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600 }}>{s.short}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{s.display}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.city && data.city_lat && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--success)' }}>
          ✓ {data.city}
        </div>
      )}

      {error && <div style={{ color: '#e74c3c', fontSize: 13, marginTop: 12 }}>{error}</div>}

      <button className="btn btn-primary" onClick={handleFinish} disabled={saving} style={{ marginTop: 24 }}>
        {saving ? 'Setting up your profile...' : "Let's go! 🚀"}
      </button>
    </div>
  )
}

// ── Main Onboarding ───────────────────────────────────────────
export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [personalData, setPersonalData] = useState({})
  const [selectedInterests, setSelectedInterests] = useState([])
  const [locationData, setLocationData] = useState({})
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  function updatePersonal(key, val) { setPersonalData(d => ({ ...d, [key]: val })) }
  function updateLocation(key, val) { setLocationData(d => ({ ...d, [key]: val })) }

  function toggleInterest(id) {
    setSelectedInterests(s => s.includes(id) ? s.filter(i => i !== id) : [...s, id])
  }

  async function finish() {
    setSaving(true)
    // Save personal + location data
    await supabase.from('profiles').update({
      first_name: personalData.first_name?.trim(),
      last_name: personalData.last_name?.trim(),
      age: parseInt(personalData.age),
      gender: personalData.gender,
      city: locationData.city,
      city_lat: locationData.city_lat,
      city_lng: locationData.city_lng,
      onboarding_complete: true
    }).eq('id', user.id)

    // Save interests — remove old ones first then insert
    await supabase.from('profile_interests').delete().eq('user_id', user.id)
    if (selectedInterests.length > 0) {
      await supabase.from('profile_interests').insert(
        selectedInterests.map(id => ({ user_id: user.id, interest_id: id }))
      )
    }

    navigate('/')
  }

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: 48 }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 12 }}>
          <span className="auth-logo">Upp</span>
          <span style={{ color: 'var(--muted)', fontSize: 13, marginLeft: 12 }}>Setting up your profile</span>
        </div>

        <ProgressBar step={step} />

        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: '40px 36px' }}>
          {step === 1 && (
            <StepPersonal data={personalData} onChange={updatePersonal} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepPhoto userId={user.id} onNext={() => setStep(3)} onSkip={() => setStep(3)} />
          )}
          {step === 3 && (
            <StepInterests selected={selectedInterests} onToggle={toggleInterest} onNext={() => setStep(4)} />
          )}
          {step === 4 && (
            <StepLocation data={locationData} onChange={updateLocation} onFinish={finish} saving={saving} />
          )}
        </div>

        {step > 1 && (
          <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}
            style={{ marginTop: 16, fontSize: 13 }}>
            ← Back
          </button>
        )}
      </div>
    </div>
  )
}
