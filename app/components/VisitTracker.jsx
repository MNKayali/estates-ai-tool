'use client'

/**
 * Counts page views and time on page for the admin dashboard (lib/visits.js).
 * Stores nothing on the device — no cookie, no localStorage — and sends only
 * the page address, the referring site and utm_source on the first page of a
 * visit, and how long each page was on screen. The admin's own pages are not
 * counted.
 */
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

function send(payload) {
  try {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) navigator.sendBeacon('/api/track', body)
    else fetch('/api/track', { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch { /* a counter never breaks the page */ }
}

function isExternal(referrer) {
  if (!referrer) return true
  try { return new URL(referrer).host !== window.location.host } catch { return true }
}

export default function VisitTracker() {
  const pathname = usePathname()
  const firstView = useRef(true)
  const lastSent = useRef(null)

  useEffect(() => {
    if (!pathname || /^\/(admin|report-fixture)(\/|$)/.test(pathname)) return

    // The first page after a full load is a visit's landing page when the
    // visitor came from elsewhere; later pages are in-app navigation.
    let landing = false
    let ref = ''
    let utm = ''
    if (firstView.current) {
      firstView.current = false
      if (isExternal(document.referrer)) {
        landing = true
        ref = document.referrer || ''
        utm = new URLSearchParams(window.location.search).get('utm_source') || ''
      }
    }
    // React's development double-run of effects must not count a page twice.
    if (lastSent.current !== pathname) send({ t: 'view', path: pathname, landing, ref, utm })
    lastSent.current = pathname

    // Time on screen: counted while the tab is visible, sent when it is hidden
    // or the visitor moves to another page.
    let visibleSince = document.visibilityState === 'visible' ? Date.now() : null
    let shown = 0
    const flush = () => {
      if (visibleSince != null) { shown += Date.now() - visibleSince; visibleSince = null }
      if (shown >= 500) send({ t: 'engage', ms: shown })
      shown = 0
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
      else if (visibleSince == null) visibleSince = Date.now()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [pathname])

  return null
}
