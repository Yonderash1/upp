// Views shown in the group's left-hand panel.
// For now there's only the main feed — add more entries here later
// (e.g. Events, Announcements, Media) to turn them into filters.
export const GROUP_VIEWS = [
  { key: 'feed', label: 'Feed', icon: '📰' }
]

export default function GroupNav({ active, onSelect }) {
  return (
    <nav>
      <h4 className="group-nav-title">Browse</h4>
      {GROUP_VIEWS.map(v => (
        <button
          key={v.key}
          className={`group-nav-item ${active === v.key ? 'active' : ''}`}
          onClick={() => onSelect(v.key)}
        >
          <span>{v.icon}</span> {v.label}
        </button>
      ))}
    </nav>
  )
}
