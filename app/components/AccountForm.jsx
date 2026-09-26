'use client'

/**
 * The create-account / sign-in form, shared by /signup, /login's alternative
 * and the AuthDialog (opened from the questionnaire at the free-trial limit and
 * from the report's download buttons). Either way the server moves this
 * browser's free-trial reports into the account (lib/trial.js).
 *
 * mode: 'signup' | 'login' — the form offers a link to switch, and tells the
 * page through onModeChange so its heading can follow (ACCOUNT_COPY).
 * onSuccess({ mode, claimed }) runs after the session cookie is set.
 */
import { useState } from 'react'
import Link from 'next/link'
import { FormError, SubmitButton, linkStyle } from './AuthShell'

const MIN = 10

/** The heading of a page built around this form, for each mode. */
export const ACCOUNT_COPY = {
  login: {
    eyebrow: 'Sign in',
    title: 'Welcome back',
    intro: 'Sign in to start a new feasibility report or open one you have already created.',
  },
  signup: {
    eyebrow: 'Free account',
    title: 'Create your account',
    intro: 'Unlimited feasibility reports, PDF and Word downloads, and every report you create kept in one place. Reports you made on the free trial come with you.',
  },
}

export default function AccountForm({ initialMode = 'signup', onSuccess, onModeChange, idPrefix = 'acct', autoFocus = true }) {
  const [mode, setMode]         = useState(initialMode)
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [accept, setAccept]     = useState(false)
  const [error, setError]       = useState('')
  const [field, setField]       = useState('')
  const [exists, setExists]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const signup = mode === 'signup'
  const id = s => `${idPrefix}-${s}`

  function switchMode(next) {
    setMode(next); setError(''); setField(''); setExists(false)
    onModeChange?.(next)
  }

  async function submit(e) {
    e.preventDefault()
    setError(''); setField(''); setExists(false)
    if (signup) {
      if (password.length < MIN) { setError(`Use at least ${MIN} characters for your password.`); setField('password'); return }
      if (!accept) { setError('Please accept the Terms and Privacy Notice to create an account.'); setField('acceptTerms'); return }
    }
    setLoading(true)
    try {
      const res = await fetch(signup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signup
          ? { email: email.trim(), password, name: name.trim(), acceptTerms: accept }
          : { email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { await onSuccess?.({ mode, claimed: data.claimed || 0 }); return }
      setError(data.error || (signup ? 'Your account could not be created. Please try again.' : 'Sign-in failed. Please try again.'))
      setField(data.field || (signup ? '' : 'password'))
      setExists(!!data.exists)
      if (!signup) setPassword('')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const bad = f => (field === f ? { borderColor: 'var(--danger)' } : undefined)

  return (
    <form onSubmit={submit} noValidate>
      {signup && (
        <>
          <label className="label" htmlFor={id('name')}>Name <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(optional)</span></label>
          <input id={id('name')} className="field" value={name} autoComplete="name" onChange={e => setName(e.target.value)} />
        </>
      )}
      <label className="label" htmlFor={id('email')} style={signup ? { marginTop: 14 } : undefined}>Email</label>
      <input id={id('email')} className="field" type="email" value={email} autoFocus={autoFocus}
        autoComplete={signup ? 'email' : 'username'} onChange={e => setEmail(e.target.value)} style={bad('email')} />
      <label className="label" htmlFor={id('password')} style={{ marginTop: 14 }}>Password</label>
      <input id={id('password')} className="field" type="password" value={password}
        autoComplete={signup ? 'new-password' : 'current-password'} onChange={e => setPassword(e.target.value)}
        aria-describedby={signup ? id('password-help') : undefined} style={bad('password')} />
      {signup && <p id={id('password-help')} className="help">At least {MIN} characters. A short phrase is easier to remember than a jumble.</p>}
      {signup && (
        <label htmlFor={id('accept')} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input id={id('accept')} type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--navy)', flex: 'none' }} />
          <span>
            I accept the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={linkStyle}>Terms of Use</a>
            {' '}and the{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={linkStyle}>Privacy Notice</a>
          </span>
        </label>
      )}
      <FormError>{error}</FormError>
      {exists && (
        <p style={{ fontSize: 13, margin: '6px 0 0' }}>
          <button type="button" onClick={() => switchMode('login')} style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>Sign in with this email</button>
        </p>
      )}
      <SubmitButton loading={loading} disabled={!email.trim() || !password} loadingText={signup ? 'Creating your account…' : 'Signing in…'}>
        {signup ? 'Create free account ▸' : 'Sign in ▸'}
      </SubmitButton>
      <p style={{ fontSize: 13, textAlign: 'center', margin: '16px 0 0', color: 'var(--text-soft)' }}>
        {signup ? 'Already have an account? ' : 'New here? '}
        <button type="button" onClick={() => switchMode(signup ? 'login' : 'signup')}
          style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}>
          {signup ? 'Sign in' : 'Create a free account'}
        </button>
        {!signup && <> · <Link href="/forgot-password" style={linkStyle}>Forgotten your password?</Link></>}
      </p>
    </form>
  )
}
