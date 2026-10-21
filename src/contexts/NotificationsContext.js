import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Shares the unread count between the bell in the top bar and the notifications page.
const NotificationsContext = createContext({
  unreadCount: 0,
  version: 0,
  setUnreadCount: () => {},
  refreshUnread: () => {},
})

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const [unreadCount, setUnreadCount] = useState(0)
  const [version, setVersion] = useState(0)   // goes up whenever something changes, so an open page can reload

  const refreshUnread = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return }
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
    if (!error) setUnreadCount(count || 0)
  }, [userId])

  useEffect(() => {
    if (!userId) { setUnreadCount(0); return }
    refreshUnread()

    // Live updates…
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { refreshUnread(); setVersion(v => v + 1) })
      .subscribe()

    // …with a gentle fallback in case the live connection drops
    const timer = setInterval(refreshUnread, 60000)
    const onFocus = () => refreshUnread()
    window.addEventListener('focus', onFocus)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, refreshUnread])

  return (
    <NotificationsContext.Provider value={{ unreadCount, version, setUnreadCount, refreshUnread }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
