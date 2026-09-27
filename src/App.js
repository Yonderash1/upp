import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Register from './pages/Register'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import EventDetail from './pages/EventDetail'
import Profile from './pages/Profile'
import People from './pages/People'
import Groups from './pages/Groups'
import CreateGroup from './pages/CreateGroup'
import GroupDetail from './pages/GroupDetail'
import GroupSettings from './pages/GroupSettings'
import Navbar from './components/Navbar'
import './App.css'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const [onboardingDone, setOnboardingDone] = useState(null)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('onboarding_complete').eq('id', user.id).single()
      .then(({ data }) => setOnboardingDone(data?.onboarding_complete ?? false))
  }, [user])

  if (loading || (user && onboardingDone === null)) return <div className="loading-screen"><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" />
  if (!onboardingDone) return <Navigate to="/onboarding" />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  return !user ? children : <Navigate to="/" />
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
        <Route path="/event/:id" element={<ProtectedRoute><EventDetail /></ProtectedRoute>} />
        <Route path="/profile/:id" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/people" element={<ProtectedRoute><People /></ProtectedRoute>} />
        <Route path="/groups" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/groups/create" element={<ProtectedRoute><CreateGroup /></ProtectedRoute>} />
        <Route path="/groups/:id" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
        <Route path="/groups/:id/settings" element={<ProtectedRoute><GroupSettings /></ProtectedRoute>} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}
