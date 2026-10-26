import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, isToday, isYesterday } from 'date-fns'
import { supabase } from '../lib/supabase'
import UserAvatar from './UserAvatar'

const PAGE_SIZE = 50
const SELECT = '*, sender:sender_id(id, username, avatar_url)'

function dayLabel(date) {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE d MMMM')
}

// One group chat channel.
//   access      = { view, read, send, manage } for the current person
//   memberRoles = user id -> role row (for name colours and the "can I moderate them?" check)
export default function GroupChannel({ channel, userId, myRole, access, memberRoles }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const listRef = useRef(null)
  const inputRef = useRef(null)
  const stickRef = useRef(true)
  const prependRef = useRef(null)

  const addMessage = useCallback(msg => {
    setMessages(list => (list.some(m => m.id === msg.id) ? list : [...list, msg]))
  }, [])

  // Load the channel when it's opened
  useEffect(() => {
    let cancelled = false
    stickRef.current = true
    setMessages([]); setError(''); setEditingId(null)
    if (!access.read) { setLoading(false); setHasMore(false); return }
    setLoading(true)
    supabase.from('group_messages').select(SELECT).eq('channel_id', channel.id)
      .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) { setError(err.message); setLoading(false); return }
        const rows = data || []
        setHasMore(rows.length > PAGE_SIZE)
        setMessages(rows.slice(0, PAGE_SIZE).reverse())
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [channel.id, access.read])

  // Live updates
  useEffect(() => {
    if (!access.read) return
    const sub = supabase.channel(`group-channel-${channel.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `channel_id=eq.${channel.id}` },
        async payload => {
          const { data } = await supabase.from('group_messages').select(SELECT).eq('id', payload.new.id).maybeSingle()
          if (data) addMessage(data)
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `channel_id=eq.${channel.id}` },
        payload => setMessages(list => list.map(m => (m.id === payload.new.id ? { ...m, body: payload.new.body, edited_at: payload.new.edited_at } : m))))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_messages' },
        payload => setMessages(list => list.filter(m => m.id !== payload.old.id)))
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [channel.id, access.read, addMessage])

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
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function loadEarlier() {
    const oldest = messages[0]
    if (!oldest) return
    const { data, error: err } = await supabase.from('group_messages').select(SELECT).eq('channel_id', channel.id)
      .lt('created_at', oldest.created_at).order('created_at', { ascending: false }).limit(PAGE_SIZE + 1)
    if (err) { setError(err.message); return }
    const rows = data || []
    setHasMore(rows.length > PAGE_SIZE)
    prependRef.current = listRef.current ? listRef.current.scrollHeight : 0
    setMessages(list => [...rows.slice(0, PAGE_SIZE).reverse(), ...list])
  }

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setText(''); setError(''); stickRef.current = true
    if (inputRef.current) inputRef.current.style.height = 'auto'
    const { data, error: err } = await supabase.from('group_messages')
      .insert({ channel_id: channel.id, sender_id: userId, body }).select(SELECT).single()
    if (err) { setText(body); setError('Could not send your message: ' + err.message) }
    else addMessage(data)
    setSending(false)
    if (inputRef.current) inputRef.current.focus()
  }

  async function saveEdit(id) {
    const body = editText.trim()
    if (!body) return
    const { data, error: err } = await supabase.from('group_messages').update({ body }).eq('id', id).select('id, body, edited_at')
    if (err || !data || data.length === 0) { setError(err?.message || "You don't have permission to edit that message"); return }
    setMessages(list => list.map(m => (m.id === id ? { ...m, body: data[0].body, edited_at: data[0].edited_at } : m)))
    setEditingId(null)
  }

  async function remove(id) {
    if (!window.confirm('Delete this message?')) return
    const { data, error: err } = await supabase.from('group_messages').delete().eq('id', id).select('id')
    if (err || !data || data.length === 0) { setError(err?.message || "You don't have permission to delete that message"); return }
    setMessages(list => list.filter(m => m.id !== id))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
  }
  function handleInput(e) {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // Can I edit/delete someone else's message? Needs the channel's moderation access AND a higher role than theirs.
  function canModerate(m) {
    if (!access.manage || m.sender_id === userId) return false
    const theirs = memberRoles[m.sender_id]
    return myRole?.is_owner || !theirs || myRole.rank < theirs.rank
  }

  let lastDay = null
  let lastSender = null
  let lastTime = 0
  const items = messages.map(m => {
    const date = new Date(m.created_at)
    const dayKey = format(date, 'yyyy-MM-dd')
    const newDay = dayKey !== lastDay
    const compact = !newDay && lastSender === m.sender_id && date - lastTime < 5 * 60 * 1000
    lastDay = dayKey; lastSender = m.sender_id; lastTime = +date

    const mine = m.sender_id === userId
    const role = memberRoles[m.sender_id]
    const canEdit = mine ? access.send : canModerate(m)
    const canDelete = mine ? access.read : canModerate(m)
    const name = m.sender?.username ? `@${m.sender.username}` : 'Deleted user'

    return (
      <div key={m.id}>
        {newDay && <div className="chat-day"><span>{dayLabel(date)}</span></div>}
        <div className={`gc-msg ${compact ? 'compact' : ''}`}>
          <div className="gc-avatar">{!compact && <UserAvatar profile={m.sender} size={36} />}</div>
          <div className="gc-body">
            {!compact && (
              <div className="gc-head">
                {m.sender
                  ? <Link to={`/profile/${m.sender.id}`} className="gc-name" style={{ color: role?.color }}>{name}</Link>
                  : <span className="gc-name" style={{ color: 'var(--muted)' }}>{name}</span>}
                <span className="gc-time">{format(date, 'HH:mm')}</span>
              </div>
            )}
            {editingId === m.id ? (
              <div className="gc-edit">
                <textarea value={editText} maxLength={2000} rows={2} autoFocus onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id) }
                    if (e.key === 'Escape') setEditingId(null)
                  }} />
                <div className="gc-edit-actions">
                  <button type="button" className="btn btn-primary" onClick={() => saveEdit(m.id)}>Save</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="chat-text">
                {m.body}{m.edited_at && <span className="gc-edited"> (edited)</span>}
              </div>
            )}
          </div>
          {editingId !== m.id && (canEdit || canDelete) && (
            <div className="gc-actions">
              {canEdit && <button title="Edit message" onClick={() => { setEditingId(m.id); setEditText(m.body) }}>✏</button>}
              {canDelete && <button title="Delete message" className="danger" onClick={() => remove(m.id)}>🗑</button>}
            </div>
          )}
        </div>
      </div>
    )
  })

  return (
    <div className="gc-panel">
      <div className="gc-header">
        <span className="gc-hash">#</span>
        <h3>{channel.name}</h3>
      </div>

      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {!access.read ? (
          <div className="chat-center chat-empty">
            <h3>🔒 You can't read this channel</h3>
            <p>Your role doesn't have access to the messages here.</p>
          </div>
        ) : loading ? (
          <div className="chat-center"><div className="spinner" /></div>
        ) : (
          <>
            {hasMore && <button type="button" className="chat-load-more" onClick={loadEarlier}>Load earlier messages</button>}
            {messages.length === 0
              ? <div className="chat-center chat-empty"><h3>Welcome to #{channel.name}</h3><p>This is the start of the channel.</p></div>
              : items}
          </>
        )}
      </div>

      {error && <div className="error-msg chat-error">{error}</div>}

      {access.read && (access.send ? (
        <div className="chat-input-row">
          <textarea ref={inputRef} rows={1} value={text} maxLength={2000}
            placeholder={`Message #${channel.name}`} onChange={handleInput} onKeyDown={handleKeyDown} />
          <button type="button" className="chat-send" onClick={send} disabled={!text.trim() || sending} aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      ) : (
        <div className="gc-readonly">You don't have permission to send messages in this channel</div>
      ))}
    </div>
  )
}
