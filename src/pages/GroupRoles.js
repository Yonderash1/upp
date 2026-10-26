import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  MAX_ROLES, PERMISSION_GROUPS, ROLE_COLORS, DEFAULT_ROLE_COLOR,
  sortRoles, hasPerm, canEditRole
} from '../lib/permissions'

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x))

// Role editor: the hierarchy list on the left, the selected role's editor on the right.
export default function GroupRoles() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [roles, setRoles] = useState([])
  const [counts, setCounts] = useState({})
  const [me, setMe] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)       // { name, color, permissions } being edited
  const [tab, setTab] = useState('display')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(selectId) {
    const [groupRes, rolesRes, myRes, membersRes] = await Promise.all([
      supabase.from('groups').select('id, name').eq('id', id).single(),
      supabase.from('group_roles').select('*').eq('group_id', id).order('rank', { ascending: true }),
      supabase.from('group_members').select('group_roles(*)').eq('group_id', id).eq('user_id', user.id).maybeSingle(),
      supabase.from('group_members').select('role_id').eq('group_id', id)
    ])
    const myRole = myRes.data?.group_roles
    if (!groupRes.data || !hasPerm(myRole, 'manage_roles')) { navigate(`/groups/${id}`); return }

    const list = sortRoles(rolesRes.data)
    const countMap = {}
    ;(membersRes.data || []).forEach(m => { countMap[m.role_id] = (countMap[m.role_id] || 0) + 1 })

    setGroup(groupRes.data)
    setRoles(list)
    setCounts(countMap)
    setMe(myRole)
    const pick = list.find(r => r.id === (selectId || selectedId)) || list.find(r => !r.is_owner) || list[0]
    select(pick, true)
    setLoading(false)
  }

  function select(role, force) {
    if (!force && dirty && !window.confirm('Discard your unsaved changes to this role?')) return
    setSelectedId(role.id)
    setDraft({ name: role.name, color: role.color, permissions: [...role.permissions] })
    setError('')
  }

  const role = roles.find(r => r.id === selectedId)
  const editable = !!role && canEditRole(me, role)
  const dirty = !!role && !!draft && (
    draft.name !== role.name || draft.color.toLowerCase() !== role.color.toLowerCase() ||
    !sameSet(draft.permissions, role.permissions)
  )

  const defaultRole = roles.find(r => r.is_default)

  // Wraps the database functions: shows their error message if they refuse
  async function run(fn, args, selectId) {
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc(fn, args)
    setBusy(false)
    if (err) { setError(err.message); return null }
    await load(selectId)
    return data ?? true
  }

  async function createRole() {
    if (dirty && !window.confirm('Discard your unsaved changes to this role?')) return
    setBusy(true); setError('')
    const { data, error: err } = await supabase.rpc('create_group_role', {
      p_group: id, p_name: 'New role', p_color: DEFAULT_ROLE_COLOR, p_permissions: []
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    await load(data)
    setTab('display')
  }

  async function saveRole() {
    if (!draft.name.trim()) { setError('Please give the role a name'); return }
    const ok = await run('update_group_role', {
      p_role: role.id, p_name: draft.name.trim(), p_color: draft.color, p_permissions: draft.permissions
    }, role.id)
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  async function deleteRole() {
    const n = counts[role.id] || 0
    const msg = n > 0
      ? `Delete "${role.name}"? Its ${n} member${n === 1 ? '' : 's'} will become "${defaultRole.name}". Anything restricted to this role moves up to the role above it.`
      : `Delete "${role.name}"? Anything restricted to this role moves up to the role above it.`
    if (!window.confirm(msg)) return
    await run('delete_group_role', { p_role: role.id }, null)
  }

  // Swap with the neighbour above (-1) or below (+1)
  async function move(index, dir) {
    if (dirty && !window.confirm('Discard your unsaved changes to this role?')) return
    const order = roles.map(r => r.id)
    const j = index + dir
    ;[order[index], order[j]] = [order[j], order[index]]
    await run('reorder_group_roles', { p_group: id, p_order: order }, roles[index].id)
  }

  function canMove(index, dir) {
    const r = roles[index]
    const other = roles[index + dir]
    if (!r || !other || r.is_owner || r.is_default || other.is_owner || other.is_default) return false
    return me.is_owner || (me.rank < r.rank && me.rank < other.rank)
  }

  function togglePermission(key) {
    setDraft(d => ({
      ...d,
      permissions: d.permissions.includes(key) ? d.permissions.filter(k => k !== key) : [...d.permissions, key]
    }))
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const atLimit = roles.length >= MAX_ROLES
  const canCreate = hasPerm(me, 'manage_roles') && (me.is_owner || me.rank < defaultRole.rank)

  return (
    <div className="page">
      <div className="roles-page">
        <button className="btn btn-ghost" style={{ marginBottom: 20, padding: '7px 14px', fontSize: 13 }}
          onClick={() => navigate(`/groups/${id}`)}>
          ← Back to group
        </button>
        <h1>Roles</h1>
        <p className="subtitle">{group.name}</p>

        {error && <div className="error-msg">{error}</div>}

        <div className="roles-layout">
          {/* ── Hierarchy ── */}
          <aside className="roles-card">
            <div className="roles-card-head">
              <h3>Role hierarchy</h3>
              <span className={`roles-count ${atLimit ? 'full' : ''}`}>{roles.length} / {MAX_ROLES}</span>
            </div>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Top to bottom. A role can only kick, edit or give out roles that sit <strong>below</strong> it — never an equal or higher one.
            </p>

            <div className="role-table">
              {roles.map((r, i) => (
                <div
                  key={r.id}
                  className={`role-row ${r.id === selectedId ? 'selected' : ''}`}
                  onClick={() => select(r)}
                >
                  <span className="role-rank">{i + 1}</span>
                  <span className="role-dot" style={{ background: r.color }} />
                  <span className="role-row-name" style={{ color: r.color }}>{r.name}</span>
                  <span className="role-row-meta">
                    {r.is_owner && <em>Owner</em>}
                    {r.is_default && <em>Base</em>}
                    <span title="Members with this role">👥 {counts[r.id] || 0}</span>
                  </span>
                  <span className="role-move" onClick={e => e.stopPropagation()}>
                    <button disabled={busy || !canMove(i, -1)} onClick={() => move(i, -1)} title="Move up" aria-label={`Move ${r.name} up`}>▲</button>
                    <button disabled={busy || !canMove(i, 1)} onClick={() => move(i, 1)} title="Move down" aria-label={`Move ${r.name} down`}>▼</button>
                  </span>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" style={{ marginTop: 14 }}
              disabled={busy || atLimit || !canCreate} onClick={createRole}>
              {atLimit ? `Role limit reached (${MAX_ROLES})` : '＋ Create role'}
            </button>
          </aside>

          {/* ── Editor ── */}
          <section className="roles-card">
            {role && draft && (
              <>
                <div className="roles-card-head">
                  <h3 style={{ color: draft.color }}>Edit role — {draft.name || '…'}</h3>
                </div>

                {!editable && (
                  <div className="role-notice">
                    🔒 {role.is_owner
                      ? 'Only the group owner can edit the Owner role.'
                      : 'This role is at or above yours, so you can’t edit it.'}
                  </div>
                )}

                <div className="role-tabs">
                  <button className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Display</button>
                  <button className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}>Permissions</button>
                </div>

                {tab === 'display' && (
                  <>
                    <div className="field">
                      <label>Role name</label>
                      <input value={draft.name} maxLength={32} disabled={!editable}
                        onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                    </div>

                    <div className="field">
                      <label>Role colour</label>
                      <div className="color-swatches">
                        {ROLE_COLORS.map(c => (
                          <button key={c} type="button" disabled={!editable}
                            className={`color-swatch ${draft.color.toLowerCase() === c ? 'selected' : ''}`}
                            style={{ background: c }} aria-label={`Colour ${c}`}
                            onClick={() => setDraft(d => ({ ...d, color: c }))} />
                        ))}
                        <input type="color" className="color-custom" value={draft.color} disabled={!editable}
                          title="Pick any colour" onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} />
                      </div>
                    </div>

                    <div className="field">
                      <label>Preview</label>
                      <div className="role-preview">
                        <h4 style={{ color: draft.color, borderBottom: `2px solid ${draft.color}55` }}>
                          {role.is_owner ? '👑 ' : ''}{draft.name || 'Role name'} — {counts[role.id] || 0}
                        </h4>
                        <div className="member-row" style={{ margin: 0 }}>
                          <div className="member-info" style={{ cursor: 'default' }}>
                            <div className="avatar-sm member-avatar">U</div>
                            <span className="member-name" style={{ color: draft.color }}>@username</span>
                          </div>
                        </div>
                      </div>
                      <div className="field-hint" style={{ marginTop: 8 }}>
                        This is how the role appears in the members list: a coloured title and line, with names in the same colour.
                      </div>
                    </div>
                  </>
                )}

                {tab === 'permissions' && (
                  <>
                    {role.is_owner && (
                      <div className="role-notice">👑 The Owner always has every permission. This can’t be changed.</div>
                    )}
                    {!role.is_owner && !me.is_owner && editable && (
                      <div className="field-hint" style={{ marginTop: 0 }}>
                        You can only switch on or off permissions that you have yourself.
                      </div>
                    )}
                    {PERMISSION_GROUPS.map(g => (
                      <div key={g.title} className="perm-group">
                        <h4>{g.title}</h4>
                        {g.items.map(p => {
                          const on = role.is_owner || draft.permissions.includes(p.key)
                          const locked = role.is_owner || !editable || (!me.is_owner && !hasPerm(me, p.key))
                          return (
                            <label key={p.key} className={`perm-row ${locked ? 'locked' : ''}`}>
                              <span className="perm-text">
                                <strong>{p.label}</strong>
                                <span>{p.desc}</span>
                              </span>
                              <input type="checkbox" className="switch" checked={on} disabled={locked}
                                onChange={() => togglePermission(p.key)} />
                            </label>
                          )
                        })}
                      </div>
                    ))}
                  </>
                )}

                <div className="role-actions">
                  <button className="btn btn-primary" style={{ width: 'auto' }}
                    disabled={!editable || !dirty || busy} onClick={saveRole}>
                    {busy ? 'Saving...' : 'Save changes'}
                  </button>
                  <button className="btn btn-ghost" disabled={!dirty || busy} onClick={() => select(role, true)}>Reset</button>
                  {saved && <span style={{ color: 'var(--success)', fontSize: 14 }}>✓ Saved</span>}
                  {editable && !role.is_owner && !role.is_default && (
                    <button className="btn btn-ghost" disabled={busy} onClick={deleteRole}
                      style={{ marginLeft: 'auto', color: '#e74c3c', borderColor: '#e74c3c' }}>
                      🗑 Delete role
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
