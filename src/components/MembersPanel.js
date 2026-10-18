import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidePanel from './SidePanel'

// Ranks shown top to bottom. Add new ranks here later.
const RANKS = [
  { key: 'owner', label: 'Owner' },
  { key: 'admin', label: 'Admins' },
  { key: 'member', label: 'Members' }
]

// 'creator' (older role name) is displayed as owner
const rankOf = m => (m.role === 'creator' ? 'owner' : m.role)

export default function MembersPanel({
  members, memberCount, canSeeMembers, isOwner, currentUserId,
  onChangeRole, onRemove, open, onToggle
}) {
  const navigate = useNavigate()
  const [hoverId, setHoverId] = useState(null)

  return (
    <SidePanel side="right" open={open} onToggle={onToggle} label="members">

        <h3 className="members-title">
          Members <span>{canSeeMembers ? members.length : memberCount}</span>
        </h3>

        {!canSeeMembers && (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Member list is only visible to admins</p>
        )}

        {canSeeMembers && RANKS.map(({ key, label }) => {
          const list = members.filter(m => rankOf(m) === key)
          if (list.length === 0) return null
          return (
            <section key={key} className="members-rank">
              <h4>{label} — {list.length}</h4>
              {list.map(m => {
                const canManage = isOwner && m.user_id !== currentUserId && key !== 'owner'
                const username = m.profiles?.username || '?'
                return (
                  <div
                    key={m.user_id}
                    className="member-row"
                    onMouseEnter={() => setHoverId(m.user_id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <div className="member-info" onClick={() => navigate(`/profile/${m.profiles?.id}`)}>
                      {m.profiles?.avatar_url
                        ? <img src={m.profiles.avatar_url} alt="" className="member-avatar" />
                        : <div className="avatar-sm member-avatar">{username[0].toUpperCase()}</div>}
                      <span className="member-name">@{username}</span>
                    </div>

                    {canManage && (
                      <div className="member-actions" style={{ opacity: hoverId === m.user_id ? 1 : undefined }}>
                        {key === 'member' && (
                          <button title="Make admin" onClick={() => onChangeRole(m.user_id, 'admin')}>▲</button>
                        )}
                        {key === 'admin' && (
                          <button title="Demote to member" onClick={() => onChangeRole(m.user_id, 'member')}>▼</button>
                        )}
                        <button
                          title="Remove from group"
                          className="danger"
                          onClick={() => {
                            if (window.confirm(`Remove @${username} from the group?`)) onRemove(m.user_id)
                          }}
                        >✕</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )
        })}
    </SidePanel>
  )
}
