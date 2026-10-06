import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export default function LabelPicker({ selected, onChange, error, min = 1, max = 5, placeholder = 'Search or create a label...' }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [blacklist, setBlacklist] = useState([])
  const [customError, setCustomError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    supabase.from('label_blacklist').select('term')
      .then(({ data }) => setBlacklist((data || []).map(b => b.term.toLowerCase())))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchLabels(query), 250)
    return () => clearTimeout(t)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  async function searchLabels(q) {
    setCustomError('')
    if (!q.trim()) { setSuggestions([]); return }
    setSearching(true)

    const { data: labels } = await supabase
      .from('group_labels')
      .select('id, name')
      .ilike('name', `%${q}%`)
      .order('name')
      .limit(10)

    if (!labels) { setSuggestions([]); setSearching(false); return }

    // Count how many groups AND profiles use each label
    const [{ data: groupCounts }, { data: profileCounts }] = await Promise.all([
      supabase.from('group_label_assignments').select('label_id'),
      supabase.from('profile_label_assignments').select('label_id')
    ])

    const countMap = {}
    ;[...(groupCounts || []), ...(profileCounts || [])].forEach(c => {
      countMap[c.label_id] = (countMap[c.label_id] || 0) + 1
    })

    setSuggestions(labels.map(l => ({
      ...l,
      count: countMap[l.id] || 0,
      alreadySelected: selected.some(s => s.id === l.id)
    })))
    setSearching(false)
  }

  function isBlacklisted(term) {
    const lower = term.toLowerCase()
    return blacklist.some(b => lower.includes(b))
  }

  function addLabel(label) {
    if (selected.length >= max) return
    if (selected.some(s => s.id === label.id)) return
    onChange([...selected, label])
    setQuery('')
    setSuggestions([])
    inputRef.current?.focus()
  }

  async function addCustomLabel() {
    const name = query.trim()
    if (!name) return
    setCustomError('')

    if (name.length < 2) { setCustomError('Label must be at least 2 characters'); return }
    if (name.length > 40) { setCustomError('Label must be 40 characters or less'); return }
    if (isBlacklisted(name)) { setCustomError('This label is not permitted'); return }
    if (selected.length >= max) { setCustomError(`Maximum ${max} labels allowed`); return }
    if (selected.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setCustomError('You already added this label'); return
    }

    const { data: existing } = await supabase
      .from('group_labels')
      .select('id, name')
      .ilike('name', name)
      .maybeSingle()

    if (existing) { addLabel({ ...existing, count: 0 }); return }

    const { data: newLabel, error: createErr } = await supabase
      .from('group_labels')
      .insert({ name })
      .select()
      .single()

    if (createErr) { setCustomError('Could not create label: ' + createErr.message); return }
    addLabel({ ...newLabel, count: 0 })
  }

  function removeLabel(id) {
    onChange(selected.filter(s => s.id !== id))
  }

  const exactMatch = suggestions.some(s => s.name.toLowerCase() === query.trim().toLowerCase())
  const showAddCustom = query.trim().length >= 2 && !exactMatch && !searching

  return (
    <div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {selected.map(label => (
            <div key={label.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              background: 'rgba(255,92,53,0.12)',
              border: '1.5px solid rgba(255,92,53,0.4)',
              fontSize: 13, fontWeight: 600, color: 'var(--accent)'
            }}>
              {label.name}
              <button onClick={() => removeLabel(label.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', fontSize: 16, lineHeight: 1,
                padding: '0 0 1px', display: 'flex', alignItems: 'center'
              }}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Counter */}
      <div style={{ fontSize: 12, marginBottom: 8, color: selected.length >= max ? 'var(--accent)' : 'var(--muted)' }}>
        {selected.length}/{max} selected
        {selected.length < min && ` (at least ${min} required)`}
      </div>

      {/* Input */}
      {selected.length < max && (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (suggestions.length > 0 && !suggestions[0].alreadySelected) addLabel(suggestions[0])
                  else if (showAddCustom) addCustomLabel()
                }
              }}
              placeholder={placeholder}
              style={{ flex: 1 }}
            />
            {showAddCustom && (
              <button
                type="button"
                onClick={addCustomLabel}
                className="btn btn-ghost"
                style={{ padding: '10px 14px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                + Add "{query.trim()}"
              </button>
            )}
          </div>

          {customError && (
            <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 6 }}>{customError}</div>
          )}

          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: 'var(--card)', border: '1.5px solid var(--border)',
              borderRadius: 10, overflow: 'hidden', marginTop: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}>
              {suggestions.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => !s.alreadySelected && addLabel(s)}
                  style={{
                    padding: '10px 14px', cursor: s.alreadySelected ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: s.alreadySelected ? 0.45 : 1, transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => { if (!s.alreadySelected) e.currentTarget.style.background = 'var(--bg3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.count > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg3)', borderRadius: 20, padding: '2px 8px', fontWeight: 500 }}>
                        {s.count} {s.count === 1 ? 'use' : 'uses'}
                      </span>
                    )}
                    {s.alreadySelected && (
                      <span style={{ fontSize: 11, color: 'var(--accent)' }}>✓ Added</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div style={{ color: '#e74c3c', fontSize: 12, marginTop: 8 }}>{error}</div>}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
        Search existing labels or type your own and click "+ Add"
      </div>
    </div>
  )
}
