import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useMessages } from '../contexts/MessagesContext'
import UserAvatar from './UserAvatar'
import ConfirmDialog from './ConfirmDialog'

const PAGE_SIZE = 50

function dayLabel(date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE d MMMM')
}

// The right-hand side of the messages page: one conversation with one person
export default function ChatPanel({ meId, other, onBack, onChanged, onBlocked }) {
  const { onMessage, refreshUnread } = useMessages()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  // open | request | pending | incoming | none | blocked | you_blocked  (null until checked)
  const [convState, setConvState] = useState(null)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const stickRef = useRef(true)        // stay glued to the newest message unless they scrolled up
  const prependRef = useRef(null)      // scroll height before older messages were added
  const onChangedRef = useRef(onChanged)
  useEffect(() => { onChangedRef.current = onChanged }, [onChanged])

  const otherId = other.id
  const pairFilter = `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`

  const markRead = useCallback(async () => {
    await supabase.rpc('mark_conversation_read', { other_user: otherId })
    refreshUnread()
    if (onChangedRef.current) onChangedRef.current()
  }, [otherId, refreshUnread])

  const addMessage = useCallback((msg) => {
    setMessages(list => (list.some(m => m.id === msg.id) ? list : [...list, msg]))
  }, [])

  // Can we chat freely, or is this a message request? (decided by the database)
  const loadState = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('conversation_state', { p_other: otherId })
    if (!err && data) setConvState(data)
  }, [otherId])

  useEffect(() => { setConvState(null); loadState() }, [loadState])

  // While waiting on a request, quietly check whether it has been accepted
  useEffect(() => {
    if (convState !== 'pending') return
    const timer = setInterval(loadState, 20000)
    window.addEventListener('focus', loadState)
    return () => { clearInterval(timer); window.removeEventListener('focus', loadState) }
  }, [convState, loadState])

  // Load the conversation when it's opened
  useEffect(() => {
    let cancelled = false
    stickRef.current = true
    setLoading(true)
    setMessages([])
    setError('')
    supabase.from('messages').select('*').or(pairFilter)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        const rows = data || []
        setHasMore(rows.length > PAGE_SIZE)
        const list = rows.slice(0, PAGE_SIZE).reverse()
        setMessages(list)
        setLoading(false)
        if (list.some(m => m.recipient_id === meId && !m.read_at)) markRead()
      })
    return () => { cancelled = true }
  }, [pairFilter, meId, markRead, reloadKey])

  // New messages for this conversation arrive live
  useEffect(() => {
    return onMessage((row) => {
      const mine = row.sender_id === meId && row.recipient_id === otherId
      const theirs = row.sender_id === otherId && row.recipient_id === meId
      if (!mine && !theirs) return
      addMessage(row)
      if (theirs) markRead()
      loadState()
    })
  }, [onMessage, meId, otherId, addMessage, markRead, loadState])

  // Scrolling: keep the view at the bottom for new messages, or hold position when older ones load
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (prependRef.current != null) {
      el.scrollTop = el.scrollHeight - prependRef.current
      prependRef.current = null
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, loading])

  function handleScroll() {
    const el = listRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function loadEarlier() {
    const oldest = messages[0]
    if (!oldest) return
    const { data, error: err } = await supabase.from('messages').select('*').or(pairFilter)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1)
    if (err) { setError(err.message); return }
    const rows = data || []
    setHasMore(rows.length > PAGE_SIZE)
    prependRef.current = listRef.current ? listRef.current.scrollHeight : 0
    setMessages(list => [...rows.slice(0, PAGE_SIZE).reverse(), ...list])
  }

  async function send() {
    const body = text.trim()
    if (!body || sending || !canSend) return
    setSending(true)
    setText('')
    setError('')
    stickRef.current = true
    if (inputRef.current) inputRef.current.style.height = 'auto'
    const { data, error: err } = await supabase.from('messages')
      .insert({ sender_id: meId, recipient_id: otherId, body })
      .select().single()
    if (err) {
      setText(body)
      setError('Could not send your message: ' + err.message)
    } else {
      addMessage(data)
      if (onChangedRef.current) onChangedRef.current()
    }
    loadState()
    setSending(false)
    if (inputRef.current) inputRef.current.focus()
  }

  async function acceptRequest() {
    setError('')
    const { error: err } = await supabase.rpc('accept_message_request', { p_sender: otherId })
    if (err) { setError(err.message); return }
    setReloadKey(k => k + 1)
    await loadState()
    refreshUnread()
    if (onChangedRef.current) onChangedRef.current()
  }

  async function unblock() {
    setError('')
    const { error: err } = await supabase.from('user_blocks').delete().eq('blocker_id', meId).eq('blocked_id', otherId)
    if (err) { setError(err.message); return }
    await loadState()
    if (onChangedRef.current) onChangedRef.current()
  }

  async function blockUser() {
    const { error: err } = await supabase.rpc('block_user', { p_user: otherId })
    if (err) return err.message          // ConfirmDialog shows this and stays open
    if (onBlocked) onBlocked()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  function handleInput(e) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const canSend = convState === 'open' || convState === 'request'
  const blockedByThem = convState === 'blocked' || convState === 'none'

  // Messages, with a small date heading wherever the day changes
  let lastDay = null
  const items = messages.map(m => {
    const date = new Date(m.created_at)
    const dayKey = format(date, 'yyyy-MM-dd')
    const heading = dayKey !== lastDay ? <div className="chat-day" key={`d-${m.id}`}><span>{dayLabel(date)}</span></div> : null
    lastDay = dayKey
    const mine = m.sender_id === meId
    return [
      heading,
      <div key={m.id} className={`chat-row ${mine ? 'mine' : 'theirs'}`}>
        <div className="chat-bubble">
          <div className="chat-text">{m.body}</div>
          <div className="chat-time">{format(date, 'HH:mm')}</div>
        </div>
      </div>,
    ]
  })

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <button type="button" className="chat-back" onClick={onBack} aria-label="Back to conversations">‹</button>
        <Link to={`/profile/${otherId}`} className="chat-header-user">
          <UserAvatar profile={other} size={38} />
          <div>
            <div className="chat-header-name">@{other.username}</div>
            <div className="chat-header-sub">View profile</div>
          </div>
        </Link>
        {convState !== 'you_blocked' && (
          <button type="button" className="chat-block-btn" onClick={() => setConfirmBlock(true)}>🚫 Block</button>
        )}
      </div>

      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {loading ? (
          <div className="chat-center"><div className="spinner" /></div>
        ) : (
          <>
            {hasMore && (
              <button type="button" className="chat-load-more" onClick={loadEarlier}>Load earlier messages</button>
            )}
            {messages.length === 0 ? (
              convState === 'incoming' ? (
                <div className="chat-center chat-empty">
                  <h3>@{other.username} wants to message you</h3>
                  <p>Accept their request to read what they sent.</p>
                </div>
              ) : (
                <div className="chat-center chat-empty">
                  <h3>Say hello to @{other.username}</h3>
                  <p>This is the start of your conversation.</p>
                </div>
              )
            ) : items}
          </>
        )}
      </div>

      {error && <div className="error-msg chat-error">{error}</div>}

      {convState === 'request' && (
        <div className="chat-notice">
          ✉️ @{other.username} will need to accept your message request before they can view this message.
        </div>
      )}
      {convState === 'pending' && (
        <div className="chat-notice">
          ⏳ Your message request has been sent. You can keep chatting once @{other.username} accepts it.
        </div>
      )}
      {convState === 'incoming' && (
        <div className="chat-notice action">
          <span>@{other.username} would like to message you.</span>
          <div className="chat-notice-buttons">
            <button type="button" className="attend-btn" onClick={acceptRequest}>Accept</button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => setConfirmBlock(true)}>Block</button>
          </div>
        </div>
      )}
      {blockedByThem && (
        <div className="chat-notice">🚫 @{other.username} isn’t accepting messages from you.</div>
      )}
      {convState === 'you_blocked' && (
        <div className="chat-notice action">
          <span>You’ve blocked @{other.username}.</span>
          <div className="chat-notice-buttons">
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={unblock}>Unblock</button>
          </div>
        </div>
      )}

      {canSend && (
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={2000}
            placeholder={`Message @${other.username}`}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="chat-send" onClick={send} disabled={!text.trim() || sending} aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      )}

      {confirmBlock && (
        <ConfirmDialog
          title={`Block @${other.username}?`}
          confirmLabel="Block"
          danger
          onConfirm={blockUser}
          onCancel={() => setConfirmBlock(false)}
        >
          Are you sure? They won’t be able to message you or send you connection requests, and any connection between you will be removed.
          You can unblock them later from the Blocked tab on your profile.
        </ConfirmDialog>
      )}
    </div>
  )
}
