import { describe, it, expect } from 'vitest'
import { procurementNameProblems } from '../prose.js'
import { procurementBasisSentence } from '../reportContent.js'

const proc = {
  vocabulary: { options: [], contractTokens: [] },
  preferred: { route: { id: 'R1', name: 'Design and build (single stage)' } },
  alternative: { route: { id: 'R2', name: 'Two-stage (PCSA)' } },
  drivers: { valueLevel: 'V2 £1m to threshold', durationLevel: 'Over 52 wks', highRisks: 1, priority: 'Speed', publicClient: false },
}
const risk = (d, m) => ({ ref: 'R01', category: 'Procurement', description: d, rating: 'High', mitigation: m })

describe('route-consistent risk text', () => {
  it("flags second-stage pricing on a single-stage preferred route", () => {
    const out = { riskRegister: [risk('Scope ambiguity', "benchmark contractor's second-stage pricing")] }
    expect(procurementNameProblems(out, proc).join(' ')).toMatch(/two-stage/)
  })
  it('allows it when the preferred route is two-stage', () => {
    const p = { ...proc, preferred: { route: { id: 'R2', name: 'Two-stage (PCSA)' } } }
    const out = { riskRegister: [risk('Scope ambiguity', 'second-stage pricing')] }
    expect(procurementNameProblems(out, p)).toEqual([])
  })
})

describe('procurement basis High-risk count', () => {
  it('uses the printed register, not just the seeds', () => {
    const reg = [risk('a', 'm'), risk('b', 'm'), risk('c', 'm')].map((r, i) => ({ ...r, description: 'd' + i }))
    expect(procurementBasisSentence(proc, reg)).toMatch(/3 risks rated High/)
    expect(procurementBasisSentence(proc)).toMatch(/1 risk rated High/)
  })
})
