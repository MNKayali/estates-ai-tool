'use client'

/**
 * The sign-up dialog: the "sign up and everything opens" moment. Opened by the
 * questionnaire when the free trial is used up (the draft is kept, and the
 * report generates as soon as the account exists) and by the report page's
 * download buttons for a free-trial visitor. Switching the form to "sign in"
 * switches the heading too.
 *
 * Dialog semantics per CLAUDE.md "Accessibility patterns": role="dialog",
 * aria-modal, aria-labelledby, Escape closes, focus returns to the opener.
 */
import { useEffect, useRef, useState } from 'react'
import AccountForm from './AccountForm'

const SIGN_IN_INTRO = 'Sign in with your existing account. Anything you made on the free trial in this browser moves into it.'

export default function AuthDialog({ open, ...props }) {
  if (!open) return null
  // Mounted only while open, so each opening starts in the requested mode.
  return <OpenDialog {...props} />
}

function OpenDialog({ title, intro, onClose, onSuccess, initialMode = 'signup' }) {
  const returnFocus = useRef(null)
  const [mode, setMode] = useState(initialMode)

  useEffect(() => {
    returnFocus.current = document.activeElement
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocus.current?.focus?.()
    }
  }, [onClose])

  const signIn = mode === 'login'
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(14,27,46,.55)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title" className="card"
        style={{ width: '100%', maxWidth: 440, padding: '30px 28px', position: 'relative', background: 'var(--surface)' }}>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: 'var(--text-soft)', cursor: 'pointer', padding: 6 }}>×</button>
        <div className="eyebrow">{signIn ? 'Sign in' : 'Free account'}</div>
        <h2 id="auth-dialog-title" style={{ fontSize: 22, margin: '8px 0 6px', color: 'var(--ink)' }}>{signIn ? 'Sign in to your account' : title}</h2>
        {(signIn || intro) && <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 18px', lineHeight: 1.6 }}>{signIn ? SIGN_IN_INTRO : intro}</p>}
        <AccountForm idPrefix="dlg" initialMode={initialMode} onModeChange={setMode} onSuccess={onSuccess} />
      </div>
    </div>
  )
}
