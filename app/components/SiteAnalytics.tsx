'use client'

import { Analytics } from '@vercel/analytics/react'
import { usePathname } from 'next/navigation'

export default function SiteAnalytics() {
  const pathname = usePathname()
  if (pathname === '/office' || pathname?.startsWith('/office/')) return null
  return <Analytics beforeSend={(event) => {
    const url = new URL(event.url, window.location.origin)
    return url.pathname === '/office' || url.pathname.startsWith('/office/') ? null : event
  }} />
}
