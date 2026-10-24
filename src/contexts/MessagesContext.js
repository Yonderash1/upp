import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Shares the unread-message count between the top bar and the messages page,
// and lets an open chat hear about new messages the moment they arrive.
const MessagesContext = createContext({
  unreadCount: 0,
  version: 0,
  refreshUnread: () => {},
  onMessage: () => () => {},
})

export function MessagesProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const [unreadCount, setUnreadCount] = useState(0)
  const [version, setVersion] = useState(0)     // goes up whenever a message is sent or received
  const listeners = useRef(new Set())

  const refreshUnread = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return }
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null)
    if (!error) setUnreadCount(count || 0)
  }, [userId])

  // An open chat calls this to be handed every new message row; returns an unsubscribe function
  const onMessage = useCallback((fn) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  useEffect(() => {
    if (!userId) { setUnreadCount(0); return }
    refreshUnread()

    const handle = (payload) => {
      const row = payload.new
      listeners.current.forEach(fn => fn(row))
      if (row.recipient_id === userId) refreshUnread()
      setVersion(v => v + 1)
    }

    const channel = supabase
      .channel(`messages-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` }, handle)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` }, handle)
      .subscribe()

    // Gentle fallback in case the live connection drops
    const timer = setInterval(refreshUnread, 60000)
    const onFocus = () => { refreshUnread(); setVersion(v => v + 1) }
    window.addEventListener('focus', onFocus)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, refreshUnread])

  return (
    <MessagesContext.Provider value={{ unreadCount, version, refreshUnread, onMessage }}>
      {children}
    </MessagesContext.Provider>
  )
}

export function useMessages() {
  return useContext(MessagesContext)
}
