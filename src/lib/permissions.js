// Group roles & permissions — shared by the role editor, members panel, group page and channels.
//
// HIERARCHY: every role has a `rank`. 0 is the top (Owner) and bigger numbers sit lower.
// A person can only act on someone whose rank number is LARGER than their own.

export const MAX_ROLES = 10
export const MAX_CHANNELS = 4

// Shown in the role editor, grouped like Discord's permission list
export const PERMISSION_GROUPS = [
  {
    title: 'Events',
    items: [
      { key: 'create_events', label: 'Create events', desc: 'Post new events for the group' },
      { key: 'edit_events', label: 'Edit events', desc: 'Change any of the group’s events' },
      { key: 'delete_events', label: 'Delete events', desc: 'Remove any of the group’s events' }
    ]
  },
  {
    title: 'Announcements',
    items: [
      { key: 'create_announcements', label: 'Make announcements', desc: 'Post announcements to the group' },
      { key: 'edit_announcements', label: 'Edit announcements', desc: 'Change any announcement' },
      { key: 'delete_announcements', label: 'Delete announcements', desc: 'Remove any announcement' }
    ]
  },
  {
    title: 'Members',
    items: [
      { key: 'kick_members', label: 'Kick members', desc: 'Remove people from the group — only people with a lower role' },
      { key: 'manage_roles', label: 'Manage roles', desc: 'Create, edit and give out roles below their own' },
      { key: 'manage_join_requests', label: 'Approve join requests', desc: 'Accept or deny requests to join' },
      { key: 'message_members', label: 'Message members', desc: 'Message, or send message requests to, other members of the group (as each member’s privacy settings allow)' }
    ]
  },
  {
    title: 'Group',
    items: [
      { key: 'manage_group', label: 'Manage group settings', desc: 'Change the name, image, labels and how people join' }
    ]
  },
  {
    title: 'Channels',
    items: [
      { key: 'create_channels', label: 'Create channels', desc: `Add chat channels (a group can have ${MAX_CHANNELS})` },
      { key: 'edit_channels', label: 'Edit channels', desc: 'Rename channels and change who can see, read and chat' },
      { key: 'delete_channels', label: 'Delete channels', desc: 'Remove channels and their messages' }
    ]
  }
]

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key))

// Discord-style colour choices for the role title
export const ROLE_COLORS = [
  '#99aab5', '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63',
  '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#11806a', '#1f8b4c',
  '#206694', '#71368a', '#ad1457', '#c27c0e', '#a84300', '#992d22'
]
export const DEFAULT_ROLE_COLOR = '#99aab5'

export const sortRoles = roles => [...(roles || [])].sort((a, b) => a.rank - b.rank)

// Does this role hold the permission? (The Owner role holds everything.)
export const hasPerm = (role, key) => !!role && (role.is_owner || (role.permissions || []).includes(key))

// Is `a` strictly higher than `b`? (b = null means "not in the group" → lowest of all)
export const outranks = (a, b) => !!a && (!b || a.rank < b.rank)

// May `me` edit / delete this role (and tick permissions on it)?
export const canEditRole = (me, target) =>
  !!me && !!target && hasPerm(me, 'manage_roles') && (me.is_owner || me.rank < target.rank)

// May `me` kick someone who holds `targetRole`?
export const canKickRole = (me, targetRole) =>
  hasPerm(me, 'kick_members') && !!targetRole && !targetRole.is_owner && (me.is_owner || me.rank < targetRole.rank)

// May `me` change this member's role (to something lower than their own)?
export const canChangeMemberRole = (me, targetRole) =>
  hasPerm(me, 'manage_roles') && !!targetRole && !targetRole.is_owner && (me.is_owner || me.rank < targetRole.rank)

// Roles `me` is allowed to hand out
export const assignableRoles = (me, roles) =>
  sortRoles(roles).filter(r => !r.is_owner && (me.is_owner || me.rank < r.rank))

// ── Channels ──────────────────────────────────────────────
// Each channel level stores the LOWEST role that gets it; everyone above that role gets it too.
export const CHANNEL_LEVELS = [
  { key: 'view_min_role', label: 'See that the channel exists', short: 'View' },
  { key: 'read_min_role', label: 'Read the messages', short: 'Read' },
  { key: 'send_min_role', label: 'Chat in the channel', short: 'Chat' },
  { key: 'manage_messages_min_role', label: 'Edit & delete other people’s messages', short: 'Moderate' }
]

// What can `me` do in this channel? (mirrors the database function channel_access)
export function channelAccess(channel, me, rolesById) {
  const none = { view: false, read: false, send: false, manage: false }
  if (!channel || !me) return none
  if (me.is_owner) return { view: true, read: true, send: true, manage: true }
  const ok = key => {
    const min = rolesById[channel[key]]
    return !!min && me.rank <= min.rank
  }
  const view = ok('view_min_role')
  const read = view && ok('read_min_role')
  return {
    view,
    read,
    send: read && ok('send_min_role'),
    manage: read && ok('manage_messages_min_role')
  }
}

// Text for the "who gets this?" dropdowns
export function roleAndAboveLabel(role) {
  if (role.is_owner) return `${role.name} only`
  if (role.is_default) return `Everyone (${role.name})`
  return `${role.name} & above`
}
