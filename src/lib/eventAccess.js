// Who can see / join an event. Stored on the event as two text arrays:
//   ['public']  ['members']  or a list of roles, e.g. ['owner', 'admin']

export const ROLE_OPTIONS = [
  { key: 'owner', label: 'Owner' },
  { key: 'admin', label: 'Admin' }
]

// Older group creators may have the role 'creator' — treat as owner
export const normalizeRole = r => (r === 'creator' ? 'owner' : r || null)

// ── Form helpers: array ⇄ { mode, roles } ──
export function audienceFromArray(arr) {
  const a = arr && arr.length ? arr : ['public']
  if (a.includes('public')) return { mode: 'public', roles: [] }
  if (a.includes('members')) return { mode: 'members', roles: [] }
  return { mode: 'roles', roles: ROLE_OPTIONS.map(r => r.key).filter(k => a.includes(k)) }
}
export function audienceToArray({ mode, roles }) {
  return mode === 'roles' ? roles : [mode]
}

function roleList(roles) {
  return ROLE_OPTIONS.filter(r => roles.includes(r.key)).map(r => `'${r.label}'`).join(' & ')
}

// Short wording used in the form summary
export function audienceShort({ mode, roles }) {
  if (mode === 'public') return 'Anyone'
  if (mode === 'members') return 'All group members'
  return roles.length ? ROLE_OPTIONS.filter(r => roles.includes(r.key)).map(r => r.label).join(' & ') : 'No roles chosen'
}

// Sentence shown on a posted event
export function describeJoinAccess(event) {
  const a = audienceFromArray(event?.join_access)
  if (a.mode === 'public') return 'This event is open to the public'
  if (a.mode === 'members') return 'This event is open to all members'
  return `This event is open for the ${a.roles.length === 1 ? 'role' : 'roles'} ${roleList(a.roles)}`
}

// 'ok' | 'non_member' | 'wrong_role'
export function getJoinStatus(event, myRole) {
  const access = event.join_access || ['public']
  if (!event.group_id || access.includes('public')) return 'ok'
  if (!myRole) return 'non_member'
  if (access.includes('members')) return 'ok'
  return access.includes(myRole) ? 'ok' : 'wrong_role'
}

// What the "I'm going" button should do for this person
export function getAttendState({ event, myRole, isAttending, attendeeCount }) {
  if (isAttending) return { status: 'attending', canClick: true, label: '' }
  const join = getJoinStatus(event, myRole)
  if (join === 'non_member') return { status: 'blocked', canClick: false, label: 'Unavailable to non-members' }
  if (join === 'wrong_role') return { status: 'blocked', canClick: false, label: 'Unavailable to your group role' }
  if (event.max_attendees != null && attendeeCount >= event.max_attendees) {
    return { status: 'full', canClick: false, label: 'Event full' }
  }
  return { status: 'open', canClick: true, label: '' }
}
