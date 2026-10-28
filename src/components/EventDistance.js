import { useGeo } from '../contexts/LocationContext'
import { haversineKm, formatDistance } from '../lib/eventUtils'

// "🧭 3.2 km from you · 12 km from home" — only for events pinned on the map
export default function EventDistance({ event }) {
  const { unit, here, home } = useGeo()
  if (!event || event.location_type === 'online' || event.lat == null || event.lng == null) return null
  const point = { lat: event.lat, lng: event.lng }
  const parts = []
  if (here) parts.push(`${formatDistance(haversineKm(here, point), unit)} from you`)
  if (home) parts.push(`${formatDistance(haversineKm(home, point), unit)} from home`)
  if (parts.length === 0) return null
  return <span className="event-distance">🧭 {parts.join(' · ')}</span>
}
