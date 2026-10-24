import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useMessages } from '../contexts/MessagesContext'
import ChatPanel from '../components/ChatPanel'
import UserAvatar from '../components/UserAvatar'

function listTime(iso) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'd MMM')
}

export default function Messages() {
  const { otherId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { version } = useMessages()

  const [conversations, setConversations] = useState([])
  const [contacts, setContacts] = useState([])
  const [query, setQuery] = useState('')
  const [activeProfile, setActiveProfile] = useState(null)
  const [activeMissing, setActiveMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Can't message yourself
  useEffect(() => {
    if (otherId === user.id) navigate('/messages', { replace: true })
  }, [otherId, user.id, navigate])

  // The left-hand list of previous chats, reloaded whenever a message is sent or received
  const loadConversations = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('my_conversations')
    if (err) { setError(err.message); setLoading(false); return }
    setConversations(data || [])
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations, version])

  // Current contacts (accepted connections), for starting new chats
  useEffect(() => {
    supabase.from('connections')
      .select('id, from_user, to_user, from_profile:from_user(id, username, avatar_url), to_profile:to_user(id, username, avatar_url)')
      .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
      .eq('status', 'accepted')
      .then(({ data }) => {
        const people = (data || [])
          .map(c => (c.from_user === user.id ? c.to_profile : c.from_profile))
          .filter(Boolean)
          .sort((a, b) => a.username.localeCompare(b.username))
        setContacts(people)
      })
  }, [user.id])

  // Whoever's chat is open (also covers someone you haven't messaged yet)
  useEffect(() => {
    setActiveMissing(false)
    if (!otherId || otherId === user.id) { setActiveProfile(null); return }
    let cancelled = false
    supabase.from('profiles').select('id, username, avatar_url').eq('id', otherId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setActiveProfile(data || null)
        setActiveMissing(!data)
      })
    return () => { cancelled = true }
  }, [otherId, user.id])

  function openChat(id) {
    setQuery('')
    navigate(`/messages/${id}`)
  }

  const q = query.trim().toLowerCase()
  const convoIds = useMemo(() => new Set(conversations.map(c => c.other_id)), [conversations])

  const shownConversations = useMemo(
    () => (q ? conversations.filter(c => c.username.toLowerCase().includes(q)) : conversations),
    [conversations, q]
  )

  // Contacts: while searching, those matching who aren't already listed above;
  // with no chats yet, all of them so there's an easy way to start
  const shownContacts = useMemo(() => {
    if (q) return contacts.filter(c => c.username.toLowerCase().includes(q) && !shownConversations.some(s => s.other_id === c.id))
    if (conversations.length === 0) return contacts
    return []
  }, [contacts, conversations.length, shownConversations, q])

  // A chat opened from a profile that has no messages yet still appears at the top of the list
  const activeReady = activeProfile && activeProfile.id === otherId
  const showDraft = !q && activeReady && !convoIds.has(activeProfile.id)

  function renderConversation(c) {
    const active = c.other_id === otherId
    const unread = Number(c.unread_count) || 0
    const preview = (c.last_sender_id === user.id ? 'You: ' : '') + c.last_body
    return (
      <button type="button" key={c.other_id} className={`msg-item ${active ? 'active' : ''}`} onClick={() => openChat(c.other_id)}>
        <UserAvatar profile={{ username: c.username, avatar_url: c.avatar_url }} size={44} />
        <div className="msg-item-body">
          <div className="msg-item-top">
            <span className="msg-item-name">@{c.username}</span>
            <span className="msg-item-time">{listTime(c.last_at)}</span>
          </div>
          <div className="msg-item-bottom">
            <span className={`msg-item-preview ${unread > 0 && !active ? 'unread' : ''}`}>{preview}</span>
            {unread > 0 && !active && <span className="msg-unread">{unread > 99 ? '99+' : unread}</span>}
          </div>
        </div>
      </button>
    )
  }

  function renderContact(p) {
    return (
      <button type="button" key={p.id} className={`msg-item ${p.id === otherId ? 'active' : ''}`} onClick={() => openChat(p.id)}>
        <UserAvatar profile={p} size={44} />
        <div className="msg-item-body">
          <div className="msg-item-name">@{p.username}</div>
          <div className="msg-item-preview">Start a conversation</div>
        </div>
      </button>
    )
  }

  const nothingToShow = !showDraft && shownConversations.length === 0 && shownContacts.length === 0

  return (
    <div className="page messages-wrap">
      <div className={`msg-layout ${otherId ? 'has-chat' : ''}`}>
        {/* ── Left: search + previous chats ── */}
        <aside className="msg-sidebar">
          <div className="msg-sidebar-head">
            <h2>Messages</h2>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search chats and contacts"
              aria-label="Search chats and contacts"
            />
          </div>

          <div className="msg-list">
            {error && <div className="error-msg" style={{ margin: 12 }}>{error}</div>}
            {loading ? (
              <div className="chat-center"><div className="spinner" /></div>
            ) : (
              <>
                {showDraft && (
                  <button type="button" className="msg-item active" onClick={() => openChat(activeProfile.id)}>
                    <UserAvatar profile={activeProfile} size={44} />
                    <div className="msg-item-body">
                      <div className="msg-item-name">@{activeProfile.username}</div>
                      <div className="msg-item-preview">New conversation</div>
                    </div>
                  </button>
                )}

                {shownConversations.length > 0 && (
                  <>
                    {q && <h3 className="msg-section">Chats</h3>}
                    {shownConversations.map(renderConversation)}
                  </>
                )}

                {shownContacts.length > 0 && (
                  <>
                    <h3 className="msg-section">{q ? 'Contacts' : 'Your contacts'}</h3>
                    {shownContacts.map(renderContact)}
                  </>
                )}

                {nothingToShow && !error && (
                  <div className="msg-empty">
                    {q
                      ? <p>No chats or contacts match “{query.trim()}”.</p>
                      : <><h3>No messages yet</h3><p>Open someone’s profile and tap Message, or connect with people to build your contacts.</p></>}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Right: the open chat ── */}
        <section className="msg-chat-pane">
          {otherId && activeReady ? (
            <ChatPanel
              key={activeProfile.id}
              meId={user.id}
              other={activeProfile}
              onBack={() => navigate('/messages')}
              onChanged={loadConversations}
            />
          ) : otherId && activeMissing ? (
            <div className="chat-center chat-empty">
              <h3>User not found</h3>
              <p>That profile doesn’t exist any more.</p>
            </div>
          ) : otherId ? (
            <div className="chat-center"><div className="spinner" /></div>
          ) : (
            <div className="chat-center chat-empty">
              <h3>Your messages</h3>
              <p>Pick a conversation on the left, or search for a contact to start a new one.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
