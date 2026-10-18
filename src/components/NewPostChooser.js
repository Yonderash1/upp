// Step 1 of creating a post: pick what kind of post to make.
const OPTIONS = [
  { key: 'event', icon: '📅', title: 'Event', desc: 'Plan something with a date, time and place' },
  { key: 'announcement', icon: '📢', title: 'Announcement', desc: 'Share news or updates with your members' },
  { key: 'media', icon: '🖼️', title: 'Media', desc: 'Photos and videos from group events', comingSoon: true }
]

export default function NewPostChooser({ onSelect, onCancel }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.1rem' }}>What would you like to post?</h3>
        <button onClick={onCancel} aria-label="Cancel"
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      <div className="post-type-grid">
        {OPTIONS.map(o => (
          <button
            key={o.key}
            type="button"
            className="post-type-tile"
            disabled={o.comingSoon}
            onClick={() => onSelect(o.key)}
          >
            <span className="post-type-icon">{o.icon}</span>
            <span className="post-type-title">
              {o.title}
              {o.comingSoon && <em>Coming soon</em>}
            </span>
            <span className="post-type-desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
