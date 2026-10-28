// Profile privacy + message-request settings — shared by the Settings page and the profile.
// The database columns are named  vis_<key>  and  msg_<audience>  (see supabase-privacy-messaging.sql).

// Who can see something. Everything starts as 'private' (only the owner).
export const VISIBILITY_LEVELS = [
  { key: 'public', icon: '🌍', label: 'Public', short: 'Anyone' },
  { key: 'connections', icon: '👥', label: 'Connections', short: 'Connections' },
  { key: 'private', icon: '🔒', label: 'Only me', short: 'Only you' },
]

export const visibilityLevel = key => VISIBILITY_LEVELS.find(l => l.key === key) || VISIBILITY_LEVELS[2]

// What can be shown or hidden — [key, label]
export const ABOUT_FIELDS = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'city', label: 'Home town / city' },
]

export const PROFILE_SECTIONS = [
  { key: 'interests', label: 'Interests', desc: 'Your interests. Private interests are always only visible to you.' },
  { key: 'groups', label: 'Groups', desc: 'The groups you’re in. A group that hides its member list stays hidden from people outside it.' },
  { key: 'connections', label: 'Connections', desc: 'Who you’re connected with.' },
  { key: 'events_attending', label: 'Events attending', desc: 'Events you’re going to. Events you can’t see yourself stay hidden from others too.' },
  { key: 'events_interested', label: 'Events interested in', desc: 'Events you’ve tapped “I’m interested” on.' },
]

export const VISIBILITY_KEYS = [...ABOUT_FIELDS, ...PROFILE_SECTIONS].map(f => f.key)

export const DEFAULT_VISIBILITY = Object.fromEntries(VISIBILITY_KEYS.map(k => [k, 'private']))

// Turns a user_settings row into { first_name: 'private', … } (missing row / column = private)
export function visibilityFromRow(row) {
  const out = { ...DEFAULT_VISIBILITY }
  if (row) VISIBILITY_KEYS.forEach(k => { if (row[`vis_${k}`]) out[k] = row[`vis_${k}`] })
  return out
}

// ── Messaging ──
export const MESSAGE_CHOICES = {
  none: 'Can’t message me',
  request: 'Must send a request first',
  direct: 'Can message me directly',
}

export const MESSAGE_AUDIENCES = [
  {
    key: 'connections', label: 'Connections', options: ['request', 'direct'],
    desc: 'People you’re connected with.',
  },
  {
    key: 'others', label: 'Everyone else', options: ['none', 'request', 'direct'],
    desc: 'People you’re not connected with.',
  },
  {
    key: 'admins', label: 'Admins of your groups', options: ['request', 'direct'],
    desc: 'Owners and admins of any group you’re in. They can always at least send a request.',
  },
  {
    key: 'members', label: 'Fellow group members', options: ['none', 'request', 'direct'],
    desc: 'Other members of groups you’re in.',
  },
]

export const DEFAULT_MESSAGE_SETTINGS = { connections: 'request', others: 'request', admins: 'request', members: 'request' }

export function messageSettingsFromRow(row) {
  const out = { ...DEFAULT_MESSAGE_SETTINGS }
  if (row) MESSAGE_AUDIENCES.forEach(a => { if (row[`msg_${a.key}`]) out[a.key] = row[`msg_${a.key}`] })
  return out
}

// Builds the object saved to user_settings
export function settingsToRow(userId, visibility, messaging) {
  const row = { user_id: userId, updated_at: new Date().toISOString() }
  VISIBILITY_KEYS.forEach(k => { row[`vis_${k}`] = visibility[k] })
  MESSAGE_AUDIENCES.forEach(a => { row[`msg_${a.key}`] = messaging[a.key] })
  return row
}
