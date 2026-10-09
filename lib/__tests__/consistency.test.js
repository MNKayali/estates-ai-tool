import { describe, it, expect } from 'vitest'
import { checkConsistency } from '../consistency.js'

const reg = (n, rating = 'High') => Array.from({ length: n }, (_, i) => ({ ref: `R0${i}`, category: 'Cost', description: `risk ${i}`, rating, mitigation: 'm' }))
const stage = (stage, start, end, extra = {}) => ({ stage, startWeek: start, endWeek: end, weeks: end - start, activity: stage, ...extra })
const programme = {
  stages: [stage('Stage 3', 0, 17), stage('Stage 4', 17, 35), stage('Tender / Procurement', 35, 47), stage('Construction', 47, 107),
    stage('Handover', 107, 110), stage('Programme float', 110, 119)],
}
const codes = x => x.map(i => i.code)

describe('checkConsistency', () => {
  it('flags a High count that disagrees with the register', () => {
    const r = checkConsistency({ programme, aiProse: { riskRegister: reg(3), procurementNarrative: 'Scored with 1 risk rated High.' } })
    expect(codes(r)).toContain('RISK_COUNT')
  })
  it('accepts a matching count', () => {
    const r = checkConsistency({ programme, aiProse: { riskRegister: reg(3), procurementNarrative: 'There are three risks rated High.' } })
    expect(codes(r)).not.toContain('RISK_COUNT')
  })
  it('flags a stage that is not in the programme', () => {
    const p = { stages: programme.stages.filter(s => s.stage !== 'Stage 4') }
    const r = checkConsistency({ programme: p, aiProse: { riskRegister: reg(1), nextSteps: ['Confirm at Stage 2 and Stage 4.'] } })
    expect(r.filter(i => i.code === 'STAGE_REFERENCE').map(i => i.message).join(' ')).toMatch(/Stage 2.*Stage 4|Stage 4.*Stage 2/s)
  })
  it('flags float after completion (and not the owner-approved missing mobilisation)', () => {
    const r = checkConsistency({ programme: { stages: [stage('Tender / Procurement', 0, 12), stage('Construction', 12, 60), stage('Handover', 60, 63), stage('Programme float', 63, 70)] }, aiProse: { riskRegister: [] } })
    expect(codes(r)).toEqual(expect.arrayContaining(['FLOAT_AFTER_COMPLETION']))
    expect(codes(r)).not.toContain('NO_MOBILISATION')
  })
  it('flags "lower end only" wording when the mid-point is covered', () => {
    const r = checkConsistency({ programme, budget: { position: 'mid' }, aiProse: { riskRegister: [], keyFindings: ['Budget is achievable only if it prices toward the lower end.'] } })
    expect(codes(r)).toContain('BUDGET_WORDING')
  })
})
