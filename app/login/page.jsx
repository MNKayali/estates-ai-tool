'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '../components/AuthShell'
import AccountForm from '../components/AccountForm'
import { safeNextPath } from '@/lib/safePath'

function LoginForm() {
  const next = safeNextPath(useSearchParams().get('from'), '/reports')
  const router = useRouter()
  // The form can switch to "create account"; either way the destination is the same.
  return <AccountForm idPrefix="login" initialMode="login" onSuccess={() => router.replace(next)} />
}

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      intro="Sign in to start a new feasibility report or open one you have already created."
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
