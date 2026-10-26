import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EventLabels from '../components/EventLabels'
import { formatEventRange, getComingUp, rankFeedEvents } from '../lib/eventUtils'
import { getAttendState, EVENT_ROLE_SELECT } from '../lib/eventAccess'

const CalIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const PinIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>

export default function Home() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [attending, setAttending] = useState(new Set())
  const [roles, setRoles] = useState({})     // group id -> this person's role there
  const [counts, setCounts] = useState({})   // event id -> number going
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([fetchEvents(), fetchAttending(), fetchRoles()]).then(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchEvents() {
    const { data } = await supabase
      .from('events')
      .select(`*, profiles(username), groups(id, name), event_label_assignments(group_labels(id, name)), ${EVENT_ROLE_SELECT}`)
      .order('event_date', { ascending: true })
      .gte('event_date', new Date().toISOString())
    setEvents(data || [])
    fetchCounts((data || []).map(e => e.id))
  }

  async function fetchRoles() {
    const { data } = await supabase.from('group_members').select('group_id, group_roles(rank)').eq('user_id', user.id)
    const map = {}   // group id -> my role's rank (0 = owner)
    ;(data || []).forEach(r => { map[r.group_id] = r.group_roles?.rank ?? null })
    setRoles(map)
  }

  async function fetchCounts(eventIds) {
    if (eventIds.length === 0) return
    const { data } = await supabase.from('attendees').select('event_id').in('event_id', eventIds)
    const map = {}
    ;(data || []).forEach(a => { map[a.event_id] = (map[a.event_id] || 0) + 1 })
    setCounts(map)
  }

  async function fetchAttending() {
    const { data } = await supabase.from('attendees').select('event_id').eq('user_id', user.id)
    if (data) setAttending(new Set(data.map(a => a.event_id)))
  }

  async function toggleAttend(e, eventId) {
    e.stopPropagation()
    if (attending.has(eventId)) {
      await supabase.from('attendees').delete().eq('event_id', eventId).eq('user_id', user.id)
      setAttending(prev => { const s = new Set(prev); s.delete(eventId); return s })
      setCounts(prev => ({ ...prev, [eventId]: Math.max(0, (prev[eventId] || 1) - 1) }))
    } else {
      const { error } = await supabase.from('attendees').insert({ event_id: eventId, user_id: user.id })
      if (error) { alert(error.message); fetchCounts(events.map(ev => ev.id)); return }
      await supabase.from('event_interests').delete().eq('event_id', eventId).eq('user_id', user.id)
      setAttending(prev => new Set([...prev, eventId]))
      setCounts(prev => ({ ...prev, [eventId]: (prev[eventId] || 0) + 1 }))
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  // The soonest events I'm going to (max 3, within 2 weeks) sit at the top of the feed
  const comingUp = getComingUp(events, attending)
  const comingUpIds = new Set(comingUp.map(e => e.id))
  // Everything else, in the order the app thinks is most relevant (see rankFeedEvents)
  const feed = rankFeedEvents(events.filter(e => !comingUpIds.has(e.id)))

  function renderCard(event) {
    return (
    <div key={event.id} className="event-card" onClick={() => navigate(`/event/${event.id}`)}>
      <EventLabels event={event} />
      <h3 className="event-title">{event.title}</h3>
      <div className="event-meta">
        <span><CalIcon /> {formatEventRange(event.event_date, event.event_end)}</span>
        <span><PinIcon /> {event.location_name}</span>
      </div>
      {event.description && <p className="event-desc">{event.description}</p>}
      <div className="event-footer">
        <div className="event-host">
          {event.groups ? (
            <>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, fontFamily: 'Syne, sans-serif' }}>
                {event.groups.name[0].toUpperCase()}
              </div>
              <span
                style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); navigate(`/groups/${event.groups.id}`) }}
              >
                {event.groups.name}
              </span>
            </>
          ) : (
            <>
              <div className="avatar-sm" style={{ width: 26, height: 26, fontSize: 11 }}>
                {event.profiles?.username?.[0]?.toUpperCase() || '?'}
              </div>
              {event.profiles?.username || 'Unknown'}
            </>
          )}
        </div>
        {(() => {
          const state = getAttendState({
            event, myRank: roles[event.group_id] ?? null,
            isAttending: attending.has(event.id), attendeeCount: counts[event.id] || 0
          })
          return (
            <button
              className={`attend-btn ${attending.has(event.id) ? 'attending' : ''}`}
              disabled={!state.canClick}
              onClick={e => toggleAttend(e, event.id)}
            >
              {attending.has(event.id) ? '✓ Going' : state.canClick ? "I'm going" : state.label}
            </button>
          )
        })()}
      </div>
    </div>
    )
  }

  return (
    <div className="page">
      <div className="home-page">
        <div className="feed-header">
          <h1>What's Upp 👋</h1>
        </div>

        {comingUp.length === 0 && feed.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.4 }}>
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <h3>No events yet</h3>
            <p>Join a group to start seeing events here</p>
            <Link to="/groups" className="btn btn-primary" style={{ width: 'auto', marginTop: 16 }}>Find groups</Link>
          </div>
        ) : (
          <>
            {comingUp.length > 0 && (
              <section className="feed-section">
                <h2 className="feed-section-title">Coming up...</h2>
                {comingUp.map(renderCard)}
              </section>
            )}
            {feed.map(renderCard)}
          </>
        )}
      </div>
    </div>
  )
}
