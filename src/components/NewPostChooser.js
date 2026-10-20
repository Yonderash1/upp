// Step 1 of creating a post: pick what kind of post to make.
const OPTIONS = [
  { key: 'event', icon: '📅', title: 'Event', desc: 'Plan something with a date, time and place' },
  { key: 'announcement', icon: '📢', title: 'Announcement', desc: 'Share news or updates with your members' },
  { key: 'media', icon: '🖼️', title: 'Media', desc: 'Photos and videos from group events', comingSoon: true }
]

export default function NewPostChooser({ onSelect }) {
  return (
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
  )
}
