import { describe, it, expect } from 'vitest'
import { evaluate, ENTER, isEnter, parseCondition, conditionHolds, references, compile } from '../scopeExpr.js'

// The quantity-rule language from '1. Instructions' ("QUANTITY RULES"), run
// by a hand-written evaluator — never eval().
const env = (names = {}, ratios = {}, qs = {}) => ({
  name: n => names[n],
  ratio: k => ratios[k],
  q: id => (id in qs ? qs[id] : 0),
})

describe('scopeExpr — quantity rules', () => {
  it('evaluates the workbook examples', () => {
    const e = env({ GIFA: 4000, STOREYS: 3, USE: 'EDU' }, { m2_per_person: 5, persons_per_wc: 20, kwp_per_m2_roof: 0.1 })
    expect(evaluate('ROUND(GIFA / r.m2_per_person / r.persons_per_wc, 0)', e)).toBe(40)
    expect(evaluate('IF(STOREYS>=2, 1, 0)', e)).toBe(1)
    expect(evaluate('GIFA / STOREYS * r.kwp_per_m2_roof', e)).toBeCloseTo(133.33, 2)
  })

  it('rounds half away from zero, as Excel does', () => {
    expect(evaluate('ROUND(0.5, 0)', env())).toBe(1)
    expect(evaluate('ROUND(2.5, 0)', env())).toBe(3)
    expect(evaluate('ROUND(1.25, 1)', env())).toBe(1.3)
  })

  it('ENTER is contagious through arithmetic but IF only follows the branch taken', () => {
    expect(isEnter(evaluate('ENTER', env()))).toBe(true)
    expect(isEnter(evaluate('GIFA * 2', env({ GIFA: ENTER })))).toBe(true)
    expect(evaluate('IF(PT=EW, 0, ENTER)', env({ PT: 'EW' }))).toBe(0)
    expect(isEnter(evaluate('IF(PT=EW, 0, ENTER)', env({ PT: 'NB' })))).toBe(true)
    // A blank input or a zero divisor has no honest estimate.
    expect(isEnter(evaluate('GIFA / STOREYS', env({ GIFA: 100, STOREYS: 0 })))).toBe(true)
    expect(isEnter(evaluate('GIFA + 1', env({})))).toBe(true)
  })

  it('"=" followed by several codes means any of them', () => {
    expect(evaluate('PT=RF FO DM', env({ PT: 'FO' }))).toBe(true)
    expect(evaluate('PT=RF FO DM', env({ PT: 'NB' }))).toBe(false)
    expect(evaluate('USE<>RES STU', env({ USE: 'EDU' }))).toBe(true)
  })

  it('a comparison against a blank answer is false, not an error', () => {
    expect(evaluate('AGE<2000', env({}))).toBe(false)
  })

  it('Q() reads another item and MAX works on it', () => {
    const rule = 'MAX(1, ROUND(Q(S-0074) / 5, 0))'
    expect(evaluate(rule, env({}, {}, { 'S-0074': 0 }))).toBe(1)
    expect(evaluate(rule, env({}, {}, { 'S-0074': 52 }))).toBe(10)
    expect(isEnter(evaluate(rule, env({}, {}, { 'S-0074': ENTER })))).toBe(true)
    expect([...references(rule).items]).toEqual(['S-0074'])
  })

  it('rejects an unknown name, a missing ratio and anything that is not the language', () => {
    expect(() => compile('HEIGHT * 2')).toThrow(/unknown name "HEIGHT"/)
    expect(() => evaluate('r.nope * 2', env())).toThrow(/quantity_ratios/)
    expect(() => compile('process.exit(1)')).toThrow()
    expect(() => compile('GIFA; alert(1)')).toThrow()
  })
})

describe('scopeExpr — Other conditions', () => {
  it('parses tests joined by & with a tick / untick action', () => {
    const c = parseCondition('PT=NB & USE=RES STU & STOREYS>=4 → tick')
    expect(c.action).toBe('tick')
    expect(conditionHolds(c, env({ PT: 'NB', USE: 'STU', STOREYS: 5 }))).toBe(true)
    expect(conditionHolds(c, env({ PT: 'NB', USE: 'STU', STOREYS: 3 }))).toBe(false)
    expect(parseCondition('STOREYS<2 → untick').action).toBe('untick')
  })

  it('treats AUTO rows and blanks as no condition, and rejects a condition with no action', () => {
    expect(parseCondition('AUTO: add when any Group 5 item is selected; never shown').auto).toBe(true)
    expect(parseCondition('—')).toBeNull()
    expect(() => parseCondition('PT=NB')).toThrow(/tick/)
  })
})
