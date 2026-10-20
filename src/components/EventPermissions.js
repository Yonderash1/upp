import Modal from './Modal'
import { ROLE_OPTIONS } from '../lib/eventAccess'

// Dropdown: anyone / all members / specific roles (with checkboxes for the roles)
function AudienceSelect({ value, onChange }) {
  function handleMode(mode) {
    // Switching to roles starts with both ticked so it's never empty
    onChange({ mode, roles: mode === 'roles' ? (value.roles.length ? value.roles : ROLE_OPTIONS.map(r => r.key)) : [] })
  }
  function toggleRole(key) {
    const roles = value.roles.includes(key) ? value.roles.filter(r => r !== key) : [...value.roles, key]
    onChange({ mode: 'roles', roles })
  }
  return (
    <>
      <select value={value.mode} onChange={e => handleMode(e.target.value)}>
        <option value="public">Anyone — including people outside the group</option>
        <option value="members">Only group members</option>
        <option value="roles">Specific group roles…</option>
      </select>
      {value.mode === 'roles' && (
        <div className="role-checks">
          {ROLE_OPTIONS.map(r => (
            <label key={r.key}>
              <input type="checkbox" checked={value.roles.includes(r.key)} onChange={() => toggleRole(r.key)} />
              {r.label}
            </label>
          ))}
          {value.roles.length === 0 && <span className="field-hint" style={{ margin: 0 }}>Choose at least one role</span>}
        </div>
      )}
    </>
  )
}

// value = { maxMode: 'none'|'limit', maxAttendees: string, join: {mode, roles}, visibility: {mode, roles} }
export default function EventPermissions({ value, onChange, onClose }) {
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
        <AudienceSelect value={value.join} onChange={join => onChange({ join })} />
        <div className="field-hint" style={{ marginTop: 8 }}>Only these people can confirm they're going.</div>
      </div>

      <div className="field">
        <label>Who can see this event?</label>
        <AudienceSelect value={value.visibility} onChange={visibility => onChange({ visibility })} />
        <div className="field-hint" style={{ marginTop: 8 }}>
          People who can't see the event won't find it on the group page, and can't join it.
        </div>
      </div>

      <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
    </Modal>
  )
}
