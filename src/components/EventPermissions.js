import Modal from './Modal'
import { sortRoles } from '../lib/permissions'

// Dropdown: anyone / all members / "this role and everyone above it"
export function AudienceSelect({ value, onChange, roles }) {
  // The base "Member" role is the same as "all members", so it isn't offered here
  const choices = sortRoles(roles).filter(r => !r.is_default)

  function handleMode(mode) {
    if (mode !== 'role') { onChange({ mode, roleId: null }); return }
    // Start on the role just under the owner so it's never empty
    const start = choices.find(r => !r.is_owner) || choices[0]
    onChange({ mode, roleId: value.roleId || start?.id || null })
  }

  return (
    <>
      <select value={value.mode} onChange={e => handleMode(e.target.value)}>
        <option value="public">Anyone — including people outside the group</option>
        <option value="members">Only group members</option>
        <option value="role">A group role and everyone above it…</option>
      </select>
      {value.mode === 'role' && (
        <div style={{ marginTop: 10 }}>
          <select value={value.roleId || ''} onChange={e => onChange({ mode: 'role', roleId: e.target.value })}>
            {choices.map(r => (
              <option key={r.id} value={r.id}>
                {r.is_owner ? `${r.name} only` : `${r.name} & above`}
              </option>
            ))}
          </select>
          <div className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>
            Anyone with a higher role is included automatically.
          </div>
        </div>
      )}
    </>
  )
}

// value = { maxMode: 'none'|'limit', maxAttendees: string, join: {mode, roleId}, visibility: {mode, roleId} }
export default function EventPermissions({ value, onChange, onClose, roles = [] }) {
  return (
    <Modal title="Event permissions" onClose={onClose} width={560}>
      <div className="field">
        <label>Is there a maximum number of attendees?</label>
        <div className="option-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button type="button" className={`option-tile ${value.maxMode === 'none' ? 'selected' : ''}`}
            onClick={() => onChange({ maxMode: 'none' })}>
            <strong>No limit</strong>
          </button>
          <button type="button" className={`option-tile ${value.maxMode === 'limit' ? 'selected' : ''}`}
            onClick={() => onChange({ maxMode: 'limit' })}>
            <strong>Set a limit</strong>
          </button>
        </div>
        {value.maxMode === 'limit' && (
          <input
            type="number" min="1" max="100000" step="1" style={{ marginTop: 10 }}
            placeholder="Maximum number of attendees"
            value={value.maxAttendees} onChange={e => onChange({ maxAttendees: e.target.value })}
          />
        )}
        <div className="field-hint" style={{ marginTop: 8 }}>Once the event is full, nobody else can confirm they're going.</div>
      </div>

      <div className="field">
        <label>Who is this event open to?</label>
        <AudienceSelect value={value.join} onChange={join => onChange({ join })} roles={roles} />
        <div className="field-hint" style={{ marginTop: 8 }}>Only these people can confirm they're going.</div>
      </div>

      <div className="field">
        <label>Who can see this event?</label>
        <AudienceSelect value={value.visibility} onChange={visibility => onChange({ visibility })} roles={roles} />
        <div className="field-hint" style={{ marginTop: 8 }}>
          People who can't see the event won't find it on the group page, and can't join it.
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
    </Modal>
  )
}
