'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ReportPage() {
  const router = useRouter()

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('estatesAI_report')
      if (!stored) { router.push('/questionnaire'); return }

      // Parse to validate before loading
      JSON.parse(stored)

      // Load the template HTML and replace the page entirely
      fetch('/report-template.html')
        .then(r => r.text())
        .then(html => {
          document.open()
          document.write(html)
          document.close()
        })
        .catch(() => router.push('/questionnaire'))
    } catch {
      router.push('/questionnaire')
    }
  }, [router])

  // Loading screen while template fetches
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', background: '#1a2e4a', color: '#fff',
      fontFamily: 'Arial, sans-serif', fontSize: '16px',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px', height: '48px', border: '4px solid rgba(255,255,255,0.3)',
          borderTopColor: '#fff', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div>Loading your report…</div>
      </div>
    </div>
  )
}
