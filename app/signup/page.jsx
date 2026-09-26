'use client'

/**
 * /signup — create a free account (email, password, optional name). Any
 * reports made on this browser's free trial move into the account.
 */
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '../components/AuthShell'
import AccountForm, { ACCOUNT_COPY } from '../components/AccountForm'
import { safeNextPath } from '@/lib/safePath'

function SignupForm({ onModeChange }) {
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get('from'), '/reports')
  return <AccountForm idPrefix="signup" initialMode="signup" onModeChange={onModeChange} onSuccess={() => router.replace(next)} />
}

export default function SignupPage() {
  // The heading follows the form: "Welcome back" once it has switched to sign-in.
  const [mode, setMode] = useState('signup')
  const copy = ACCOUNT_COPY[mode]
  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} intro={copy.intro}>
      <Suspense fallback={<div style={{ color: 'var(--text-mute)' }}>Loading…</div>}>
        <SignupForm onModeChange={setMode} />
      </Suspense>
    </AuthShell>
  )
}
