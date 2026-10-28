import { format, isSameDay, addDays } from 'date-fns'

// "Sat, Nov 7 · 7:00 PM – 10:00 PM"  or  "Sat, Nov 7 · 7:00 PM → Sun, Nov 8 · 1:00 AM"
// Older events have no end time, so they just show the start.
export function formatEventRange(startIso, endIso, long = false) {
  const start = new Date(startIso)
  const dayFmt = long ? 'EEEE, MMMM d yyyy' : 'EEE, MMM d'
  const timeFmt = 'h:mm a'
  if (!endIso) return `${format(start, dayFmt)} · ${format(start, timeFmt)}`
  const end = new Date(endIso)
  if (isSameDay(start, end)) {
    return `${format(start, dayFmt)} · ${format(start, timeFmt)} – ${format(end, timeFmt)}`
  }
  return `${format(start, dayFmt)} · ${format(start, timeFmt)} → ${format(end, dayFmt)} · ${format(end, timeFmt)}`
}

// Labels come back from Supabase nested: event_label_assignments[].group_labels
export function eventLabels(event) {
  return (event?.event_label_assignments || []).map(a => a.group_labels).filter(Boolean)
}

// "Coming up..." strip at the top of the feed: events I'm attending that start
// within the next 2 weeks, soonest first, max 3.
export function getComingUp(events, attendingIds, { days = 14, max = 3 } = {}) {
  const now = new Date()
  const cutoff = addDays(now, days)
  return events
    .filter(e => attendingIds.has(e.id))
    .filter(e => {
      const start = new Date(e.event_date)
      return start >= now && start <= cutoff
    })
    .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
    .slice(0, max)
}

// The main feed order. For now this is just soonest-first, but it's the ONE place
// to plug in the relevance algorithm later (e.g. score each event by how much the
// user engages with that group / label / type of event, then sort by score).
// `context` is where signals like engagement history will be passed in.
export function rankFeedEvents(events, context = {}) { // eslint-disable-line no-unused-vars
  return [...events].sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
}

// ── What kind of event is it? (label shown at the top of an event card) ──
//   📍 EVENT          – pinned on the map
//   🖱️ ONLINE EVENT   – online (gets its own border colour)
//   ⏰ EVENT           – a place described in words, no map pin
//   📆 EVENT          – location still to be confirmed
export function eventKind(event) {
  const type = event?.location_type
  if (type === 'online') return { key: 'online', icon: '🖱️', label: 'Online event', tone: 'online' }
  if (type === 'tbc') return { key: 'tbc', icon: '📆', label: 'Event', tone: 'physical' }
  // older events default to "physical" even when they were never pinned
  if (type === 'other' || (type === 'physical' && (event.lat == null || event.lng == null))) {
    return { key: 'other', icon: '⏰', label: 'Event', tone: 'physical' }
  }
  return { key: 'physical', icon: '📍', label: 'Event', tone: 'physical' }
}

// ── Distances ──
export function haversineKm(a, b) {
  const rad = d => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// unit: 'km' (default) or 'mi'
export function formatDistance(km, unit = 'km') {
  const mi = unit === 'mi'
  const value = mi ? km * 0.621371 : km
  const label = mi ? 'mi' : 'km'
  if (value < 0.1) return `<0.1 ${label}`
  return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString()} ${label}`
}
