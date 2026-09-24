import { describe, it, expect } from 'vitest'
import sample from '../../public/sample/report.json'
import { prepareRisks } from '../reportContent.js'
import { ensureSeedRisks } from '../prose.js'

describe('prepareRisks', () => {
  it('drops the duplicated heat-pump seed, sorts High first and renumbers', () => {
    const { risks, counts } = prepareRisks(sample.aiProse.riskRegister)
    expect(risks).toHaveLength(8)
    expect(risks.map(r => r.ref)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08'])
    expect(risks.slice(0, 3).every(r => r.rating === 'High')).toBe(true)
    expect(counts).toEqual({ High: 3, Medium: 5, Low: 0 })
    expect(risks.some(r => /\(Q3\.5\)/.test(r.description))).toBe(false)
  })
  it('keeps at most ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ref: `R${i + 1}`, seedRef: 'NONE', rating: i % 2 ? 'Low' : 'High', description: `risk ${i}`, mitigation: 'm' }))
    const { risks, dropped } = prepareRisks(many)
    expect(risks).toHaveLength(10)
    expect(dropped).toBe(4)
    expect(risks.filter(r => r.rating === 'High')).toHaveLength(7)
  })
})

describe('ensureSeedRisks', () => {
  it('treats a seed the model wrote under its ref (seedRef NONE) as present', () => {
    const prose = { riskRegister: [{ ref: 'SCOPE-S-0039-1', seedRef: 'NONE', rating: 'Medium', description: 'x', mitigation: 'y' }] }
    const before = prose.riskRegister.length
    // Re-run the merge against the sample's inputs: no second heat-pump entry may be appended.
    // senseCheck: pass the minimal shape buildDeterministicSeeds reads; if it reads more
    // fields, copy them from a runSenseCheck() result rather than weakening the assertion.
    ensureSeedRisks(prose, sample.answers, sample.cost, { warnings: [], clientWarnings: [], benchmarkChecked: true })
    const heat = prose.riskRegister.filter(r => r.ref === 'SCOPE-S-0039-1' || r.seedRef === 'SCOPE-S-0039-1')
    expect(heat).toHaveLength(1)
    expect(prose.riskRegister.length).toBeGreaterThanOrEqual(before)
  })
})
