'use client'

/**
 * /set-password?kind=invite|reset&token=… — the page an invite or reset link
 * opens. Checks the link first, then sets the password and signs the user in.
 */
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthShell, FormError, SubmitButton, linkStyle } from '../components/AuthShell'

const MIN = 10

function SetPasswordForm() {
  const params = useSearchParams()
  const kind = params.get('kind') === 'reset' ? 'reset' : 'invite'
  const token = params.get('token') || ''
  const router = useRouter()
  const [check, setCheck]       = useState({ state: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/auth/set-password?kind=${kind}&token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setCheck(d.valid ? { state: 'ok', email: d.email, name: d.name } : { state: 'bad', error: d.error }) })
      .catch(() => { if (!cancelled) setCheck({ state: 'bad', error: 'This link could not be checked. Try again shortly.' }) })
    return () => { cancelled = true }
  }, [kind, token])

  async function submit(e) {
    e.preventDefault()
    if (password.length < MIN) { setError(`Use at least ${MIN} characters.`); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, token, password }),
      })
      if (res.ok) { router.replace('/reports'); return }
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'The password could not be saved. Please try again.')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (check.state === 'checking') return <p role="status" style={{ color: 'var(--text-mute)', fontSize: 14 }}>Checking your link…</p>
  if (check.state === 'bad') {
    return (
      <>
        <FormError>{check.error}</FormError>
        <p style={{ fontSize: 13, margin: '16px 0 0' }}>
          <Link href="/forgot-password" style={linkStyle}>Request a new link</Link> · <Link href="/login" style={linkStyle}>Sign in</Link>
        </p>
      </>
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 16px' }}>
        {check.name ? `${check.name} — ` : ''}<strong>{check.email}</strong>
      </p>
      {/* A hidden username field lets password managers save the pair. */}
      <input type="email" autoComplete="username" value={check.email || ''} readOnly hidden />
      <label className="label" htmlFor="new-password">New password</label>
      <input id="new-password" className="field" type="password" value={password} autoFocus
        autoComplete="new-password" onChange={e => setPassword(e.target.value)} aria-describedby="password-help" />
      <p id="password-help" className="help">At least {MIN} characters. A short phrase is easier to remember than a jumble.</p>
      <label className="label" htmlFor="confirm-password" style={{ marginTop: 14 }}>Confirm password</label>
      <input id="confirm-password" className="field" type="password" value={confirm}
        autoComplete="new-password" onChange={e => setConfirm(e.target.value)} />
      <FormError>{error}</FormError>
      <SubmitButton loading={loading} disabled={!password || !confirm} loadingText="Saving…">
        {kind === 'invite' ? 'Create account ▸' : 'Save new password ▸'}
      </SubmitButton>
    </form>
  )
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordShell />
    </Suspense>
  )
}

function SetPasswordShell() {
  const invite = useSearchParams().get('kind') !== 'reset'
  return (
    <AuthShell
      eyebrow={invite ? 'Your invitation' : 'Password reset'}
      title={invite ? 'Set up your account' : 'Choose a new password'}
      intro={invite ? 'Choose a password to finish setting up your account. You will be signed in straight away.' : 'Choose a new password. Any other devices signed in to your account will be signed out.'}
    >
      <SetPasswordForm />
    </AuthShell>
  )
}
