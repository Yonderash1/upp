import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const MapIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
    <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
)
const GroupsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
    <path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
)
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const initial = user?.user_metadata?.username?.[0]?.toUpperCase() ||
                  user?.email?.[0]?.toUpperCase() || 'U'

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="nav-logo">Upp</Link>

      <div className="nav-links">
        <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
          <HomeIcon />
          Feed
        </Link>
        <Link to="/map" className={`nav-link ${location.pathname === '/map' ? 'active' : ''}`}>
          <MapIcon />
          Map
        </Link>
        <Link to="/groups" className={`nav-link ${isActive('/groups') ? 'active' : ''}`}>
          <GroupsIcon />
          Groups
        </Link>
        <Link to="/create" className={`nav-link ${location.pathname === '/create' ? 'active' : ''}`}>
          <PlusIcon />
          Post
        </Link>
      </div>

      <div className="nav-right">
        <div
          className="avatar-sm"
          onClick={() => navigate(`/profile/${user?.id}`)}
          title="My Profile"
        >
          {initial}
        </div>
        <button
          className="btn btn-ghost"
          style={{ padding: '7px 14px', fontSize: '13px' }}
          onClick={handleSignOut}
        >
          Out
        </button>
      </div>
    </nav>
  )
}
