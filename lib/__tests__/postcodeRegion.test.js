import { describe, it, expect } from 'vitest'
import { outwardCode, postcodeArea, matchRegion } from '../postcodeRegion.js'

const REGIONS = [
  { region: 'Inner London', postcodes: ['EC', 'WC', 'E1W', 'SW1', 'SE1'] },
  { region: 'Outer London', postcodes: ['E', 'N', 'SE', 'SW', 'W'] },
  { region: 'West Midlands', postcodes: ['B', 'SY1', 'SY10'] },
  { region: 'Wales', postcodes: ['CF', 'SY'] },
  { region: 'South West', postcodes: ['BS', 'GL'] },
]

describe('outwardCode', () => {
  it.each([
    ['BS1', 'BS1'], ['bs1', 'BS1'], ['SW1A 1AA', 'SW1A'], ['sw1a1aa', 'SW1A'],
    ['M139PL', 'M13'], ['  LS2 ', 'LS2'], ['B15', 'B15'], ['', ''],
  ])('%s → %s', (input, out) => expect(outwardCode(input)).toBe(out))
  it('area is the letters only', () => expect(postcodeArea('SW1A 1AA')).toBe('SW'))
})

describe('matchRegion', () => {
  const r = pc => matchRegion(pc, REGIONS)?.region ?? null
  // Test reports FO-3 / EX-2 / EW-3 (BS1) and NB-2 (GL54) were priced as
  // West Midlands: the workbook had no South West row at all.
  it('matches a plain area', () => { expect(r('BS1')).toBe('South West'); expect(r('GL54')).toBe('South West') })
  // The old matcher cut at the first digit, so these district rows never matched.
  it('prefers a district entry over its area', () => {
    expect(r('SW1A 1AA')).toBe('Inner London')
    expect(r('SE1')).toBe('Inner London')
    expect(r('E1W')).toBe('Inner London')
  })
  it('a district entry does not swallow a longer district number', () => {
    expect(r('SW10')).toBe('Outer London')
    expect(r('SE10')).toBe('Outer London')
    expect(r('E1')).toBe('Outer London')
  })
  it('splits an area across regions by district (SY10 Oswestry is England)', () => {
    expect(r('SY10')).toBe('West Midlands')
    expect(r('SY1')).toBe('West Midlands')
    expect(r('SY23')).toBe('Wales')
  })
  it('single-letter areas do not match two-letter areas', () => {
    expect(r('B29')).toBe('West Midlands')
    expect(r('BS8')).toBe('South West')
  })
  it('returns null when nothing matches', () => { expect(r('ZZ9')).toBeNull(); expect(r('')).toBeNull() })
})
