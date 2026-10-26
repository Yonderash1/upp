import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SidePanel from './SidePanel'
import { sortRoles, canKickRole, canChangeMemberRole, assignableRoles } from '../lib/permissions'

// Members grouped by role, highest role first. Each role's title (and the line under it) uses the role's colour.
export default function MembersPanel({
  members, roles, myRole, memberCount, canSeeMembers, currentUserId,
  onChangeRole, onKick, open, onToggle
}) {
  const navigate = useNavigate()
  const [hoverId, setHoverId] = useState(null)
  const rolesById = Object.fromEntries((roles || []).map(r => [r.id, r]))
  const givable = myRole ? assignableRoles(myRole, roles) : []

  return (
    <SidePanel side="right" open={open} onToggle={onToggle} label="members">

      <h3 className="members-title">
        Members <span>{canSeeMembers ? members.length : memberCount}</span>
      </h3>

      {!canSeeMembers && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>The member list is hidden by the group</p>
      )}

      {canSeeMembers && sortRoles(roles).map(role => {
        const list = members.filter(m => m.role_id === role.id)
        if (list.length === 0) return null
        return (
          <section key={role.id} className="members-rank">
            <h4 style={{ color: role.color, borderBottom: `2px solid ${role.color}55` }}>
              {role.is_owner ? '👑 ' : ''}{role.name} — {list.length}
            </h4>
            {list.map(m => {
              const username = m.profiles?.username || '?'
              const isMe = m.user_id === currentUserId
              const canRole = !isMe && myRole && canChangeMemberRole(myRole, role)
              const canKick = !isMe && myRole && canKickRole(myRole, role)
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
                    <span className="member-name" style={{ color: role.color }}>@{username}</span>
                  </div>

                  {(canRole || canKick) && (
                    <div className="member-actions" style={{ opacity: hoverId === m.user_id ? 1 : undefined }}>
                      {canRole && givable.length > 0 && (
                        <select
                          className="member-role-select"
                          title="Change role"
                          value={m.role_id}
                          onChange={e => onChangeRole(m.user_id, e.target.value)}
                        >
                          {/* their current role is always listed, even if it can't be picked again */}
                          {!givable.some(r => r.id === m.role_id) && rolesById[m.role_id] && (
                            <option value={m.role_id}>{rolesById[m.role_id].name}</option>
                          )}
                          {givable.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      )}
                      {canKick && (
                        <button
                          title="Kick from group"
                          className="danger"
                          onClick={() => {
                            if (window.confirm(`Kick @${username} from the group?`)) onKick(m.user_id)
                          }}
                        >✕</button>
                      )}
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
