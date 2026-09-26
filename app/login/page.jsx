'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '../components/AuthShell'
import AccountForm, { ACCOUNT_COPY } from '../components/AccountForm'
import { safeNextPath } from '@/lib/safePath'

function LoginForm({ onModeChange }) {
  const next = safeNextPath(useSearchParams().get('from'), '/reports')
  const router = useRouter()
  // The form can switch to "create account"; either way the destination is the same.
  return <AccountForm idPrefix="login" initialMode="login" onModeChange={onModeChange} onSuccess={() => router.replace(next)} />
}

export default function LoginPage() {
  // The heading follows the form: "Create your account" once it has switched.
  const [mode, setMode] = useState('login')
  const copy = ACCOUNT_COPY[mode]
  return (
    <AuthShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      intro={copy.intro}
      footer={
        <p style={{ fontSize: 12, color: 'var(--text-mute)', textAlign: 'center', marginTop: 22, lineHeight: 1.6 }}>
          By {mode === 'login' ? 'signing in' : 'creating an account'} you agree to our{' '}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)' }}>Terms of Use</a>
          {' '}and acknowledge our{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--navy)' }}>Privacy Notice</a>.
        </p>
      }
    >
      <Suspense fallback={<div style={{ color: 'var(--text-mute)' }}>Loading…</div>}>
        <LoginForm onModeChange={setMode} />
      </Suspense>
    </AuthShell>
  )
}
