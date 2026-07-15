import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { format } from 'date-fns'

export default function Profile() {
  const { id } = useParams()
  const [profile, setProfile] = useState(null)
  const [events, setEvents] = useState([])
  const [attending, setAttending] = useState([])
  const [loading, setLoading] = useState(true)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const isOwnProfile = user?.id === id

  useEffect(() => {
    fetchProfile()
    fetchUserEvents()
    fetchAttending()
  }, [id])

  async function fetchProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    setProfile(data)
    setLoading(false)
  }

  async function fetchUserEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', id)
      .order('event_date', { ascending: false })
    setEvents(data || [])
  }

  async function fetchAttending() {
    const { data } = await supabase
      .from('attendees')
      .select('events(*)')
      .eq('user_id', id)
    setAttending((data || []).map(a => a.events).filter(Boolean))
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!profile) return <div className="page"><div className="profile-page"><h2>User not found</h2></div></div>

  return (
    <div className="page">
      <div className="profile-page">
        <div className="profile-header">
          <div className="avatar-lg">
            {profile.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="profile-info">
            <h2>@{profile.username}</h2>
            <p>{profile.email}</p>
            <div className="profile-stats">
              <div className="stat">
                <div className="stat-num">{events.length}</div>
                <div className="stat-label">Posted</div>
              </div>
              <div className="stat">
                <div className="stat-num">{attending.length}</div>
                <div className="stat-label">Attending</div>
              </div>
            </div>
          </div>
        </div>

        {isOwnProfile && (
          <button
            className="btn btn-ghost"
            style={{ marginBottom: 28, fontSize: 14 }}
            onClick={async () => { await signOut(); navigate('/login') }}
          >
            Sign Out
          </button>
        )}

        <div style={{ marginBottom: 32 }}>
          <h3 className="section-title">Events Posted</h3>
          {events.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>No events posted yet</p>
            </div>
          ) : (
            events.map(event => (
              <div
                key={event.id}
                className="event-card"
                onClick={() => navigate(`/event/${event.id}`)}
              >
                <span className="event-category">{event.category}</span>
                <h3 className="event-title">{event.title}</h3>
                <div className="event-meta">
                  <span>{format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}</span>
                  <span>{event.location_name}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div>
          <h3 className="section-title">Events Attending</h3>
          {attending.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <p>Not attending any events yet</p>
            </div>
          ) : (
            attending.map(event => (
              <div
                key={event.id}
                className="event-card"
                onClick={() => navigate(`/event/${event.id}`)}
              >
                <span className="event-category">{event.category}</span>
                <h3 className="event-title">{event.title}</h3>
                <div className="event-meta">
                  <span>{format(new Date(event.event_date), 'EEE, MMM d · h:mm a')}</span>
                  <span>{event.location_name}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
