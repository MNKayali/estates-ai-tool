'use client'
// The report as A4 pages — the same pages on screen (scaled to fit), in the
// PDF (Puppeteer prints them 1:1) and, through lib/docx/*, in Word. The page
// order and every derived line come from lib/reportContent.js.
import { useEffect, useRef, useState } from 'react'
import './report.css'
import { cssVariables } from '@/lib/reportStyle'
import { buildPageMap, money, reportReference, fmtLongDate } from '@/lib/reportContent'
import { plexSans, plexMono } from './fonts'
import CoverPage from './CoverPage'
import SummaryPage from './SummaryPage'
import ScopePage from './ScopePage'
import RiskPage from './RiskPage'
import ProgrammePage from './ProgrammePage'
import { CostWorksPage, CostSummaryPage, AppendixPage } from './CostPages'
import LatePage from './LatePages'
import LastPage from './LastPage'

const PAGES = {
  cover: CoverPage, summary: SummaryPage, scope: ScopePage, risk: RiskPage, programme: ProgrammePage,
  costWorks: CostWorksPage, costSummary: CostSummaryPage, late: LatePage, last: LastPage, appendix: AppendixPage,
}

export default function ReportDocument({ data, reportId, isPdf = false, isPending = false }) {
  const ref = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (isPdf || !ref.current) return undefined
    const el = ref.current
    // A hidden or not-yet-laid-out container reports 0; keep full size then.
    const fit = () => { const w = el.clientWidth; if (w > 0) setScale(Math.min(1, w / 794)) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [isPdf])

  const { pages, ctx: base } = buildPageMap(data, { isPending })
  const high = data?.cost?.total?.high
  const ctx = {
    ...base,
    isPending,
    reference: reportReference(reportId, data),
    dateLong: fmtLongDate(data?.generatedAt || new Date().toISOString()),
    money: (n, bare = false) => money(n, high, { symbol: !bare }),
  }

  return (
    <div ref={ref} className={`r-doc ${plexSans.variable} ${plexMono.variable}`} style={{ ...cssVariables(), '--s': scale }}>
      {pages.map((p, i) => {
        const Page = PAGES[p.kind]
        return <Page key={i} n={i + 1} page={p} data={data} ctx={ctx} />
      })}
    </div>
  )
}
