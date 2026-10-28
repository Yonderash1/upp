import { VISIBILITY_LEVELS } from '../lib/privacy'

// Three-way switch: Public / Connections / Only me
export default function VisibilityPicker({ value, onChange, label }) {
  return (
    <div className="vis-picker" role="group" aria-label={label}>
      {VISIBILITY_LEVELS.map(l => (
        <button
          type="button" key={l.key}
          className={`vis-option ${value === l.key ? 'selected' : ''} ${l.key}`}
          aria-pressed={value === l.key}
          onClick={() => onChange(l.key)}
          title={l.short}
        >
          <span aria-hidden="true">{l.icon}</span> {l.label}
        </button>
      ))}
    </div>
  )
}
