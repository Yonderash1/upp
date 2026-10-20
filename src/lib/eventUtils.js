import { format, isSameDay } from 'date-fns'

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
