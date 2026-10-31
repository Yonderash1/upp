import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import { formatDistanceToNow } from 'date-fns'
import 'leaflet/dist/leaflet.css'
import '../lib/leafletIcons'
import GroupAvatar from './GroupAvatar'
import EventLabels from './EventLabels'
import EventDistance from './EventDistance'
import { formatEventRange, eventKind, eventStatus, isHappeningToday, timeFromNow } from '../lib/eventUtils'
import { describeJoinAccess, getAttendState, getJoinStatus } from '../lib/eventAccess'

const CalIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const PinIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>

// Re-renders once a minute so "in 5 mins" stays right while the page is open
function useNow(everyMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

// A small, non-interactive map showing where the event is. Only built once it scrolls near the screen,
// so a long feed doesn't create dozens of maps at once.
function MiniMap({ lat, lng }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect() }
    }, { rootMargin: '250px' })
    if (ref.current) io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return (
    <div className="ec-map" ref={ref}>
      {visible && (
        <MapContainer
          center={[lat, lng]} zoom={15} style={{ height: '100%' }}
          zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false}
          touchZoom={false} boxZoom={false} keyboard={false}
        >
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[lat, lng]} interactive={false} />
        </MapContainer>
      )}
    </div>
  )
}

// One event, laid out the same way on the home feed and on a group's page:
//   group name · title · tags · thumbnail · date (+ time from now) · location (+ distance) · map ·
//   description · other info · going / interested buttons · (optional admin buttons)
//
//   counts = { going, interested }      myRank = this person's role rank in the event's group (null = not a member)
//   actions = extra buttons shown under the card (e.g. Edit / Cancel / Delete) — never greyed out
export default function EventCard({
  event, counts, isGoing, isInterested, myRank = null,
  onToggleGoing, onToggleInterested, actions, domId, highlight = false
}) {
  const navigate = useNavigate()
  const now = useNow()
  const status = eventStatus(event, now)
  const closed = status === 'ended' || status === 'cancelled'
  const today = isHappeningToday(event, now)
  const kind = eventKind(event)
  const hasPin = event.location_type === 'physical' && event.lat != null && event.lng != null
  const isOnline = event.location_type === 'online'
  const group = event.groups

  const attendState = getAttendState({ event, myRank, isAttending: isGoing, attendeeCount: counts.going })
  const canInterest = !isGoing && getJoinStatus(event, myRank) === 'ok'
  const stop = fn => e => { e.stopPropagation(); fn && fn(e) }

  return (
    <div
      id={domId}
      className={[
        'event-card', 'ec', kind.tone === 'online' ? 'post-online' : 'post-event',
        status === 'ended' ? 'is-ended' : '', status === 'cancelled' ? 'is-cancelled' : '',
        highlight ? 'event-highlight' : ''
      ].join(' ')}
      onClick={() => navigate(`/event/${event.id}`)}
    >
      {status === 'cancelled' && <div className="ec-banner cancelled">🚫 This event has been cancelled</div>}
      {status === 'ended' && <div className="ec-banner ended">⏱ This event has already happened</div>}

      <div className="ec-body">
        {/* 1. Group name */}
        <div className="ec-group">
          {group ? (
            <>
              <GroupAvatar group={group} size={24} />
              <span className="ec-group-name" onClick={stop(() => navigate(`/groups/${group.id}`))}>{group.name}</span>
            </>
          ) : (
            <>
              <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 11 }}>
                {event.profiles?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <span className="ec-group-plain">{event.profiles?.username || 'Unknown'}</span>
            </>
          )}
        </div>

        {/* 2. Title   3. Tags */}
        <h3 className="event-title ec-title">{event.title}</h3>
        <EventLabels event={event} />

        {/* 4. Thumbnail (always the same shape) */}
        <div className="ec-thumb">
          {event.image_url
            ? <img src={event.image_url} alt="" loading="lazy" />
            : <div className="ec-thumb-empty">{isOnline ? '💻' : '📍'}</div>}
        </div>

        {/* 5. Date + how far away it is (bold when it's today) */}
        <div className={`ec-row ec-date ${today ? 'today' : ''}`}>
          <CalIcon />
          <span>{formatEventRange(event.event_date, event.event_end)}<span className="ec-rel"> · {timeFromNow(event, now)}</span></span>
        </div>

        {/* 6. Location + distance */}
        <div className="ec-row ec-location">
          {isOnline ? <span className="ec-emoji">💻</span> : <PinIcon />}
          <span>{event.location_name}</span>
          <EventDistance event={event} />
        </div>

        {/* 7. Map position */}
        {hasPin && <MiniMap lat={event.lat} lng={event.lng} />}

        {/* 8. Description */}
        {event.description && <p className="event-desc ec-desc">{event.description}</p>}

        {/* 9. Everything else */}
        <div className="ec-other">
          <span>🎟 {describeJoinAccess(event).replace('This event is open', 'Open')}</span>
          {event.max_attendees != null && <span>👥 {counts.going} / {event.max_attendees} places taken</span>}
          {event.created_at && <span>🕐 Posted {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>}
        </div>

        {/* 10. I'm going | n attending     I'm interested | n interested */}
        <div className="ec-actions" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            className={`ec-btn ec-going ${isGoing ? 'on' : ''}`}
            disabled={closed || !attendState.canClick}
            onClick={stop(onToggleGoing)}
          >
            <span>{isGoing ? '✓ Going' : attendState.canClick ? "I'm going" : attendState.label}</span>
            <span className="ec-bar">|</span>
            <span>{counts.going} attending</span>
          </button>
          <button
            type="button"
            className={`ec-btn ec-interested ${isInterested ? 'on' : ''}`}
            disabled={closed || !canInterest}
            onClick={stop(onToggleInterested)}
          >
            <span>{isInterested ? '★ Interested' : "I'm interested"}</span>
            <span className="ec-bar">|</span>
            <span>{counts.interested} interested</span>
          </button>
        </div>
      </div>

      {status === 'cancelled' && <div className="ec-stamp" aria-hidden="true">CANCELLED</div>}

      {actions && <div className="ec-admin" onClick={e => e.stopPropagation()}>{actions}</div>}
    </div>
  )
}
