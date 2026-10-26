// Who can see / join an event. Stored on the event as:
//   join_access / visibility_access = ['public'] | ['members'] | ['role']
//   join_min_role / visibility_min_role = the LOWEST role let in (everyone above it is let in too)
//
// A person's "rank" is their role's rank number: 0 = Owner, bigger = lower. null = not in the group.

// Add this to event queries so the page knows the role names and ranks
export const EVENT_ROLE_SELECT =
  'join_role:group_roles!events_join_min_role_fkey(id, name, rank), visibility_role:group_roles!events_visibility_min_role_fkey(id, name, rank)'

// ── Form helpers: stored values ⇄ { mode, roleId } ──
export function audienceFromEvent(access, minRole) {
  const mode = access && access[0] ? access[0] : 'public'
  return { mode, roleId: mode === 'role' ? minRole || null : null }
}
export function audienceToStored({ mode, roleId }) {
  return { access: [mode], minRole: mode === 'role' ? roleId : null }
}

// Short wording used in the form summary
export function audienceShort({ mode, roleId }, roles = []) {
  if (mode === 'public') return 'Anyone'
  if (mode === 'members') return 'All group members'
  const r = roles.find(x => x.id === roleId)
  if (!r) return 'No role chosen'
  return r.is_owner ? `${r.name} only` : `${r.name} & above`
}

// Sentence shown on a posted event
export function describeJoinAccess(event) {
  const mode = event?.join_access?.[0] || 'public'
  if (mode === 'public') return 'This event is open to the public'
  if (mode === 'members') return 'This event is open to all members'
  const r = event?.join_role
  if (!r) return 'This event is open to the group owner'
  return r.rank === 0 ? `This event is open to the '${r.name}' only` : `This event is open to '${r.name}' and all roles above`
}

// 'ok' | 'non_member' | 'wrong_role'
export function getJoinStatus(event, myRank) {
  const mode = event.join_access?.[0] || 'public'
  if (!event.group_id || mode === 'public') return 'ok'
  if (myRank == null) return 'non_member'
  if (myRank === 0 || mode === 'members') return 'ok'
  const need = event.join_role?.rank
  return need != null && myRank <= need ? 'ok' : 'wrong_role'
}

// What the "I'm going" button should do for this person
export function getAttendState({ event, myRank, isAttending, attendeeCount }) {
  if (isAttending) return { status: 'attending', canClick: true, label: '' }
  const join = getJoinStatus(event, myRank)
  if (join === 'non_member') return { status: 'blocked', canClick: false, label: 'Unavailable to non-members' }
  if (join === 'wrong_role') return { status: 'blocked', canClick: false, label: 'Unavailable to your group role' }
  if (event.max_attendees != null && attendeeCount >= event.max_attendees) {
    return { status: 'full', canClick: false, label: 'Event full' }
  }
  return { status: 'open', canClick: true, label: '' }
}
