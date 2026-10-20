import { eventLabels } from '../lib/eventUtils'

// The category pill (older events) plus the event's labels.
// Always renders its wrapper so card headers keep their layout when empty.
export default function EventLabels({ event }) {
  const labels = eventLabels(event)
  return (
    <div className="event-labels">
      {event.category && <span className="event-category">{event.category}</span>}
      {labels.map(l => <span key={l.id} className="event-label-chip">{l.name}</span>)}
    </div>
  )
}
