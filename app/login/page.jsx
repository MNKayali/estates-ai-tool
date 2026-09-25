'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthShell, FormError, SubmitButton, linkStyle } from '../components/AuthShell'
import { safeNextPath } from '@/lib/safePath'

function LoginForm() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const next = safeNextPath(useSearchParams().get('from'), '/reports')
  const router = useRouter()

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (res.ok) { router.replace(next); return }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Sign-in failed. Please try again.')
      setPassword('')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label className="label" htmlFor="login-email">Email</label>
      <input id="login-email" className="field" type="email" value={email} autoFocus
        autoComplete="username" onChange={e => setEmail(e.target.value)} />
      <label className="label" htmlFor="login-password" style={{ marginTop: 14 }}>Password</label>
      <input id="login-password" className="field" type="password" value={password}
        autoComplete="current-password" onChange={e => setPassword(e.target.value)}
        style={{ borderColor: error ? 'var(--danger)' : undefined }} />
      <FormError>{error}</FormError>
      <SubmitButton loading={loading} disabled={!email.trim() || !password} loadingText="Signing in…">Sign in ▸</SubmitButton>
      <p style={{ fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>
        <Link href="/forgot-password" style={linkStyle}>Forgotten your password?</Link>
      </p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      intro="Sign in to start a new feasibility report or open one you have already created. Accounts are by invitation."
      footer={
        <p style={{ fontSize: 12, color: 'var(--text-mute)', textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
          By signing in you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)' }}>Terms of Use</a>
          {' '}and acknowledge our{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)' }}>Privacy Notice</a>.
        </p>
      }
    >
      <Suspense fallback={<div style={{ color: 'var(--text-mute)' }}>Loading…</div>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
