import { useCallback, useEffect, useMemo, useState } from 'react'
import GroupAvatar from '../components/GroupAvatar'
import { Link, useNavigate } from 'react-router-dom'
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  startOfDay, endOfDay, eachDayOfInterval, isSameMonth, isSameDay, isToday, format
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import EventLabels from '../components/EventLabels'
import { formatEventRange } from '../lib/eventUtils'

const EVENT_SELECT = '*, groups(id, name, image_url), profiles(username), event_label_assignments(group_labels(id, name))'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const CalIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const PinIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>

// ── Small helpers ─────────────────────────────────────────────
const startOf = ev => new Date(ev.event_date)
const endOf = ev => new Date(ev.event_end || ev.event_date)
const byStart = (a, b) => startOf(a) - startOf(b)
const isUpcoming = (ev, now) => endOf(ev) >= now
const dayKey = d => format(d, 'yyyy-MM-dd')

// Does this event touch this calendar day? (handles events that run over several days)
function overlapsDay(ev, day) {
  return startOf(ev) <= endOfDay(day) && endOf(ev) >= startOfDay(day)
}

// What shows on a given day:
//   mine   = you're going
//   theirs = the connection is going, you're not
//   shared = you're both going
function itemsForDay(going, theirs, goingIds, theirIds, day) {
  const items = []
  going.forEach(ev => {
    if (overlapsDay(ev, day)) items.push({ ev, kind: theirIds.has(ev.id) ? 'shared' : 'mine' })
  })
  theirs.forEach(ev => {
    if (!goingIds.has(ev.id) && overlapsDay(ev, day)) items.push({ ev, kind: 'theirs' })
  })
  return items.sort((a, b) => byStart(a.ev, b.ev))
}

// ── Going / Interested / Not going control ────────────────────
function StatusControl({ status, busy, onChange }) {
  return (
    <div className="pl-status" role="group" aria-label="Your plans for this event">
      <button
        className={status === 'going' ? 'on going' : ''}
        disabled={busy}
        onClick={() => status !== 'going' && onChange('going')}
      >
        ✓ Going
      </button>
      <button
        className={status === 'interested' ? 'on interested' : ''}
        disabled={busy}
        onClick={() => status !== 'interested' && onChange('interested')}
      >
        ★ Interested
      </button>
      <button className="remove" disabled={busy} onClick={() => onChange('none')}>
        {status === 'going' ? 'Not going' : 'Not interested'}
      </button>
    </div>
  )
}

// ── One event in the "Going" / "Interested" lists ─────────────
function PlannerCard({ ev, status, busy, onChange }) {
  const navigate = useNavigate()
  return (
    <div className="pl-card">
      <EventLabels event={ev} />
      <h3 className="event-title" onClick={() => navigate(`/event/${ev.id}`)}>{ev.title}</h3>
      <div className="event-meta">
        <span><CalIcon /> {formatEventRange(ev.event_date, ev.event_end)}</span>
        <span><PinIcon /> {ev.location_name}</span>
      </div>
      <div className="pl-card-footer">
        <div className="pl-host">
          {ev.groups ? (
            <>
              <GroupAvatar group={ev.groups} size={24} />
              <span className="pl-host-link" onClick={() => navigate(`/groups/${ev.groups.id}`)}>{ev.groups.name}</span>
            </>
          ) : (
            <>
              <div className="avatar-sm" style={{ width: 24, height: 24, fontSize: 11 }}>
                {ev.profiles?.username?.[0]?.toUpperCase() || '?'}
              </div>
              {ev.profiles?.username || 'Unknown'}
            </>
          )}
        </div>
        <StatusControl status={status} busy={busy} onChange={next => onChange(ev, next)} />
      </div>
    </div>
  )
}

// ── The page ──────────────────────────────────────────────────
export default function Planner() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [going, setGoing] = useState([])               // events I'm attending (all dates)
  const [interested, setInterested] = useState([])     // events I've marked interested in
  const [people, setPeople] = useState([])             // my accepted connections
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())

  const [compareId, setCompareId] = useState('')
  const [theirs, setTheirs] = useState([])             // events the chosen connection is attending
  const [loadingTheirs, setLoadingTheirs] = useState(false)

  const now = useMemo(() => new Date(), [])

  // ── Loading ──
  const loadMine = useCallback(async () => {
    const [g, i] = await Promise.all([
      supabase.from('attendees').select(`event_id, events(${EVENT_SELECT})`).eq('user_id', user.id),
      supabase.from('event_interests').select(`event_id, events(${EVENT_SELECT})`).eq('user_id', user.id)
    ])
    const err = g.error || i.error
    if (err) { setError(err.message); return }
    setError('')
    const goingEvents = (g.data || []).map(r => r.events).filter(Boolean).sort(byStart)
    const goingSet = new Set(goingEvents.map(e => e.id))
    setGoing(goingEvents)
    setInterested(
      (i.data || []).map(r => r.events).filter(e => e && !goingSet.has(e.id)).sort(byStart)
    )
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    async function init() {
      await loadMine()
      const { data } = await supabase
        .from('connections')
        .select('id, from_user, to_user, from_profile:from_user(id, username, avatar_url), to_profile:to_user(id, username, avatar_url)')
        .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
        .eq('status', 'accepted')
      if (cancelled) return
      setPeople(
        (data || [])
          .map(c => (c.from_user === user.id ? c.to_profile : c.from_profile))
          .filter(Boolean)
          .sort((a, b) => a.username.localeCompare(b.username))
      )
      setLoading(false)
    }
    init()
    return () => { cancelled = true }
  }, [loadMine, user.id])

  // When a connection is picked, load what they're attending
  useEffect(() => {
    if (!compareId) { setTheirs([]); setLoadingTheirs(false); return }
    let cancelled = false
    setLoadingTheirs(true)
    supabase
      .from('attendees')
      .select(`event_id, events(${EVENT_SELECT})`)
      .eq('user_id', compareId)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError(err.message)
        setTheirs((data || []).map(r => r.events).filter(Boolean).sort(byStart))
        setLoadingTheirs(false)
      })
    return () => { cancelled = true }
  }, [compareId])

  // ── Changing your plans ──
  async function changeStatus(ev, next) {
    const wasGoing = going.some(e => e.id === ev.id)
    const wasInterested = interested.some(e => e.id === ev.id)
    setBusyId(ev.id)
    try {
      if (next === 'going') {
        const { error: err } = await supabase.from('attendees').insert({ event_id: ev.id, user_id: user.id })
        if (err) { alert(err.message); return }
        await supabase.from('event_interests').delete().eq('event_id', ev.id).eq('user_id', user.id)
      } else if (next === 'interested') {
        // Add the interest first, so a rejected change never loses your place
        const { error: err } = await supabase.from('event_interests').insert({ event_id: ev.id, user_id: user.id })
        if (err) { alert(err.message); return }
        if (wasGoing) await supabase.from('attendees').delete().eq('event_id', ev.id).eq('user_id', user.id)
      } else {
        if (wasGoing) await supabase.from('attendees').delete().eq('event_id', ev.id).eq('user_id', user.id)
        if (wasInterested) await supabase.from('event_interests').delete().eq('event_id', ev.id).eq('user_id', user.id)
      }
      await loadMine()
    } finally {
      setBusyId(null)
    }
  }

  // ── Derived data ──
  const goingIds = useMemo(() => new Set(going.map(e => e.id)), [going])
  const theirIds = useMemo(() => new Set(theirs.map(e => e.id)), [theirs])
  const friend = people.find(p => p.id === compareId) || null

  const days = useMemo(() => eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  }), [month])

  const dayItems = useMemo(() => {
    const map = new Map()
    days.forEach(d => map.set(dayKey(d), itemsForDay(going, theirs, goingIds, theirIds, d)))
    return map
  }, [days, going, theirs, goingIds, theirIds])

  const selectedItems = selectedDay ? itemsForDay(going, theirs, goingIds, theirIds, selectedDay) : []
  const upcomingGoing = going.filter(e => isUpcoming(e, now))
  const upcomingTheirs = theirs.filter(e => isUpcoming(e, now))

  // ── Navigation ──
  // A connection's event: open the group hosting it (so you can join in there).
  // Events with no group, or that have already started, open the event page instead
  // because a group's feed only lists events that haven't started yet.
  function openTheirEvent(ev) {
    if (ev.group_id && startOf(ev) > new Date()) navigate(`/groups/${ev.group_id}?event=${ev.id}`)
    else navigate(`/event/${ev.id}`)
  }
  function openItem(item) {
    if (item.kind === 'theirs') openTheirEvent(item.ev)
    else navigate(`/event/${item.ev.id}`)
  }

  function goToMonth(m) {
    setMonth(m)
    setSelectedDay(isSameMonth(m, new Date()) ? new Date() : null)
  }

  const kindLabel = {
    mine: "You're going",
    shared: friend ? `You and @${friend.username}` : 'Both going',
    theirs: friend ? `@${friend.username} is going` : 'Going'
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="planner-page">
        <div className="feed-header">
          <div>
            <h1>Planner 🗓️</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Your plans, and what your connections are up to</p>
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {/* Compare with a connection */}
        <div className="pl-toolbar">
          <label htmlFor="pl-compare">Compare with</label>
          <select
            id="pl-compare"
            value={compareId}
            onChange={e => setCompareId(e.target.value)}
            disabled={people.length === 0}
          >
            <option value="">{people.length === 0 ? 'No connections yet' : 'Just me'}</option>
            {people.map(p => <option key={p.id} value={p.id}>@{p.username}</option>)}
          </select>
          {people.length === 0 && (
            <span className="pl-hint">Find people in the <Link to="/people" style={{ color: 'var(--accent)' }}>People</Link> tab</span>
          )}
          {loadingTheirs && <span className="pl-hint">Loading their calendar…</span>}
        </div>

        {/* Calendar */}
        <div className="cal">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => goToMonth(subMonths(month, 1))} aria-label="Previous month">‹</button>
            <h2 className="cal-title">{format(month, 'MMMM yyyy')}</h2>
            <button className="btn btn-ghost cal-today" onClick={() => goToMonth(startOfMonth(new Date()))}>Today</button>
            <button className="cal-nav" onClick={() => goToMonth(addMonths(month, 1))} aria-label="Next month">›</button>
          </div>

          <div className="cal-grid cal-weekdays">
            {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
          </div>

          <div className="cal-grid">
            {days.map(day => {
              const key = dayKey(day)
              const items = dayItems.get(key) || []
              const cls = [
                'cal-cell',
                !isSameMonth(day, month) && 'outside',
                isToday(day) && 'today',
                selectedDay && isSameDay(day, selectedDay) && 'selected'
              ].filter(Boolean).join(' ')
              return (
                <div
                  key={key}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDay(day)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDay(day) } }}
                >
                  <span className="cal-daynum">{format(day, 'd')}</span>
                  <div className="cal-chips">
                    {items.slice(0, 2).map(it => (
                      <button
                        key={it.ev.id}
                        className={`cal-chip ${it.kind} ${endOf(it.ev) < now ? 'past' : ''}`}
                        title={it.ev.title}
                        onClick={e => { e.stopPropagation(); openItem(it) }}
                      >
                        {isSameDay(startOf(it.ev), day) ? `${format(startOf(it.ev), 'h:mma').toLowerCase()} ` : ''}{it.ev.title}
                      </button>
                    ))}
                    {items.length > 2 && <span className="cal-more">+{items.length - 2} more</span>}
                  </div>
                  <div className="cal-dots">
                    {items.slice(0, 4).map(it => <span key={it.ev.id} className={`cal-dot ${it.kind}`} />)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="cal-legend">
            <span><i className="cal-dot mine" /> You're going</span>
            {friend && <span><i className="cal-dot theirs" /> @{friend.username} is going</span>}
            {friend && <span><i className="cal-dot shared" /> You're both going</span>}
          </div>
        </div>

        {/* Day detail */}
        <div className="pl-day-panel">
          {selectedDay ? (
            <>
              <h3>{format(selectedDay, 'EEEE, d MMMM')}</h3>
              {selectedItems.length === 0 ? (
                <p className="pl-hint" style={{ marginTop: 8 }}>
                  {friend ? 'Nothing planned for you or @' + friend.username + ' on this day' : 'Nothing planned for this day'}
                </p>
              ) : selectedItems.map(it => (
                <div key={it.ev.id} className="pl-day-row" onClick={() => openItem(it)}>
                  <i className={`cal-dot ${it.kind}`} />
                  <div className="pl-day-main">
                    <div className="pl-day-title">{it.ev.title}</div>
                    <div className="pl-day-sub">
                      {formatEventRange(it.ev.event_date, it.ev.event_end)}
                      {it.ev.groups ? ` · ${it.ev.groups.name}` : ''}
                    </div>
                    {it.kind === 'theirs' && (
                      <div className="pl-day-cta">
                        {it.ev.group_id && startOf(it.ev) > now
                          ? `Open ${it.ev.groups?.name || 'the group'} to say if you're going →`
                          : 'Open event →'}
                      </div>
                    )}
                  </div>
                  <span className={`pl-tag ${it.kind}`}>{kindLabel[it.kind]}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="pl-hint">Pick a day to see what's on</p>
          )}
        </div>

        {/* What the chosen connection is attending */}
        {friend && (
          <>
            <h2 className="pl-section-title">
              What @{friend.username} is going to <span className="pl-count">{upcomingTheirs.length}</span>
            </h2>
            {loadingTheirs ? null : upcomingTheirs.length === 0 ? (
              <p className="pl-hint">@{friend.username} isn't going to any upcoming events.</p>
            ) : upcomingTheirs.map(ev => {
              const youGoing = goingIds.has(ev.id)
              const youInterested = interested.some(e => e.id === ev.id)
              const viaGroup = ev.group_id && startOf(ev) > now
              return (
                <div key={ev.id} className="pl-card">
                  <EventLabels event={ev} />
                  <h3 className="event-title" onClick={() => openTheirEvent(ev)}>{ev.title}</h3>
                  <div className="event-meta">
                    <span><CalIcon /> {formatEventRange(ev.event_date, ev.event_end)}</span>
                    <span><PinIcon /> {ev.location_name}</span>
                  </div>
                  <div className="pl-card-footer">
                    <div className="pl-host">
                      {ev.groups ? (
                        <>
                          <GroupAvatar group={ev.groups} size={24} />
                          <span>{ev.groups.name}</span>
                        </>
                      ) : (
                        <>by {ev.profiles?.username || 'Unknown'}</>
                      )}
                    </div>
                    {youGoing
                      ? <span className="pl-tag shared">✓ You're going too</span>
                      : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          {youInterested && <span className="pl-tag interested">★ You're interested</span>}
                          <button className="attend-btn" onClick={() => openTheirEvent(ev)}>
                            {viaGroup ? 'View in group →' : 'View event →'}
                          </button>
                        </div>
                      )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* My plans */}
        <h2 className="pl-section-title">
          Going <span className="pl-count">{upcomingGoing.length}</span>
        </h2>
        {upcomingGoing.length === 0 ? (
          <p className="pl-hint">You're not going to anything yet. Browse the <Link to="/" style={{ color: 'var(--accent)' }}>Feed</Link> to find something.</p>
        ) : upcomingGoing.map(ev => (
          <PlannerCard key={ev.id} ev={ev} status="going" busy={busyId === ev.id} onChange={changeStatus} />
        ))}

        <h2 className="pl-section-title">
          Interested <span className="pl-count">{interested.filter(e => isUpcoming(e, now)).length}</span>
        </h2>
        {interested.filter(e => isUpcoming(e, now)).length === 0 ? (
          <p className="pl-hint">Events you mark as “Interested” will be kept here.</p>
        ) : interested.filter(e => isUpcoming(e, now)).map(ev => (
          <PlannerCard key={ev.id} ev={ev} status="interested" busy={busyId === ev.id} onChange={changeStatus} />
        ))}
      </div>
    </div>
  )
}
