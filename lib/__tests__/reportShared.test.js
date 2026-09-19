import { describe, it, expect } from 'vitest'
import {
  buildUpRows, buildUpPromptLines, rangeSentence, baseDateLabel,
  rateSourcesSentence, programmeHeadline, fastTrackLines, resolveSectionFlags,
} from '../reportShared.js'

// All pure — these are the strings and rows BOTH renderers print, so pinning
// them here pins the .docx and the HTML/PDF report at once.

const COST = {
  percentages: { prelims: 10.5, ohp: 11, fees: 13.5, devCosts: 0, risk: 7, contingency: 5, inflation: 0 },
  trace: {
    prelims: [
      { code: 'A', label: 'Base 8% — clean/vacant/short programme', pct: 8 },
      { code: 'A', label: 'Q3.6 = Fully occupied throughout', pct: 2 },
      { code: 'A', label: 'Q3.5 includes Restricted working hours', pct: 0.5 },
    ],
    ohp: [{ code: 'B', label: 'Works cost < £1M → 10–12% (use 11%)', pct: 11 }],
    fees: [{ code: 'C', label: 'Q4.5 = Stage 0–1 → 12–15% (use 13.5%)', pct: 13.5 }],
    devCosts: [{ code: 'D', label: 'No planning consent required (Q3.4) — no developer costs applied', pct: 0 }],
    risk: [{ code: 'E', label: 'Baseline 5%', pct: 5 }, { code: 'E', label: 'Q3.3 = None — surveys needed', pct: 2 }],
    contingency: [{ code: 'H', label: 'ALWAYS 5%', pct: 5 }],
    inflation: [],
  },
  lineItems: [
    { code: '3.1', source: 'BCIS 2Q26' },
    { code: '3.2', source: '' },
    { code: 'PS',  source: '' },
  ],
}

describe('buildUpRows — percentage build-up', () => {
  it('lists every fired rule under its code and closes each group with a subtotal that equals the applied percentage', () => {
    const rows = buildUpRows(COST)
    const prelims = rows.filter(r => r.code === 'A')
    expect(prelims.map(r => r.pct)).toEqual([8, 2, 0.5, 10.5])
    expect(prelims.at(-1).subtotal).toBe(true)
    // The rule rows foot to the subtotal — the whole point of the table.
    const sum = prelims.slice(0, -1).reduce((s, r) => s + r.pct, 0)
    expect(sum).toBeCloseTo(prelims.at(-1).pct, 5)
  })

  it('omits a code with no rules and a zero percentage (inflation here) rather than printing an empty group', () => {
    const rows = buildUpRows(COST)
    expect(rows.some(r => r.code === 'F')).toBe(false)
    // D fired a zero-value explanatory row, so it IS shown.
    expect(rows.some(r => r.code === 'D')).toBe(true)
  })

  it('renders a compact prompt line per code with signed contributions', () => {
    const lines = buildUpPromptLines(COST)
    const a = lines.find(l => l.startsWith("Contractor's Preliminaries (A) = 10.5%"))
    expect(a).toContain('+8%')
    expect(a).toContain('Q3.6 = Fully occupied throughout +2%')
  })
})

describe('Estimate Basis sentences', () => {
  it('names the workbook range width and grade when the Range Widths sheet set it', () => {
    const s = rangeSentence({ rangeApplied: { grade: 'C', low: 0.8, high: 1.25, fromWorkbook: true } })
    expect(s).toContain('−20% / +25%')
    expect(s).toContain('confidence grade C')
  })

  it('describes the legacy ±11% as rate uncertainty only when no workbook row applied', () => {
    const s = rangeSentence({ rangeApplied: { grade: null, low: 0.89, high: 1.11, fromWorkbook: false } })
    expect(s).toContain('−11% / +11%')
    expect(s).not.toContain('confidence grade')
  })

  it('prints the workbook base date, never the generation date, and falls back honestly', () => {
    expect(baseDateLabel({ baseDate: '2Q 2026' })).toBe('2Q 2026')
    expect(baseDateLabel({})).toBe('the workbook issue date')
  })

  it('lists distinct rate sources and counts unsourced priced lines, ignoring the provisional sum', () => {
    expect(rateSourcesSentence(COST)).toBe('Rate sources: BCIS 2Q26 (1 of 2 priced lines unsourced).')
    expect(rateSourcesSentence({ lineItems: [{ code: '3.1' }, { code: '3.2' }] })).toContain('all 2 priced lines are unsourced')
    expect(rateSourcesSentence({ lineItems: [] })).toBeNull()
  })
})

describe('programme headline and acceleration options', () => {
  it('shows the with-float headline with the best case it was built from', () => {
    expect(programmeHeadline({ totalWeeks: 72, totalWeeksBestCase: 66, floatWeeks: 6 })).toBe('72 weeks (best case 66 weeks + 6 weeks float)')
    expect(programmeHeadline({ totalWeeks: 66, floatWeeks: 0 })).toBe('66 weeks')
  })

  it('formats each fired FastTrack lever with its saving and trade-off', () => {
    const lines = fastTrackLines({ fastTrackOptions: [
      { id: 'FT4', lever: 'Framework / call-off procurement', action: 'Replace TN1 with TN3.', weeksSaved: '6 – 10', tradeOff: 'Framework rates may be higher.' },
    ] })
    expect(lines).toEqual(['FT4 — Framework / call-off procurement: Replace TN1 with TN3. Approx. saving 6 – 10 weeks. Trade-off: Framework rates may be higher.'])
  })

  it('quotes a prose "weeks saved" cell as written instead of appending "weeks" to it', () => {
    const [line] = fastTrackLines({ fastTrackOptions: [{ id: 'FT2', lever: 'Reuse surveys', action: 'Drop the row.', weeksSaved: '0 on critical path; de-risks', tradeOff: '' }] })
    expect(line).toBe('FT2 — Reuse surveys: Drop the row. Weeks saved: 0 on critical path; de-risks.')
  })
})

describe('resolveSectionFlags — Q6.1 exclude-list with legacy include-list support', () => {
  it('cost is always shown; exclude-list removes only what it names', () => {
    const f = resolveSectionFlags({ q6_1_excludeSections: ['Procurement Recommendation'] }, { paybackYears: 3 })
    expect(f).toEqual({ showCost: true, showROI: true, showProc: false, showCon: true })
  })
  it('honours a legacy include-list from a report already in KV, but never hides cost', () => {
    const f = resolveSectionFlags({ q6_1_sections: ['ROI & Financial Case'] }, { paybackYears: 3 })
    expect(f).toEqual({ showCost: true, showROI: true, showProc: false, showCon: false })
  })
  it('shows everything when neither key is present, and hides ROI when there is no ROI data', () => {
    expect(resolveSectionFlags({}, null)).toEqual({ showCost: true, showROI: false, showProc: true, showCon: true })
  })
})
