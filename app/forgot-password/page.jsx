'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthShell, FormError, FormNote, SubmitButton, linkStyle } from '../components/AuthShell'
import { BRAND } from '@/lib/brand'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) setError(data.error || 'Too many requests. Please wait and try again.')
      else if (data.emailEnabled === false) setNote(`Password reset by email is not available yet. Contact the ${BRAND.name} team${BRAND.email ? ` at ${BRAND.email}` : ''} from the address your account uses and we will send you a reset link.`)
      else setNote('If that email has an account, a reset link is on its way. It works once and expires in one hour — check your junk folder if it has not arrived in a few minutes.')
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Password reset"
      title="Forgotten your password?"
      intro="Enter the email address your account uses and we will send you a link to choose a new password."
      footer={<p style={{ fontSize: 13, textAlign: 'center', margin: '18px 0 0' }}><Link href="/login" style={linkStyle}>Back to sign in</Link></p>}
    >
      {note ? <FormNote>{note}</FormNote> : (
        <form onSubmit={submit} noValidate>
          <label className="label" htmlFor="forgot-email">Email</label>
          <input id="forgot-email" className="field" type="email" value={email} autoFocus
            autoComplete="username" onChange={e => setEmail(e.target.value)} />
          <FormError>{error}</FormError>
          <SubmitButton loading={loading} disabled={!email.trim()} loadingText="Sending…">Send reset link ▸</SubmitButton>
        </form>
      )}
    </AuthShell>
  )
}
