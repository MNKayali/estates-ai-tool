import { describe, it, expect } from 'vitest'
import { validatePostcode } from '../postcodeRegion.js'

describe('validatePostcode', () => {
  it.each(['B15', 'CV4 7AL', 'cv4', 'SW1A 1AA', 'E1W', 'M139PL', 'CV13', 'CV47', 'CR0', 'JE2'])('accepts %s', pc => {
    expect(validatePostcode(pc).ok).toBe(true)
  })
  it('rejects CV14, which does not exist', () => {
    const v = validatePostcode('CV14')
    expect(v.ok).toBe(false)
    expect(v.reason).toMatch(/CV14/)
    expect(validatePostcode('CV14 2AB').ok).toBe(false)
  })
  it.each(['', '  ', 'ZZ9', 'QX1 1AA', '12345', 'B', 'CV 4', 'hello'])('rejects %j', pc => {
    expect(validatePostcode(pc).ok).toBe(false)
  })
})

describe('validatePostcode — every UK district', () => {
  it.each(['CV9 1AA', 'G1', 'EC4', 'WC1', 'SW1A 2AA', 'E1W', 'M60', 'BT1', 'ZE2', 'IM1', 'GY1'])('accepts %s', pc => {
    expect(validatePostcode(pc).ok).toBe(true)
  })
  it.each(['B39', 'G6', 'SW21', 'EC5', 'W15', 'E19', 'WC3', 'M37'])('refuses %s, a district that does not exist', pc => {
    expect(validatePostcode(pc).ok).toBe(false)
  })
})
