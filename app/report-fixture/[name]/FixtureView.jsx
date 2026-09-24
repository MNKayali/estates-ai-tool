'use client'
// Client half of the dev-only fixture route: loads the public sample exactly
// as /sample does, applies the named fixture, renders the real report.
import { useEffect, useState } from 'react'
import ReportRenderer from '../../report/ReportRenderer'
import { worstCaseReport, longScopeReport } from '@/lib/reportFixtures'

const FIXTURES = { sample: s => s, worst: worstCaseReport, 'long-scope': longScopeReport }

export default function FixtureView({ name }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    fetch('/sample/report.json')
      .then(r => r.json())
      .then(s => { if (alive) setData(FIXTURES[name](s)) })
    return () => { alive = false }
  }, [name])
  if (!data) return <p role="status" style={{ padding: 24 }}>Loading fixture…</p>
  return <ReportRenderer data={data} reportId={null} sample />
}
