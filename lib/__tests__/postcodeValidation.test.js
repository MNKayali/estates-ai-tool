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
