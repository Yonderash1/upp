import { MAX_CHANNELS } from '../lib/permissions'

// Views shown in the group's left-hand panel: the main feed, then the group's chat channels.
export const GROUP_VIEWS = [
  { key: 'feed', label: 'Feed', icon: '📰' }
]

export default function GroupNav({ active, onSelect, channels = [], canCreateChannel, canEditChannel, onCreateChannel, onEditChannel }) {
  const full = channels.length >= MAX_CHANNELS
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

      {(channels.length > 0 || canCreateChannel) && (
        <>
          <div className="group-nav-heading">
            <h4 className="group-nav-title" style={{ margin: 0 }}>Channels {channels.length}/{MAX_CHANNELS}</h4>
            {canCreateChannel && (
              <button
                className="group-nav-add"
                onClick={onCreateChannel}
                disabled={full}
                title={full ? `A group can have ${MAX_CHANNELS} channels` : 'Create a channel'}
                aria-label="Create a channel"
              >＋</button>
            )}
          </div>
          {channels.map(c => (
            <div key={c.id} className="group-nav-channel">
              <button
                className={`group-nav-item ${active === c.id ? 'active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                <span style={{ opacity: 0.6 }}>#</span> <span className="group-nav-name">{c.name}</span>
              </button>
              {canEditChannel && (
                <button className="group-nav-gear" onClick={() => onEditChannel(c)} title="Channel settings" aria-label={`Settings for ${c.name}`}>⚙</button>
              )}
            </div>
          ))}
        </>
      )}
    </nav>
  )
}
