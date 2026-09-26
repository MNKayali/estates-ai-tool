'use client'

/**
 * The sign-up dialog: the "sign up and everything opens" moment. Opened by the
 * questionnaire when the free trial is used up (the draft is kept, and the
 * report generates as soon as the account exists) and by the report page's
 * download buttons for a free-trial visitor.
 *
 * Dialog semantics per CLAUDE.md "Accessibility patterns": role="dialog",
 * aria-modal, aria-labelledby, Escape closes, focus returns to the opener.
 */
import { useEffect, useRef } from 'react'
import AccountForm from './AccountForm'

export default function AuthDialog({ open, title, intro, onClose, onSuccess, initialMode = 'signup' }) {
  const returnFocus = useRef(null)

  useEffect(() => {
    if (!open) return
    returnFocus.current = document.activeElement
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      returnFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(14,27,46,.55)', display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title" className="card"
        style={{ width: '100%', maxWidth: 440, padding: '30px 28px', position: 'relative', background: 'var(--surface)' }}>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', fontSize: 22, lineHeight: 1, color: 'var(--text-soft)', cursor: 'pointer', padding: 6 }}>×</button>
        <div className="eyebrow">Free account</div>
        <h2 id="auth-dialog-title" style={{ fontSize: 22, margin: '8px 0 6px', color: 'var(--ink)' }}>{title}</h2>
        {intro && <p style={{ fontSize: 14, color: 'var(--text-soft)', margin: '0 0 18px', lineHeight: 1.6 }}>{intro}</p>}
        <AccountForm idPrefix="dlg" initialMode={initialMode} onSuccess={onSuccess} />
      </div>
    </div>
  )
}
