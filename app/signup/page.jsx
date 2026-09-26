'use client'

/**
 * /signup — create a free account (email, password, optional name). Any
 * reports made on this browser's free trial move into the account.
 */
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthShell } from '../components/AuthShell'
import AccountForm from '../components/AccountForm'
import { safeNextPath } from '@/lib/safePath'

function SignupForm() {
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get('from'), '/reports')
  return <AccountForm idPrefix="signup" initialMode="signup" onSuccess={() => router.replace(next)} />
}

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Free account"
      title="Create your account"
      intro="Unlimited feasibility reports, PDF and Word downloads, and every report you create kept in one place. Reports you made on the free trial come with you."
    >
      <Suspense fallback={<div style={{ color: 'var(--text-mute)' }}>Loading…</div>}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  )
}
