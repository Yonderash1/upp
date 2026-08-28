import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [resendStatus, setResendStatus] = useState('') // 'sending' | 'sent' | 'error'
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setUnverified(false)
    setResendStatus('')
    setLoading(true)

    const { data, error } = await signIn(email, password)

    if (error) {
      // Supabase returns this message for unconfirmed accounts
      if (
        error.message.toLowerCase().includes('email not confirmed') ||
        error.message.toLowerCase().includes('not confirmed')
      ) {
        setUnverified(true)
      } else {
        setError(error.message)
      }
    } else if (data?.user) {
      navigate('/')
    }

    setLoading(false)
  }

  async function handleResend() {
    setResendStatus('sending')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: window.location.origin
      }
    })
    if (error) {
      setResendStatus('error')
    } else {
      setResendStatus('sent')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">Upp</div>
        <div className="auth-tagline">Find what's happening near you</div>
        <h2>Welcome back</h2>

        {error && <div className="error-msg">{error}</div>}

        {unverified && (
          <div style={{
            background: 'rgba(255,200,0,0.08)',
            border: '1px solid rgba(255,200,0,0.3)',
            color: '#ffd84d',
            padding: '14px 16px',
            borderRadius: '10px',
            fontSize: '14px',
            marginBottom: '18px',
            lineHeight: '1.6'
          }}>
            <strong>Email not verified.</strong> Please check your inbox and click the confirmation link.
            <div style={{ marginTop: 10 }}>
              {resendStatus === 'sent' ? (
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  ✓ Verification email sent — check your inbox
                </span>
              ) : resendStatus === 'error' ? (
                <span style={{ color: 'var(--accent)' }}>
                  Failed to send — please try again shortly
                </span>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendStatus === 'sending'}
                  style={{
                    background: 'rgba(255,200,0,0.15)',
                    border: '1px solid rgba(255,200,0,0.4)',
                    color: '#ffd84d',
                    borderRadius: '7px',
                    padding: '6px 14px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontFamily: 'Syne, sans-serif'
                  }}
                >
                  {resendStatus === 'sending' ? 'Sending...' : 'Resend verification email'}
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-switch">
          Don't have an account? <Link to="/register">Sign up</Link>
        </div>
      </div>
    </div>
  )
}
