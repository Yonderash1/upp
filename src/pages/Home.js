import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EventCard from '../components/EventCard'
import { getComingUp, rankFeedEvents, eventStatus } from '../lib/eventUtils'
import { EVENT_ROLE_SELECT } from '../lib/eventAccess'

export default function Home() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [attending, setAttending] = useState(new Set())
  const [interested, setInterested] = useState(new Set())   // events I've marked "interested"
  const [roles, setRoles] = useState({})     // group id -> this person's role there
  const [counts, setCounts] = useState({})   // event id -> number going
  const [interestCounts, setInterestCounts] = useState({})   // event id -> number interested
  const { user } = useAuth()

  useEffect(() => {
    Promise.all([fetchEvents(), fetchMine(), fetchRoles()]).then(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchEvents() {
    // Events that haven't finished yet (ones with no end time count as finished once they start)
    const nowIso = new Date().toISOString()
    const { data } = await supabase
      .from('events')
      .select(`*, profiles(username), groups(id, name, image_url), event_label_assignments(group_labels(id, name)), ${EVENT_ROLE_SELECT}`)
      .or(`event_end.gte.${nowIso},and(event_end.is.null,event_date.gte.${nowIso})`)
      .order('event_date', { ascending: true })
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
    const [att, int] = await Promise.all([
      supabase.from('attendees').select('event_id').in('event_id', eventIds),
      supabase.from('event_interests').select('event_id').in('event_id', eventIds)
    ])
    const map = {}
    ;(att.data || []).forEach(a => { map[a.event_id] = (map[a.event_id] || 0) + 1 })
    setCounts(map)
    const imap = {}
    ;(int.data || []).forEach(a => { imap[a.event_id] = (imap[a.event_id] || 0) + 1 })
    setInterestCounts(imap)
  }

  // Which events am I going to / interested in?
  async function fetchMine() {
    const [att, int] = await Promise.all([
      supabase.from('attendees').select('event_id').eq('user_id', user.id),
      supabase.from('event_interests').select('event_id').eq('user_id', user.id)
    ])
    if (att.data) setAttending(new Set(att.data.map(a => a.event_id)))
    if (int.data) setInterested(new Set(int.data.map(a => a.event_id)))
  }

  async function toggleAttend(eventId) {
    if (attending.has(eventId)) {
      await supabase.from('attendees').delete().eq('event_id', eventId).eq('user_id', user.id)
    } else {
      const { error } = await supabase.from('attendees').insert({ event_id: eventId, user_id: user.id })
      if (error) { alert(error.message); fetchMine(); fetchCounts(events.map(ev => ev.id)); return }
      await supabase.from('event_interests').delete().eq('event_id', eventId).eq('user_id', user.id)   // going replaces "interested"
    }
    fetchMine()
    fetchCounts(events.map(ev => ev.id))
  }

  async function toggleInterest(eventId) {
    if (interested.has(eventId)) {
      await supabase.from('event_interests').delete().eq('event_id', eventId).eq('user_id', user.id)
    } else {
      const { error } = await supabase.from('event_interests').insert({ event_id: eventId, user_id: user.id })
      if (error) { alert(error.message); return }
    }
    fetchMine()
    fetchCounts(events.map(ev => ev.id))
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  // Anything that has finished since the page loaded drops off the feed
  const live = events.filter(e => eventStatus(e) !== 'ended')

  // The soonest events I'm going to (max 3, within 2 weeks) sit at the top of the feed
  const comingUp = getComingUp(live, attending)
  const comingUpIds = new Set(comingUp.map(e => e.id))
  // Everything else, in the order the app thinks is most relevant (see rankFeedEvents).
  // Cancelled events stay visible, greyed out, but sink to the bottom.
  const ranked = rankFeedEvents(live.filter(e => !comingUpIds.has(e.id)))
  const feed = [...ranked.filter(e => !e.cancelled_at), ...ranked.filter(e => e.cancelled_at)]

  function renderCard(event) {
    return (
      <EventCard
        key={event.id}
        event={event}
        myRank={roles[event.group_id] ?? null}
        counts={{ going: counts[event.id] || 0, interested: interestCounts[event.id] || 0 }}
        isGoing={attending.has(event.id)}
        isInterested={interested.has(event.id)}
        onToggleGoing={() => toggleAttend(event.id)}
        onToggleInterested={() => toggleInterest(event.id)}
      />
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
