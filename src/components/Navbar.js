import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useNotifications } from '../contexts/NotificationsContext'
import { useMessages } from '../contexts/MessagesContext'

const HomeIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const MapIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
const GroupsIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
const PeopleIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const BellIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
const MessageIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
const ProfileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const { unreadCount } = useNotifications()
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount)
  const { unreadCount: msgUnread } = useMessages()
  const msgLabel = msgUnread > 99 ? '99+' : String(msgUnread)

  const initial = user?.user_metadata?.username?.[0]?.toUpperCase() ||
                  user?.email?.[0]?.toUpperCase() || 'U'

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/')

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url) })
    supabase.from('connections').select('id').eq('to_user', user.id).eq('status', 'pending')
      .then(({ data }) => setPendingCount((data || []).length))
  }, [user])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('avatar_url').eq('id', user.id).single()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url) })
  }, [location.pathname, user])

  async function handleSignOut() { await signOut(); navigate('/login') }

  const navItems = [
    { path: '/', label: 'Feed', icon: <HomeIcon />, exact: true },
    { path: '/map', label: 'Map', icon: <MapIcon /> },
    { path: '/groups', label: 'Groups', icon: <GroupsIcon /> },
    { path: '/people', label: 'People', icon: <PeopleIcon /> },
    { path: '/messages', label: 'Chat', icon: <MessageIcon />, msgBadge: true },
    { path: '/notifications', label: 'Alerts', icon: <BellIcon />, badge: true },
    { path: `/profile/${user?.id}`, label: 'Me', icon: <ProfileIcon />, isProfile: true },
  ]

  function itemActive(item) {
    if (item.exact) return location.pathname === item.path
    if (item.isProfile) return location.pathname === item.path
    return isActive(item.path)
  }

  return (
    <>
      {/* ── Desktop top nav ── */}
      <nav className="navbar">
        <Link to="/" className="nav-logo">Upp</Link>

        <div className="nav-links">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
            <HomeIcon />Feed
          </Link>
          <Link to="/map" className={`nav-link ${location.pathname === '/map' ? 'active' : ''}`}>
            <MapIcon />Map
          </Link>
          <Link to="/groups" className={`nav-link ${isActive('/groups') ? 'active' : ''}`}>
            <GroupsIcon />Groups
          </Link>
          <Link to="/people" className={`nav-link ${location.pathname === '/people' ? 'active' : ''}`}>
            <PeopleIcon />People
          </Link>
        </div>

        <div className="nav-right">
          <Link
            to="/messages"
            className={`nav-bell ${isActive('/messages') ? 'active' : ''}`}
            aria-label={msgUnread > 0 ? `Messages, ${msgLabel} unread` : 'Messages'}
            title="Messages"
          >
            <MessageIcon />
            {msgUnread > 0 && <span className="notif-badge">{msgLabel}</span>}
          </Link>
          <Link
            to="/notifications"
            className={`nav-bell ${isActive('/notifications') ? 'active' : ''}`}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadLabel} new` : 'Notifications'}
            title="Notifications"
          >
            <BellIcon />
            {unreadCount > 0 && <span className="notif-badge">{unreadLabel}</span>}
          </Link>
          <div
            onClick={() => navigate(`/profile/${user?.id}`)}
            style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
          >
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div className="avatar-sm">{initial}</div>
            }
            {pendingCount > 0 && (
              <div style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, background: 'var(--accent)', borderRadius: '50%', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                {pendingCount}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: '13px' }} onClick={handleSignOut}>
            Out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom nav ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`bottom-nav-link ${itemActive(item) ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <div style={{ position: 'relative' }}>
                {item.isProfile ? (
                  avatarUrl
                    ? <img src={avatarUrl} alt="me" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: itemActive(item) ? '2px solid var(--accent)' : '2px solid var(--border)' }} />
                    : item.icon
                ) : item.icon}
                {item.badge && unreadCount > 0 && (
                  <span className="notif-badge">{unreadLabel}</span>
                )}
                {item.msgBadge && msgUnread > 0 && (
                  <span className="notif-badge">{msgLabel}</span>
                )}
                {item.isProfile && pendingCount > 0 && (
                  <div style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, background: 'var(--accent)', borderRadius: '50%', border: '1.5px solid var(--bg)' }} />
                )}
              </div>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
